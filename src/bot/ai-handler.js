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

async function reply(phone, text) {
  if (!text) return;
  try { await sendMessage(phone, text); }
  catch (err) { console.error(`[ai-handler] send failed ${phone}:`, err.message); }
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

async function handleDisputeResponse(phone, userMessage, session) {
  const dispute = session.pending_dispute;
  const msg     = userMessage.trim();

  // Normalise: support both new (items[]) and old (item_name) format
  const missingItems = dispute.items && dispute.items.length
    ? dispute.items
    : [{ type: 'item', name: dispute.item_name || '?', price: dispute.item_price || 0, qty: 1 }];

  const totalRefund = missingItems.reduce((s, d) => s + (d.price || 0) * (d.qty || 1), 0);
  const isSingle    = missingItems.length === 1;
  const namesStr    = isSingle ? `*${missingItems[0].name}*` : 'הפריטים החסרים';
  const refundStr   = totalRefund > 0 ? ` (זיכוי של ₪${totalRefund.toFixed(0)})` : '';

  const choice = msg.replace(/\s+/g, '');

  // ── If waiting for replacement text (choice already was '3') ────────────────
  if (dispute.awaiting_replacement) {
    const order = await getOrderById(dispute.order_id);
    if (!order || ['cancelled', 'done'].includes(order.status)) {
      await updateSession(phone, { pending_dispute: null });
      await reply(phone, 'ההזמנה כבר אינה פעילה. 🙏');
      return;
    }
    // Mark dispute resolved, add replacement note, pass to Claude to process
    await updateOrder(order.id, { dispute_status: 'resolved', dispute_resolution: 'replaced' });
    await updateSession(phone, {
      pending_dispute: null,
      // Inject context so Claude knows what happened
    });
    // Let Claude handle the replacement naturally with context
    const systemContext = `הלקוח ביקש להחליף את ${namesStr} ב: "${msg}". עדכן את העגלה בהתאם, אשר את השינוי ועבור לסיכום.`;
    await reply(phone, `מעולה! בודקים אפשרות להחלפה — ${msg}. נחזור אליך מיד.`);
    // Continue with Claude to handle replacement
    await handleMessage(phone, `רוצה לשנות ${missingItems.map(d=>d.name).join(' ו')} ל: ${msg}`);
    return;
  }

  if (!['1', '2', '3'].includes(choice)) {
    const hint = `אנא שלח:\n*1* — לבטל את ההזמנה\n*2* — להמשיך ללא ${namesStr}${refundStr}\n*3* — להחליף בפריט אחר`;
    await reply(phone, hint);
    return;
  }

  const order = await getOrderById(dispute.order_id);
  if (!order || ['cancelled', 'done'].includes(order.status)) {
    await updateSession(phone, { pending_dispute: null });
    await reply(phone, 'ההזמנה כבר אינה פעילה. תודה! 🙏');
    return;
  }

  // ── 1: Cancel ──
  if (choice === '1') {
    await updateOrderStatus(order.id, 'cancelled');
    await updateOrder(order.id, { dispute_status: 'resolved', dispute_resolution: 'cancelled', cancelled_by: 'customer' });
    await updateSession(phone, { pending_dispute: null, conversation_history: [], pending_order: {} });
    const refundNote = order.payment_method === 'credit'
      ? '\nהתשלום יזוכה לכרטיסך תוך 3-5 ימי עסקים.' : '';
    await reply(phone, `✅ הזמנה מספר *${dispute.order_number}* בוטלה.${refundNote}\n\nמצטערים על אי הנוחות 🙏`);
    return;
  }

  // ── 2: Continue without missing items ──
  if (choice === '2') {
    let orderItems = [...(order.items || [])];
    let removed    = 0;

    for (const d of missingItems) {
      if (d.type === 'topping') {
        // Remove topping from all items that have it
        orderItems = orderItems.map(it => ({
          ...it,
          toppings: (it.toppings || []).filter(t => (t.name || t.name_he) !== d.name),
        }));
      } else {
        // Remove item entirely
        const before = orderItems.length;
        orderItems   = orderItems.filter(it => (it.name || it.name_he) !== d.name);
        const qty    = d.qty || 1;
        if (orderItems.length < before) removed += (d.price || 0) * qty;
      }
    }

    const newTotal = Math.max(0, (parseFloat(order.total_price) || 0) - removed);
    await updateOrder(order.id, {
      items:              orderItems,
      total_price:        newTotal,
      dispute_status:     'resolved',
      dispute_resolution: 'removed',
    });
    await updateSession(phone, { pending_dispute: null });

    const removedList = missingItems.map(d =>
      d.type === 'topping' ? `תוספת ${d.name}` : d.name).join(', ');
    const refundNote = order.payment_method === 'credit' && removed > 0
      ? `\nהחזר של ₪${removed.toFixed(0)} יזוכה לכרטיסך.` : '';

    await reply(phone,
      `✅ ההזמנה עודכנה — הוסרו: *${removedList}*.\n` +
      `סכום מעודכן: ₪${newTotal.toFixed(0)}.${refundNote}\nתודה על ההבנה! 🙏`
    );
    return;
  }

  // ── 3: Replace with something else ──
  await updateSession(phone, {
    pending_dispute: { ...dispute, awaiting_replacement: true },
  });
  await reply(phone,
    `מה תרצה במקום ${namesStr}? 😊\n\nכתוב מה תרצה להחליף ואנחנו נבדוק שיש לנו.`
  );
}

// ─── Main handler ────────────────────────────────────────────────────────────

async function handleMessage(phone, userMessage) {
  const session = await getSession(phone);

  // ── Pending dispute — process before isOpen check ────────────────────────────
  // Customer is replying to a "missing item" question about an existing order.
  if (session.pending_dispute) {
    return handleDisputeResponse(phone, userMessage, session);
  }

  // Check if the restaurant is open
  const open = await settings.isOpen();
  if (!open) {
    const lang = session.language || 'he';
    await reply(phone, lang === 'en'
      ? "Sorry, we're currently closed. Please try again during business hours 🕐"
      : 'מצטערים, אנחנו כרגע סגורים. אנא נסה שוב בשעות הפתיחה 🕐');
    return;
  }

  let history = Array.isArray(session.conversation_history) ? session.conversation_history : [];

  // ── Stale session guard ───────────────────────────────────────────────────────
  // If history is very long but seems stuck or outdated (old poll-based flow),
  // check the last assistant message. If it contains old-flow markers (בחרתי:/סקר)
  // or if history is older than 3 hours, reset so Claude starts fresh.
  if (history.length > 0) {
    const lastMsg = history[history.length - 1];
    const lastTs  = session.updated_at ? new Date(session.updated_at) : null;
    const ageHours = lastTs ? (Date.now() - lastTs.getTime()) / 3600000 : 999;
    const hasOldFlow = history.some((m) =>
      typeof m.content === 'string' && (
        m.content.includes('SHOW_MENU') ||
        m.content.includes('sendCategoryPoll') ||
        (m.content.includes('בחרתי:') && m.content.includes(' — '))
      )
    );
    if (ageHours > 3 || hasOldFlow) {
      console.log(`[ai-handler] resetting stale/old-flow session for ${phone} (age=${ageHours.toFixed(1)}h, oldFlow=${hasOldFlow})`);
      history = [];
      await updateSession(phone, { conversation_history: [], pending_order: {} });
    }
  }

  console.log(`[ai-handler] phone=${phone} historyLen=${history.length} msg="${userMessage.slice(0, 80)}"`);

  // ── 15-minute edit window ──────────────────────────────────────────────────
  // If history is empty (new conversation) and the customer has a recent order,
  // check if they're trying to cancel/modify it.
  if (history.length === 0) {
    const lastOrder = await getLastOrderByPhone(phone);
    if (lastOrder && lastOrder.status === 'new') {
      const minutesSince = (Date.now() - new Date(lastOrder.created_at).getTime()) / 60000;
      if (minutesSince <= 15) {
        const lang = detectLang(userMessage, []);
        const cancelKeywords = ['בטל', 'ביטול', 'לבטל', 'cancel', 'שנה', 'לשנות'];
        const wantsCancel = cancelKeywords.some((k) => userMessage.toLowerCase().includes(k));
        if (wantsCancel) {
          // Cancel the order
          await updateOrderStatus(lastOrder.id, 'cancelled');
          const msg = lang === 'en'
            ? `✅ Order #${lastOrder.order_number} has been cancelled. Want to place a new order?`
            : `✅ הזמנה מספר ${lastOrder.order_number} בוטלה. רוצה להזמין מחדש?`;
          await reply(phone, msg);
          return;
        }
        // Inform them about the edit window
        const msg = lang === 'en'
          ? `Your order #${lastOrder.order_number} was placed ${Math.floor(minutesSince)} min ago and is being prepared.\nTo cancel, send *בטל* within ${Math.floor(15 - minutesSince)} more minutes.`
          : `הזמנה מספר ${lastOrder.order_number} בוצעה לפני ${Math.floor(minutesSince)} דקות ונמצאת בטיפול.\nלביטול שלח *בטל* בתוך ${Math.floor(15 - minutesSince)} דקות נוספות.`;
        await reply(phone, msg);
        return;
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Load returning customer profile (name, address from previous orders)
  const customerProfile = await getCustomerProfile(phone).catch(() => null);

  let systemPrompt;
  try {
    systemPrompt = await buildSystemPrompt(customerProfile);
  } catch (err) {
    console.error('[ai-handler] Failed to build system prompt:', err.message);
    systemPrompt = 'You are a pizza ordering assistant. Help the customer order pizza.';
  }

  let assistantText;
  try {
    assistantText = await callClaude(systemPrompt, history, userMessage);
  } catch (err) {
    console.error('[ai-handler] Claude error:', err.message);
    await reply(phone, 'מצטערים, אירעה שגיאה זמנית. אנא נסה שוב. 🙏');
    return;
  }

  const match     = assistantText.match(ACTION_RE);
  const cleanText = stripAction(assistantText);

  // Send reply to customer first
  await reply(phone, cleanText);

  // Append to history
  const updatedHistory = [
    ...history,
    { role: 'user',      content: userMessage   },
    { role: 'assistant', content: assistantText },
  ].slice(-40); // keep last 40 messages

  if (!match) {
    await updateSession(phone, { conversation_history: updatedHistory });
    return;
  }

  const actionType = match[1];
  const payload    = match[2] ? parsePayload(match[2]) : null;

  // ── SHOW_TOPPINGS — toppings poll ──
  if (actionType === 'SHOW_TOPPINGS') {
    const lang = detectLang(userMessage, history);
    // Try to extract the product name from the current user message for per-product toppings
    const productName = userMessage.length < 80 ? userMessage : null;
    await sendToppingsPoll(phone, lang, productName).catch(() => {});
    await updateSession(phone, { conversation_history: updatedHistory });
    return;
  }

  // ── RESET ──
  if (actionType === 'RESET') {
    await updateSession(phone, { conversation_history: [], pending_order: {} });
    return;
  }

  // ── SAVE_ORDER (cash payment) ──
  if (actionType === 'SAVE_ORDER' && payload) {
    try {
      // Persist customer profile for future orders
      if (payload.customer_name || payload.address) {
        await saveCustomerProfile(phone, {
          name:            payload.customer_name  || null,
          phone:           payload.customer_phone || null,
          last_address:    payload.address        || null,
          delivery_method: payload.delivery_method,
          payment_method:  'cash',
        });
      }

      const { id, orderNumber } = await saveOrder({
        phone,
        customer_name:   payload.customer_name   || null,
        customer_phone:  payload.customer_phone  || null,
        items:           payload.items           || [],
        delivery_method: payload.delivery_method,
        address:         payload.address         || null,
        notes:           payload.notes           || null,
        payment_method:  'cash',
        payment_status:  'paid',
        total_price:     payload.total,
        status:          'new',
      });

      const lang = detectLang(userMessage, history);
      const confirmMsg = lang === 'en'
        ? `🍕 Order *#${orderNumber}* confirmed!\nWe'll start preparing it now.`
        : `🍕 הזמנה מספר *${orderNumber}* אושרה!\nמתחילים להכין עכשיו.`;
      await reply(phone, confirmMsg);

      await updateSession(phone, { conversation_history: [], pending_order: {} });
    } catch (err) {
      console.error('[ai-handler] saveOrder error:', err.message);
      await reply(phone, 'אירעה שגיאה בשמירת ההזמנה. אנא נסה שוב. 🙏');
      await updateSession(phone, { conversation_history: updatedHistory });
    }
    return;
  }

  // ── CREATE_PAYMENT (credit card) ──
  if (actionType === 'CREATE_PAYMENT' && payload) {
    // Save profile even before payment confirms — address/name are known
    if (payload.customer_name || payload.address) {
      await saveCustomerProfile(phone, {
        name:            payload.customer_name  || null,
        phone:           payload.customer_phone || null,
        last_address:    payload.address        || null,
        delivery_method: payload.delivery_method,
        payment_method:  'credit',
      });
    }
    await updateSession(phone, { conversation_history: updatedHistory });

    const returnValue = makeReturnValue();

    try {
      const { lowProfileCode, paymentUrl } = await createPaymentPage({
        amount:      payload.total,
        returnValue,
        productName: `פיצה דליבריס — הזמנה`,
        phone,
      });

      // Save the pending payment so the webhook / polling can confirm it later
      await savePendingPayment({
        phone,
        cardcomCode:  lowProfileCode,
        returnValue,
        orderData:    payload,
      });

      console.log(`[ai-handler] CREATE_PAYMENT — phone=${phone} code=${lowProfileCode} rv=${returnValue} total=${payload.total}`);

      const lang = detectLang(userMessage, history);
      const linkMsg = lang === 'en'
        ? `💳 Please complete your payment here:\n${paymentUrl}\n\nThe link is valid for 30 minutes.`
        : `💳 לסיום ביצוע ההזמנה, שלם כאן:\n${paymentUrl}\n\nהקישור בתוקף ל-30 דקות.`;

      await reply(phone, linkMsg);
    } catch (err) {
      console.error('[ai-handler] createPaymentPage error:', err.message);
      const lang = detectLang(userMessage, history);
      await reply(phone, lang === 'en'
        ? 'Sorry, could not generate a payment link. Please try again.'
        : 'מצטערים, לא הצלחנו ליצור קישור תשלום. אנא נסה שוב.');
    }
    return;
  }

  // Fallback — save history
  await updateSession(phone, { conversation_history: updatedHistory });
}

module.exports = { handleMessage, stripAction, detectLang, parsePayload };
