'use strict';

require('dotenv').config();
const axios = require('axios');

const BASE_URL     = process.env.GREEN_API_BASE_URL || 'https://api.green-api.com';
const INSTANCE_ID  = process.env.GREEN_API_INSTANCE_ID;
const TOKEN        = process.env.GREEN_API_TOKEN;

/**
 * Build the full endpoint URL for a Green API method.
 * Pattern: {BASE_URL}/waInstance{INSTANCE_ID}/{method}/{TOKEN}
 * @param {string} method
 * @returns {string}
 */
function apiUrl(method) {
  return `${BASE_URL}/waInstance${INSTANCE_ID}/${method}/${TOKEN}`;
}

/**
 * Normalize a phone string from various incoming formats to the bare E.164
 * number used for storage (e.g. "972501234567").
 *
 * Green API webhooks send:  "972501234567@c.us"  or  "972501234567@g.us"
 * We strip the @suffix and optionally prepend 972 for Israeli numbers.
 *
 * @param {string} raw
 * @returns {string}  e.g. "972501234567"
 */
function formatPhone(raw) {
  if (!raw) return raw;

  // Strip @c.us / @g.us / any @… suffix
  let phone = raw.split('@')[0].trim();

  // Remove any non-digit characters (dashes, spaces, +)
  phone = phone.replace(/\D/g, '');

  // If it looks like a local Israeli number (starts with 05, 10 digits), prepend 972
  if (phone.startsWith('0') && phone.length === 10) {
    phone = '972' + phone.slice(1);
  }

  return phone;
}

/**
 * Convert a bare phone number to the Green API chatId format.
 * @param {string} phone  e.g. "972501234567"
 * @returns {string}      e.g. "972501234567@c.us"
 */
function toChatId(phone) {
  const bare = formatPhone(phone);
  return bare.includes('@') ? bare : `${bare}@c.us`;
}

/**
 * Send a plain text message via Green API.
 * @param {string} phone   bare number, e.g. "972501234567"
 * @param {string} message text to send
 */
async function sendMessage(phone, message) {
  const chatId = toChatId(phone);
  const url = apiUrl('sendMessage');

  try {
    const response = await axios.post(url, { chatId, message });
    return response.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendMessage failed for ${chatId}:`, detail);
    throw err;
  }
}

/**
 * Send a list-picker message (interactive list).
 * @param {string} phone
 * @param {string} title         header text
 * @param {string} description   body text
 * @param {string} buttonText    label on the list-opener button
 * @param {Array}  sections      array of { title, rows: [{ title, rowId, description }] }
 */
async function sendListMessage(phone, title, description, buttonText, sections) {
  const chatId = toChatId(phone);
  const url = apiUrl('sendListMessage');

  try {
    const response = await axios.post(url, {
      chatId,
      title,
      description,
      buttonText,
      sections,
    });
    return response.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendListMessage failed for ${chatId}:`, detail);
    // Fallback: send plain text so the user is not left hanging
    await sendMessage(phone, `${title}\n\n${description}`).catch(() => {});
    throw err;
  }
}

/**
 * Send a button-reply message (max 3 buttons).
 * @param {string} phone
 * @param {string} message          body text
 * @param {Array}  buttons          array of { buttonId, buttonText }
 */
async function sendButtons(phone, message, buttons) {
  const chatId = toChatId(phone);
  const url = apiUrl('sendButtons');

  // Green API expects buttons as: [{ buttonId: "1", buttonText: { displayText: "Yes" } }]
  const formattedButtons = buttons.map((b) => ({
    buttonId: b.buttonId,
    buttonText: { displayText: b.buttonText },
  }));

  try {
    const response = await axios.post(url, {
      chatId,
      message,
      footer: '',
      buttons: formattedButtons,
    });
    return response.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendButtons failed for ${chatId}:`, detail);
    // Fallback to plain text
    const fallback = message + '\n\n' + buttons.map((b) => `${b.buttonId}. ${b.buttonText}`).join('\n');
    await sendMessage(phone, fallback).catch(() => {});
    throw err;
  }
}

module.exports = { sendMessage, sendListMessage, sendButtons, formatPhone, toChatId };
