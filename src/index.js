'use strict';

require('dotenv').config();

const express          = require('express');
const path             = require('path');
const adminRouter      = require('./routes/admin');
const dashboardApi     = require('./routes/dashboard-api');
const paymentRouter    = require('./routes/payment');
const businessBotRouter = require('./routes/business-bot');
const { handleMessage }   = require('./bot/handler');
const { formatPhone } = require('./services/greenapi');
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

  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const messageData = body.messageData;
  if (!messageData) return;

  const rawSender = body.senderData?.sender;
  if (!rawSender) return;

  // Ignore messages from the business bot instance
  const instanceId = body.instanceData?.idInstance?.toString();
  if (instanceId && instanceId === process.env.GREEN_API_BUSINESS_INSTANCE_ID) return;

  const phone = formatPhone(rawSender);
  let textMessage = null;

  if (messageData.typeMessage === 'textMessage') {
    textMessage = messageData.textMessageData?.textMessage;

  } else if (messageData.typeMessage === 'listResponseMessage') {
    textMessage = messageData.listResponseMessage?.title || messageData.listResponseMessage?.sticker;

  } else if (messageData.typeMessage === 'buttonsResponseMessage') {
    textMessage = messageData.buttonsResponseMessage?.selectedDisplayText
               || messageData.buttonsResponseMessage?.selectedButtonId;

  } else if (messageData.typeMessage === 'pollUpdateMessage') {
    // ── Toppings poll handler ─────────────────────────────────────────────────
    // Only toppings polls remain in the new waiter flow.
    // Toppings always have " — " (price separator) + a ✅ confirm button.

    const allOptions = messageData.pollMessageData?.votes || [];
    const voted = allOptions
      .filter((o) => Array.isArray(o.optionVoters) ? o.optionVoters.length > 0 : o.optionVoters > 0)
      .map((o) => o.optionName);

    console.log('[poll] voted:', voted);

    if (!voted.length) return;

    const hasConfirm = voted.some((v) => v.startsWith('✅') && !v.includes('ללא') && !v.includes('No topping'));
    const hasNoTop   = voted.some((v) => v.includes('ללא תוספות') || v.includes('No topping'));
    const hasItems   = voted.some((v) => v.includes(' — '));

    if (hasConfirm) {
      // User confirmed topping selection → build text for Claude
      const selections = voted.filter((v) => !v.startsWith('✅'));
      textMessage = selections.length
        ? `בחרתי: ${selections.join(', ')}`
        : 'ללא תוספות';
    } else if (!hasItems) {
      // Intermediate vote with no price separator → ignore
      return;
    } else {
      // Has item votes but no confirm yet → ignore (wait for confirm)
      return;
    }
  }

  if (!textMessage) return;

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
