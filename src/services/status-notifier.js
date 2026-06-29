'use strict';

const { sendMessage } = require('./greenapi');
const settings        = require('./settings');
const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

const STATUS_MESSAGES = {
  preparing: {
    he: '⏳ ההזמנה שלך בהכנה! נעדכן אותך כשתצא למשלוח.',
    en: "⏳ Your order is being prepared! We'll update you when it's on its way.",
  },
  ready: {
    he: '✅ ההזמנה שלך מוכנה! אפשר לאסוף 🏍️',
    en: '✅ Your order is ready for pickup! 🏍️',
  },
  out_for_delivery: {
    he: '🛵 ההזמנה שלך יצאה למשלוח! זמן הגעה משוער: 30-45 דקות.',
    en: '🛵 Your order is on its way! Estimated arrival: 30-45 minutes.',
  },
  delivered: {
    he: '✅ ההזמנה נמסרה! תיהנו 🍕',
    en: '✅ Your order has been delivered! Enjoy 🍕',
  },
  cancelled: {
    he: '❌ ההזמנה שלך בוטלה. לשאלות צרו קשר.',
    en: '❌ Your order has been cancelled. Please contact us for questions.',
  },
};

/**
 * Notify customer of status change.
 * Also notify courier(s) when status matches the configured trigger.
 * @param {string} phone       customer phone
 * @param {string} status      new order status
 * @param {string} lang        'he'|'en'
 * @param {number} orderNumber human-readable order number
 * @param {object} order       full order row (needed for courier message)
 */
async function notifyStatusChange(phone, status, lang = 'he', orderNumber, order = null, tenantId = DEFAULT_TENANT_ID) {
  const tid = order?.tenant_id || tenantId;

  // ── Customer notification ──────────────────────────────────────────────────
  const msgs = STATUS_MESSAGES[status];
  // 'ready' notification only for pickup orders
  const skipNotify = status === 'ready' && order?.delivery_method !== 'pickup';
  if (msgs && !skipNotify) {
    const text   = msgs[lang] || msgs.he;
    const prefix = lang === 'en'
      ? `*Order #${orderNumber}*\n`
      : `*הזמנה מספר ${orderNumber}*\n`;
    await sendMessage(phone, prefix + text, tid).catch(err =>
      console.error(`[notifier] Customer notify failed ${phone}:`, err.message)
    );
    console.log(`[notifier] "${status}" → customer ${phone} (tenant ${tid})`);
  }

  // ── Courier notification ───────────────────────────────────────────────────
  if (!order) return;
  try {
    const cfg = await settings.loadAll(tid);
    if (!cfg.courier_notify_enabled) return;

    const triggerStatus = cfg.courier_notify_on_status || 'out_for_delivery';
    if (status !== triggerStatus) return;

    const couriers = Array.isArray(cfg.couriers) ? cfg.couriers.filter(c => c && c.phone) : [];
    if (!couriers.length) return;

    const msg = buildCourierMessage(order);
    for (const c of couriers) {
      await sendMessage(c.phone, msg, tid).catch(err =>
        console.error(`[notifier] Courier ${c.phone} failed:`, err.message)
      );
      console.log(`[notifier] "${status}" → courier ${c.phone} (${c.name || ''})`);
    }
  } catch (err) {
    console.error('[notifier] Courier notify error:', err.message);
  }
}

function buildCourierMessage(order) {
  const items = (order.items || []).map(it => {
    const qty  = it.quantity || it.qty || 1;
    const tops = (it.toppings || []).map(t => t.name || t.name_he || '').filter(Boolean);
    return `  • ${it.name || it.name_he}${qty > 1 ? ` ×${qty}` : ''}${tops.length ? ` (${tops.join(', ')})` : ''}`;
  }).join('\n');

  const payLine = order.payment_method === 'cash'
    ? `💵 מזומן — לגבות ₪${order.total_price}`
    : `💳 אשראי — שולם`;

  const lines = [
    `🛵 *משלוח חדש — הזמנה #${order.order_number}*`,
    '',
    `👤 ${order.customer_name || 'לקוח'}`,
    order.customer_phone || order.phone ? `📞 ${order.customer_phone || order.phone}` : null,
    `📍 ${order.address || 'כתובת לא צוינה'}`,
    order.courier_notes ? `📝 ${order.courier_notes}` : null,
    '',
    `*פריטים:*`,
    items || '  —',
    '',
    `*סה"כ: ₪${order.total_price}*`,
    payLine,
  ];

  return lines.filter(l => l !== null).join('\n');
}

module.exports = { notifyStatusChange };
