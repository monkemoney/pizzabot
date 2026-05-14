'use strict';

const { MENU, calcItemPrice, calcCartTotal } = require('./menu');

// ---------------------------------------------------------------------------
// Message templates — every key has both `he` and `en` variants.
// Variable interpolation: use {{varName}} placeholders.
// ---------------------------------------------------------------------------
const MESSAGES = {
  welcome: {
    he: '👋 ברוכים הבאים לפיצרייה שלנו!\n\nלבחירת שפה / To choose language:\n1️⃣ עברית\n2️⃣ English',
    en: '👋 Welcome to our Pizzeria!\n\nTo choose language / לבחירת שפה:\n1️⃣ עברית\n2️⃣ English',
  },

  mainMenu: {
    he: '🍕 *תפריט ראשי*\n\n1️⃣ הזמן פיצה\n2️⃣ צפה בתפריט\n3️⃣ צור קשר\n\nבחר אפשרות:',
    en: '🍕 *Main Menu*\n\n1️⃣ Place an order\n2️⃣ View menu\n3️⃣ Contact us\n\nChoose an option:',
  },

  fullMenu: {
    he:
      '📋 *התפריט שלנו*\n\n' +
      '*🍕 פיצות:*\n' +
      MENU.pizzas.map((p, i) => `${i + 1}. ${p.he} — ₪${p.price}`).join('\n') +
      '\n\n*📐 גדלים (תוספת):*\n' +
      MENU.sizes.map((s) => `• ${s.he}${s.extra > 0 ? ` (+₪${s.extra})` : ''}`).join('\n') +
      '\n\n*🧀 תוספות:*\n' +
      MENU.toppings.map((t) => `• ${t.he} — ₪${t.price}`).join('\n') +
      '\n\n*🥗 תוספות לצד:*\n' +
      MENU.sides.map((s) => `• ${s.he} — ₪${s.price}`).join('\n') +
      '\n\n*🥤 שתייה:*\n' +
      MENU.drinks.map((d) => `• ${d.he} — ₪${d.price}`).join('\n') +
      `\n\n*🚗 דמי משלוח:* ₪${MENU.delivery.price}`,
    en:
      '📋 *Our Menu*\n\n' +
      '*🍕 Pizzas:*\n' +
      MENU.pizzas.map((p, i) => `${i + 1}. ${p.en} — ₪${p.price}`).join('\n') +
      '\n\n*📐 Sizes (extra charge):*\n' +
      MENU.sizes.map((s) => `• ${s.en}${s.extra > 0 ? ` (+₪${s.extra})` : ''}`).join('\n') +
      '\n\n*🧀 Toppings:*\n' +
      MENU.toppings.map((t) => `• ${t.en} — ₪${t.price}`).join('\n') +
      '\n\n*🥗 Sides:*\n' +
      MENU.sides.map((s) => `• ${s.en} — ₪${s.price}`).join('\n') +
      '\n\n*🥤 Drinks:*\n' +
      MENU.drinks.map((d) => `• ${d.en} — ₪${d.price}`).join('\n') +
      `\n\n*🚗 Delivery fee:* ₪${MENU.delivery.price}`,
  },

  contactUs: {
    he: '📞 *צור קשר*\n\nטלפון: 03-1234567\nאימייל: pizza@example.com\nשעות פעילות: א-ה 11:00–23:00, ו-ש 12:00–00:00',
    en: '📞 *Contact Us*\n\nPhone: 03-1234567\nEmail: pizza@example.com\nHours: Sun–Thu 11:00–23:00, Fri–Sat 12:00–00:00',
  },

  pizzaMenu: {
    he:
      '🍕 *בחר פיצה:*\n\n' +
      MENU.pizzas.map((p, i) => `${i + 1}. ${p.he} — ₪${p.price}`).join('\n'),
    en:
      '🍕 *Choose your pizza:*\n\n' +
      MENU.pizzas.map((p, i) => `${i + 1}. ${p.en} — ₪${p.price}`).join('\n'),
  },

  sizeSelect: {
    he:
      '📐 *בחר גודל:*\n\n' +
      MENU.sizes.map((s, i) => `${i + 1}. ${s.he}${s.extra > 0 ? ` (+₪${s.extra})` : ''}`).join('\n'),
    en:
      '📐 *Choose a size:*\n\n' +
      MENU.sizes.map((s, i) => `${i + 1}. ${s.en}${s.extra > 0 ? ` (+₪${s.extra})` : ''}`).join('\n'),
  },

  toppingsSelect: {
    he: '🧀 *בחר תוספות* (שלח מספר להוספה/הסרה, 0 לסיום):',
    en: '🧀 *Choose toppings* (send number to add/remove, 0 when done):',
  },

  toppingsAdded: {
    he: '✅ עודכן! שלח עוד מספרים להוספה/הסרה, או 0 לסיום.',
    en: '✅ Updated! Send more numbers to add/remove, or 0 when done.',
  },

  sidesMenu: {
    he:
      '🥗 *תוספות לצד* (שלח מספר, ניתן לבחור כמה — 0 לדילוג):*\n\n' +
      MENU.sides.map((s, i) => `${i + 1}. ${s.he} — ₪${s.price}`).join('\n') +
      '\n\n0. דלג',
    en:
      '🥗 *Sides* (send number, multiple allowed — 0 to skip):*\n\n' +
      MENU.sides.map((s, i) => `${i + 1}. ${s.en} — ₪${s.price}`).join('\n') +
      '\n\n0. Skip',
  },

  drinksMenu: {
    he:
      '🥤 *שתייה* (שלח מספר, ניתן לבחור כמה — 0 לדילוג):*\n\n' +
      MENU.drinks.map((d, i) => `${i + 1}. ${d.he} — ₪${d.price}`).join('\n') +
      '\n\n0. דלג',
    en:
      '🥤 *Drinks* (send number, multiple allowed — 0 to skip):*\n\n' +
      MENU.drinks.map((d, i) => `${i + 1}. ${d.en} — ₪${d.price}`).join('\n') +
      '\n\n0. Skip',
  },

  deliveryMethod: {
    he: '🚗 *שיטת קבלה:*\n\n1️⃣ איסוף עצמי\n2️⃣ משלוח לבית (+₪15)',
    en: '🚗 *Delivery method:*\n\n1️⃣ Pickup\n2️⃣ Delivery (+₪15)',
  },

  addressPrompt: {
    he: '🏠 שלח את כתובת המשלוח שלך:',
    en: '🏠 Please send your delivery address:',
  },

  notesPrompt: {
    he: '📝 יש הערות להזמנה? (כתוב הערה או שלח 0 לדילוג)',
    en: '📝 Any notes for your order? (type a note or send 0 to skip)',
  },

  paymentSelect: {
    he: '💳 *שיטת תשלום:*\n\n1️⃣ מזומן\n2️⃣ אשראי',
    en: '💳 *Payment method:*\n\n1️⃣ Cash\n2️⃣ Credit card',
  },

  confirmPrompt: {
    he: '{{summary}}\n\n1️⃣ אשר הזמנה ✅\n2️⃣ בטל הזמנה ❌',
    en: '{{summary}}\n\n1️⃣ Confirm order ✅\n2️⃣ Cancel order ❌',
  },

  orderConfirmed: {
    he: '🎉 *הזמנה אושרה!*\n\nמספר הזמנה: *{{orderId}}*\n\nתודה רבה! ההזמנה שלך בדרך. 🍕',
    en: '🎉 *Order confirmed!*\n\nOrder ID: *{{orderId}}*\n\nThank you! Your order is on its way. 🍕',
  },

  orderCancelled: {
    he: '❌ ההזמנה בוטלה.\n\nנשמח לשרת אותך שוב! שלח כל הודעה להתחיל מחדש.',
    en: '❌ Order cancelled.\n\nWe hope to serve you again! Send any message to start over.',
  },

  addMoreItems: {
    he: '✅ הפיצה נוספה לסל!\n\n1️⃣ הוסף פיצה נוספת\n2️⃣ המשך לתוספות / שתייה',
    en: '✅ Pizza added to cart!\n\n1️⃣ Add another pizza\n2️⃣ Continue to sides / drinks',
  },

  invalidInput: {
    he: '⚠️ קלט לא תקין. אנא בחר אפשרות מהרשימה.',
    en: '⚠️ Invalid input. Please choose one of the listed options.',
  },

  goodbye: {
    he: '👋 להתראות! אנחנו מצפים לראותך שוב. שלח כל הודעה להזמין שוב.',
    en: '👋 Goodbye! We hope to see you again. Send any message to order again.',
  },
};

// ---------------------------------------------------------------------------
// Translation helper
// ---------------------------------------------------------------------------

/**
 * Get the message string for `key` in the given language, with optional
 * variable interpolation.  Variables are expressed as {{varName}} in templates.
 *
 * @param {string} key       — key in MESSAGES
 * @param {string} lang      — 'he' | 'en'
 * @param {Object} [vars={}] — map of variable name → value
 * @returns {string}
 */
function t(key, lang, vars = {}) {
  const entry = MESSAGES[key];
  if (!entry) {
    console.warn(`[messages] Unknown message key: ${key}`);
    return '';
  }
  const safeLang = lang === 'en' ? 'en' : 'he';
  let text = entry[safeLang] || entry['he'] || '';

  // Interpolate {{varName}} placeholders
  for (const [name, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), String(value));
  }
  return text;
}

// ---------------------------------------------------------------------------
// Order summary builder
// ---------------------------------------------------------------------------

/**
 * Build a human-readable order summary string.
 *
 * @param {Object} params
 * @param {Array}  params.cart            — pizza items
 * @param {Array}  params.sides           — side items
 * @param {Array}  params.drinks          — drink items
 * @param {string} params.deliveryMethod  — 'pickup' | 'delivery'
 * @param {string} params.address         — delivery address (optional)
 * @param {string} params.notes           — order notes (optional)
 * @param {string} params.paymentMethod   — 'cash' | 'credit'
 * @param {string} params.lang            — 'he' | 'en'
 * @returns {string}
 */
function buildOrderSummary({ cart, sides, drinks, deliveryMethod, address, notes, paymentMethod, lang }) {
  const isHe = lang !== 'en';
  const lines = [];

  if (isHe) {
    lines.push('📋 *סיכום הזמנה:*\n');
    lines.push('🍕 *פיצות:*');
    cart.forEach((item, idx) => {
      const pizzaName  = item.pizza[isHe ? 'he' : 'en'];
      const sizeName   = item.size[isHe ? 'he' : 'en'];
      const price      = calcItemPrice(item);
      const toppingStr = item.toppings && item.toppings.length > 0
        ? item.toppings.map((tp) => tp[isHe ? 'he' : 'en']).join(', ')
        : 'ללא תוספות';
      lines.push(`  ${idx + 1}. ${pizzaName} (${sizeName})`);
      lines.push(`     תוספות: ${toppingStr}`);
      lines.push(`     מחיר: ₪${price}`);
    });

    if (sides && sides.length > 0) {
      lines.push('\n🥗 *תוספות לצד:*');
      sides.forEach((s) => lines.push(`  • ${s.he} — ₪${s.price}`));
    }

    if (drinks && drinks.length > 0) {
      lines.push('\n🥤 *שתייה:*');
      drinks.forEach((d) => lines.push(`  • ${d.he} — ₪${d.price}`));
    }

    const total = calcCartTotal(cart, sides, drinks, deliveryMethod);
    const subtotal = total - (deliveryMethod === 'delivery' ? MENU.delivery.price : 0);

    lines.push(`\n💰 סכום ביניים: ₪${subtotal}`);
    if (deliveryMethod === 'delivery') lines.push(`🚗 דמי משלוח: ₪${MENU.delivery.price}`);
    lines.push(`💳 *סה"כ לתשלום: ₪${total}*`);

    lines.push(`\n📦 שיטת קבלה: ${deliveryMethod === 'delivery' ? 'משלוח' : 'איסוף עצמי'}`);
    if (deliveryMethod === 'delivery' && address) lines.push(`🏠 כתובת: ${address}`);
    lines.push(`💳 תשלום: ${paymentMethod === 'cash' ? 'מזומן' : 'אשראי'}`);
    if (notes) lines.push(`📝 הערות: ${notes}`);
  } else {
    lines.push('📋 *Order Summary:*\n');
    lines.push('🍕 *Pizzas:*');
    cart.forEach((item, idx) => {
      const pizzaName  = item.pizza.en;
      const sizeName   = item.size.en;
      const price      = calcItemPrice(item);
      const toppingStr = item.toppings && item.toppings.length > 0
        ? item.toppings.map((tp) => tp.en).join(', ')
        : 'No toppings';
      lines.push(`  ${idx + 1}. ${pizzaName} (${sizeName})`);
      lines.push(`     Toppings: ${toppingStr}`);
      lines.push(`     Price: ₪${price}`);
    });

    if (sides && sides.length > 0) {
      lines.push('\n🥗 *Sides:*');
      sides.forEach((s) => lines.push(`  • ${s.en} — ₪${s.price}`));
    }

    if (drinks && drinks.length > 0) {
      lines.push('\n🥤 *Drinks:*');
      drinks.forEach((d) => lines.push(`  • ${d.en} — ₪${d.price}`));
    }

    const total = calcCartTotal(cart, sides, drinks, deliveryMethod);
    const subtotal = total - (deliveryMethod === 'delivery' ? MENU.delivery.price : 0);

    lines.push(`\n💰 Subtotal: ₪${subtotal}`);
    if (deliveryMethod === 'delivery') lines.push(`🚗 Delivery fee: ₪${MENU.delivery.price}`);
    lines.push(`💳 *Total: ₪${total}*`);

    lines.push(`\n📦 Delivery method: ${deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}`);
    if (deliveryMethod === 'delivery' && address) lines.push(`🏠 Address: ${address}`);
    lines.push(`💳 Payment: ${paymentMethod === 'cash' ? 'Cash' : 'Credit card'}`);
    if (notes) lines.push(`📝 Notes: ${notes}`);
  }

  return lines.join('\n');
}

/**
 * Build the toppings selection menu with checkmarks on selected items.
 * @param {Array}  selectedToppings  — array of topping objects currently in current_item
 * @param {string} lang
 * @returns {string}
 */
function buildToppingsMenu(selectedToppings, lang) {
  const isHe  = lang !== 'en';
  const header = isHe ? '🧀 *בחר תוספות* (שלח מספר להוספה/הסרה, 0 לסיום):\n' : '🧀 *Choose toppings* (send number to add/remove, 0 when done):\n';
  const selectedIds = new Set((selectedToppings || []).map((t) => t.id));

  const rows = MENU.toppings.map((tp, idx) => {
    const checked = selectedIds.has(tp.id) ? '✅ ' : '   ';
    const name    = isHe ? tp.he : tp.en;
    return `${checked}${idx + 1}. ${name} — ₪${tp.price}`;
  });

  const footer = isHe ? '\n0. סיים תוספות' : '\n0. Done with toppings';
  return header + rows.join('\n') + footer;
}

module.exports = { MESSAGES, t, buildOrderSummary, buildToppingsMenu };
