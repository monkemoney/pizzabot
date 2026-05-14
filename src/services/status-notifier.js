'use strict';

const { sendMessage } = require('./greenapi');

const STATUS_MESSAGES = {
  preparing: {
    he: '⏳ ההזמנה שלך בהכנה! נעדכן אותך כשתצא למשלוח.',
    en: '⏳ Your order is being prepared! We\'ll update you when it\'s on its way.',
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
 * Send a WhatsApp status update to the customer.
 * @param {string} phone       customer phone
 * @param {string} status      new order status
 * @param {string} lang        'he' | 'en'
 * @param {number} orderNumber human-readable order number
 */
async function notifyStatusChange(phone, status, lang = 'he', orderNumber) {
  const msgs = STATUS_MESSAGES[status];
  if (!msgs) return; // no message for this status

  const text = msgs[lang] || msgs.he;
  const prefix = lang === 'en'
    ? `*Order #${orderNumber}*\n`
    : `*הזמנה מספר ${orderNumber}*\n`;

  try {
    await sendMessage(phone, prefix + text);
    console.log(`[notifier] Sent "${status}" notification to ${phone}`);
  } catch (err) {
    console.error(`[notifier] Failed to notify ${phone}:`, err.message);
  }
}

module.exports = { notifyStatusChange };
