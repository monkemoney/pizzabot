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
 *   lang       customer language for the standard notification. OMIT IT and the
 *              customer's own `sessions.language` is used — the dashboard,
 *              kitchen and admin bot all called this without one, so every
 *              staff-triggered update reached an English customer in Hebrew.
 * @returns {Promise<{order, changed}>}  updated row; changed=false if already in target status
 * @throws  {code: 'ORDER_NOT_FOUND'|'INVALID_TRANSITION'|'CONFLICT'}
 */
/**
 * The customer's language, from their session.
 *
 * This is resolved HERE rather than at each call site on purpose: `lang` was an
 * optional parameter defaulting to 'he', and every dashboard/kitchen/admin-bot
 * caller omitted it. A default that callers forget is not a safety net, it is
 * the trap (failure class 6). Routing it through the one exit point every
 * status change already passes through fixes all of them at once.
 */
async function customerLang(phone, tenantId) {
  if (!phone) return 'he';
  try {
    const { data } = await supabase
      .from('sessions').select('language')
      .eq('tenant_id', tenantId).eq('phone', phone).maybeSingle();
    return data?.language === 'en' ? 'en' : 'he';
  } catch (err) {
    console.error('[order-state] language lookup failed:', err.message);
    return 'he';
  }
}

async function transition(orderId, to, opts = {}) {
  const { force = false, by = null, notify = true, extra = {} } = opts;

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

  // Explicit override wins (the admin bot knows the language of the exchange it
  // is in); otherwise ask the customer's session.
  const lang = opts.lang || await customerLang(updated.phone, tenantId);

  if (notify) {
    const { notifyStatusChange } = require('./status-notifier');
    await notifyStatusChange(updated.phone, to, lang, updated.order_number, updated, tenantId)
      .catch((err) => console.error('[order-state] notify error:', err.message));
  }

  // Ask the customer how it went once the order is finished. Hooked on the
  // transition (not on a status message) so it covers BOTH paths to 'done':
  // delivered→done auto-complete, which passes notify:false, and the pickup
  // ready→done route that never reaches 'delivered' at all.
  if (to === 'done') {
    require('./csat').askCsat(updated, tenantId, lang)
      .catch((err) => console.error('[order-state] csat ask error:', err.message));
  }

  console.log(`[order-state] #${updated.order_number} ${from} → ${to}${by ? ` (${by})` : ''}`);
  return { order: updated, changed: true };
}

/** Scheduled-order time, formatted in Israel time (empty when not scheduled). */
function scheduledTimeLabel(order) {
  if (!order?.scheduled_for) return '';
  return new Date(order.scheduled_for).toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem', hour12: false,
  });
}

/**
 * Business approves an order.
 *
 * Immediate orders (`new`) → preparing, with the prep-time ETA to the customer.
 * Pre-orders (`scheduled`) stay `scheduled` — approving one means "we commit to
 * making it at that time"; the scheduler promotes it to preparing at
 * scheduled_for − prep_lead_time. Either way accepted_at + prep_minutes are
 * stamped, so an unaccepted pre-order is distinguishable from an approved one.
 *
 * Idempotent: an already-accepted order returns unchanged with no second
 * customer message (the dashboard, the KDS and the WhatsApp button can race).
 */
async function accept(orderId, opts = {}) {
  const { prepMinutes = null, by = 'dashboard' } = opts;
  const prep = Number(prepMinutes) || null;
  const now  = new Date().toISOString();

  const { data: existing, error: readErr } = await supabase
    .from('orders').select('*').eq('id', orderId).single();
  if (readErr || !existing) throw _err('ORDER_NOT_FOUND', 'הזמנה לא נמצאה');
  if (existing.accepted_at) return existing;

  const { sendMessage } = require('./greenapi');
  const tenantId = existing.tenant_id || DEFAULT_TENANT_ID;
  // Same rule as transition(): the caller may know better, otherwise ask the
  // customer's session. Accepting an order is the message an English customer
  // is most likely to receive from a Hebrew-speaking dashboard.
  const lang = opts.lang || await customerLang(existing.phone, tenantId);

  // ── Pre-order: approve in place, no status change ──────────────────────────
  if (existing.status === 'scheduled') {
    const history = Array.isArray(existing.status_history) ? [...existing.status_history] : [];
    history.push({ status: 'accepted', at: now, by });

    const { data: rows, error } = await supabase
      .from('orders')
      .update({ accepted_at: now, updated_at: now, status_history: history, ...(prep ? { prep_minutes: prep } : {}) })
      .eq('id', orderId)
      .eq('status', 'scheduled')
      .is('accepted_at', null)
      .select('*');
    if (error) throw new Error('order-state accept(scheduled): ' + error.message);
    if (!rows || !rows.length) {
      throw _err('CONFLICT', 'ההזמנה עודכנה במקביל על ידי גורם אחר — רענן ונסה שוב');
    }

    const order = rows[0];
    sse.broadcast(tenantId, 'order_updated', order);

    const timeStr = scheduledTimeLabel(order);
    const msg = lang === 'en'
      ? `✅ Order *#${order.order_number}* is confirmed${timeStr ? ` for ${timeStr}` : ''} — we'll have it ready on time.`
      : `✅ הזמנה מספר *${order.order_number}* אושרה${timeStr ? ` לשעה ${timeStr}` : ''} — נכין אותה בזמן.`;
    await sendMessage(order.phone, msg, tenantId)
      .catch((err) => console.error('[order-state] accept notify error:', err.message));

    console.log(`[order-state] #${order.order_number} accepted (scheduled${timeStr ? ` ${timeStr}` : ''})${by ? ` by ${by}` : ''}`);
    return order;
  }

  // ── Immediate order: straight to the kitchen ───────────────────────────────
  const { order, changed } = await transition(orderId, 'preparing', {
    by,
    notify: false, // custom approval message below instead of the generic "preparing"
    extra: { accepted_at: now, ...(prep ? { prep_minutes: prep } : {}) },
  });

  if (changed) {
    const effectivePrep = prep || order.prep_minutes || null;

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

/**
 * Mark a cash/Bit order as paid — the single path for the dashboard button,
 * the admin-bot CONFIRM_PAYMENT action and the WhatsApp confirm button.
 * Guarded on payment_status so two confirmations can't double-fire the
 * customer message; in auto-acceptance tenants this is what releases a Bit
 * order into the kitchen (its auto-accept was deferred until payment).
 */
async function confirmPayment(orderId, { by = 'dashboard' } = {}) {
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', updated_at: now })
    .eq('id', orderId)
    .neq('payment_status', 'paid')
    .select('*');
  if (error) throw new Error('order-state confirmPayment: ' + error.message);

  if (!rows || !rows.length) {
    const { data: existing } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (!existing) throw _err('ORDER_NOT_FOUND', 'הזמנה לא נמצאה');
    return { order: existing, changed: false };
  }

  const order    = rows[0];
  const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
  sse.broadcast(tenantId, 'order_updated', order);

  const mode = await afterCreate(order).catch(() => 'manual');

  const method  = order.payment_method === 'bit' ? 'Bit' : 'מזומן';
  const pending = ['new', 'scheduled'].includes(order.status) && !order.accepted_at && mode === 'manual';
  const tail    = pending
    ? 'ההזמנה ממתינה לאישור המסעדה — נעדכן אותך ברגע שתאושר.'
    : 'ההזמנה בהכנה 🍕';

  const { sendMessage } = require('./greenapi');
  await sendMessage(order.phone, `✅ קיבלנו את התשלום ב${method}! (הזמנה מספר *${order.order_number}*)\n${tail}`, tenantId)
    .catch((err) => console.error('[order-state] confirmPayment notify error:', err.message));

  console.log(`[order-state] #${order.order_number} payment confirmed (${method}, by ${by})`);
  return { order, changed: true };
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
 * WhatsApp the tenant's admins about an order awaiting approval, with
 * interactive accept buttons (Meta) or text commands (Green API fallback).
 */
async function notifyAdminsNewOrder(order) {
  const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
  const { getAdminUsers } = require('./supabase');
  const { sendInteractiveButtons } = require('./greenapi');

  const admins = await getAdminUsers(tenantId);
  if (!admins.length) return;

  const prep = await getDefaultPrepMinutes(tenantId);
  const items = (order.items || []).map((it) => {
    const qty  = it.quantity || it.qty || 1;
    const tops = (it.toppings || [])
      .map((t) => {
        const n = t.name || t.name_he;
        return n && t.portion ? `${n} (${t.portion})` : n;   // e.g. "זיתים (חצי)"
      })
      .filter(Boolean);
    return `• ${it.name || it.name_he}${qty > 1 ? ` ×${qty}` : ''}${tops.length ? ` (${tops.join(', ')})` : ''}`;
  }).join('\n');

  const awaitingBit = order.payment_status === 'pending' && order.payment_method === 'bit';
  const payLine = awaitingBit
    ? `💳 *ממתין לתשלום Bit — ₪${order.total_price}*`
    : order.payment_method === 'cash' ? `💵 מזומן — ₪${order.total_price}` : `💳 שולם — ₪${order.total_price}`;

  const timeStr = scheduledTimeLabel(order);
  const header  = timeStr
    ? `🔔 *הזמנה מתוזמנת #${order.order_number} לשעה ${timeStr} — ממתינה לאישור*`
    : `🔔 *הזמנה חדשה #${order.order_number} — ממתינה לאישור*`;

  const body = [
    header,
    `👤 ${order.customer_name || 'לקוח'}`,
    order.delivery_method === 'pickup' ? '🏠 איסוף עצמי' : `🛵 משלוח — ${order.address || ''}`,
    '',
    items || '—',
    order.notes ? `📝 ${order.notes}` : null,
    '',
    payLine,
  ].filter((l) => l !== null).join('\n');

  // For an unpaid Bit order the first useful action is confirming the transfer
  // arrived, not approving the order — Meta allows three buttons, so swap it in.
  const acceptTitle = timeStr ? '✅ אשר הזמנה' : `✅ אשר (${prep} דק')`;
  const buttons = awaitingBit
    ? [
        { id: `confirmpay:${order.id}`, title: '💰 קיבלתי תשלום' },
        { id: `accept:${order.id}`,     title: acceptTitle },
        { id: `orderissue:${order.id}`, title: '⚠️ בעיה בהזמנה' },
      ]
    : [
        { id: `accept:${order.id}`,     title: acceptTitle },
        { id: `accepttime:${order.id}`, title: '⏱️ אשר עם זמן אחר' },
        { id: `orderissue:${order.id}`, title: '⚠️ בעיה בהזמנה' },
      ];

  const fallback = body +
    `\n\nלאישור השב: *אשר ${order.order_number}*` +
    `\nלאישור עם זמן: *אשר ${order.order_number} 45 דק*` +
    (awaitingBit ? `\nלאישור קבלת התשלום: *שולם ${order.order_number}*` : '') +
    `\nלבעיה/ביטול — כתוב חופשי.`;

  for (const admin of admins) {
    await sendInteractiveButtons(admin.phone, body, buttons, tenantId, fallback)
      .catch((err) => console.error(`[order-state] admin notify failed (${admin.phone}):`, err.message));
  }
  console.log(`[order-state] #${order.order_number} approval request sent to ${admins.length} admin(s)`);
}

/**
 * The customer says they sent the Bit transfer. We cannot verify that, so this
 * only asks the admins to confirm — it never marks the order paid on its own.
 */
async function notifyAdminsPaymentClaim(order) {
  const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
  const { getAdminUsers } = require('./supabase');
  const { sendInteractiveButtons } = require('./greenapi');

  const admins = await getAdminUsers(tenantId);
  if (!admins.length) return false;

  const body = [
    `💰 *הלקוח מדווח ששילם — הזמנה #${order.order_number}*`,
    `👤 ${order.customer_name || 'לקוח'} — ${order.customer_phone || order.phone}`,
    `סכום: ₪${order.total_price} ב-Bit`,
    '',
    'בדקו שהתשלום התקבל ואשרו — רק אז הלקוח יקבל אישור.',
  ].join('\n');

  const buttons = [
    { id: `confirmpay:${order.id}`, title: '💰 קיבלתי תשלום' },
    { id: `orderissue:${order.id}`, title: '⚠️ לא התקבל' },
  ];
  const fallback = body + `\n\nלאישור השב: *שולם ${order.order_number}*`;

  for (const admin of admins) {
    await sendInteractiveButtons(admin.phone, body, buttons, tenantId, fallback)
      .catch((err) => console.error(`[order-state] payment-claim notify failed (${admin.phone}):`, err.message));
  }
  console.log(`[order-state] #${order.order_number} payment claim relayed to ${admins.length} admin(s)`);
  return true;
}

/**
 * Called right after an order row is created. In 'auto' mode the order is
 * accepted immediately (straight to the kitchen, customer gets the approval
 * message). In 'manual' mode the tenant's admins get a WhatsApp approval
 * request (when notifyAdmins is set — creation paths pass true; the
 * confirm-payment path passes false to avoid a duplicate ping).
 * Returns 'auto' | 'manual' so the caller can word its confirmation message.
 */
async function afterCreate(order, opts = {}) {
  const { notifyAdmins = false } = opts;
  const lang = opts.lang
    || await customerLang(order?.phone, order?.tenant_id || DEFAULT_TENANT_ID);
  const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
  const mode = await getAcceptanceMode(tenantId);

  // Recovery funnel: credit the missed-call recovery this order followed, if
  // any (fire-and-forget, never throws, idempotent — afterCreate runs again
  // from confirmPayment and the event can only be claimed once).
  require('./recovery-attribution').markOrder(order);

  // Both immediate and scheduled orders need approval; an order already
  // accepted (or past those states) is nothing to do here.
  const awaitingApproval = ['new', 'scheduled'].includes(order.status) && !order.accepted_at;
  if (!awaitingApproval) return mode;

  // Bit orders await payment confirmation first — auto-accept fires from
  // confirmPayment() once the money is confirmed.
  if (mode === 'auto' && order.payment_status !== 'pending') {
    const prep = await getDefaultPrepMinutes(tenantId);
    await accept(order.id, { prepMinutes: prep, by: 'auto-accept', lang })
      .catch((err) => console.error('[order-state] auto-accept error:', err.message));
  } else if (mode === 'manual' && notifyAdmins) {
    await notifyAdminsNewOrder(order)
      .catch((err) => console.error('[order-state] notifyAdminsNewOrder error:', err.message));
  }
  return mode;
}

module.exports = {
  TRANSITIONS, STATUSES, transition, accept, confirmPayment, afterCreate,
  notifyAdminsNewOrder, notifyAdminsPaymentClaim, scheduledTimeLabel,
  getAcceptanceMode, getDefaultPrepMinutes,
};
