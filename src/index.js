'use strict';

require('dotenv').config();

const express          = require('express');
const path             = require('path');
const adminRouter      = require('./routes/admin');
const dashboardApi     = require('./routes/dashboard-api');
const paymentRouter    = require('./routes/payment');
const businessBotRouter = require('./routes/business-bot');
const { handleMessage }   = require('./bot/handler');
const { formatPhone, isControlOption, CTRL_CONFIRM, CTRL_BACK, CTRL_NO_TOP } = require('./services/greenapi');
const { autoCompleteDeliveredOrders } = require('./services/supabase');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Static dashboard ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date() }));

// ─── Dashboard API ────────────────────────────────────────────────────────────
app.use('/api', dashboardApi);

// ─── Payment routes (Cardcom webhook + success/failed pages) ─────────────────
app.use('/webhook', paymentRouter);   // POST /webhook/payment
app.use('/payment', paymentRouter);   // GET  /payment/success, /payment/failed

// ─── Legacy admin routes ──────────────────────────────────────────────────────
app.use('/admin', adminRouter);

// ─── Business owner WhatsApp bot ──────────────────────────────────────────────
if (process.env.GREEN_API_BUSINESS_INSTANCE_ID) {
  app.use('/webhook/business', businessBotRouter);
  console.log('[server] Business bot webhook: /webhook/business');
}

// ─── Customer WhatsApp webhook (Green API) ────────────────────────────────────
//
// Payload structure:
// { typeWebhook: "incomingMessageReceived",
//   senderData: { sender: "972501234567@c.us" },
//   messageData: { typeMessage: "textMessage",
//                  textMessageData: { textMessage: "hello" } } }
//
app.post('/webhook', (req, res) => {
  res.sendStatus(200); // ack immediately — Green API retries on non-200

  const body = req.body;

  // Log ALL non-standard webhook types so we can debug
  if (body.typeWebhook !== 'incomingMessageReceived') {
    console.log(`[webhook] type=${body.typeWebhook}`, JSON.stringify(body).slice(0, 500));
    // Fall through — don't return yet, handle poll events below
  }

  // Handle poll vote events — may arrive with different typeWebhook values
  if (body.typeWebhook === 'pollUpdateReceived' ||
      (body.typeWebhook === 'incomingMessageReceived' &&
       body.messageData?.typeMessage === 'pollUpdateMessage')) {
    const rawSender = body.senderData?.sender;
    if (!rawSender) return;
    const phone = formatPhone(rawSender);

    // Real format (confirmed): messageData.pollMessageData.votes
    const allOptions = (
      body.messageData?.pollMessageData?.votes ||
      body.messageData?.pollMessageData?.stateMessage?.pollOptions ||
      body.pollMessageData?.votes ||
      []
    );

    console.log('[poll] typeWebhook:', body.typeWebhook, 'options:', JSON.stringify(allOptions).slice(0, 300));

    const voted = allOptions.filter((o) => {
      const v = o.optionVoters;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'number') return v > 0;
      return false;
    }).map((o) => o.optionName);

    console.log('[poll] voted:', voted);

    if (!voted.length) return;

    const hasBack    = voted.some((v) => v.includes('🔙'));
    const hasConfirm = voted.some((v) => v.includes('✅ אישור') || v.includes('✅ Confirm'));
    const hasNoTop   = voted.some((v) => v.includes('ללא תוספות') || v.includes('No toppings'));

    let textMessage = null;

    if (hasConfirm) {
      // Confirm always wins — even if user accidentally also tapped Back
      // Multi-select poll (items or toppings) — user confirmed selection
      const selections = voted.filter((v) => !v.startsWith('✅') && !v.startsWith('🔙'));
      if (selections.length) {
        textMessage = `בחרתי: ${selections.join(', ')}${hasNoTop ? ' | ללא תוספות' : ''}`;
      } else if (hasNoTop) {
        textMessage = 'ללא תוספות';
      } else {
        // Confirmed with nothing selected — treat as "no preference"
        textMessage = 'ללא תוספות';
      }
    } else if (hasBack) {
      // Back button only (no confirm) — return to category poll
      textMessage = '🔙 חזרה לתפריט';
    } else if (!voted.some((v) => v.startsWith('✅') || v.startsWith('🔙'))) {
      // Single-answer category poll — no control options, pass directly
      const selection = voted.find((v) => v.length > 0);
      if (selection) textMessage = selection;
    }
    // else: intermediate multi-select vote (no confirm yet) — ignore

    if (textMessage) {
      handleMessage(phone, textMessage).catch((err) =>
        console.error(`[webhook] poll handleMessage error for ${phone}:`, err.message)
      );
    }
    return;
  }

  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const messageData = body.messageData;
  if (!messageData) return;

  const rawSender = body.senderData?.sender;
  if (!rawSender) return;

  // Ignore messages from the business bot instance
  const instanceId = body.instanceData?.idInstance?.toString();
  if (instanceId && instanceId === process.env.GREEN_API_BUSINESS_INSTANCE_ID) return;

  let textMessage = null;

  if (messageData.typeMessage === 'textMessage') {
    textMessage = messageData.textMessageData?.textMessage;
  } else if (messageData.typeMessage === 'listResponseMessage') {
    textMessage = messageData.listResponseMessage?.title || messageData.listResponseMessage?.sticker;
  } else if (messageData.typeMessage === 'buttonsResponseMessage') {
    textMessage = messageData.buttonsResponseMessage?.selectedDisplayText
               || messageData.buttonsResponseMessage?.selectedButtonId;
  } else if (messageData.typeMessage === 'pollUpdateMessage') {
    console.log('[poll] raw:', JSON.stringify(messageData).slice(0, 600));

    const senderJid = body.senderData?.sender;

    // Extract all options that currently have votes — try every known payload shape
    const allOptions = (
      messageData.pollMessageData?.stateMessage?.pollOptions ||
      messageData.pollMessageData?.pollOptions ||
      messageData.pollUpdateMessage?.stateMessage?.pollOptions ||
      messageData.pollUpdateMessage?.pollOptions ||
      messageData.stateMessage?.pollOptions ||
      []
    );

    const voted = allOptions.filter((o) => {
      const v = o.optionVoters;
      if (Array.isArray(v)) return v.length > 0; // any voter (incl. by JID match)
      if (typeof v === 'number') return v > 0;
      return false;
    }).map((o) => o.optionName);

    console.log('[poll] voted options:', voted);

    if (!voted.length) return; // no votes yet / intermediate state

    const hasConfirm = voted.some((v) => v.includes('✅ אישור') || v.includes('✅ Confirm'));
    const hasBack    = voted.some((v) => v.includes('🔙'));
    const hasNoTop   = voted.some((v) => v.includes('ללא תוספות') || v.includes('No toppings'));

    if (hasBack) {
      textMessage = CTRL_BACK; // Claude will trigger SHOW_MENU
    } else if (hasConfirm) {
      // Confirmed — pass actual selections (excluding control options) as text
      const selections = voted.filter((v) => !isControlOption(v));
      if (hasNoTop) {
        textMessage = selections.length
          ? `בחרתי: ${selections.join(', ')} | ללא תוספות`
          : 'ללא תוספות';
      } else {
        textMessage = selections.length
          ? `בחרתי: ${selections.join(', ')}`
          : CTRL_CONFIRM;
      }
    }
    // If only intermediate votes (no confirm/back) → ignore until user confirms
  }

  if (!textMessage) return;

  const phone = formatPhone(rawSender);

  handleMessage(phone, textMessage).catch((err) =>
    console.error(`[webhook] handleMessage error for ${phone}:`, err.message)
  );
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Auto-complete delivered orders hourly ────────────────────────────────────
setInterval(autoCompleteDeliveredOrders, 60 * 60 * 1000);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Pizza bot listening on port ${PORT}`);
  console.log(`[server] Dashboard: http://localhost:${PORT}/`);
  console.log(`[server] Webhook:   http://localhost:${PORT}/webhook`);
  console.log(`[server] Health:    http://localhost:${PORT}/health`);
});

module.exports = app;
