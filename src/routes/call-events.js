'use strict';

/**
 * Missed-call recovery — telephony CDR webhook.
 *
 * The tenant's VoIP provider (DIDWW Voice IN CDR Streamer) POSTs a CDR here
 * after every inbound call to the tenant's number. Unanswered calls trigger
 * a WhatsApp recovery message to the caller (Meta template — business-initiated,
 * outside the 24h window; Green API tenants get plain text).
 *
 * Auth: per-tenant shared secret in the query string (?token=), compared
 * against the missed_call_webhook_token setting. DIDWW retries on non-2xx,
 * so we ack 200 immediately after auth and process async (repo convention);
 * the per-caller throttle absorbs duplicate deliveries.
 *
 * Settings (per tenant):
 *   missed_call_enabled         master switch (default off)
 *   missed_call_webhook_token   shared secret for the webhook URL (required)
 *   missed_call_template        Meta template name   (default 'missed_call_recovery')
 *   missed_call_template_lang   template language    (default 'he')
 *   missed_call_template_params array of body {{n}} values (optional)
 *   missed_call_text            fallback/Green-API message text (optional)
 *   missed_call_forward_number  the phone calls are forwarded to — never messaged
 *   missed_call_throttle_hours  min hours between messages per caller (default 3)
 *   missed_call_when_closed     also send outside business hours (default false)
 */

const express = require('express');
const crypto  = require('crypto');

const settings         = require('../services/settings');
const { getAdminUser } = require('../services/supabase');
const greenapi         = require('../services/greenapi');

const router = express.Router();

const DEFAULT_TEMPLATE = 'missed_call_recovery';
const DEFAULT_TEXT =
  'היי 👋 ראינו שהתקשרתם אלינו ולא הספקנו לענות 🙏\nאפשר להזמין כאן בהודעה — מה תרצו?';

// Per-caller throttle: Map<`${tenantId}:${phone}`, lastNotifiedMs>.
// In-memory (resets on deploy) — same accepted trade-off as login rate
// limiting; worst case after a deploy is one extra message per caller.
const _lastNotified = new Map();
const MAX_THROTTLE_ENTRIES = 5000;

function _throttleKey(tenantId, phone) {
  return `${tenantId}:${phone}`;
}

function _pruneThrottle(maxAgeMs) {
  if (_lastNotified.size <= MAX_THROTTLE_ENTRIES) return;
  const cutoff = Date.now() - maxAgeMs;
  for (const [k, ts] of _lastNotified) {
    if (ts < cutoff) _lastNotified.delete(k);
  }
}

// timingSafeEqual throws on length mismatch — attacker controls token length.
function tokenMatches(given, expected) {
  try {
    return crypto.timingSafeEqual(Buffer.from(String(given)), Buffer.from(String(expected)));
  } catch {
    return false;
  }
}

/**
 * Normalize a DIDWW CDR webhook body into [{ caller, answered, raw }].
 *
 * Known shape (Voice IN CDR Streamer): { data: [{ type: 'inbound-cdr',
 * attributes: { success, duration, time_connect, ... } }] } — but the exact
 * caller-field name is confirmed against the first real event, so we probe
 * the common namings and keep the raw attributes for logging.
 */
function parseCallEvents(body) {
  if (!body || typeof body !== 'object') return [];

  let items = [];
  if (Array.isArray(body)) items = body;
  else if (Array.isArray(body.data)) items = body.data;
  else if (body.data && typeof body.data === 'object') items = [body.data];
  else items = [body];

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const attrs = item.attributes && typeof item.attributes === 'object' ? item.attributes : item;

      const caller =
        attrs.src_number ?? attrs.source ?? attrs.cli ?? attrs.caller_number ??
        attrs.caller ?? attrs.from ?? attrs.ani ?? null;

      // Answered when the provider says success, or a connect timestamp /
      // positive talk duration exists. Everything else counts as missed
      // (no-answer, busy, rejected — the caller wanted us either way).
      let answered;
      if (typeof attrs.success === 'boolean') {
        answered = attrs.success;
      } else if (attrs.time_connect) {
        answered = true;
      } else {
        answered = Number(attrs.duration) > 0;
      }

      return { caller, answered, raw: attrs };
    });
}

async function processCallEvents(tenantId, events) {
  const all = await settings.loadAll(tenantId);

  const forwardPhone = greenapi.formatPhone(all.missed_call_forward_number || '') || null;
  const couriers = (Array.isArray(all.couriers) ? all.couriers : [])
    .map((c) => greenapi.formatPhone(c?.phone || ''))
    .filter(Boolean);

  const throttleHours = Number(all.missed_call_throttle_hours) > 0
    ? Number(all.missed_call_throttle_hours) : 3;
  const throttleMs = throttleHours * 60 * 60 * 1000;

  for (const event of events) {
    if (event.answered) continue;

    const caller = greenapi.formatPhone(event.caller || '');
    if (!caller || !/^\d{9,15}$/.test(caller)) {
      console.log(`[calls:${tenantId}] missed call with unusable caller id (${event.caller}) — skipping`);
      continue;
    }
    if (caller === forwardPhone) continue;              // the owner's own device
    if (couriers.includes(caller)) continue;            // courier phoning in

    // Business-hours gate: a 3am recovery message is spam, not sales.
    if (all.missed_call_when_closed !== true && !(await settings.isOpen(tenantId))) {
      console.log(`[calls:${tenantId}] missed call from ${caller} while closed — skipping`);
      continue;
    }

    // Admins/owners calling their own line don't get a sales pitch.
    const adminUser = await getAdminUser(caller, tenantId).catch(() => null);
    if (adminUser) {
      console.log(`[calls:${tenantId}] missed call from admin ${caller} — skipping`);
      continue;
    }

    const key = _throttleKey(tenantId, caller);
    const last = _lastNotified.get(key);
    if (last && Date.now() - last < throttleMs) {
      console.log(`[calls:${tenantId}] ${caller} already notified ${Math.round((Date.now() - last) / 60000)}m ago — throttled`);
      continue;
    }
    _lastNotified.set(key, Date.now()); // set before send — absorbs provider retries mid-send
    _pruneThrottle(throttleMs);

    try {
      await greenapi.sendTemplate(
        caller,
        {
          name:   all.missed_call_template || DEFAULT_TEMPLATE,
          lang:   all.missed_call_template_lang || 'he',
          params: Array.isArray(all.missed_call_template_params) ? all.missed_call_template_params : [],
        },
        tenantId,
        all.missed_call_text || DEFAULT_TEXT
      );
      console.log(`[calls:${tenantId}] missed call from ${caller} → recovery message sent`);
    } catch (err) {
      _lastNotified.delete(key); // let the next event retry
      console.error(`[calls:${tenantId}] recovery message to ${caller} failed:`, err.message);
    }
  }
}

// Manual sanity check for wiring the provider ("is the URL right?").
router.get('/calls/:tenantId', (_req, res) => res.json({ ok: true, service: 'call-events' }));

router.post('/calls/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId;

  let expectedToken;
  try {
    expectedToken = await settings.get('missed_call_webhook_token', tenantId);
  } catch (err) {
    console.error(`[calls:${tenantId}] settings error:`, err.message);
    return res.sendStatus(500);
  }

  if (!expectedToken) return res.status(403).json({ error: 'missed-call webhook not configured' });
  if (!tokenMatches(req.query.token, expectedToken)) return res.sendStatus(403);

  const enabled = await settings.get('missed_call_enabled', tenantId).catch(() => false);
  if (enabled !== true && enabled !== 'true') {
    return res.json({ ok: true, skipped: 'disabled' }); // 200 — don't make the provider retry
  }

  const events = parseCallEvents(req.body);
  res.json({ ok: true, received: events.length }); // ack now, process async

  if (!events.length) {
    console.log(`[calls:${tenantId}] webhook with no parsable events:`, JSON.stringify(req.body).slice(0, 500));
    return;
  }

  processCallEvents(tenantId, events).catch((err) =>
    console.error(`[calls:${tenantId}] processing error:`, err.message)
  );
});

module.exports = router;
module.exports.parseCallEvents = parseCallEvents;
module.exports._lastNotified = _lastNotified;
