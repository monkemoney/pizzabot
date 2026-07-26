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
// rawBody is kept so Meta's X-Hub-Signature-256 can be verified over the exact
// bytes that were signed — re-serialising the parsed object would not match.
app.use(express.json({
  type: ['application/json', 'application/*+json'],
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

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
  // Authenticate BEFORE acting: an unsigned payload can name any phone, and a
  // phone in admin_users routes straight into the admin bot.
  const sigStatus = metaWA.verifySignature(req.rawBody, req.get('x-hub-signature-256'));
  if (sigStatus === 'invalid' || sigStatus === 'missing') {
    console.warn(`[webhook:meta] rejected — signature ${sigStatus}`);
    return res.sendStatus(403);
  }

  res.sendStatus(200); // ack immediately

  const parsed = metaWA.parseIncoming(req.body);
  if (!parsed) return;
  const { phone, textMessage, phoneNumberId, interactiveId } = parsed;

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
    if (adminUser) return handleAdminMessage(phone, textMessage, adminUser, tenantId, interactiveId);
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

  // Verify the request came from the expected Green API instance for this tenant.
  // Green API has no HMAC, so idInstance is all we have — which means an ABSENT
  // idInstance must be rejected too. It used to pass straight through: omit the
  // field and the check was skipped entirely, so anyone could post as an admin.
  const instanceId = body.instanceData?.idInstance?.toString();
  if (!instanceId) {
    console.warn(`[webhook:${tenantId}] payload has no instanceData.idInstance — dropping (unauthenticated)`);
    return;
  }
  if (instanceId === process.env.GREEN_API_BUSINESS_INSTANCE_ID) return;

  const expectedInstance = tenantId === DEFAULT_TENANT_ID
    ? process.env.GREEN_API_INSTANCE_ID
    : null; // resolved async below

  if (expectedInstance && instanceId !== expectedInstance) {
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
    // For per-tenant routes, verify instanceId against the tenant's configured
    // instance. A tenant with no Green instance configured cannot legitimately
    // receive Green payloads at all, so that is a drop, not a pass.
    if (tenantId !== DEFAULT_TENANT_ID) {
      const tenantInstance = await settings.get('green_api_instance', tenantId).catch(() => null);
      if (!tenantInstance || instanceId !== tenantInstance.toString()) {
        console.warn(`[webhook:${tenantId}] instanceId ${instanceId} does not match this tenant (${tenantInstance || 'none configured'}). Dropping.`);
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
// Each tenant's own prep_lead_time decides when its pre-orders enter the
// kitchen, so we fetch with the widest supported window and filter per order —
// reading one tenant's setting and applying it to everyone was the old bug.
const MAX_LEAD_MINUTES  = 120;
const STALE_ORDER_HOURS = 6;   // past this, a due pre-order is not started blindly

async function processScheduledOrders() {
  try {
    const orderState = require('./services/order-state');
    const { sendMessage } = require('./services/greenapi');
    const due = await getScheduledOrdersDue(MAX_LEAD_MINUTES);

    for (const order of due) {
      const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
      const lead     = Number(await settings.get('prep_lead_time', tenantId).catch(() => null)) || 45;
      const minsUntil = (new Date(order.scheduled_for).getTime() - Date.now()) / 60000;

      if (minsUntil > lead) continue;                    // not this tenant's turn yet

      // Post-outage guard: never fire yesterday's dinner into today's kitchen.
      if (minsUntil < -STALE_ORDER_HOURS * 60) {
        console.warn(`[scheduler] #${order.order_number} is ${Math.round(-minsUntil / 60)}h past its slot — skipping (needs manual handling)`);
        continue;
      }

      // In manual mode a pre-order the business never approved must not start
      // itself; the escalation loop is already chasing the admins for it.
      if (!order.accepted_at) {
        const mode = await orderState.getAcceptanceMode(tenantId);
        if (mode === 'manual') continue;
      }

      let updated;
      try {
        ({ order: updated } = await orderState.transition(order.id, 'preparing', {
          by: 'scheduler', notify: false, // custom scheduled-order message below
        }));
      } catch (err) {
        // Cancelled/edited concurrently — skip quietly
        console.warn(`[scheduler] skip #${order.order_number}: ${err.message}`);
        continue;
      }

      const timeStr = orderState.scheduledTimeLabel(order);
      await sendMessage(order.phone, `🍕 הזמנה מספר *${order.order_number}* נכנסה להכנה${timeStr ? ` לקראת השעה ${timeStr}` : ''}!`, tenantId)
        .catch(e => console.error('[scheduler] WhatsApp notify error:', e.message));
      console.log(`[scheduler] order #${order.order_number} → preparing (tenant lead ${lead}m)`);
    }
  } catch (err) {
    console.error('[scheduler] error:', err.message);
  }
}
setInterval(processScheduledOrders, 60 * 1000); // every minute

// ─── Unaccepted-order escalation (every minute) ──────────────────────────────
// Manual-acceptance flow: an order sitting in 'new' means the business hasn't
// approved it yet while the customer waits. Level 1 (after accept_reminder_minutes,
// default 3): re-push + WhatsApp the admins. Level 2 (after 3×): urgent WhatsApp
// to admins + reassurance message to the customer. escalation_level is persisted
// on the order row, so restarts don't re-alert.
async function escalateUnacceptedOrders() {
  try {
    const sb = createSB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: waiting, error } = await sb
      .from('orders').select('*')
      .in('status', ['new', 'scheduled'])
      .is('accepted_at', null)
      .lt('escalation_level', 2)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    if (error || !waiting?.length) return;

    const { getAdminUsers } = require('./services/supabase');
    const { sendMessage }   = require('./services/greenapi');
    const pushNotifier      = require('./services/push-notifier');
    const orderState        = require('./services/order-state');

    for (const order of waiting) {
      const tenantId  = order.tenant_id || DEFAULT_TENANT_ID;
      const remindMin = Number(await settings.get('accept_reminder_minutes', tenantId).catch(() => null)) || 3;
      const isScheduled = order.status === 'scheduled';
      const awaitingBit = order.payment_status === 'pending' && order.payment_method === 'bit';

      // Immediate orders escalate on how long the customer has been waiting;
      // pre-orders only become urgent as their slot approaches — nagging about
      // tomorrow's booking three minutes after it was placed is noise.
      let targetLevel, ageMin = (Date.now() - new Date(order.created_at).getTime()) / 60000, minsUntil = null;
      if (isScheduled) {
        if (!order.scheduled_for) continue;
        const lead = Number(await settings.get('prep_lead_time', tenantId).catch(() => null)) || 45;
        minsUntil  = (new Date(order.scheduled_for).getTime() - Date.now()) / 60000;
        targetLevel = minsUntil <= lead ? 2 : minsUntil <= lead + 30 ? 1 : 0;
      } else {
        targetLevel = ageMin >= remindMin * 3 ? 2 : ageMin >= remindMin ? 1 : 0;
      }
      if (targetLevel <= (order.escalation_level || 0)) continue;

      // Guarded write — only one process/interval wins the escalation
      const { data: claimed } = await sb.from('orders')
        .update({ escalation_level: targetLevel, updated_at: new Date().toISOString() })
        .eq('id', order.id).eq('status', order.status)
        .eq('escalation_level', order.escalation_level || 0)
        .select('id');
      if (!claimed?.length) continue;

      const admins = await getAdminUsers(tenantId);
      if (!admins.length) {
        console.warn(`[escalation] #${order.order_number} reached level ${targetLevel} but tenant ${tenantId} has no admin_users`);
      }

      const itemsShort = (order.items || []).map(it => `${it.name || it.name_he}${(it.quantity || it.qty || 1) > 1 ? ` ×${it.quantity || it.qty}` : ''}`).join(', ');
      const who        = `${order.customer_name || 'לקוח'} — ₪${order.total_price}`;
      const timeStr    = orderState.scheduledTimeLabel(order);

      // An unpaid Bit order is waiting on the customer's money, not on the
      // owner's approval — saying "approve it" would be wrong on both ends.
      let adminMsg;
      if (awaitingBit) {
        adminMsg = targetLevel === 1
          ? `💳 *הזמנה #${order.order_number} — התשלום ב-Bit טרם התקבל (${Math.round(ageMin)} דקות)*\n${who}\n${itemsShort}\n\nאם הכסף התקבל — השב *שולם ${order.order_number}*.`
          : `💳 *הזמנה #${order.order_number} עדיין ללא תשלום Bit (${Math.round(ageMin)} דקות)*\n${who}\nשווה לבדוק מול הלקוח או לבטל את ההזמנה.`;
      } else if (isScheduled) {
        adminMsg = targetLevel === 1
          ? `🔔 *הזמנה מתוזמנת #${order.order_number} לשעה ${timeStr} ממתינה לאישור*\n${who}\n${itemsShort}\n\nאשרו כדי שנוכל להתחיל בזמן — השב *אשר ${order.order_number}*.`
          : `🚨 *הזמנה מתוזמנת #${order.order_number} לשעה ${timeStr} עדיין לא אושרה!*\nזמן ההכנה מתחיל עכשיו — אשרו או בטלו מיד.\n${who}`;
      } else {
        adminMsg = targetLevel === 1
          ? `🔔 *הזמנה #${order.order_number} ממתינה לאישור כבר ${Math.round(ageMin)} דקות*\n${who}\n${itemsShort}\n\nהיכנסו לדשבורד לאישור ההזמנה 👨‍🍳`
          : `🚨 *הזמנה #${order.order_number} עדיין לא אושרה (${Math.round(ageMin)} דקות!)*\nהלקוח ממתין — אנא אשרו או בטלו את ההזמנה עכשיו.\n${who}`;
      }

      for (const admin of admins) {
        await sendMessage(admin.phone, adminMsg, tenantId).catch(() => {});
      }

      const pushLabel = awaitingBit ? '💳 ממתינה לתשלום' : '⏰ ממתינה לאישור';
      pushNotifier.notifyNewOrder({ ...order, customer_name: `${pushLabel} — ${order.customer_name || 'לקוח'}` }).catch(() => {});

      if (targetLevel === 2) {
        // Level 2 reaches the customer — but only with something true for them:
        // an unpaid Bit order needs a payment nudge, not a "we'll confirm soon".
        const customerMsg = awaitingBit
          ? `היי${order.customer_name ? ` ${order.customer_name}` : ''} 🙏 עדיין לא קיבלנו את התשלום ב-Bit להזמנה *#${order.order_number}* (₪${order.total_price}).\nההזמנה ממתינה — ברגע שהתשלום יתקבל נתחיל להכין.`
          : `היי${order.customer_name ? ` ${order.customer_name}` : ''} 🙏 ההזמנה שלך (מספר *${order.order_number}*) התקבלה והעסק יאשר אותה ממש בקרוב. תודה על הסבלנות!`;
        await sendMessage(order.phone, customerMsg, tenantId).catch(() => {});
      }

      console.log(`[escalation] #${order.order_number} → level ${targetLevel} (${isScheduled ? `${Math.round(minsUntil)}m to slot` : `${Math.round(ageMin)}m old`}${awaitingBit ? ', unpaid Bit' : ''}, ${admins.length} admins)`);
    }
  } catch (err) {
    console.error('[escalation] error:', err.message);
  }
}
// Only on the real deployment (Render sets RENDER=true) — a local dev server
// pointed at the production DB must never WhatsApp real admins/customers.
// Local override for testing: ENABLE_ESCALATION=1.
if (process.env.RENDER || process.env.ENABLE_ESCALATION) {
  setInterval(escalateUnacceptedOrders, 60 * 1000);
} else {
  console.log('[escalation] disabled (not on Render; set ENABLE_ESCALATION=1 to enable locally)');
}

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

  // Webhook authentication status — the single loudest thing to get wrong
  if (metaWA.APP_SECRET) {
    console.log('[server] Meta webhook signature verification: ENABLED ✅');
  } else {
    console.warn('[server] ⚠️  META_APP_SECRET is not set — Meta webhook payloads CANNOT be verified.');
    console.warn('[server] ⚠️  Anyone who knows an admin phone number can drive the admin bot. Set it in Render.');
  }

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
