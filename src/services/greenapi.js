'use strict';

require('dotenv').config();
const axios = require('axios');
const metaWA = require('./meta-whatsapp');

const BASE_URL    = process.env.GREEN_API_BASE_URL || 'https://api.green-api.com';
const INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const TOKEN       = process.env.GREEN_API_TOKEN;
const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

// A tenant sends via the official Meta Cloud API when it has Meta credentials:
// the default tenant from env vars, other tenants from their settings rows
// (meta_phone_number_id + meta_access_token, seeded during onboarding).
// Tenants without Meta creds stay on Green API.
async function _metaCreds(tenantId) {
  // dialCode rides along with the creds: meta-whatsapp's senders only ever see
  // this object, and a US tenant's ten-digit recipient needs its country code.
  const dialCode = await _dialCode(tenantId);
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    return metaWA.ENV_CREDS.phoneNumberId && metaWA.ENV_CREDS.accessToken
      ? { ...metaWA.ENV_CREDS, dialCode } : null;
  }
  const settings = require('./settings');
  const [phoneNumberId, accessToken] = await Promise.all([
    settings.get('meta_phone_number_id', tenantId).catch(() => null),
    settings.get('meta_access_token', tenantId).catch(() => null),
  ]);
  return phoneNumberId && accessToken ? { phoneNumberId, accessToken, dialCode } : null;
}

function apiUrl(method, instanceId = INSTANCE_ID, token = TOKEN) {
  return `${BASE_URL}/waInstance${instanceId}/${method}/${token}`;
}

// Delegates to services/phone.js — this logic existed here AND in
// meta-whatsapp.js, character for character, and both were Israel-only.
// dialCode defaults to Israel so every existing caller is unchanged.
function formatPhone(raw, dialCode) {
  return require('./phone').normalize(raw, dialCode);
}

function toChatId(phone, dialCode) {
  const bare = formatPhone(phone, dialCode);
  return bare.includes('@') ? bare : `${bare}@c.us`;
}

/** The tenant's dial code, for normalising a number the way THEY write it. */
async function _dialCode(tenantId) {
  try {
    const settings = require('./settings');
    const { resolveLocale } = require('./locale');
    return resolveLocale(await settings.loadAll(tenantId)).dialCode;
  } catch { return require('./phone').DEFAULT_DIAL; }
}

// Resolve Green API credentials for a tenant.
// For the default tenant, use env vars. For others, read from settings table.
async function _tenantCreds(tenantId) {
  const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    return { instanceId: INSTANCE_ID, token: TOKEN };
  }
  const settings = require('./settings');
  const [instanceId, token] = await Promise.all([
    settings.get('green_api_instance', tenantId),
    settings.get('green_api_token', tenantId),
  ]);
  if (!instanceId || !token) {
    throw new Error(`[greenapi] Missing Green API credentials for tenant ${tenantId}`);
  }
  return { instanceId, token };
}

async function sendMessage(phone, message, tenantId = null) {
  const meta = await _metaCreds(tenantId);
  if (meta) return metaWA.sendMessage(phone, message, meta);

  const chatId = toChatId(phone, meta ? undefined : await _dialCode(tenantId));
  const { instanceId, token } = await _tenantCreds(tenantId);
  try {
    const r = await axios.post(apiUrl('sendMessage', instanceId, token), { chatId, message });
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] sendMessage failed for ${chatId}:`, detail);
    throw err;
  }
}

/**
 * Send a business-initiated message: Meta tenants need an approved template
 * (outside the 24h window Meta rejects free text); Green API tenants have no
 * such rule, so they get fallbackText as a plain message.
 * template = { name, lang, params }.
 */
async function sendTemplate(phone, template, tenantId = null, fallbackText = null) {
  const meta = await _metaCreds(tenantId);
  if (meta) {
    return metaWA.sendTemplate(phone, template.name, template.lang || 'he', template.params || [], meta);
  }
  if (fallbackText) return sendMessage(phone, fallbackText, tenantId);
  throw new Error(`[greenapi] tenant ${tenantId} has no Meta creds and no fallback text for template "${template.name}"`);
}

/**
 * Configure Green API webhook URL for a specific instance.
 * Called during client provisioning.
 */
async function setWebhook(instanceId, token, webhookUrl) {
  try {
    const r = await axios.post(apiUrl('setSettings', instanceId, token), {
      webhookUrl,
      webhookUrlToken: '',
      delaySendMessagesMilliseconds: 1000,
      markIncomingMessagesReaded: 'yes',
    });
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[greenapi] setWebhook failed (instance ${instanceId}):`, detail);
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
 * DEPRECATED (2026-07-28): toppings are collected as free text now — polls/lists
 * can't express partial portions ("רבע זיתים") and were a recurring failure
 * source. No production caller remains; kept only for API compatibility.
 *
 * Step 3 — Toppings poll for pizza orders.
 * Sends a toppings multi-select poll.
 * 1. If productName is given → look for product_additions for that product first.
 * 2. Fallback: use the global is_topping_addon category products.
 */
// Lazy shared client for sendToppingsPoll — was created fresh on every call.
let _pollSB = null;
function _pollDB() {
  if (!_pollSB) {
    const { createClient } = require('@supabase/supabase-js');
    _pollSB = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _pollSB;
}

async function sendToppingsPoll(phone, lang = 'he', productName = null, tenantId = null) {
  const supabase = _pollDB();
  const { getProducts } = require('./menu-service');
  const { categories, byCategory, main } = await getProducts();

  const isHe = lang !== 'en';
  let toppingRows = []; // [{ name_he, price }]

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
      if (additions && additions.length) toppingRows = additions;
    }
  }

  // 2. Fallback: global is_topping_addon category
  if (!toppingRows.length) {
    const toppingCat = categories.find((c) => c.is_topping_addon);
    toppingRows = toppingCat ? (byCategory[toppingCat.id]?.items || []) : [];
  }

  if (!toppingRows.length) {
    await sendMessage(phone, isHe ? 'אין תוספות זמינות כרגע.' : 'No toppings available right now.', tenantId);
    return;
  }

  const meta = await _metaCreds(tenantId);
  if (meta) {
    return metaWA.sendToppingsList(phone, lang, toppingRows, meta);
  }

  const toppingOptions = toppingRows.map((a) => `${a.name_he} — +${a.price}₪`);

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
 * Interactive reply buttons through the tenant's channel.
 * Meta tenants get native buttons; Green API tenants get the plain-text
 * fallback (fallbackText should tell the admin what to type instead).
 * buttons: [{ id, title }]
 */
async function sendInteractiveButtons(phone, body, buttons, tenantId = null, fallbackText = null) {
  const meta = await _metaCreds(tenantId);
  if (meta) return metaWA.sendButtons(phone, { body, buttons }, meta);
  return sendMessage(phone, fallbackText || body, tenantId);
}

/**
 * Interactive single-select list through the tenant's channel (same fallback rule).
 * rows: [{ id, title, description }]
 */
async function sendInteractiveList(phone, { header, body, buttonText, rows }, tenantId = null, fallbackText = null) {
  const meta = await _metaCreds(tenantId);
  if (meta) return metaWA.sendList(phone, { header, body, buttonText, rows }, meta);
  return sendMessage(phone, fallbackText || body, tenantId);
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
  sendMessage, sendTemplate, sendListMessage, sendMenuList, sendCategoryPoll,
  sendToppingsPoll, sendPoll, resolveCategoryVote,
  isControlOption, CTRL_CONFIRM, CTRL_BACK, CTRL_NO_TOP,
  sendButtons, sendInteractiveButtons, sendInteractiveList, formatPhone, toChatId, setWebhook, _dialCode,
};
