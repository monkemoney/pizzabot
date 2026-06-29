'use strict';

require('dotenv').config();

const express          = require('express');
const path             = require('path');
const adminRouter      = require('./routes/admin');
const dashboardApi     = require('./routes/dashboard-api');
const paymentRouter    = require('./routes/payment');
const businessBotRouter = require('./routes/business-bot');
const { handleMessage }        = require('./bot/handler');
const { handleAdminMessage }   = require('./bot/admin-handler');
const { getAdminUser }         = require('./services/supabase');
const { formatPhone }          = require('./services/greenapi');
const { DEFAULT_TENANT_ID }    = require('./services/settings');
const { autoCompleteDeliveredOrders, pruneOldSessions } = require('./services/supabase');
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

// ─── Client onboarding (public, token-based) ─────────────────────────────────
app.get('/onboarding/:token', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'onboarding.html'))
);

// ─── Kitchen window ───────────────────────────────────────────────────────────
app.get('/kitchen', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'kitchen.html'))
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

// ─── WhatsApp webhook handler (shared for default + per-tenant routes) ───────

function handleWebhook(req, res, tenantId) {
  res.sendStatus(200); // ack immediately — Green API retries on non-200

  const body = req.body;
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const messageData = body.messageData;
  if (!messageData) return;

  const rawSender = body.senderData?.sender;
  if (!rawSender) return;

  // Verify the request came from the expected Green API instance for this tenant
  const instanceId = body.instanceData?.idInstance?.toString();
  if (instanceId && instanceId === process.env.GREEN_API_BUSINESS_INSTANCE_ID) return;

  const expectedInstance = tenantId === DEFAULT_TENANT_ID
    ? process.env.GREEN_API_INSTANCE_ID
    : null; // resolved async below

  if (expectedInstance && instanceId && instanceId !== expectedInstance) {
    console.warn(`[webhook:${tenantId}] instanceId mismatch — got ${instanceId}, expected ${expectedInstance}. Dropping.`);
    return;
  }

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
    const allOptions = messageData.pollMessageData?.votes || [];
    const voted = allOptions
      .filter((o) => Array.isArray(o.optionVoters) ? o.optionVoters.length > 0 : o.optionVoters > 0)
      .map((o) => o.optionName);

    console.log('[poll] voted:', voted);
    if (!voted.length) return;

    const hasConfirm = voted.some((v) => v.startsWith('✅') && !v.includes('ללא') && !v.includes('No topping'));
    const hasItems   = voted.some((v) => v.includes(' — '));

    if (hasConfirm) {
      const selections = voted.filter((v) => !v.startsWith('✅'));
      textMessage = selections.length ? `בחרתי: ${selections.join(', ')}` : 'ללא תוספות';
    } else if (!hasItems) {
      return;
    } else {
      return;
    }
  }

  if (!textMessage) return;

  const verifyAndHandle = async () => {
    // For per-tenant routes, verify instanceId against the tenant's configured instance
    if (tenantId !== DEFAULT_TENANT_ID && instanceId) {
      const tenantInstance = await settings.get('green_api_instance', tenantId).catch(() => null);
      if (tenantInstance && instanceId !== tenantInstance.toString()) {
        console.warn(`[webhook:${tenantId}] instanceId mismatch — got ${instanceId}, expected ${tenantInstance}. Dropping.`);
        return;
      }
    }

    const adminUser = await getAdminUser(phone, tenantId);
    if (adminUser) return handleAdminMessage(phone, textMessage, adminUser, tenantId);
    return handleMessage(phone, textMessage, tenantId);
  };

  verifyAndHandle().catch((err) =>
    console.error(`[webhook:${tenantId}] handler error for ${phone}:`, err.message)
  );
}

// Default tenant webhook (backward compat)
app.post('/webhook', (req, res) => handleWebhook(req, res, DEFAULT_TENANT_ID));

// Per-tenant webhook — each client's Green API instance points here
app.post('/webhook/:tenantId', (req, res) => handleWebhook(req, res, req.params.tenantId));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Auto-complete delivered orders hourly ────────────────────────────────────
setInterval(autoCompleteDeliveredOrders, 60 * 60 * 1000);
setInterval(pruneOldSessions, 24 * 60 * 60 * 1000); // daily

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
        tenant_id:       pending.tenant_id || orderData.tenant_id || process.env.TENANT_ID,
      });

      await deletePendingPayment(pending.id);

      const tenantId = pending.tenant_id || orderData.tenant_id || null;
      await sendMessage(pending.phone,
        `✅ התשלום התקבל! הזמנה מספר *${orderNumber}* בדרך 🍕\nנעדכן אותך על כל שינוי בסטטוס.`,
        tenantId
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

// ─── Start (only when run directly, not when require()'d in tests) ───────────
if (require.main === module) app.listen(PORT, async () => {
  console.log(`[server] Pizza bot listening on port ${PORT}`);
  console.log(`[server] Dashboard: http://localhost:${PORT}/`);
  console.log(`[server] Webhook:   http://localhost:${PORT}/webhook`);
  console.log(`[server] Health:    http://localhost:${PORT}/health`);

  // Auto-create admin_users table if it doesn't exist yet
  try {
    const sb = createSB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { error } = await sb.from('admin_users').select('id').limit(1);
    if (error && error.code === 'PGRST205') {
      console.warn('[server] admin_users table missing — run supabase/schema.sql to create it');
    } else {
      console.log('[server] admin_users table ✅');
    }
  } catch {}

  // Notify vendor on restart
  vendorAlerts.alerts.serverRestart().catch(() => {});
}); // end app.listen guard

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
