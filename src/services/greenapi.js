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

/**
 * Send a WhatsApp poll (native — works on all WhatsApp accounts).
 * @param {string}   phone
 * @param {string}   question   poll title/question
 * @param {string[]} options    up to 12 option strings
 */
async function sendPoll(phone, question, options) {
  const chatId = toChatId(phone);
  try {
    const r = await axios.post(apiUrl('sendPoll'), {
      chatId,
      message:         question,
      options:         options.map((o) => ({ optionName: o })),
      multipleAnswers: false,
    });
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendPoll failed for ${chatId}:`, detail);
    throw err;
  }
}

// Product categories — derived from product name keywords
function getCategory(nameHe) {
  if (nameHe.includes('פיצה'))  return 'pizzas';
  if (nameHe.includes('פסטה'))  return 'pastas';
  return 'other';
}

const CATEGORY_LABELS = {
  pizzas: '🍕 פיצות',
  pastas: '🍝 פסטות',
  other:  '🥗 מנות נוספות',
};

const CATEGORY_LABELS_EN = {
  pizzas: '🍕 Pizzas',
  pastas: '🍝 Pastas',
  other:  '🥗 More Items',
};

/**
 * Step 1 — Send category selection poll.
 * Groups live products into categories; only shows categories that have items.
 */
async function sendMenuList(phone, lang = 'he') {
  const { getProducts } = require('./menu-service');
  const { main } = await getProducts();

  const isHe = lang !== 'en';
  const labels = isHe ? CATEGORY_LABELS : CATEGORY_LABELS_EN;

  // Find which categories have products
  const usedCategories = [...new Set(main.map((p) => getCategory(p.name_he)))]
    .filter((c) => labels[c]);

  const options  = usedCategories.map((c) => labels[c]);
  const question = isHe ? 'מה תרצה להזמין? 👇' : "What would you like? 👇";

  await sendPoll(phone, question, options);
}

/**
 * Step 2 — Send item selection poll for a specific category.
 * @param {string} phone
 * @param {string} categoryKey  'pizzas' | 'pastas' | 'other'
 * @param {string} lang
 */
async function sendCategoryPoll(phone, categoryKey, lang = 'he') {
  const { getProducts } = require('./menu-service');
  const { main } = await getProducts();

  const isHe  = lang !== 'en';
  const items  = main.filter((p) => getCategory(p.name_he) === categoryKey);

  if (!items.length) {
    await sendMessage(phone, isHe ? 'אין פריטים בקטגוריה זו כרגע.' : 'No items in this category right now.');
    return;
  }

  const options  = items.map((p) => `${p.name_he} — ${p.price}₪`);
  const label    = (isHe ? CATEGORY_LABELS : CATEGORY_LABELS_EN)[categoryKey] || '';
  const question = isHe ? `בחר מנה מ${label}:` : `Choose from ${label}:`;

  await sendPoll(phone, question, options);
}

/**
 * Resolve a category poll vote (localized label) → category key.
 * Returns null if not recognized.
 */
function resolveCategoryVote(vote) {
  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    if (vote.includes(label) || label.includes(vote.trim())) return key;
  }
  for (const [key, label] of Object.entries(CATEGORY_LABELS_EN)) {
    if (vote.includes(label) || label.includes(vote.trim())) return key;
  }
  return null;
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
  sendPoll, resolveCategoryVote, sendButtons, formatPhone, toChatId,
};
