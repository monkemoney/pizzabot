'use strict';

const { callClaude }              = require('../services/claude');
const { buildSystemPrompt }       = require('./prompts');
const { sendMessage, sendToppingsPoll } = require('../services/greenapi');
const { getSession, updateSession, savePendingPayment, saveOrder,
        getLastOrderByPhone, saveCustomerProfile, getCustomerProfile } = require('../services/supabase');
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

// ─── Main handler ────────────────────────────────────────────────────────────

async function handleMessage(phone, userMessage) {
  // Check if the restaurant is open
  const open = await settings.isOpen();
  if (!open) {
    const session = await getSession(phone);
    const lang = session.language || 'he';
    await reply(phone, lang === 'en'
      ? "Sorry, we're currently closed. Please try again during business hours 🕐"
      : 'מצטערים, אנחנו כרגע סגורים. אנא נסה שוב בשעות הפתיחה 🕐');
    return;
  }

  const session = await getSession(phone);
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
          const { updateOrderStatus } = require('../services/supabase');
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
