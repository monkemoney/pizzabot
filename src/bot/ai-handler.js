'use strict';

const { callClaude }              = require('../services/claude');
const { buildSystemPrompt }       = require('./prompts');
const { sendMessage } = require('../services/greenapi');
const { getSession, updateSession, savePendingPayment, saveOrder,
        getLastOrderByPhone, saveCustomerProfile, getCustomerProfile,
        getOrderById, updateOrderStatus, updateOrder } = require('../services/supabase');
const { createPaymentPage }       = require('../services/cardcom');
const settings                    = require('../services/settings');
const sse                         = require('../services/sse');
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

// Whether the last reply() actually reached the customer, keyed by phone.
// The handler is serialized per conversation, so one slot per phone is enough.
const _lastDelivery = new Map(); // phone → boolean

/**
 * Send a message to the customer and REPORT whether it landed.
 *
 * This used to swallow every failure, so a rejected send still had its text
 * written into conversation_history as though the customer had read it — the
 * bot's own record of the conversation then disagreed with reality, and Claude
 * reasoned from the fiction on the next turn.
 */
async function reply(phone, text, tenantId) {
  if (!text) return true;
  try {
    await sendMessage(phone, text, tenantId);
    _lastDelivery.set(phone, true);
    return true;
  } catch (err) {
    _lastDelivery.set(phone, false);
    console.error(`[ai-handler] send FAILED ${phone} (tenant ${tenantId}):`, err.message);
    require('../services/vendor-alerts').alerts
      .deliveryFailed(phone, err.message).catch(() => {});
    return false;
  }
}

function lastReplyDelivered(phone) {
  return _lastDelivery.get(phone) !== false;
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

// ─── Tenant toppings snapshot (for the availability check) ───────────────────
// Lazy shared Supabase client + per-tenant cache (3s TTL — same coherence model
// as settings/menu-service: one snapshot per message, direct-DB edits picked up
// within seconds). Replaces a fresh createClient + 2 queries on EVERY message.
let _stockSB = null;
function stockDB() {
  if (!_stockSB) {
    const { createClient } = require('@supabase/supabase-js');
    _stockSB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _stockSB;
}
const TOPPINGS_TTL = 3_000;
const _toppingsCache = new Map(); // tenantId → { data: [{name_he,is_available}], time }
async function getTenantToppings(tid) {
  const hit = _toppingsCache.get(tid);
  if (hit && Date.now() - hit.time < TOPPINGS_TTL) return hit.data;
  const sb = stockDB();
  const { data: tenantProds } = await sb.from('products').select('id').eq('tenant_id', tid);
  const productIds = (tenantProds || []).map((p) => p.id);
  const { data } = productIds.length
    ? await sb.from('product_additions').select('name_he, is_available').in('product_id', productIds)
    : { data: [] };
  _toppingsCache.set(tid, { data: data || [], time: Date.now() });
  return data || [];
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
      await reply(phone, 'ההזמנה כבר אינה פעילה.', tenantId);
      return;
    }
    await updateOrder(order.id, { dispute_status: 'resolved', dispute_resolution: 'replaced' });
    await updateSession(phone, { pending_dispute: null }, tenantId);
    await reply(phone, `מעולה! בודקים אפשרות להחלפה — ${msg}. נחזור אליך מיד.`, tenantId);
    // NOTE: must call the INNER handler — we're already inside this phone's
    // serialized slot; going through the queued wrapper would deadlock.
    await handleMessageInner(phone, `רוצה לשנות ${missingItems.map(d=>d.name).join(' ו')} ל: ${msg}`, tenantId);
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
    await reply(phone, 'ההזמנה כבר אינה פעילה. תודה!', tenantId);
    return;
  }

  if (choice === '1') {
    const orderState = require('../services/order-state');
    // Attempt automatic refund for paid credit orders
    let refundStatus = null;
    if (order.payment_method === 'credit' && order.payment_status === 'paid') {
      const { cancelDeal } = require('../services/cardcom');
      const r = await cancelDeal(order.cardcom_deal_number, tenantId).catch(() => ({ success: false }));
      refundStatus = r.success ? 'refunded' : 'manual';
    }
    await orderState.transition(order.id, 'cancelled', {
      force: true, by: 'customer', notify: false,
      extra: { dispute_status: 'resolved', dispute_resolution: 'cancelled', cancelled_by: 'customer', refund_status: refundStatus },
    }).catch((err) => console.error('[dispute] cancel error:', err.message));
    await updateSession(phone, { pending_dispute: null, conversation_history: [], pending_order: {} }, tenantId);
    const refundNote = order.payment_method === 'credit'
      ? '\nהתשלום יזוכה לכרטיסך תוך 3-5 ימי עסקים.' : '';
    await reply(phone, `הזמנה מספר *${dispute.order_number}* בוטלה.${refundNote}\n\nמצטערים על אי הנוחות`, tenantId);
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
      `ההזמנה עודכנה — הוסרו: *${removedList}*.\n` +
      `סכום מעודכן: ₪${newTotal.toFixed(0)}.${refundNote}\nתודה על ההבנה!`,
      tenantId
    );
    return;
  }

  // ── 3: Replace with something else ──
  await updateSession(phone, { pending_dispute: { ...dispute, awaiting_replacement: true } }, tenantId);
  await reply(phone, `מה תרצה במקום ${namesStr}?\n\nכתוב מה תרצה להחליף ואנחנו נבדוק שיש לנו.`, tenantId);
}

// ─── Main handler ────────────────────────────────────────────────────────────

// Opt-out is answered before anything else — it has to work while a human has
// the conversation, while a dispute is open, and outside business hours.
// Handled deterministically: an unsubscribe request is not something to leave
// to the model's judgement.
const OPT_OUT_WORDS = ['הסר', 'הסירו', 'הסירי', 'להסיר', 'תסירו', 'הפסיקו לשלוח', 'אל תשלחו',
                       'stop', 'unsubscribe', 'remove me'];
const OPT_IN_WORDS  = ['הצטרף', 'הצטרפי', 'חזרו לשלוח', 'הרשם', 'הירשם', 'start', 'subscribe'];

function _matchesWord(text, words) {
  const t = (text || '').trim().toLowerCase();
  // Exact or near-exact only: "הסר" inside "תסיר לי את הזיתים" is not an
  // unsubscribe, and silently opting that customer out would be worse than
  // missing the keyword.
  return words.some((w) => t === w || t === `*${w}*` || t === `${w}.` || t === `${w}!`);
}

// The ONE place an inbound customer message reaches the dashboard feed —
// fields (preview line, timestamp) AND the SSE broadcast, whether the bot or a
// human holds the conversation. The broadcast used to exist only on the
// agent-mode path (failure class 7), so bot conversations never moved in the
// inbox and their preview/timestamp froze at the last agent-mode message.
// unread_count increments only in agent mode: a message the bot answered is
// handled, and a badge counting answered messages becomes permanent noise.
async function recordInboundForInbox(phone, userMessage, session, tid, extraFields = {}) {
  const agentMode = session.is_bot_active === false;
  const unread = (session.unread_count || 0) + (agentMode ? 1 : 0);
  await updateSession(phone, {
    ...extraFields,
    last_customer_message: userMessage,
    last_message_at: new Date().toISOString(),
    ...(agentMode ? { unread_count: unread } : {}),
  }, tid);
  sse.broadcast(tid, 'inbox_message', {
    phone,
    message: userMessage,
    unread_count: unread,
    is_bot_active: !agentMode,
  });
}

async function handleMessageInner(phone, userMessage, tenantId = null) {
  const tid = tenantId || settings.DEFAULT_TENANT_ID;
  const session = await getSession(phone, tid);

  if (_matchesWord(userMessage, OPT_OUT_WORDS)) {
    const { setOptedOut } = require('../services/supabase');
    await setOptedOut(phone, true, tid);
    console.log(`[opt-out] ${phone} unsubscribed from marketing (tenant ${tid})`);
    await reply(phone, 'הוסרת מרשימת הדיוור ולא נשלח אליך יותר תוכן שיווקי. עדכונים על הזמנות שביצעת ימשיכו להישלח.\nלחזרה שלח *הצטרף*.', tid);
    return;
  }
  if (session.opted_out && _matchesWord(userMessage, OPT_IN_WORDS)) {
    const { setOptedOut } = require('../services/supabase');
    await setOptedOut(phone, false, tid);
    await reply(phone, 'חזרת לרשימת הדיוור 🎉', tid);
    return;
  }

  if (session.pending_dispute) {
    return handleDisputeResponse(phone, userMessage, session, tid);
  }

  // Human agent takeover — save message + notify dashboard, skip Claude
  if (session.is_bot_active === false) {
    const newHistory = Array.isArray(session.conversation_history) ? session.conversation_history : [];
    newHistory.push({ role: 'user', content: userMessage });
    await recordInboundForInbox(phone, userMessage, session, tid, {
      conversation_history: newHistory.slice(-40),
    });
    return;
  }

  // Bot-handled messages hit the feed too (dispute responses above are the one
  // small gap — their conversation already surfaced via earlier messages).
  await recordInboundForInbox(phone, userMessage, session, tid);

  const open = await settings.isOpen(tid);
  if (!open) {
    const lang = session.language || 'he';
    await reply(phone, lang === 'en'
      ? "Sorry, we're currently closed. Please try again during business hours"
      : 'מצטערים, אנחנו כרגע סגורים. אנא נסה שוב בשעות הפתיחה', tid);
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
    // Recovery funnel: a fresh conversation may be the reply to a missed-call
    // recovery message — stamp it (fire-and-forget, never throws). Checked only
    // on new conversations so ordinary messages don't pay the lookup.
    require('../services/recovery-attribution').markResponded(phone, tid);

    const [lastOrder, editsAllowed] = await Promise.all([
      getLastOrderByPhone(phone, tid),
      settings.get('allow_order_edits', tid),
    ]);

    // "שילמתי" on an unpaid Bit order — the bot asked for this reply, so handle
    // it deterministically. We cannot verify a Bit transfer, so this only asks
    // the admins to confirm; nothing here marks the order paid.
    if (lastOrder && lastOrder.payment_method === 'bit' && lastOrder.payment_status !== 'paid'
        && !['cancelled', 'done'].includes(lastOrder.status)) {
      const paidKeywords = ['שילמתי', 'שולם', 'העברתי', 'ביצעתי תשלום', 'paid', 'i paid', 'sent the money'];
      const claimsPaid = paidKeywords.some((k) => userMessage.toLowerCase().includes(k));
      if (claimsPaid) {
        const lang = detectLang(userMessage, []);
        const orderState = require('../services/order-state');
        const relayed = await orderState.notifyAdminsPaymentClaim(lastOrder).catch(() => false);
        const msg = lang === 'en'
          ? `Thanks! We've asked the restaurant to confirm the Bit transfer for order *#${lastOrder.order_number}*.\nYou'll get a confirmation as soon as they verify it.`
          : `תודה! ביקשנו מהעסק לאמת את התשלום ב-Bit להזמנה *#${lastOrder.order_number}*.\nתקבל אישור ברגע שהתשלום יאומת.`;
        await reply(phone, msg, tid);
        if (!relayed) console.warn(`[ai-handler] payment claim for #${lastOrder.order_number} — tenant ${tid} has no admin_users to notify`);
        return;
      }
    }

    // Editable only while the order hasn't started preparing yet ('new' or 'scheduled').
    // The moment the kitchen moves it to 'preparing', the customer can no longer change/cancel it.
    if (lastOrder && ['new', 'scheduled'].includes(lastOrder.status) && editsAllowed !== false) {
      const lang = detectLang(userMessage, []);
      const cancelKeywords = ['בטל', 'ביטול', 'לבטל', 'cancel', 'שנה', 'לשנות'];
      const wantsCancel = cancelKeywords.some((k) => userMessage.toLowerCase().includes(k));
      if (wantsCancel) {
        const orderState = require('../services/order-state');
        // Attempt automatic refund for paid credit orders before cancelling
        let refundStatus = null;
        if (lastOrder.payment_method === 'credit' && lastOrder.payment_status === 'paid') {
          const { cancelDeal } = require('../services/cardcom');
          const r = await cancelDeal(lastOrder.cardcom_deal_number, tid).catch(() => ({ success: false }));
          refundStatus = r.success ? 'refunded' : 'manual';
        }
        try {
          await orderState.transition(lastOrder.id, 'cancelled', {
            by: 'customer', notify: false,
            extra: { cancelled_by: 'customer', refund_status: refundStatus },
          });
        } catch (err) {
          // Kitchen moved it to preparing (or similar) between our read and the write
          const msg = lang === 'en'
            ? `Order #${lastOrder.order_number} is already being prepared and can no longer be cancelled. Contact the restaurant for help.`
            : `הזמנה מספר ${lastOrder.order_number} כבר נכנסה להכנה ולא ניתן לבטל אותה. לעזרה אפשר לפנות לעסק.`;
          await reply(phone, msg, tid);
          return;
        }
        const refundLine = refundStatus
          ? (lang === 'en' ? '\nYour payment will be refunded within 3-5 business days.' : '\nהתשלום יזוכה לכרטיסך תוך 3-5 ימי עסקים.')
          : '';
        const msg = lang === 'en'
          ? `Order #${lastOrder.order_number} has been cancelled.${refundLine} Want to place a new order?`
          : `הזמנה מספר ${lastOrder.order_number} בוטלה.${refundLine} רוצה להזמין מחדש?`;
        await reply(phone, msg, tid);
        return;
      }
      const msg = lang === 'en'
        ? `Your order #${lastOrder.order_number} hasn't started preparing yet.\nTo cancel, send *בטל*.`
        : `הזמנה מספר ${lastOrder.order_number} עדיין לא נכנסה להכנה.\nלביטול שלח *בטל*.`;
      await reply(phone, msg, tid);
      return;
    }
  }

  // Start the toppings snapshot early — independent of the profile→prompt chain,
  // so the two DB paths run in parallel instead of stacking round-trips.
  const toppingsPromise = getTenantToppings(tid).catch(() => []);

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
  let stockNote = '';
  {
    try {
      const customerText = [
        ...history.filter(m => m.role === 'user').map(m => (typeof m.content === 'string' ? m.content : '')),
        userMessage,
      ].join(' ').toLowerCase();

      // All toppings for this tenant, both available and not — stale history
      // ("X ran out") must not override a topping that came back in stock.
      // Cached per tenant (3s TTL, same coherence model as menu-service) —
      // previously this created a fresh Supabase client + 2 queries per message,
      // a measurable latency hit under concurrent load.
      const allToppings = await toppingsPromise;

      const mentioned = new Map(); // name → is_available (unavailable wins if mixed across products)
      for (const a of allToppings || []) {
        const name = a.name_he || '';
        if (!name || !customerText.includes(name.toLowerCase())) continue;
        mentioned.set(name, mentioned.has(name) ? (mentioned.get(name) && a.is_available) : a.is_available);
      }

      if (mentioned.size > 0) {
        const lines = [...mentioned.entries()]
          .map(([name, ok]) => `- ${name}: ${ok ? 'זמינה במלאי' : 'אזלה — לא זמינה'}`)
          .join('\n');
        systemPrompt += `\n\nסטטוס מלאי עדכני לתוספות שהוזכרו בשיחה — נתון זה גובר על כל אמירה קודמת בשיחה (כולל הודעות קודמות שלך או של נציג):\n${lines}\nאם תוספת שסומנה קודם כחסרה מופיעה כאן כזמינה — היא חזרה למלאי ואפשר להציע אותה. תוספת שאינה זמינה אסור לכלול ב-SAVE_ORDER/CREATE_PAYMENT, ויש להציע חלופה.`;
        // Also attach to the current message — history full of stale "ran out"
        // statements otherwise outweighs a note at the end of the system prompt
        stockNote = `\n\n[עדכון מערכת — מלאי נבדק הרגע מול מסד הנתונים:\n${lines}\nזהו המצב הנכון כרגע, גם אם קודם בשיחה נאמר אחרת.]`;
        console.log(`[ai-handler] availability status ${phone}: ${[...mentioned.entries()].map(([n,ok]) => `${n}=${ok}`).join(', ')}`);
      }
    } catch (e) {
      console.error('[ai-handler] availability check error:', e.message);
    }
  }

  let assistantText;
  try {
    assistantText = await callClaude(systemPrompt, history, userMessage + stockNote);
  } catch (err) {
    console.error('[ai-handler] Claude error:', err.message);
    require('../services/vendor-alerts').alerts.botError(phone, err).catch(() => {});
    await reply(phone, 'מצטערים, אירעה שגיאה זמנית. אנא נסה שוב.', tid);
    return;
  }

  const match     = assistantText.match(ACTION_RE);
  const cleanText = stripAction(assistantText);

  // On the first message of a conversation: fallback greeting if Claude returned
  // empty text, plus the privacy notice — ONCE PER CUSTOMER LIFETIME, not once
  // per conversation. sessions.privacy_sent_at survives session resets (like
  // customer_profile), so returning customers only ever see the menu link.
  if (history.length === 0) {
    const botUrl = (await settings.get('bot_url', tid).catch(() => null)) || process.env.PUBLIC_URL || 'https://www.jasell.com';
    const allSettingsForName = await settings.loadAll(tid);
    const bizName = allSettingsForName.business_name || 'פיצה דליבריס';
    const menuSlug = allSettingsForName.public_slug || tid;
    const menuUrl = botUrl + '/menu.html?biz=' + encodeURIComponent(menuSlug);
    const text = cleanText || `היי! ברוכים הבאים ל${bizName}\nמשלוח או איסוף? מזומן או אשראי?\nתפריט עם תמונות: ${menuUrl}`;

    const isNewCustomer = !session.privacy_sent_at;
    const privacyNotice = isNewCustomer ? `\n\n_מדיניות הפרטיות שלנו: ${botUrl}/privacy.html_` : '';
    const delivered = await reply(phone, text + privacyNotice, tid);
    // Stamp only after a delivered send — a failed send retries the notice next time.
    if (isNewCustomer && delivered !== false) {
      await updateSession(phone, { privacy_sent_at: new Date().toISOString() }, tid);
    }
  } else if (cleanText) {
    await reply(phone, cleanText, tid);
  }

  // History records what the customer actually received. If the send failed,
  // the assistant turn is left out so the next turn re-states it instead of
  // building on something the customer never saw.
  const delivered = lastReplyDelivered(phone);
  const updatedHistory = [
    ...history,
    { role: 'user', content: userMessage },
    ...(delivered ? [{ role: 'assistant', content: assistantText }] : []),
  ].slice(-40);

  if (!match) {
    await updateSession(phone, { conversation_history: updatedHistory }, tid);
    return;
  }

  const actionType = match[1];
  const payload    = match[2] ? parsePayload(match[2]) : null;

  if (actionType === 'SHOW_TOPPINGS') {
    // Deprecated action (2026-07-28): toppings are free-text now — polls/lists
    // can't express "רבע זיתים, חצי בלי כלום" and were a recurring failure
    // source (poll parse loops, Meta single-select). The prompt no longer emits
    // this, but if the model does anyway, fall back to the free-text question
    // rather than a poll.
    const lang = detectLang(userMessage, history);
    const q = lang === 'en'
      ? 'Which toppings would you like? Feel free to describe — e.g. half olives, quarter mushrooms, onion on all — or no toppings.'
      : 'אילו תוספות תרצה? אפשר לפרט חופשי — למשל חצי זיתים, רבע פטריות, בצל על הכל — או בלי תוספות.';
    await reply(phone, q, tid);
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
          await reply(phone, `לא ניתן לתזמן הזמנה בפחות מ-${lead} דקות מראש.\nהשעה המוקדמת ביותר שניתן לתזמן כרגע: *${earliestStr}*.`, tid);
          await updateSession(phone, { conversation_history: updatedHistory }, tid);
          return;
        }
        scheduledFor = sched.toISOString();
      }

      const isScheduled = !!scheduledFor;

      const { orderNumber, order: savedOrder } = await saveOrder({
        phone,
        customer_name:   payload.customer_name   || null,
        customer_phone:  payload.customer_phone  || null,
        items:           payload.items           || [],
        delivery_method: payload.delivery_method,
        address:         payload.address         || null,
        // Recorded at order time so a later change to the zone table cannot
        // rewrite what this customer was actually charged.
        delivery_fee:    payload.delivery_method === 'delivery'
          ? await require('../services/delivery-fee').resolveDeliveryFee(payload.address, tid)
          : 0,
        notes:           payload.notes           || null,
        payment_method:  isBit ? 'bit' : 'cash',
        payment_status:  isBit ? 'pending' : 'paid',
        total_price:     payload.total,
        status:          isScheduled ? 'scheduled' : 'new',
        scheduled_for:   scheduledFor,
        tenant_id:       tid,
      });

      const lang = detectLang(userMessage, history);

      // Acceptance flow — every creation path goes through it: manual (default)
      // leaves the order awaiting approval and WhatsApps the admins; auto
      // accepts immediately and sends the approval + ETA message itself.
      // Bit orders defer both until the payment is confirmed.
      const orderState = require('../services/order-state');
      const mode = await orderState.afterCreate(savedOrder, { lang, notifyAdmins: true });
      const awaitingApproval = mode === 'manual';

      if (isScheduled) {
        const timeStr = payload.scheduled_for;
        const tailHe = awaitingApproval
          ? '\nנשלחה למסעדה לאישור — נעדכן אותך ברגע שתאושר.'
          : '\nנתחיל להכין בזמן.';
        const tailEn = awaitingApproval
          ? "\nSent to the restaurant for approval — we'll update you once it's confirmed."
          : "\nWe'll start preparing in time.";
        const confirmMsg = lang === 'en'
          ? `Order *#${orderNumber}* scheduled for ${timeStr}!${tailEn}`
          : `הזמנה מספר *${orderNumber}* תוזמנה לשעה ${timeStr}!${tailHe}`;
        await reply(phone, confirmMsg, tid);
      } else if (isBit) {
        const allSettings = await settings.loadAll(tid);
        const bitPhone = allSettings.bit_phone ? String(allSettings.bit_phone).replace(/"/g, '') : null;
        const confirmMsg = lang === 'en'
          ? `Order *#${orderNumber}* saved!\nPlease send ₪${payload.total} via Bit${bitPhone ? ` to ${bitPhone}` : ''}.\nOnce paid, reply *paid*`
          : `הזמנה מספר *${orderNumber}* נשמרה!\nלסיום — שלח *₪${payload.total}* בBit${bitPhone ? ` למספר ${bitPhone}` : ''}.\nלאחר התשלום שלח *שילמתי*`;
        await reply(phone, confirmMsg, tid);
      } else if (awaitingApproval) {
        const confirmMsg = lang === 'en'
          ? `Order *#${orderNumber}* received and sent to the restaurant for approval ✅\nWe'll update you the moment it's confirmed.`
          : `הזמנה מספר *${orderNumber}* התקבלה ונשלחה למסעדה לאישור ✅\nנעדכן אותך ברגע שההזמנה תאושר ותיכנס להכנה.`;
        await reply(phone, confirmMsg, tid);
      }

      // The order row exists either way. If the customer never got the
      // confirmation they do not know that — so the business is told, because
      // they are the ones who can pick up the phone.
      if (!lastReplyDelivered(phone)) {
        console.error(`[ai-handler] order #${orderNumber} created but the confirmation did not reach ${phone}`);
        const { getAdminUsers } = require('../services/supabase');
        const admins = await getAdminUsers(tid).catch(() => []);
        for (const admin of admins) {
          await sendMessage(admin.phone,
            `⚠️ *הזמנה #${orderNumber} נקלטה אך הלקוח לא קיבל אישור*\n${payload.customer_name || ''} ${payload.customer_phone || phone}\nשליחת ההודעה בוואטסאפ נכשלה — שווה ליצור קשר טלפוני.`,
            tid).catch(() => {});
        }
      }

      await updateSession(phone, { conversation_history: [], pending_order: {} }, tid);
    } catch (err) {
      console.error('[ai-handler] saveOrder error:', err.message);
      await reply(phone, 'אירעה שגיאה בשמירת ההזמנה. אנא נסה שוב.', tid);
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
        orderData:    {
          ...payload,
          tenant_id: tid,
          // Carried through the payment round-trip so the order records what
          // the zone charged at the time, not what it charges when it lands.
          delivery_fee: payload.delivery_method === 'delivery'
            ? await require('../services/delivery-fee').resolveDeliveryFee(payload.address, tid)
            : 0,
        },
      });

      console.log(`[ai-handler] CREATE_PAYMENT — phone=${phone} tenant=${tid} code=${lowProfileCode} rv=${returnValue} total=${payload.total}`);

      const lang = detectLang(userMessage, history);
      const linkMsg = lang === 'en'
        ? `Please complete your payment here:\n${paymentUrl}\n\nThe link is valid for 30 minutes.`
        : `לסיום ביצוע ההזמנה, שלם כאן:\n${paymentUrl}\n\nהקישור בתוקף ל-30 דקות.`;

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

// ─── Per-conversation serialization ──────────────────────────────────────────
// Two concurrent messages from the same phone used to race on the session row:
// both handlers read the same conversation_history, both appended, and the
// last upsert won — silently dropping a turn (measured: 100% loss under true
// concurrency in the bootcamp race test). Production runs a single instance,
// so an in-process FIFO per (tenant, phone) fully serializes each conversation.
// Different customers are unaffected — their queues are independent.
const _convQueues = new Map(); // key → tail promise (never rejects)
function handleMessage(phone, userMessage, tenantId = null) {
  const key = `${tenantId || settings.DEFAULT_TENANT_ID}:${phone}`;
  const prev = _convQueues.get(key) || Promise.resolve();
  const run = prev.then(() => handleMessageInner(phone, userMessage, tenantId));
  const tail = run.catch(() => {}); // an error must not poison the queue
  _convQueues.set(key, tail);
  tail.then(() => { if (_convQueues.get(key) === tail) _convQueues.delete(key); });
  return run; // caller still sees this call's own success/failure
}

module.exports = { handleMessage, stripAction, detectLang, parsePayload };
