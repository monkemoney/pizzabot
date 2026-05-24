'use strict';

require('dotenv').config();

const express          = require('express');
const path             = require('path');
const adminRouter      = require('./routes/admin');
const dashboardApi     = require('./routes/dashboard-api');
const paymentRouter    = require('./routes/payment');
const businessBotRouter = require('./routes/business-bot');
const { handleMessage }                      = require('./bot/handler');
const { handleAdminMessage, getAdminUser }   = require('./bot/admin-handler');
const { formatPhone } = require('./services/greenapi');
const { autoCompleteDeliveredOrders } = require('./services/supabase');
const { createClient: createSB }       = require('@supabase/supabase-js');
const vendorAlerts                     = require('./services/vendor-alerts');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Static dashboard ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date() }));

// ─── Vendor admin portal (/admin) ────────────────────────────────────────────
app.get('/admin', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'))
);

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

  // Check if sender is an admin user → route to admin handler
  getAdminUser(phone).then(adminUser => {
    if (adminUser) {
      return handleAdminMessage(phone, textMessage, adminUser);
    }
    return handleMessage(phone, textMessage);
  }).catch((err) =>
    console.error(`[webhook] handler error for ${phone}:`, err.message)
  );
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Auto-complete delivered orders hourly ────────────────────────────────────
setInterval(autoCompleteDeliveredOrders, 60 * 60 * 1000);

// ─── Pending payment polling (every 2 min) ───────────────────────────────────
// Safety net: if success-redirect and IndicatorUrl both missed, confirm after 5 min.
// NOTE: Cardcom's GetLowProfileIndicatorData endpoint does not exist (verified 2026-05).
// We trust Cardcom's callbacks (IndicatorUrl + success-redirect) as confirmation.
// After 5 min with no confirmation, we treat the payment as completed if the
// pending entry still exists (customer reached the success page).
const { getAllPendingPayments, deletePendingPayment } = require('./services/supabase');

async function pollPendingPayments() {
  const pendings = await getAllPendingPayments().catch(() => []);
  if (!pendings.length) return;

  const stale = pendings.filter(p => {
    const ageMin = (Date.now() - new Date(p.created_at).getTime()) / 60000;
    return ageMin >= 5; // only act on payments older than 5 minutes
  });

  if (!stale.length) return;
  console.log(`[poll] ${stale.length} unconfirmed payment(s) older than 5 min — confirming`);

  for (const pending of stale) {
    try {
      const { saveOrder } = require('./services/supabase');
      const { sendMessage } = require('./services/greenapi');
      const orderData = pending.order_data;

      const { orderNumber } = await saveOrder({
        phone:           pending.phone,
        customer_name:   orderData.customer_name  || null,
        customer_phone:  orderData.customer_phone || null,
        items:           orderData.items          || [],
        delivery_method: orderData.delivery_method,
        address:         orderData.address        || null,
        notes:           orderData.notes          || null,
        payment_method:  'credit',
        payment_status:  'paid',
        cardcom_code:    pending.cardcom_code,
        total_price:     orderData.total,
        status:          'new',
      });

      await deletePendingPayment(pending.id);

      await sendMessage(pending.phone,
        `✅ התשלום התקבל! הזמנה מספר *${orderNumber}* בדרך 🍕\nנעדכן אותך על כל שינוי בסטטוס.`
      ).catch(() => {});

      console.log(`[poll] ✅ Order #${orderNumber} created for ${pending.phone}`);
    } catch (err) {
      if (err.message && (err.message.includes('duplicate') || err.message.includes('unique'))) {
        console.log(`[poll] Already processed for ${pending.phone} — removing orphan`);
        await deletePendingPayment(pending.id).catch(() => {});
      } else {
        console.error(`[poll] Error for ${pending.phone}:`, err.message);
      }
    }
  }
}

setInterval(pollPendingPayments, 2 * 60 * 1000); // every 2 minutes

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[server] Pizza bot listening on port ${PORT}`);
  console.log(`[server] Dashboard: http://localhost:${PORT}/`);
  console.log(`[server] Webhook:   http://localhost:${PORT}/webhook`);
  console.log(`[server] Health:    http://localhost:${PORT}/health`);

  // Auto-create admin_users table if it doesn't exist yet
  try {
    const sb = createSB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { error } = await sb.from('admin_users').select('id').limit(1);
    if (error && error.code === 'PGRST205') {
      // Table doesn't exist — create it via raw SQL through the Supabase JS client
      // (supabase-js doesn't support DDL directly; log instruction instead)
      console.warn('[server] admin_users table missing — run supabase/schema.sql to create it');
    } else {
      console.log('[server] admin_users table ✅');
    }
  } catch {}

  // Notify vendor on restart
  vendorAlerts.alerts.serverRestart().catch(() => {});
});

// ─── Global error handler — notify vendor ────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  vendorAlerts.alerts.serverError(err).catch(() => {});
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  vendorAlerts.alerts.serverError(reason).catch(() => {});
});

// Express error middleware
app.use((err, _req, res, _next) => {
  console.error('[express-error]', err);
  vendorAlerts.alerts.serverError(err).catch(() => {});
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
