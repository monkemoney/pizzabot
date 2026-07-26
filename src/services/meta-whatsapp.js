'use strict';

require('dotenv').config();
const axios  = require('axios');
const crypto = require('crypto');

const API_VERSION     = process.env.META_WA_API_VERSION || 'v21.0';
const PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.META_WA_ACCESS_TOKEN;
const WABA_ID         = process.env.META_WA_WABA_ID;
const VERIFY_TOKEN    = process.env.META_WA_VERIFY_TOKEN;
const APP_SECRET      = process.env.META_APP_SECRET;   // app-level, signs every webhook

// Env creds = the default tenant. Other tenants pass their own creds
// (read from the settings table by greenapi.js's dispatch layer).
const ENV_CREDS = { phoneNumberId: PHONE_NUMBER_ID, accessToken: ACCESS_TOKEN };

function apiUrl(path) {
  return `https://graph.facebook.com/${API_VERSION}/${path}`;
}

function authHeaders(creds) {
  return { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' };
}

// Meta wants E.164 digits, no '+', no '@c.us' suffix.
function formatPhone(raw) {
  if (!raw) return raw;
  let phone = raw.split('@')[0].trim().replace(/\D/g, '');
  if (phone.startsWith('0') && phone.length === 10) phone = '972' + phone.slice(1);
  return phone;
}

async function sendMessage(phone, message, creds = ENV_CREDS) {
  const to = formatPhone(phone);
  try {
    const r = await axios.post(
      apiUrl(`${creds.phoneNumberId}/messages`),
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: message, preview_url: false } },
      { headers: authHeaders(creds) }
    );
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[meta-wa] sendMessage failed for ${to}:`, detail);
    throw err;
  }
}

/**
 * Send an approved template message — the only message type Meta allows
 * business-initiated, outside the 24h customer-service window (used by
 * missed-call recovery). params become {{1}},{{2}},... body variables.
 */
async function sendTemplate(phone, templateName, langCode = 'he', params = [], creds = ENV_CREDS) {
  const to = formatPhone(phone);
  const template = { name: templateName, language: { code: langCode } };
  if (Array.isArray(params) && params.length) {
    template.components = [{
      type: 'body',
      parameters: params.map((p) => ({ type: 'text', text: String(p) })),
    }];
  }
  try {
    const r = await axios.post(
      apiUrl(`${creds.phoneNumberId}/messages`),
      { messaging_product: 'whatsapp', to, type: 'template', template },
      { headers: authHeaders(creds) }
    );
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[meta-wa] sendTemplate "${templateName}" failed for ${to}:`, detail);
    throw err;
  }
}

/**
 * Send a single-select interactive list message.
 * Meta Cloud API has no native multi-select poll — this is the closest
 * equivalent (one row picked per message). rows: [{ id, title, description }]
 * Meta limits: max 10 rows total across max 10 sections.
 */
async function sendList(phone, { header, body, buttonText, rows }, creds = ENV_CREDS) {
  const to = formatPhone(phone);
  const trimmedRows = rows.slice(0, 10).map((r) => ({
    id: r.id.slice(0, 200),
    title: r.title.slice(0, 24),
    description: (r.description || '').slice(0, 72),
  }));
  try {
    const r = await axios.post(
      apiUrl(`${creds.phoneNumberId}/messages`),
      {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: header ? { type: 'text', text: header.slice(0, 60) } : undefined,
          body: { text: body.slice(0, 1024) },
          action: { button: buttonText.slice(0, 20), sections: [{ rows: trimmedRows }] },
        },
      },
      { headers: authHeaders(creds) }
    );
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[meta-wa] sendList failed for ${to}:`, detail);
    // Fallback to plain text so the conversation doesn't stall
    const text = [header, body, ...rows.map((row) => `• ${row.title}${row.description ? ` — ${row.description}` : ''}`)]
      .filter(Boolean).join('\n');
    await sendMessage(phone, text, creds).catch(() => {});
    throw err;
  }
}

/**
 * Toppings selection — single-select list (replaces Green API's multi-select poll).
 * Customer picks one topping per message; they can send the list again to add more,
 * or just type free text — Claude already parses free-text topping mentions.
 */
async function sendToppingsList(phone, lang = 'he', toppingOptions = [], creds = ENV_CREDS) {
  const isHe = lang !== 'en';
  if (!toppingOptions.length) {
    await sendMessage(phone, isHe ? 'אין תוספות זמינות כרגע.' : 'No toppings available right now.', creds);
    return;
  }
  const rows = toppingOptions.slice(0, 9).map((t, i) => ({
    id: `topping_${i}`,
    title: t.name_he,
    description: `+${t.price}₪`,
  }));
  rows.push({ id: 'topping_done', title: isHe ? '✅ ללא תוספות נוספות' : '✅ No more toppings' });

  await sendList(phone, {
    header: isHe ? 'תוספות' : 'Toppings',
    body: isHe ? 'בחר תוספת אחת בכל פעם — אפשר לשלוח שוב להוספה נוספת, או לכתוב חופשי.'
                : 'Pick one topping at a time — send again to add more, or just type freely.',
    buttonText: isHe ? 'בחר' : 'Choose',
    rows,
  }, creds);
}

/**
 * Send interactive reply buttons (max 3, titles ≤20 chars).
 * buttons: [{ id, title }]
 */
async function sendButtons(phone, { body, buttons }, creds = ENV_CREDS) {
  const to = formatPhone(phone);
  try {
    const r = await axios.post(
      apiUrl(`${creds.phoneNumberId}/messages`),
      {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body.slice(0, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
            })),
          },
        },
      },
      { headers: authHeaders(creds) }
    );
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`[meta-wa] sendButtons failed for ${to}:`, detail);
    throw err;
  }
}

/**
 * Subscribe our app to a tenant's WABA so Meta starts delivering its
 * webhooks. Idempotent — safe to call again on re-provision.
 */
async function subscribeWaba(wabaId, accessToken) {
  const r = await axios.post(apiUrl(`${wabaId}/subscribed_apps`), {}, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return r.data;
}

/**
 * Verify Meta's X-Hub-Signature-256 over the RAW request body.
 *
 * Without this, POST /webhook accepts anything: a forged payload naming an
 * admin's phone drives the admin bot (cancel orders with refunds, mark orders
 * paid, change prices, close the business).
 *
 * Returns 'ok' | 'invalid' | 'missing' | 'unconfigured'. Callers enforce when
 * APP_SECRET is set; when it isn't there is nothing to verify against, so the
 * server logs a loud warning at startup instead of silently trusting.
 */
function verifySignature(rawBody, headerValue) {
  if (!APP_SECRET) return 'unconfigured';
  if (!headerValue || !rawBody) return 'missing';

  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(String(headerValue));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return 'invalid';
  return crypto.timingSafeEqual(a, b) ? 'ok' : 'invalid';
}

/** Meta's GET webhook verification handshake (app-level, one token for all tenants). */
function verifyWebhook(query) {
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === VERIFY_TOKEN) {
    return query['hub.challenge'];
  }
  return null;
}

/**
 * Parse an incoming Meta webhook POST body into { phone, textMessage, phoneNumberId } or null.
 * Handles plain text and interactive list_reply messages.
 */
function parseIncoming(body) {
  if (body.object !== 'whatsapp_business_account') return null;
  const change = body.entry?.[0]?.changes?.[0];
  const value  = change?.value;
  const msg    = value?.messages?.[0];
  if (!msg) return null;

  const phoneNumberId = value.metadata?.phone_number_id;
  const phone = formatPhone(msg.from);

  let textMessage   = null;
  let interactiveId = null; // raw button/list row id — used by admin action shortcuts
  if (msg.type === 'text') {
    textMessage = msg.text?.body;
  } else if (msg.type === 'interactive') {
    if (msg.interactive?.type === 'list_reply') {
      const reply = msg.interactive.list_reply;
      interactiveId = reply.id || null;
      textMessage = reply.id === 'topping_done'
        ? (reply.title || 'בחרתי הכל')
        : `בחרתי: ${reply.title}`;
    } else if (msg.interactive?.type === 'button_reply') {
      interactiveId = msg.interactive.button_reply?.id || null;
      textMessage = msg.interactive.button_reply?.title;
    }
  }

  if (!textMessage) return null;
  return { phone, textMessage, phoneNumberId, interactiveId };
}

module.exports = {
  sendMessage, sendTemplate, sendList, sendButtons, sendToppingsList, subscribeWaba,
  verifyWebhook, verifySignature, parseIncoming, formatPhone,
  PHONE_NUMBER_ID, WABA_ID, APP_SECRET, ENV_CREDS,
};
