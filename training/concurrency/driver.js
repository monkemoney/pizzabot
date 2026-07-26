'use strict';

// Interception + driver for the concurrency harness.
//
// CRITICAL (per plan): ai-handler.js DESTRUCTURES its deps at require time, so we
// MUST overwrite the service exports BEFORE ai-handler is required for the first
// time. installPatches() asserts ai-handler is not yet in require.cache.
//
// What we intercept:
//   greenapi.sendMessage / sendToppingsPoll → capture (no real WhatsApp)
//   cardcom.createPaymentPage              → fake URL
//   supabase.saveOrder                     → record payload + REAL insert (exercise the write/race)
//   supabase.savePendingPayment            → record only (no row → prod poller can't act on it)
//   push-notifier.notifyNewOrder           → no-op (avoid spamming real default-tenant subscribers)
//   claude.callClaude                      → global concurrency limiter + backoff + tagged fault injection
//   axios.post                             → hard block (belt-and-suspenders; Supabase uses fetch, unaffected)

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production'), override: true });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const assert = require('assert');
const path = require('path');

// Require services up front so we can patch their exports before ai-handler loads.
const greenapi = require('../../src/services/greenapi');
const cardcom = require('../../src/services/cardcom');
const claude = require('../../src/services/claude');
const supabase = require('../../src/services/supabase');
const pushNotifier = require('../../src/services/push-notifier');
const axios = require('axios');

const AI_HANDLER_PATH = path.join(__dirname, '..', '..', 'src', 'bot', 'ai-handler.js');

const metrics = {
  faultRate: 0,
  injectedFaults: 0,
  opusCalls: 0,
  opusErrors: 0,      // real (post-backoff) failures
  blockedHttp: 0,     // outbound HTTP that escaped the high-level stubs (should stay 0)
  latencies: [],      // per handleMessage() call, ms
  claudeLatencies: [],// per real Opus call, ms — isolates model time from DB/handler overhead
  outbox: new Map(),  // phone → [text,...]
  orders: [],         // { phone, tenantId, payload, kind }
};

let installed = false;

function makeSemaphore(max) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= max || !q.length) return;
    active++;
    const { fn, resolve, reject } = q.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { q.push({ fn, resolve, reject }); next(); });
}

async function backoff(fn, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      const s = err?.status || err?.response?.status;
      if (s === 429 || s === 529 || (s >= 500 && s < 600)) {
        await new Promise((r) => setTimeout(r, 800 * Math.pow(2, i)));
        last = err; continue;
      }
      throw err;
    }
  }
  throw last;
}

function pushOut(phone, text) {
  if (!metrics.outbox.has(phone)) metrics.outbox.set(phone, []);
  metrics.outbox.get(phone).push(text);
}

function recordOrder(phone, tenantId, payload, kind) {
  metrics.orders.push({ phone, tenantId, payload, kind });
}

/**
 * Install all interceptions. Must be called before requiring ai-handler.
 * @param {object} opts
 * @param {number} [opts.faultRate]      probability [0..1] of injecting a Claude fault
 * @param {number} [opts.opusConcurrency] max simultaneous real Opus calls
 */
function installPatches({ faultRate = 0, opusConcurrency = 10 } = {}) {
  metrics.faultRate = faultRate;
  if (installed) return metrics;

  assert(!require.cache[AI_HANDLER_PATH], 'ai-handler already required — installPatches must run first');

  // Outbound WhatsApp / payment — capture, never send.
  greenapi.sendMessage = async (phone, text) => { pushOut(phone, text); };
  greenapi.sendToppingsPoll = async (phone) => { pushOut(phone, '[TOPPINGS_POLL]'); };
  // Interactive senders added by the order-acceptance work (Phase 3) — capture too,
  // so admin-approval / button flows never reach the network in a load run.
  if (typeof greenapi.sendInteractiveButtons === 'function') {
    greenapi.sendInteractiveButtons = async (phone, body) => { pushOut(phone, body || '[BUTTONS]'); };
  }
  if (typeof greenapi.sendInteractiveList === 'function') {
    greenapi.sendInteractiveList = async (phone, opts) => { pushOut(phone, (opts && opts.body) || '[LIST]'); };
  }
  cardcom.createPaymentPage = async () => ({ lowProfileCode: 'TEST-LP', paymentUrl: 'https://test.local/pay' });

  // Order capture — keep the REAL insert to exercise the write path + races.
  const realSaveOrder = supabase.saveOrder;
  supabase.saveOrder = async (payload) => {
    recordOrder(payload.phone, payload.tenant_id, payload, 'save_order');
    return realSaveOrder(payload);
  };
  // Pending payment — record only; NO real row so the production poller can't act on it.
  supabase.savePendingPayment = async (p) => {
    recordOrder(p.phone, (p.orderData && p.orderData.tenant_id) || null, p.orderData || p, 'create_payment');
  };
  // Never push to real subscribers.
  pushNotifier.notifyNewOrder = async () => {};

  // Claude path: limiter + backoff (real transient) + tagged fault injection (synthetic).
  const realCall = claude.callClaude;
  const limit = makeSemaphore(opusConcurrency);
  claude.callClaude = (systemPrompt, history, userMessage) => limit(async () => {
    metrics.opusCalls++;
    if (Math.random() < metrics.faultRate) {
      metrics.injectedFaults++;
      const e = new Error('[injected fault]');
      e.injected = true;
      e.status = [429, 529, 500][Math.floor(Math.random() * 3)];
      throw e; // no retry — we want to test the handler's degradation
    }
    const c0 = Date.now();
    try {
      return await backoff(() => realCall(systemPrompt, history, userMessage));
    } catch (err) {
      metrics.opusErrors++;
      throw err;
    } finally {
      metrics.claudeLatencies.push(Date.now() - c0);
    }
  });

  // Belt-and-suspenders: block any outbound HTTP that slipped past the stubs.
  const realPost = axios.post.bind(axios);
  axios.post = async (url) => {
    metrics.blockedHttp++;
    const e = new Error('[load-test] outbound axios.post blocked: ' + url);
    e.blocked = true;
    throw e;
  };
  axios.__realPost = realPost;

  installed = true;
  return metrics;
}

/** Get the real handler, requiring it now (patches are already in place). */
function getHandler() {
  return require('../../src/bot/ai-handler').handleMessage;
}

function drainOutbox(phone) {
  const arr = metrics.outbox.get(phone) || [];
  metrics.outbox.set(phone, []);
  return arr;
}

function takeOrderFor(phone) {
  const idx = metrics.orders.findIndex((o) => o.phone === phone);
  if (idx === -1) return null;
  return metrics.orders[idx];
}

const ERR_REPLY = /אירעה שגיאה זמנית|אירעה שגיאה בשמירת|לא הצלחנו ליצור קישור/;

/**
 * Drive one simulated customer against the REAL handleMessage for (tenantId, phone).
 * @param {object} args
 * @param {function} args.nextCustomerMessage  (persona, transcript) => {text, done}
 * @param {object}   args.persona
 * @param {string}   args.tenantId
 * @param {string}   args.phone
 * @param {number}   [args.maxTurns]
 * @returns {Promise<object>} conversation record
 */
async function runAgainstHandler({ nextCustomerMessage, persona, tenantId, phone, maxTurns = 12 }) {
  const handleMessage = getHandler();
  const transcript = [];
  drainOutbox(phone);
  let capturedOrder = null, hadError = false;

  for (let turn = 0; turn < maxTurns; turn++) {
    const { text: custText, done } = await nextCustomerMessage(persona, transcript);
    if (custText) transcript.push({ speaker: 'customer', text: custText });

    const t0 = Date.now();
    try {
      await handleMessage(phone, custText || '(...)', tenantId);
    } catch (err) {
      hadError = true;
    }
    metrics.latencies.push(Date.now() - t0);

    const replies = drainOutbox(phone);
    for (const r of replies) {
      transcript.push({ speaker: 'bot', text: r });
      if (ERR_REPLY.test(r)) hadError = true;
    }

    const order = takeOrderFor(phone);
    if (order) { capturedOrder = order; break; }
    if (done) break;
  }

  return {
    phone, tenantId, persona: persona.id || persona.title,
    transcript, capturedOrder, hadError,
    completed: !!capturedOrder,
    turns: transcript.filter((t) => t.speaker === 'customer').length,
  };
}

function resetMetrics() {
  metrics.injectedFaults = 0; metrics.opusCalls = 0; metrics.opusErrors = 0;
  metrics.blockedHttp = 0; metrics.latencies = []; metrics.claudeLatencies = [];
  metrics.outbox.clear(); metrics.orders = [];
}

module.exports = {
  installPatches, getHandler, runAgainstHandler,
  metrics, resetMetrics, drainOutbox, takeOrderFor,
};
