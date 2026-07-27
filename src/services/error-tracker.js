'use strict';

/**
 * Error tracking with hard PII redaction.
 *
 * Why the redaction is the main event here: in this system the customer's phone
 * number is the primary key of half the schema (`sessions`, `orders`,
 * `admin_users` are all keyed or indexed by it), so it appears in error
 * messages as a matter of course — `[greenapi] sendMessage failed for
 * 972501234567@c.us` is a routine log line. Shipping raw events to a
 * third-party service would mean streaming our clients' customers' phone
 * numbers, addresses and names out of our infrastructure, continuously.
 *
 * So nothing leaves this file unscrubbed. `scrub()` walks the entire event —
 * message strings, exception values, breadcrumbs, request data, extra context —
 * and redacts by BOTH key name and value shape. It is exported and tested
 * directly, because a scrubber that is wrong is worse than no tracking at all:
 * it leaks while looking safe.
 *
 * Inert unless SENTRY_DSN is set. Without it every function here is a no-op,
 * so nothing breaks in dev, in tests, or if the DSN is ever removed.
 */

const MAX_DEPTH = 8;

// ── What to redact by key name ───────────────────────────────────────────────
// Credentials and tokens: leaking one of these is worse than leaking PII.
// `key$` catches SUPABASE_SERVICE_KEY / VAPID_PUBLIC_KEY / settings.key;
// `user_?name` catches cardcom_username, which is a Cardcom API credential
// despite the innocuous name — the tests caught it leaking in the clear.
const SECRET_KEY = /(token|secret|password|passwd|authorization|auth|api[-_]?key|apikey|(^|[-_])key$|user_?name|dsn|credential|signature|cookie|session[-_]?id|bearer)/i;

// Personal data: the customer's, and the business owner's.
const PII_KEY = /(phone|address|customer_name|contact_phone|bot_whatsapp|admin_phones|couriers|last_address|customer_profile|sender|chat_?id|recipient|to|from|email|name_he_customer)/i;

// Free text written by or shown to a customer — may contain anything.
const TEXT_KEY = /(message|text|body|textmessage|conversation_history|last_customer_message|notes|courier_notes|cancel_reason|menu_notes|order_data|items)/i;

// ── What to redact by value shape, wherever it appears in a string ───────────
const PATTERNS = [
  // Israeli + E.164 phone numbers, with or without separators, and WhatsApp ids
  [/\b(?:\+?972|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[phone]'],
  [/\b\d{9,15}@[cg]\.us\b/g,                               '[phone]'],
  [/\b\d{11,15}\b/g,                                       '[digits]'],
  // Bearer tokens, JWTs, Meta/Supabase/Cardcom style keys
  [/\bBearer\s+[\w\-._~+/]+=*/gi,                          'Bearer [redacted]'],
  [/\beyJ[\w\-._~+/]+=*/g,                                 '[jwt]'],
  [/\b(sb_secret_|sbp_|EAA)[\w\-]{10,}/g,                  '[key]'],
  // Our own onboarding links carry a bearer-equivalent token in the path
  [/\/onboarding\/[a-f0-9]{16,}/gi,                        '/onboarding/[token]'],
  // Any query string at all — several of ours carry ?token=
  [/\?[^\s"']*token=[^\s"'&]*/gi,                          '?token=[redacted]'],
  // Email addresses
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,                        '[email]'],
  // Credentials named inline in prose. Bounded list, because pattern-matching
  // free text is unwinnable in general — this covers the shapes our own code
  // and Cardcom's API descriptions actually produce.
  [/\b(user(name)?|terminal|apiname|api_name|account)\s+[\w.@-]+/gi, '$1 [redacted]'],
  // Hebrew runs. Every error string in this codebase is written in English by a
  // developer, so Hebrew inside one is runtime data — a customer name, a street,
  // a business name. This is the only rule that catches "דמיטרי איוונוב" or
  // "ברודצקי 36", which no generic pattern can.
  [/[֐-׿][֐-׿\s'"־-]*/g,               '[he]'],
];

// tenant_id is a UUID and is the one identifier worth keeping — it says which
// business was affected without saying anything about a person. Its trailing
// group is 12 digits, so the long-digit-run rule below would eat it. Park
// UUIDs before scrubbing and restore them after.
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const PARK = '\u0000';   // cannot occur in real text, so it cannot collide

function scrubString(s) {
  if (typeof s !== 'string' || !s) return s;
  const parked = [];
  let out = s.replace(UUID_RE, (m) => `${PARK}${parked.push(m) - 1}${PARK}`);
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out.replace(new RegExp(`${PARK}(\\d+)${PARK}`, 'g'), (_, i) => parked[i]);
}

/**
 * Recursively redact a value. Redacts by key name first (the key tells us what
 * the value means), then by value shape (catches anything the names miss).
 */
function scrubValue(value, key = '', depth = 0) {
  if (depth > MAX_DEPTH) return '[truncated]';

  if (key) {
    if (SECRET_KEY.test(key)) return '[redacted]';
    if (PII_KEY.test(key))    return '[pii]';
    // Free text is dropped rather than pattern-scrubbed: a customer's message
    // can contain their own address in a shape no regex will catch.
    if (TEXT_KEY.test(key))   return '[text]';
  }

  if (value === null || value === undefined) return value;
  if (typeof value === 'string')  return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => scrubValue(v, '', depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v, k, depth + 1);
    return out;
  }
  return '[unserializable]';
}

/**
 * Strip source code and local variables out of a stack trace.
 *
 * Sentry's contextLines integration reads the failing file off disk and attaches
 * the surrounding lines; `vars` attaches local variables. An end-to-end leak
 * probe caught this shipping verbatim source — the unit tests could not, because
 * they only ever exercised `scrub()` on hand-built events. The integrations are
 * disabled in `init()` as well; this is the second line of defence, so a future
 * SDK default cannot quietly re-enable the leak.
 *
 * File, function and line number are kept — that is what makes a trace useful.
 */
function scrubStacktrace(stacktrace) {
  if (!stacktrace?.frames) return stacktrace;
  return {
    ...stacktrace,
    frames: stacktrace.frames.map(({ pre_context, context_line, post_context, vars, ...frame }) => frame),
  };
}

/**
 * Scrub a whole Sentry event. Exported so the redaction can be tested on its
 * own — it is the part that must not be wrong.
 */
function scrub(event) {
  if (!event || typeof event !== 'object') return event;
  const e = { ...event };

  if (e.message) e.message = scrubString(e.message);

  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((v) => ({
        ...v,
        value: scrubString(v.value),
        stacktrace: v.stacktrace ? scrubStacktrace(v.stacktrace) : v.stacktrace,
      })),
    };
  }
  if (e.stacktrace) e.stacktrace = scrubStacktrace(e.stacktrace);

  // The host name says which machine, which is neither useful here nor free.
  if (e.server_name) e.server_name = '[redacted]';

  if (e.breadcrumbs) {
    const list = Array.isArray(e.breadcrumbs) ? e.breadcrumbs : e.breadcrumbs.values;
    const scrubbed = (list || []).map((b) => ({
      ...b,
      message: scrubString(b.message),
      data: b.data ? scrubValue(b.data, '', 1) : b.data,
    }));
    e.breadcrumbs = Array.isArray(e.breadcrumbs) ? scrubbed : { ...e.breadcrumbs, values: scrubbed };
  }

  if (e.request) {
    const r = { ...e.request };
    delete r.data;      // request bodies carry the customer's message verbatim
    delete r.cookies;
    if (r.url) r.url = scrubString(r.url);
    if (r.query_string) r.query_string = '[redacted]';
    if (r.headers) {
      r.headers = Object.fromEntries(Object.entries(r.headers).map(([k, v]) =>
        [k, SECRET_KEY.test(k) ? '[redacted]' : scrubString(String(v))]));
    }
    e.request = r;
  }

  for (const field of ['extra', 'contexts', 'tags']) {
    if (e[field]) e[field] = scrubValue(e[field], '', 1);
  }

  // `user` exists to identify a person — which is exactly what we must not do.
  // tenant_id (a UUID) is kept as a tag so failures can still be attributed.
  if (e.user) e.user = undefined;

  return e;
}

// ── Wiring ───────────────────────────────────────────────────────────────────

let enabled = false;
let Sentry = null;

function init() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[errors] SENTRY_DSN not set — error tracking disabled (logs only)');
    return false;
  }
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.RENDER ? 'production' : 'local',
      release: process.env.RENDER_GIT_COMMIT || undefined,
      // Errors only. Traces would carry request data through a second pipeline
      // that beforeSend does not cover as thoroughly.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      // Server names and local variables both leak; neither is worth the risk.
      includeLocalVariables: false,
      serverName: false,
      // ContextLines reads the failing source file off disk and attaches the
      // surrounding lines to every frame — a leak probe caught it shipping
      // verbatim source. RequestData attaches bodies and headers; LocalVariables
      // attaches whatever was in scope, which here means customer data.
      integrations: (defaults) =>
        defaults.filter((i) => !['ContextLines', 'RequestData', 'LocalVariables'].includes(i.name)),
      beforeSend: (event) => {
        try {
          return scrub(event);
        } catch (err) {
          // If the scrubber itself fails, drop the event. Never send unscrubbed.
          console.error('[errors] scrub failed, dropping event:', err.message);
          return null;
        }
      },
      beforeBreadcrumb: (crumb) => {
        // HTTP breadcrumbs record full URLs, including our own webhook paths
        // with tokens in them. Not worth keeping.
        if (crumb.category === 'http' || crumb.category === 'fetch') return null;
        return { ...crumb, message: scrubString(crumb.message) };
      },
    });
    enabled = true;
    console.log('[errors] Sentry enabled — PII scrubbing active');
    return true;
  } catch (err) {
    console.error('[errors] Sentry init failed:', err.message);
    return false;
  }
}

/**
 * Report an error. `context.tenantId` is recorded as a tag — a UUID identifies
 * which business was affected without identifying any person.
 */
function captureException(err, context = {}) {
  if (!enabled || !Sentry) return;
  try {
    Sentry.withScope((scope) => {
      if (context.tenantId) scope.setTag('tenant_id', String(context.tenantId));
      if (context.where)    scope.setTag('where', String(context.where));
      if (context.orderNumber) scope.setTag('order_number', String(context.orderNumber));
      Sentry.captureException(err);
    });
  } catch (e) {
    console.error('[errors] capture failed:', e.message);
  }
}

module.exports = { init, captureException, scrub, scrubString, scrubValue, isEnabled: () => enabled };
