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

/**
 * Build and send the interactive menu from live products in DB.
 * Called after the greeting so the customer sees a native WhatsApp picker.
 */
async function sendMenuList(phone, lang = 'he') {
  const { getProducts } = require('./menu-service');
  const { main } = await getProducts();

  const isHe = lang !== 'en';

  const rows = main.map((p) => ({
    rowId:       p.name_he,                          // passed back as text on selection
    title:       p.name_he,
    description: `${p.price}₪`,
  }));

  const sections = [{ title: isHe ? 'מה תרצה לאכול?' : 'What would you like?', rows }];

  const title      = isHe ? '🍕 תפריט פיצה דליבריס' : '🍕 Pizza Deliveries Menu';
  const desc       = isHe ? 'בחר מנה מהרשימה 👇' : 'Select an item from the list 👇';
  const buttonText = isHe ? 'פתח תפריט' : 'Open Menu';

  try {
    await sendListMessage(phone, title, desc, buttonText, sections);
  } catch {
    // Fallback already handled inside sendListMessage
  }
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

module.exports = { sendMessage, sendListMessage, sendMenuList, sendButtons, formatPhone, toChatId };
