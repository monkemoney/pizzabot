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
const metaWA                   = require('./services/meta-whatsapp');
const { DEFAULT_TENANT_ID }    = require('./services/settings');
const { autoCompleteDeliveredOrders, pruneOldSessions, getScheduledOrdersDue, updateOrderStatus } = require('./services/supabase');
const sse      = require('./services/sse');
const settings = require('./services/settings');
const { createClient: createSB }       = require('@supabase/supabase-js');
const vendorAlerts                     = require('./services/vendor-alerts');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
// type matcher includes application/*+json — DIDWW's Call Events POST
// application/vnd.api+json (JSON:API), which the default matcher silently
// skips, leaving req.body = {} (learned from the first real CDR).
app.use(express.json({ type: ['application/json', 'application/*+json'] }));

// ─── Static dashboard ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date() }));

// Egress diagnostic — reports the server's outbound IP(s), needed when a
// provider (e.g. DIDWW SMS trunk) requires whitelisting our source IPs.
app.get('/health/egress', async (_req, res) => {
  try {
    const axios = require('axios');
    const ips = new Set();
    for (let i = 0; i < 6; i++) {
      const r = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
      ips.add(r.data.ip);
    }
    res.json({ egress_ips: [...ips] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// ─── Telephony CDR webhook (missed-call recovery) ─────────────────────────────
// Must stay mounted before the /webhook/:tenantId catch-all, like paymentRouter —
// otherwise :tenantId swallows /webhook/calls/... as tenantId='calls'.
app.use('/webhook', require('./routes/call-events'));   // POST /webhook/calls/:tenantId

// ─── Legacy admin routes ──────────────────────────────────────────────────────
app.use('/admin', adminRouter);

// ─── Business owner WhatsApp bot ──────────────────────────────────────────────
if (process.env.GREEN_API_BUSINESS_INSTANCE_ID) {
  app.use('/webhook/business', businessBotRouter);
  console.log('[server] Business bot webhook: /webhook/business');
}

// ─── WhatsApp webhook handler (shared for default + per-tenant routes) ───────

// Meta Cloud API webhook — app-level endpoint shared by all Meta tenants.
// Routed to the right tenant by the phone_number_id in the payload:
// env PHONE_NUMBER_ID → default tenant; otherwise settings lookup.
function handleMetaWebhook(req, res) {
  res.sendStatus(200); // ack immediately

  const parsed = metaWA.parseIncoming(req.body);
  if (!parsed) return;
  const { phone, textMessage, phoneNumberId } = parsed;

  const resolveAndHandle = async () => {
    let tenantId = null;
    if (!phoneNumberId || phoneNumberId === metaWA.PHONE_NUMBER_ID) {
      tenantId = DEFAULT_TENANT_ID;
    } else {
      const { resolveTenantByMetaPhoneId } = require('./services/supabase');
      tenantId = await resolveTenantByMetaPhoneId(phoneNumberId);
    }
    if (!tenantId) {
      console.warn(`[webhook:meta] no tenant for phone_number_id ${phoneNumberId}. Dropping.`);
      return;
    }

    const adminUser = await getAdminUser(phone, tenantId);
    if (adminUser) return handleAdminMessage(phone, textMessage, adminUser, tenantId);
    return handleMessage(phone, textMessage, tenantId);
  };

  resolveAndHandle().catch((err) =>
    console.error(`[webhook:meta] handler error for ${phone}:`, err.message)
  );
}

function handleWebhook(req, res, tenantId) {
  // Meta Cloud API payloads have a distinct top-level shape — route separately.
  if (req.body?.object === 'whatsapp_business_account') {
    return handleMetaWebhook(req, res);
  }

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

// Meta Cloud API webhook verification handshake (GET)
function handleMetaVerify(req, res) {
  const challenge = metaWA.verifyWebhook(req.query);
  if (challenge) return res.status(200).send(challenge);
  res.sendStatus(403);
}
app.get('/webhook', handleMetaVerify);
app.get('/webhook/:tenantId', handleMetaVerify);

// Default tenant webhook (backward compat)
app.post('/webhook', (req, res) => handleWebhook(req, res, DEFAULT_TENANT_ID));

// Per-tenant webhook — each client's Green API instance points here
app.post('/webhook/:tenantId', (req, res) => handleWebhook(req, res, req.params.tenantId));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Auto-complete delivered orders hourly ────────────────────────────────────
setInterval(autoCompleteDeliveredOrders, 60 * 60 * 1000);
setInterval(pruneOldSessions, 24 * 60 * 60 * 1000); // daily

// ─── Scheduled orders — check every minute ───────────────────────────────────
async function processScheduledOrders() {
  try {
    const lead = (await settings.get('prep_lead_time')) ?? 45;
    const due  = await getScheduledOrdersDue(Number(lead));
    for (const order of due) {
      const updated = await updateOrderStatus(order.id, 'preparing');
      sse.broadcast(order.tenant_id, 'order_updated', updated);
      const { sendMessage } = require('./services/greenapi');
      const timeStr = order.scheduled_for
        ? new Date(order.scheduled_for).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem', hour12: false })
        : '';
      await sendMessage(order.phone, `🍕 הזמנה מספר *${order.order_number}* נכנסה להכנה${timeStr ? ` לקראת השעה ${timeStr}` : ''}!`, order.tenant_id)
        .catch(e => console.error('[scheduler] WhatsApp notify error:', e.message));
      console.log(`[scheduler] order #${order.order_number} → preparing`);
    }
  } catch (err) {
    console.error('[scheduler] error:', err.message);
  }
}
setInterval(processScheduledOrders, 60 * 1000); // every minute

// ─── Pending payment watchdog (every 2 min) ──────────────────────────────────
// A pending_payments row only proves a payment LINK was generated — not that the
// customer paid. Order creation happens exclusively in Cardcom's callbacks
// (IndicatorUrl webhook / success-redirect — routes/payment.js). This watchdog
// no longer auto-creates orders (the old behavior fabricated "paid" orders from
// abandoned checkouts); it alerts the vendor about stale pendings so a human can
// check the Cardcom portal, and prunes expired rows.
const { getAllPendingPayments, deleteExpiredPendingPayments } = require('./services/supabase');

const _alertedPendings = new Set(); // pending ids already alerted (per process)

async function pollPendingPayments() {
  const pendings = await getAllPendingPayments().catch(() => []);

  for (const pending of pendings) {
    const ageMin = (Date.now() - new Date(pending.created_at).getTime()) / 60000;
    if (ageMin < 10 || _alertedPendings.has(pending.id)) continue;
    _alertedPendings.add(pending.id);

    const total = pending.order_data?.total;
    console.log(`[poll] stale pending payment for ${pending.phone} (${Math.round(ageMin)}m${total ? `, ₪${total}` : ''}) — no Cardcom confirmation, alerting vendor`);
    vendorAlerts.alerts.stalePayment(pending.phone, total).catch(() => {});
  }

  if (typeof deleteExpiredPendingPayments === 'function') {
    await deleteExpiredPendingPayments().catch(() => {});
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
