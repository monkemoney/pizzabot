'use strict';

/**
 * Every string the bot says to a CUSTOMER, in one catalogue.
 *
 * This codebase keeps a dictionary per SURFACE on purpose — the public menu has
 * MENU_HE2EN, the wizard has OB_HE2EN, the tour has its own. The bot's messages
 * looked like four surfaces and are one: the WhatsApp conversation. Split across
 * status-notifier, payment.js, ai-handler and order-state, adding a language
 * meant four edits in four styles, and nothing could check that a language was
 * complete. That is how the payment route ended up with no language branch at
 * all while status-notifier had carried he/en since the localisation work.
 *
 * Values are a string, or a function when the message interpolates. Resolution
 * runs lang -> en -> he: a string nobody has translated yet should reach an
 * American customer in English rather than Hebrew, and the coverage test is
 * what stops it being missing in the first place.
 *
 * The language of a conversation comes from order-state's customerLang(), which
 * reads the customer's own session. Do not add a `lang = 'he'` default to a
 * caller here — a default that call sites forget is failure class 6, and it is
 * exactly how every dashboard-triggered status update once reached English
 * customers in Hebrew.
 */

const MESSAGES = {
  // ── Order status (moved verbatim from status-notifier.js) ──────────────────
  status_preparing: {
    he: '⏳ ההזמנה שלך בהכנה! נעדכן אותך כשתצא למשלוח.',
    en: "⏳ Your order is being prepared! We'll update you when it's on its way.",
  },
  status_ready: {
    he: '✅ ההזמנה שלך מוכנה! אפשר לאסוף 🏍️',
    en: '✅ Your order is ready for pickup! 🏍️',
  },
  status_out_for_delivery: {
    he: '🛵 ההזמנה שלך יצאה למשלוח! זמן הגעה משוער: 30-45 דקות.',
    en: '🛵 Your order is on its way! Estimated arrival: 30-45 minutes.',
  },
  status_delivered: {
    he: '✅ ההזמנה נמסרה! תיהנו 🍕',
    en: '✅ Your order has been delivered! Enjoy 🍕',
  },
  status_cancelled: {
    he: '❌ ההזמנה שלך בוטלה. לשאלות צרו קשר.',
    en: '❌ Your order has been cancelled. Please contact us for questions.',
  },

  /** Heading above a status message. Was `lang === 'en' ? … : …` inline — the
   *  same two-valued shape that put Spanish on the Hebrew side everywhere else. */
  status_prefix: {
    he: (n) => `*הזמנה מספר ${n}*\n`,
    en: (n) => `*Order #${n}*\n`,
  },

  // ── Payment (moved verbatim from payment.js's PAY_MSG) ─────────────────────
  pay_declined: {
    he: '❌ התשלום לא אושר על ידי חברת האשראי. אפשר לנסות שוב או לבחור אמצעי תשלום אחר.',
    en: '❌ Your card issuer did not approve the payment. You can try again or choose another payment method.',
  },
  pay_paid_manual: {
    he: (n) => `✅ התשלום התקבל! הזמנה מספר *${n}* נשלחה למסעדה לאישור 🍕\nנעדכן אותך ברגע שההזמנה תאושר ותיכנס להכנה.`,
    en: (n) => `✅ Payment received! Order *${n}* has been sent to the restaurant for approval 🍕\nWe'll let you know the moment it is approved and goes into preparation.`,
  },
  pay_paid_auto: {
    he: (n) => `✅ התשלום התקבל! (הזמנה מספר *${n}*)`,
    en: (n) => `✅ Payment received! (Order *${n}*)`,
  },
  pay_recorded: {
    he: (n) => `📝 הזמנה מספר *${n}* התקבלה!\nאנחנו מאמתים את התשלום מול חברת האשראי ונעדכן אותך מיד כשיאושר.`,
    en: (n) => `📝 Order *${n}* received!\nWe are verifying the payment with your card issuer and will update you as soon as it clears.`,
  },

  // ── Disputes (ai-handler's handleDisputeResponse) ──────────────────────────
  dispute_order_inactive: {
    he: 'ההזמנה כבר אינה פעילה.',
    en: 'That order is no longer active.',
  },
  dispute_order_inactive_thanks: {
    he: 'ההזמנה כבר אינה פעילה. תודה!',
    en: 'That order is no longer active. Thank you!',
  },
  dispute_checking_replacement: {
    he: (what) => `מעולה! בודקים אפשרות להחלפה — ${what}. נחזור אליך מיד.`,
    en: (what) => `Great — we're checking whether we can swap that: ${what}. We'll come back to you right away.`,
  },
  dispute_cancelled: {
    he: (n, refundNote) => `הזמנה מספר *${n}* בוטלה.${refundNote}\n\nמצטערים על אי הנוחות`,
    en: (n, refundNote) => `Order *${n}* has been cancelled.${refundNote}\n\nSorry for the trouble.`,
  },
  dispute_what_instead: {
    he: (names) => `מה תרצה במקום ${names}?\n\nכתוב מה תרצה להחליף ואנחנו נבדוק שיש לנו.`,
    en: (names) => `What would you like instead of ${names}?\n\nTell us what to swap it for and we'll check we have it.`,
  },
  /** Interpolated INTO dispute_cancelled — its own key because it is a sentence,
   *  not a value, and it was Hebrew inside an otherwise translated message. */
  dispute_refund_note: {
    he: '\nהתשלום יזוכה לכרטיסך תוך 3-5 ימי עסקים.',
    en: '\nYour card will be refunded within 3-5 business days.',
  },
  /** Used where the customer named no single item. */
  dispute_missing_items: {
    he: 'הפריטים החסרים',
    en: 'the missing items',
  },

  // ── Marketing opt-out ──────────────────────────────────────────────────────
  /** The keyword is NOT translated freely: it is interpolated from the word the
   *  matcher actually accepts, or the instruction sends the customer to type
   *  something the bot will not recognise. */
  optout_confirmed: {
    he: (word) => `הוסרת מרשימת הדיוור ולא נשלח אליך יותר תוכן שיווקי. עדכונים על הזמנות שביצעת ימשיכו להישלח.\nלחזרה שלח *${word}*.`,
    en: (word) => `You've been removed from our marketing list and won't get promotional messages. Updates about orders you place will still reach you.\nTo rejoin, send *${word}*.`,
  },
  optin_confirmed: {
    he: 'חזרת לרשימת הדיוור 🎉',
    en: "You're back on the list 🎉",
  },
  /** The word to send to rejoin — must be one of OPT_IN_WORDS in ai-handler. */
  optin_keyword: { he: 'הצטרף', en: 'START' },

  // ── Errors and limits ──────────────────────────────────────────────────────
  error_temporary: {
    he: 'מצטערים, אירעה שגיאה זמנית. אנא נסה שוב.',
    en: 'Sorry, something went wrong for a moment. Please try again.',
  },
  error_saving_order: {
    he: 'אירעה שגיאה בשמירת ההזמנה. אנא נסה שוב.',
    en: "We couldn't save that order. Please try again.",
  },
  schedule_too_soon: {
    he: (lead, earliest) => `לא ניתן לתזמן הזמנה בפחות מ-${lead} דקות מראש.\nהשעה המוקדמת ביותר שניתן לתזמן כרגע: *${earliest}*.`,
    en: (lead, earliest) => `Orders need at least ${lead} minutes' notice.\nThe earliest we can schedule right now is *${earliest}*.`,
  },

  // ── Payment confirmed (order-state's confirmPayment) ───────────────────────
  method_bit:  { he: 'Bit', en: 'Bit' },
  method_cash: { he: 'מזומן', en: 'cash' },
  pay_confirmed_pending: {
    he: (n, m) => `✅ קיבלנו את התשלום ב${m}! (הזמנה מספר *${n}*)\nההזמנה ממתינה לאישור המסעדה — נעדכן אותך ברגע שתאושר.`,
    en: (n, m) => `✅ Payment received by ${m}! (Order *${n}*)\nYour order is waiting for the restaurant to approve it — we'll update you the moment it does.`,
  },
  pay_confirmed_preparing: {
    he: (n, m) => `✅ קיבלנו את התשלום ב${m}! (הזמנה מספר *${n}*)\nההזמנה בהכנה 🍕`,
    en: (n, m) => `✅ Payment received by ${m}! (Order *${n}*)\nYour order is being prepared 🍕`,
  },
};

/**
 * Resolve one message for a language.
 *
 * Throws on an unknown key rather than returning empty: a message the bot
 * silently fails to send is indistinguishable from one the customer ignored,
 * and this is the layer that talks to people who are paying.
 */
function say(key, lang, ...args) {
  const entry = MESSAGES[key];
  if (!entry) throw new Error(`[messages] unknown key: ${key}`);
  const v = entry[lang] || entry.en || entry.he;
  return typeof v === 'function' ? v(...args) : v;
}

/** Languages a message may be written in. Extend with the catalogue, not before. */
const LANGS = ['he', 'en'];

module.exports = { MESSAGES, say, LANGS };
