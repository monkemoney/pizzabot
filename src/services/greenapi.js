'use strict';

require('dotenv').config();
const axios = require('axios');

const BASE_URL    = process.env.GREEN_API_BASE_URL || 'https://api.green-api.com';
const INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const TOKEN       = process.env.GREEN_API_TOKEN;

function apiUrl(method) {
  return `${BASE_URL}/waInstance${INSTANCE_ID}/${method}/${TOKEN}`;
}

function formatPhone(raw) {
  if (!raw) return raw;
  let phone = raw.split('@')[0].trim().replace(/\D/g, '');
  if (phone.startsWith('0') && phone.length === 10) phone = '972' + phone.slice(1);
  return phone;
}

function toChatId(phone) {
  const bare = formatPhone(phone);
  return bare.includes('@') ? bare : `${bare}@c.us`;
}

async function sendMessage(phone, message) {
  const chatId = toChatId(phone);
  try {
    const r = await axios.post(apiUrl('sendMessage'), { chatId, message });
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendMessage failed for ${chatId}:`, detail);
    throw err;
  }
}

/**
 * Send an interactive list message (WhatsApp native picker).
 * sections = [{ title, rows: [{ rowId, title, description }] }]
 */
async function sendListMessage(phone, title, description, buttonText, sections) {
  const chatId = toChatId(phone);
  try {
    const r = await axios.post(apiUrl('sendListMessage'), {
      chatId, title, description, buttonText, sections,
    });
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendListMessage failed for ${chatId}:`, detail);
    // Fallback to plain text
    const text = [title, description, ...sections.flatMap(s =>
      [`*${s.title}*`, ...s.rows.map(r => `• ${r.title} — ${r.description}`)]
    )].join('\n');
    await sendMessage(phone, text).catch(() => {});
    throw err;
  }
}

// ─── Poll helpers ─────────────────────────────────────────────────────────────

// Control options (never treated as item selections)
const CTRL_CONFIRM   = '✅ אפשר להמשיך';
const CTRL_CONFIRM_EN= '✅ Continue';
const CTRL_BACK      = '🔙 חזרה לתפריט';
const CTRL_BACK_EN   = '🔙 Back to menu';
const CTRL_NO_TOP    = '✅ ללא תוספות';
const CTRL_NO_TOP_EN = '✅ No toppings';

function isControlOption(opt) {
  return [CTRL_CONFIRM, CTRL_CONFIRM_EN, CTRL_BACK, CTRL_BACK_EN,
          CTRL_NO_TOP, CTRL_NO_TOP_EN].some((c) => opt.includes(c));
}

/**
 * Send a WhatsApp poll.
 * @param {string}   phone
 * @param {string}   question
 * @param {string[]} options    up to 12 options
 * @param {boolean}  multiple   allow multiple selections (default false)
 */
async function sendPoll(phone, question, options, multiple = false) {
  const chatId = toChatId(phone);
  try {
    const r = await axios.post(apiUrl('sendPoll'), {
      chatId,
      message:         question,
      options:         options.map((o) => ({ optionName: o })),
      multipleAnswers: multiple,
    });
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendPoll failed for ${chatId}:`, detail);
    throw err;
  }
}

// Category label builder — uses live DB categories
function buildCategoryLabel(cat) {
  return `${cat.emoji} ${cat.name_he}`;
}

/**
 * Step 1 — Send category selection poll from live DB categories.
 */
async function sendMenuList(phone, lang = 'he') {
  const { getProducts } = require('./menu-service');
  const { categories, byCategory } = await getProducts();

  const isHe = lang !== 'en';
  // Only show non-addon categories that have products
  const active = categories.filter((c) => !c.is_topping_addon && (byCategory[c.id]?.items || []).length > 0);
  const options  = active.map(buildCategoryLabel);
  const question = isHe ? 'מה תרצה להזמין? 👇' : 'What would you like? 👇';

  await sendPoll(phone, question, options);
}

/**
 * Step 2 — Send item poll for a category (by category UUID).
 * @param {string} phone
 * @param {string} categoryId  UUID from categories table
 * @param {string} lang
 */
async function sendCategoryPoll(phone, categoryId, lang = 'he') {
  const { getProducts } = require('./menu-service');
  const { categories, byCategory } = await getProducts();

  const isHe = lang !== 'en';
  const cat  = categories.find((c) => c.id === categoryId);
  const items = byCategory[categoryId]?.items || [];

  if (!items.length) {
    await sendMessage(phone, isHe ? 'אין פריטים בקטגוריה זו כרגע.' : 'No items in this category right now.');
    return;
  }

  const confirm  = isHe ? CTRL_CONFIRM : CTRL_CONFIRM_EN;
  const back     = isHe ? CTRL_BACK    : CTRL_BACK_EN;
  const label    = cat ? buildCategoryLabel(cat) : '';
  const options  = [...items.map((p) => `${p.name_he} — ${p.price}₪`), confirm, back];
  const question = isHe
    ? `בחר מנה מ${label} (ניתן לבחור כמה שתרצה):`
    : `Choose from ${label} (multiple OK):`;

  await sendPoll(phone, question, options, true);
}

/**
 * Step 3 — Toppings poll for pizza orders.
 * Sends a toppings multi-select poll.
 * 1. If productName is given → look for product_additions for that product first.
 * 2. Fallback: use the global is_topping_addon category products.
 */
async function sendToppingsPoll(phone, lang = 'he', productName = null) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { getProducts } = require('./menu-service');
  const { categories, byCategory, main } = await getProducts();

  const isHe = lang !== 'en';
  let toppingOptions = [];

  // 1. Try per-product additions if productName given
  if (productName) {
    const product = main.find((p) =>
      p.name_he && p.name_he.includes(productName.trim().slice(0, 6))
    );
    if (product) {
      const { data: additions } = await supabase
        .from('product_additions')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_available', true)
        .order('sort_order');
      if (additions && additions.length) {
        toppingOptions = additions.map((a) => `${a.name_he} — +${a.price}₪`);
      }
    }
  }

  // 2. Fallback: global is_topping_addon category
  if (!toppingOptions.length) {
    const toppingCat = categories.find((c) => c.is_topping_addon);
    const toppings   = toppingCat ? (byCategory[toppingCat.id]?.items || []) : [];
    toppingOptions   = toppings.map((t) => `${t.name_he} — +${t.price}₪`);
  }

  if (!toppingOptions.length) {
    await sendMessage(phone, isHe ? 'אין תוספות זמינות כרגע.' : 'No toppings available right now.');
    return;
  }

  const noTop   = isHe ? CTRL_NO_TOP  : CTRL_NO_TOP_EN;
  const confirm = isHe ? CTRL_CONFIRM : CTRL_CONFIRM_EN;
  const back    = isHe ? CTRL_BACK    : CTRL_BACK_EN;

  const options  = [...toppingOptions, noTop, confirm, back];
  const question = isHe
    ? '🧀 אילו תוספות תרצה? (ניתן לבחור כמה):'
    : '🧀 Which toppings? (pick multiple):';

  await sendPoll(phone, question, options, true);
}

/**
 * Resolve a category poll vote label → category UUID from live DB.
 * Returns null if not recognized.
 */
async function resolveCategoryVote(vote) {
  const { getProducts } = require('./menu-service');
  const { categories } = await getProducts();
  const trimmed = vote.trim();
  const cat = categories.find((c) =>
    trimmed === buildCategoryLabel(c) ||
    trimmed.includes(c.name_he) ||
    trimmed.includes(c.emoji)
  );
  return cat ? cat.id : null;
}

/**
 * Send interactive buttons (max 3).
 */
async function sendButtons(phone, message, buttons) {
  const chatId = toChatId(phone);
  const formattedButtons = buttons.map((b) => ({
    buttonId:   b.buttonId,
    buttonText: { displayText: b.buttonText },
  }));
  try {
    const r = await axios.post(apiUrl('sendButtons'), {
      chatId, message, footer: '', buttons: formattedButtons,
    });
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendButtons failed for ${chatId}:`, detail);
    const fallback = message + '\n\n' + buttons.map((b) => `${b.buttonId}. ${b.buttonText}`).join('\n');
    await sendMessage(phone, fallback).catch(() => {});
    throw err;
  }
}

module.exports = {
  sendMessage, sendListMessage, sendMenuList, sendCategoryPoll,
  sendToppingsPoll, sendPoll, resolveCategoryVote,
  isControlOption, CTRL_CONFIRM, CTRL_BACK, CTRL_NO_TOP,
  sendButtons, formatPhone, toChatId,
};
