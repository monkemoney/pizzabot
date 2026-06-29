'use strict';

const { callClaude }              = require('../services/claude');
const { buildSystemPrompt }       = require('./prompts');
const { sendMessage, sendToppingsPoll } = require('../services/greenapi');
const { getSession, updateSession, savePendingPayment, saveOrder,
        getLastOrderByPhone, saveCustomerProfile, getCustomerProfile,
        getOrderById, updateOrderStatus, updateOrder } = require('../services/supabase');
const { createPaymentPage }       = require('../services/cardcom');
const settings                    = require('../services/settings');
const crypto                      = require('crypto');

// <!--ACTION:TYPE:{json}--> or <!--ACTION:RESET/SHOW_TOPPINGS-->
const ACTION_RE = /<!--ACTION:(CREATE_PAYMENT|SAVE_ORDER|RESET|SHOW_TOPPINGS)(?::(\{[\s\S]*?\}))?-->/;

function stripAction(text) {
  return text.replace(ACTION_RE, '').trim();
}

function parsePayload(jsonStr) {
  try { return JSON.parse(jsonStr); }
  catch (err) {
    console.error('[ai-handler] JSON parse error:', err.message, jsonStr?.slice(0, 200));
    return null;
  }
}

function reply(phone, text, tenantId) {
  if (!text) return Promise.resolve();
  return sendMessage(phone, text, tenantId)
    .catch((err) => console.error(`[ai-handler] send failed ${phone}:`, err.message));
}

function detectLang(lastMessage, history) {
  const allText = [lastMessage, ...history.map((m) => m.content)].join(' ');
  const heChars = (allText.match(/[א-ת]/g) || []).length;
  const enChars = (allText.match(/[a-zA-Z]/g) || []).length;
  return enChars > heChars * 2 ? 'en' : 'he';
}

/** Generate a unique return value for Cardcom (used to look up pending payment) */
function makeReturnValue() {
  return 'PB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

// ─── Item dispute response handler ───────────────────────────────────────────

async function handleDisputeResponse(phone, userMessage, session, tenantId) {
  const dispute = session.pending_dispute;
  const msg     = userMessage.trim();

  const missingItems = dispute.items && dispute.items.length
    ? dispute.items
    : [{ type: 'item', name: dispute.item_name || '?', price: dispute.item_price || 0, qty: 1 }];

  const totalRefund = missingItems.reduce((s, d) => s + (d.price || 0) * (d.qty || 1), 0);
  const isSingle    = missingItems.length === 1;
  const namesStr    = isSingle ? `*${missingItems[0].name}*` : 'הפריטים החסרים';
  const refundStr   = totalRefund > 0 ? ` (זיכוי של ₪${totalRefund.toFixed(0)})` : '';

  const choice = msg.replace(/\s+/g, '');

  if (dispute.awaiting_replacement) {
    const order = await getOrderById(dispute.order_id);
    if (!order || ['cancelled', 'done'].includes(order.status)) {
      await updateSession(phone, { pending_dispute: null }, tenantId);
      await reply(phone, 'ההזמנה כבר אינה פעילה. 🙏', tenantId);
      return;
    }
    await updateOrder(order.id, { dispute_status: 'resolved', dispute_resolution: 'replaced' });
    await updateSession(phone, { pending_dispute: null }, tenantId);
    await reply(phone, `מעולה! בודקים אפשרות להחלפה — ${msg}. נחזור אליך מיד.`, tenantId);
    await handleMessage(phone, `רוצה לשנות ${missingItems.map(d=>d.name).join(' ו')} ל: ${msg}`, tenantId);
    return;
  }

  if (!['1', '2', '3'].includes(choice)) {
    const hint = `אנא שלח:\n*1* — לבטל את ההזמנה\n*2* — להמשיך ללא ${namesStr}${refundStr}\n*3* — להחליף בפריט אחר`;
    await reply(phone, hint, tenantId);
    return;
  }

  const order = await getOrderById(dispute.order_id);
  if (!order || ['cancelled', 'done'].includes(order.status)) {
    await updateSession(phone, { pending_dispute: null }, tenantId);
    await reply(phone, 'ההזמנה כבר אינה פעילה. תודה! 🙏', tenantId);
    return;
  }

  if (choice === '1') {
    await updateOrderStatus(order.id, 'cancelled');
    await updateOrder(order.id, { dispute_status: 'resolved', dispute_resolution: 'cancelled', cancelled_by: 'customer' });
    await updateSession(phone, { pending_dispute: null, conversation_history: [], pending_order: {} }, tenantId);
    const refundNote = order.payment_method === 'credit'
      ? '\nהתשלום יזוכה לכרטיסך תוך 3-5 ימי עסקים.' : '';
    await reply(phone, `✅ הזמנה מספר *${dispute.order_number}* בוטלה.${refundNote}\n\nמצטערים על אי הנוחות 🙏`, tenantId);
    return;
  }

  if (choice === '2') {
    let orderItems = [...(order.items || [])];
    let removed    = 0;

    for (const d of missingItems) {
      if (d.type === 'topping') {
        orderItems = orderItems.map(it => ({
          ...it,
          toppings: (it.toppings || []).filter(t => (t.name || t.name_he) !== d.name),
        }));
      } else {
        const before = orderItems.length;
        orderItems   = orderItems.filter(it => (it.name || it.name_he) !== d.name);
        const qty    = d.qty || 1;
        if (orderItems.length < before) removed += (d.price || 0) * qty;
      }
    }

    const newTotal = Math.max(0, (parseFloat(order.total_price) || 0) - removed);
    await updateOrder(order.id, {
      items: orderItems, total_price: newTotal,
      dispute_status: 'resolved', dispute_resolution: 'removed',
    });
    await updateSession(phone, { pending_dispute: null }, tenantId);

    const removedList = missingItems.map(d =>
      d.type === 'topping' ? `תוספת ${d.name}` : d.name).join(', ');
    const refundNote = order.payment_method === 'credit' && removed > 0
      ? `\nהחזר של ₪${removed.toFixed(0)} יזוכה לכרטיסך.` : '';

    await reply(phone,
      `✅ ההזמנה עודכנה — הוסרו: *${removedList}*.\n` +
      `סכום מעודכן: ₪${newTotal.toFixed(0)}.${refundNote}\nתודה על ההבנה! 🙏`,
      tenantId
    );
    return;
  }

  // ── 3: Replace with something else ──
  await updateSession(phone, { pending_dispute: { ...dispute, awaiting_replacement: true } }, tenantId);
  await reply(phone, `מה תרצה במקום ${namesStr}? 😊\n\nכתוב מה תרצה להחליף ואנחנו נבדוק שיש לנו.`, tenantId);
}

// ─── Main handler ────────────────────────────────────────────────────────────

async function handleMessage(phone, userMessage, tenantId = null) {
  const tid = tenantId || settings.DEFAULT_TENANT_ID;
  const session = await getSession(phone, tid);

  if (session.pending_dispute) {
    return handleDisputeResponse(phone, userMessage, session, tid);
  }

  const open = await settings.isOpen(tid);
  if (!open) {
    const lang = session.language || 'he';
    await reply(phone, lang === 'en'
      ? "Sorry, we're currently closed. Please try again during business hours 🕐"
      : 'מצטערים, אנחנו כרגע סגורים. אנא נסה שוב בשעות הפתיחה 🕐', tid);
    return;
  }

  let history = Array.isArray(session.conversation_history) ? session.conversation_history : [];

  if (history.length > 0) {
    const lastTs   = session.updated_at ? new Date(session.updated_at) : null;
    const ageHours = lastTs ? (Date.now() - lastTs.getTime()) / 3600000 : 999;
    const hasOldFlow = history.some((m) =>
      typeof m.content === 'string' && (
        m.content.includes('SHOW_MENU') ||
        m.content.includes('sendCategoryPoll') ||
        (m.content.includes('בחרתי:') && m.content.includes(' — '))
      )
    );
    if (ageHours > 3 || hasOldFlow) {
      console.log(`[ai-handler] resetting stale session for ${phone} (age=${ageHours.toFixed(1)}h)`);
      history = [];
      await updateSession(phone, { conversation_history: [], pending_order: {} }, tid);
    }
  }

  console.log(`[ai-handler] phone=${phone} tenant=${tid} historyLen=${history.length} msg="${userMessage.slice(0, 80)}"`);

  if (history.length === 0) {
    const lastOrder = await getLastOrderByPhone(phone, tid);
    if (lastOrder && lastOrder.status === 'new') {
      const minutesSince = (Date.now() - new Date(lastOrder.created_at).getTime()) / 60000;
      if (minutesSince <= 15) {
        const lang = detectLang(userMessage, []);
        const cancelKeywords = ['בטל', 'ביטול', 'לבטל', 'cancel', 'שנה', 'לשנות'];
        const wantsCancel = cancelKeywords.some((k) => userMessage.toLowerCase().includes(k));
        if (wantsCancel) {
          await updateOrderStatus(lastOrder.id, 'cancelled');
          const msg = lang === 'en'
            ? `✅ Order #${lastOrder.order_number} has been cancelled. Want to place a new order?`
            : `✅ הזמנה מספר ${lastOrder.order_number} בוטלה. רוצה להזמין מחדש?`;
          await reply(phone, msg, tid);
          return;
        }
        const msg = lang === 'en'
          ? `Your order #${lastOrder.order_number} was placed ${Math.floor(minutesSince)} min ago and is being prepared.\nTo cancel, send *בטל* within ${Math.floor(15 - minutesSince)} more minutes.`
          : `הזמנה מספר ${lastOrder.order_number} בוצעה לפני ${Math.floor(minutesSince)} דקות ונמצאת בטיפול.\nלביטול שלח *בטל* בתוך ${Math.floor(15 - minutesSince)} דקות נוספות.`;
        await reply(phone, msg, tid);
        return;
      }
    }
  }

  const customerProfile = await getCustomerProfile(phone, tid).catch(() => null);

  let systemPrompt;
  try {
    systemPrompt = await buildSystemPrompt(customerProfile, tid);
  } catch (err) {
    console.error('[ai-handler] Failed to build system prompt:', err.message);
    systemPrompt = 'You are a pizza ordering assistant. Help the customer order pizza.';
  }

  // ── Mid-conversation availability check ──────────────────────────────────────
  // Scan customer messages for topping names, then verify they're still available.
  // Inject an explicit alert if any became unavailable mid-conversation.
  if (history.length > 0) {
    try {
      const customerText = history
        .filter(m => m.role === 'user')
        .map(m => (typeof m.content === 'string' ? m.content : ''))
        .join(' ')
        .toLowerCase();

      // Fetch all topping names mentioned by customer that now have is_available=false
      const { createClient: mkSB } = require('@supabase/supabase-js');
      const sb = mkSB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

      // Step 1: product IDs for this tenant
      const { data: tenantProds } = await sb
        .from('products').select('id').eq('tenant_id', tid);
      const productIds = (tenantProds || []).map(p => p.id);

      // Step 2: unavailable toppings for those products
      const { data: unavailableToppings } = productIds.length
        ? await sb.from('product_additions').select('name_he')
            .eq('is_available', false).in('product_id', productIds)
        : { data: [] };

      const nowUnavailable = (unavailableToppings || [])
        .filter(a => customerText.includes((a.name_he || '').toLowerCase()))
        .map(a => a.name_he);

      if (nowUnavailable.length > 0) {
        const names = [...new Set(nowUnavailable)].join(', ');
        systemPrompt += `\n\n⚠️ התראת מלאי — חשוב לפני שממשיכים:\nהתוספות הבאות הוזכרו בשיחה אך **אינן זמינות כעת** (אזלו מהמלאי): ${names}.\nחובה להודיע ללקוח **עכשיו** לפני כל שלב נוסף, להציע חלופה, ולא לכלול אותן ב-SAVE_ORDER/CREATE_PAYMENT.`;
        console.log(`[ai-handler] availability alert ${phone}: ${names}`);
      }
    } catch (e) {
      console.error('[ai-handler] availability check error:', e.message);
    }
  }

  let assistantText;
  try {
    assistantText = await callClaude(systemPrompt, history, userMessage);
  } catch (err) {
    console.error('[ai-handler] Claude error:', err.message);
    require('../services/vendor-alerts').alerts.botError(phone, err).catch(() => {});
    await reply(phone, 'מצטערים, אירעה שגיאה זמנית. אנא נסה שוב. 🙏', tid);
    return;
  }

  const match     = assistantText.match(ACTION_RE);
  const cleanText = stripAction(assistantText);

  // On first message, append a one-time privacy notice
  if (history.length === 0) {
    const botUrl = (await settings.get('bot_url', tid).catch(() => null)) || process.env.PUBLIC_URL || 'https://www.jasell.com';
    const privacyNotice = `\n\n_מדיניות הפרטיות שלנו: ${botUrl}/privacy.html_`;
    await reply(phone, cleanText + privacyNotice, tid);
  } else {
    await reply(phone, cleanText, tid);
  }

  const updatedHistory = [
    ...history,
    { role: 'user',      content: userMessage   },
    { role: 'assistant', content: assistantText },
  ].slice(-40);

  if (!match) {
    await updateSession(phone, { conversation_history: updatedHistory }, tid);
    return;
  }

  const actionType = match[1];
  const payload    = match[2] ? parsePayload(match[2]) : null;

  if (actionType === 'SHOW_TOPPINGS') {
    const lang = detectLang(userMessage, history);
    const productName = userMessage.length < 80 ? userMessage : null;
    await sendToppingsPoll(phone, lang, productName).catch(() => {});
    await updateSession(phone, { conversation_history: updatedHistory }, tid);
    return;
  }

  if (actionType === 'RESET') {
    await updateSession(phone, { conversation_history: [], pending_order: {} }, tid);
    return;
  }

  if (actionType === 'SAVE_ORDER' && payload) {
    const isBit = payload.payment_method === 'bit';
    try {
      if (payload.customer_name || payload.address) {
        await saveCustomerProfile(phone, {
          name:            payload.customer_name  || null,
          phone:           payload.customer_phone || null,
          last_address:    payload.address        || null,
          delivery_method: payload.delivery_method,
          payment_method:  isBit ? 'bit' : 'cash',
        }, tid);
      }

      // Parse scheduled_for: "HH:MM" → full ISO timestamp in Israel TZ
      let scheduledFor = null;
      if (payload.scheduled_for && /^\d{1,2}:\d{2}$/.test(String(payload.scheduled_for))) {
        const allSettingsForSched = await settings.loadAll(tid);
        const lead = Number(allSettingsForSched.prep_lead_time ?? 45);
        const [hh, mm] = String(payload.scheduled_for).split(':').map(Number);
        const nowIL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
        const sched = new Date(nowIL);
        sched.setHours(hh, mm, 0, 0);
        if (sched <= nowIL) sched.setDate(sched.getDate() + 1); // next day if past
        const minFromNow = (sched - nowIL) / 60000;
        if (minFromNow < lead) {
          const earliest = new Date(nowIL.getTime() + lead * 60000);
          const earliestStr = earliest.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
          await reply(phone, `⚠️ לא ניתן לתזמן הזמנה בפחות מ-${lead} דקות מראש.\nהשעה המוקדמת ביותר שניתן לתזמן כרגע: *${earliestStr}*.`, tid);
          await updateSession(phone, { conversation_history: updatedHistory }, tid);
          return;
        }
        scheduledFor = sched.toISOString();
      }

      const isScheduled = !!scheduledFor;

      const { orderNumber } = await saveOrder({
        phone,
        customer_name:   payload.customer_name   || null,
        customer_phone:  payload.customer_phone  || null,
        items:           payload.items           || [],
        delivery_method: payload.delivery_method,
        address:         payload.address         || null,
        notes:           payload.notes           || null,
        payment_method:  isBit ? 'bit' : 'cash',
        payment_status:  isBit ? 'pending' : 'paid',
        total_price:     payload.total,
        status:          isScheduled ? 'scheduled' : 'new',
        scheduled_for:   scheduledFor,
        tenant_id:       tid,
      });

      const lang = detectLang(userMessage, history);

      if (isScheduled) {
        const timeStr = payload.scheduled_for;
        const allSettings = await settings.loadAll(tid);
        const lead = allSettings.prep_lead_time ?? 45;
        const confirmMsg = lang === 'en'
          ? `🕐 Order *#${orderNumber}* scheduled for ${timeStr}!\nWe'll start preparing ${lead} min before.`
          : `🕐 הזמנה מספר *${orderNumber}* תוזמנה לשעה ${timeStr}!\nנתחיל להכין ${lead} דקות לפני 🍕`;
        await reply(phone, confirmMsg, tid);
      } else if (isBit) {
        const allSettings = await settings.loadAll(tid);
        const bitPhone = allSettings.bit_phone ? String(allSettings.bit_phone).replace(/"/g, '') : null;
        const confirmMsg = lang === 'en'
          ? `🍕 Order *#${orderNumber}* saved!\nPlease send ₪${payload.total} via Bit${bitPhone ? ` to ${bitPhone}` : ''}.\nOnce paid, reply *paid* 📱`
          : `🍕 הזמנה מספר *${orderNumber}* נשמרה!\nלסיום — שלח *₪${payload.total}* בBit${bitPhone ? ` למספר ${bitPhone}` : ''}.\nלאחר התשלום שלח *שילמתי* 📱`;
        await reply(phone, confirmMsg, tid);
      } else {
        const confirmMsg = lang === 'en'
          ? `🍕 Order *#${orderNumber}* confirmed!\nWe'll start preparing it now.`
          : `🍕 הזמנה מספר *${orderNumber}* אושרה!\nמתחילים להכין עכשיו.`;
        await reply(phone, confirmMsg, tid);
      }

      await updateSession(phone, { conversation_history: [], pending_order: {} }, tid);
    } catch (err) {
      console.error('[ai-handler] saveOrder error:', err.message);
      await reply(phone, 'אירעה שגיאה בשמירת ההזמנה. אנא נסה שוב. 🙏', tid);
      await updateSession(phone, { conversation_history: updatedHistory }, tid);
    }
    return;
  }

  if (actionType === 'CREATE_PAYMENT' && payload) {
    if (payload.customer_name || payload.address) {
      await saveCustomerProfile(phone, {
        name:            payload.customer_name  || null,
        phone:           payload.customer_phone || null,
        last_address:    payload.address        || null,
        delivery_method: payload.delivery_method,
        payment_method:  'credit',
      }, tid);
    }
    await updateSession(phone, { conversation_history: updatedHistory }, tid);

    const returnValue = makeReturnValue();
    try {
      const maxPayments = await settings.get('max_payments', tid).catch(() => 1);
      const { lowProfileCode, paymentUrl } = await createPaymentPage({
        amount:      payload.total,
        returnValue,
        productName: `הזמנה`,
        phone,
        tenantId:    tid,
        maxPayments: parseInt(maxPayments, 10) || 1,
      });

      await savePendingPayment({
        phone,
        cardcomCode:  lowProfileCode,
        returnValue,
        orderData:    { ...payload, tenant_id: tid },
      });

      console.log(`[ai-handler] CREATE_PAYMENT — phone=${phone} tenant=${tid} code=${lowProfileCode} rv=${returnValue} total=${payload.total}`);

      const lang = detectLang(userMessage, history);
      const linkMsg = lang === 'en'
        ? `💳 Please complete your payment here:\n${paymentUrl}\n\nThe link is valid for 30 minutes.`
        : `💳 לסיום ביצוע ההזמנה, שלם כאן:\n${paymentUrl}\n\nהקישור בתוקף ל-30 דקות.`;

      await reply(phone, linkMsg, tid);
    } catch (err) {
      console.error('[ai-handler] createPaymentPage error:', err.message);
      const lang = detectLang(userMessage, history);
      await reply(phone, lang === 'en'
        ? 'Sorry, could not generate a payment link. Please try again.'
        : 'מצטערים, לא הצלחנו ליצור קישור תשלום. אנא נסה שוב.', tid);
    }
    return;
  }

  await updateSession(phone, { conversation_history: updatedHistory }, tid);
}

module.exports = { handleMessage, stripAction, detectLang, parsePayload };
