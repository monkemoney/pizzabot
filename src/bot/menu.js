'use strict';

// Real menu from פיצה דליבריס based on actual customer conversations
const MENU = {
  items: [
    { id: 'family_pizza',    he: 'פיצה משפחתית', en: 'Family Pizza',     price: 58   },
    { id: 'couple_pizza',    he: 'פיצה זוגית',   en: 'Couple Pizza',     price: 50   },
    { id: 'pasta_alfredo',   he: 'פסטה אלפרדו',  en: 'Pasta Alfredo',    price: 42.9 },
    { id: 'focaccia',        he: "פוקצ'ה",       en: 'Focaccia',         price: 19.9 },
    { id: 'pasta_bolognese', he: 'פסטה בולונז',  en: 'Pasta Bolognese',  price: 39.9 },
    { id: 'greek_salad',     he: 'סלט יווני',    en: 'Greek Salad',      price: 32.9 },
  ],
  toppings: [
    { id: 'bulgarian',    he: 'בולגרית',      en: 'Bulgarian cheese', price: 16 },
    { id: 'extra_cheese', he: 'גבינה נוספת',  en: 'Extra cheese',     price: 7  },
    { id: 'onion',        he: 'בצל',          en: 'Onion',            price: 3  },
    { id: 'olives',       he: 'זיתים',        en: 'Olives',           price: 15 },
  ],
  delivery: {
    price: 30,
    cities: ['תל אביב', 'tel aviv'],
  },
};

// Prebuilt menu text for embedding in the system prompt
const MENU_TEXT_HE = `
תפריט פיצה דליבריס:
──────────────────
🍕 פיצה משפחתית — 58₪
🍕 פיצה זוגית — 50₪
🍝 פסטה אלפרדו — 42.9₪
🫓 פוקצ'ה — 19.9₪
🍝 פסטה בולונז — 39.9₪
🥗 סלט יווני — 32.9₪

תוספות לפיצה:
• בולגרית — +16₪
• גבינה נוספת — +7₪
• בצל — +3₪
• זיתים — +15₪

משלוח: 30₪ (לתל אביב בלבד)
איסוף עצמי: חינם
`.trim();

const MENU_TEXT_EN = `
פיצה דליבריס Menu:
──────────────────
🍕 Family Pizza — ₪58
🍕 Couple Pizza — ₪50
🍝 Pasta Alfredo — ₪42.9
🫓 Focaccia — ₪19.9
🍝 Pasta Bolognese — ₪39.9
🥗 Greek Salad — ₪32.9

Pizza Toppings (extras):
• Bulgarian cheese — +₪16
• Extra cheese — +₪7
• Onion — +₪3
• Olives — +₪15

Delivery: ₪30 (Tel Aviv only)
Pickup: free
`.trim();

module.exports = { MENU, MENU_TEXT_HE, MENU_TEXT_EN };
