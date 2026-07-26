'use strict';

/**
 * Central order state machine — the single path for every order status change.
 *
 * Every writer (dashboard, kitchen, admin bot, customer bot, scheduler) goes
 * through transition()/accept() so that:
 *   - transitions are validated against TRANSITIONS (force=true = explicit staff override)
 *   - concurrent writes are detected (.eq('status', from) optimistic guard → CONFLICT)
 *   - status_history is always appended
 *   - SSE + customer/courier WhatsApp notifications fire from ONE exit point
 *
 * Acceptance flow: 'new' means "awaiting business approval". accept() moves
 * new/scheduled → preparing, stamps accepted_at + prep_minutes, and sends the
 * customer the approval message with the prep-time estimate. Per-tenant setting
 * `order_acceptance`: 'manual' (default) | 'auto' (accept immediately on creation).
 */

const { createClient } = require('@supabase/supabase-js');
const sse              = require('./sse');
const settings         = require('./settings');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

const TRANSITIONS = {
  new:              ['preparing', 'cancelled'],
  scheduled:        ['preparing', 'cancelled'],
  preparing:        ['ready', 'out_for_delivery', 'delivered', 'cancelled'],
  ready:            ['out_for_delivery', 'delivered', 'done', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered:        ['done'],
  done:             [],
  cancelled:        [],
};

const STATUSES = Object.keys(TRANSITIONS);

function _err(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * Move an order to a new status.
 *
 * @param {string} orderId
 * @param {string} to      target status
 * @param {object} opts
 *   force      staff override — skip the TRANSITIONS check (never skips the concurrency guard)
 *   by         who triggered it ('dashboard'|'kitchen'|'admin-bot'|'customer'|'scheduler'|'auto-accept')
 *   notify     send the standard customer/courier WhatsApp for this status (default true).
 *              Callers that send a custom message pass false.
 *   extra      additional column updates written atomically with the status
 *   lang       customer language for the standard notification
 * @returns {Promise<{order, changed}>}  updated row; changed=false if already in target status
 * @throws  {code: 'ORDER_NOT_FOUND'|'INVALID_TRANSITION'|'CONFLICT'}
 */
async function transition(orderId, to, opts = {}) {
  const { force = false, by = null, notify = true, extra = {}, lang = 'he' } = opts;

  if (!STATUSES.includes(to)) throw _err('INVALID_TRANSITION', `סטטוס לא מוכר: ${to}`);

  const { data: order, error: readErr } = await supabase
    .from('orders').select('*').eq('id', orderId).single();
  if (readErr || !order) throw _err('ORDER_NOT_FOUND', 'הזמנה לא נמצאה');

  const from = order.status;
  if (from === to) return { order, changed: false };

  const allowed = TRANSITIONS[from] || [];
  if (!force && !allowed.includes(to)) {
    throw _err('INVALID_TRANSITION', `לא ניתן לעבור מ"${from}" ל"${to}"`);
  }

  const now = new Date().toISOString();
  const history = Array.isArray(order.status_history) ? [...order.status_history] : [];
  history.push({ status: to, at: now, ...(by ? { by } : {}) });

  // Optimistic concurrency guard: only wins if the status is still `from`.
  const { data: rows, error } = await supabase
    .from('orders')
    .update({ status: to, status_history: history, updated_at: now, ...extra })
    .eq('id', orderId)
    .eq('status', from)
    .select('*');

  if (error) throw new Error('order-state update: ' + error.message);
  if (!rows || !rows.length) {
    throw _err('CONFLICT', 'ההזמנה עודכנה במקביל על ידי גורם אחר — רענן ונסה שוב');
  }

  const updated = rows[0];
  const tenantId = updated.tenant_id || DEFAULT_TENANT_ID;

  sse.broadcast(tenantId, 'order_updated', updated);

  if (notify) {
    const { notifyStatusChange } = require('./status-notifier');
    await notifyStatusChange(updated.phone, to, lang, updated.order_number, updated, tenantId)
      .catch((err) => console.error('[order-state] notify error:', err.message));
  }

  console.log(`[order-state] #${updated.order_number} ${from} → ${to}${by ? ` (${by})` : ''}`);
  return { order: updated, changed: true };
}

/**
 * Business approves an order: new/scheduled → preparing, stamps accepted_at +
 * prep_minutes, sends the customer the approval message with the ETA.
 */
async function accept(orderId, { prepMinutes = null, by = 'dashboard', lang = 'he' } = {}) {
  const prep = Number(prepMinutes) || null;

  const { order, changed } = await transition(orderId, 'preparing', {
    by,
    notify: false, // custom approval message below instead of the generic "preparing"
    extra: { accepted_at: new Date().toISOString(), ...(prep ? { prep_minutes: prep } : {}) },
  });

  if (changed) {
    const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
    const effectivePrep = prep || order.prep_minutes || null;
    const { sendMessage } = require('./greenapi');

    const etaHe = effectivePrep
      ? (order.delivery_method === 'pickup'
          ? `\n⏱️ מוכן לאיסוף בעוד כ-${effectivePrep} דקות`
          : `\n⏱️ זמן הכנה משוער: כ-${effectivePrep} דקות`)
      : '';
    const etaEn = effectivePrep
      ? (order.delivery_method === 'pickup'
          ? `\n⏱️ Ready for pickup in ~${effectivePrep} minutes`
          : `\n⏱️ Estimated prep time: ~${effectivePrep} minutes`)
      : '';

    const msg = lang === 'en'
      ? `✅ Order *#${order.order_number}* confirmed — we've started preparing it!${etaEn}`
      : `✅ הזמנה מספר *${order.order_number}* אושרה — התחלנו להכין!${etaHe}`;

    await sendMessage(order.phone, msg, tenantId)
      .catch((err) => console.error('[order-state] accept notify error:', err.message));
  }

  return order;
}

/** Per-tenant acceptance mode: 'manual' (default) | 'auto'. */
async function getAcceptanceMode(tenantId = DEFAULT_TENANT_ID) {
  const mode = await settings.get('order_acceptance', tenantId).catch(() => null);
  return mode === 'auto' ? 'auto' : 'manual';
}

/** Default prep-time estimate (minutes) offered/used on acceptance. */
async function getDefaultPrepMinutes(tenantId = DEFAULT_TENANT_ID) {
  const v = await settings.get('default_prep_minutes', tenantId).catch(() => null);
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * Called right after an order row is created. In 'auto' mode the order is
 * accepted immediately (straight to the kitchen, customer gets the approval
 * message). In 'manual' mode nothing happens — the order waits in 'new'.
 * Returns 'auto' | 'manual' so the caller can word its confirmation message.
 */
async function afterCreate(order, { lang = 'he' } = {}) {
  const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
  const mode = await getAcceptanceMode(tenantId);

  // Bit orders await payment confirmation first — auto-accept fires from the
  // confirm-payment path once payment_status becomes 'paid'.
  if (mode === 'auto' && order.status === 'new' && order.payment_status !== 'pending') {
    const prep = await getDefaultPrepMinutes(tenantId);
    await accept(order.id, { prepMinutes: prep, by: 'auto-accept', lang })
      .catch((err) => console.error('[order-state] auto-accept error:', err.message));
  }
  return mode;
}

module.exports = { TRANSITIONS, STATUSES, transition, accept, afterCreate, getAcceptanceMode, getDefaultPrepMinutes };
