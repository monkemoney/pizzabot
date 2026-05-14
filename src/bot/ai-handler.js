'use strict';

const { callClaude }              = require('../services/claude');
const { buildSystemPrompt }       = require('./prompts');
const { sendMessage }             = require('../services/greenapi');
const { getSession, updateSession, savePendingPayment, saveOrder } = require('../services/supabase');
const { createPaymentPage }       = require('../services/cardcom');
const settings                    = require('../services/settings');
const crypto                      = require('crypto');

// <!--ACTION:TYPE:{json}--> or <!--ACTION:RESET-->
const ACTION_RE = /<!--ACTION:(CREATE_PAYMENT|SAVE_ORDER|RESET)(?::(\{[\s\S]*?\}))?-->/;

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
  const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];

  console.log(`[ai-handler] phone=${phone} historyLen=${history.length} msg="${userMessage.slice(0, 80)}"`);

  let systemPrompt;
  try {
    systemPrompt = await buildSystemPrompt();
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

  // ── RESET ──
  if (actionType === 'RESET') {
    await updateSession(phone, { conversation_history: [], pending_order: {} });
    return;
  }

  // ── SAVE_ORDER (cash payment) ──
  if (actionType === 'SAVE_ORDER' && payload) {
    try {
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
    await updateSession(phone, { conversation_history: updatedHistory });

    const returnValue = makeReturnValue();

    try {
      const { lowProfileCode, paymentUrl } = await createPaymentPage({
        amount:      payload.total,
        returnValue,
        productName: `פיצה דליבריס — הזמנה`,
        phone,
      });

      // Save the pending payment so the webhook can find it later
      await savePendingPayment({
        phone,
        cardcomCode:  lowProfileCode,
        returnValue,
        orderData:    payload,
      });

      const lang = detectLang(userMessage, history);
      const linkMsg = lang === 'en'
        ? `💳 Please complete your payment here:\n${paymentUrl}\n\nThe link is valid for 30 minutes.`
        : `💳 לסיום ביצוע ההזמנה, שלם כאן:\n${paymentUrl}\n\nהקישור בתוקף ל-30 דקות.`;

      await reply(phone, linkMsg);
    } catch (err) {
      console.error('[ai-handler] createPaymentPage error:', err.message);
      await reply(phone, lang === 'en'
        ? 'Sorry, could not generate a payment link. Please try again.'
        : 'מצטערים, לא הצלחנו ליצור קישור תשלום. אנא נסה שוב.');
    }
    return;
  }

  // Fallback — save history
  await updateSession(phone, { conversation_history: updatedHistory });
}

module.exports = { handleMessage };
