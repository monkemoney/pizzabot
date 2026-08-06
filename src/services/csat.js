'use strict';

/**
 * Customer satisfaction — the one signal that comes from customers themselves.
 *
 * Everything else the loop measures is the system grading its own homework: an
 * LLM judge scoring simulated conversations. A 1-5 rating after the order is
 * ground truth, and a low one carries a reason straight into the decision queue.
 *
 * The reply path is deliberately narrow. A bare "1" already means things in
 * this bot — "confirm the order" in a live conversation, "cancel the order and
 * refund" while a dispute is open — so a rating is only ever captured on an
 * IDLE conversation, and never while a dispute is pending. Anything else clears
 * the pending state and flows on to the normal handler.
 */

const { createClient } = require('@supabase/supabase-js');

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
const ASK_TTL_HOURS = 24;

// class-11 (module-level mutable state): lazy client handle only — holds no
// data, rebuilt after a deploy, per-instance duplication harmless.
let _db = null;
function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

/**
 * Ask for a rating after an order reaches 'done'. Silent no-op when asking
 * would be wrong (already rated, dispute open, agent handling it, opted out).
 */
async function askCsat(order, tenantId = DEFAULT_TENANT_ID, lang = 'he') {
  if (!order || !order.phone) return false;
  if (order.csat_rating != null) return false;

  const { getSession, updateSession } = require('./supabase');
  const session = await getSession(order.phone, tenantId).catch(() => null);
  if (!session) return false;
  if (session.pending_dispute) return false;          // a dispute owns the numeric replies
  if (session.is_bot_active === false) return false;  // a human is handling this conversation
  if (session.opted_out) return false;                // the ask is business-initiated
  if (session.pending_csat) return false;             // don't stack asks

  const { sendMessage } = require('./greenapi');
  const text = lang === 'en'
    ? `How was order *#${order.order_number}*? Reply 1-5 (5 = excellent).`
    : `איך היה בהזמנה *#${order.order_number}*? דרגו מ-1 עד 5 (5 = מצוין).`;

  try {
    await sendMessage(order.phone, text, tenantId);
  } catch (err) {
    console.error('[csat] ask failed:', err.message);
    return false;
  }

  await updateSession(order.phone, {
    pending_csat: { order_id: order.id, order_number: order.order_number, asked_at: new Date().toISOString() },
  }, tenantId).catch(() => {});
  console.log(`[csat] asked #${order.order_number}`);
  return true;
}

function expired(pending) {
  if (!pending || !pending.asked_at) return true;
  return (Date.now() - new Date(pending.asked_at).getTime()) > ASK_TTL_HOURS * 3600 * 1000;
}

/**
 * Try to consume a message as a CSAT reply.
 *
 * @returns {Promise<boolean>} true when handled (caller must stop routing).
 *          false means the pending state was cleared (or irrelevant) and the
 *          message belongs to the normal flow.
 */
async function handleCsatReply(phone, userMessage, session, tenantId = DEFAULT_TENANT_ID) {
  const pending = session && session.pending_csat;
  if (!pending) return false;

  const { updateSession } = require('./supabase');
  const clear = () => updateSession(phone, { pending_csat: null }, tenantId).catch(() => {});

  if (expired(pending)) { await clear(); return false; }

  // A rating is only unambiguous on an idle conversation. Mid-conversation a
  // "1" is an order confirmation, and eating it would break the order.
  const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
  if (history.length > 0) { await clear(); return false; }

  const msg = String(userMessage || '').trim();
  const { sendMessage } = require('./greenapi');

  // Second step: they rated low and we asked what went wrong.
  if (pending.awaiting_comment) {
    await db().from('orders').update({ csat_comment: msg.slice(0, 500) }).eq('id', pending.order_id);
    await clear();
    await sendMessage(phone, 'תודה — העברנו את זה לעסק.', tenantId).catch(() => {});
    require('./insights').addInsightOnce({
      source: 'csat',
      title: `לקוח דירג ${pending.rating}/5 — ${msg.slice(0, 40)}`,
      evidence: `הזמנה #${pending.order_number}: דירוג ${pending.rating}/5. בלשון הלקוח: "${msg.slice(0, 300)}"`,
      metrics: { rating: pending.rating, sample_size: 1 },
      proposal: 'לבדוק את השיחה וההזמנה; אם הדפוס חוזר — לקח או תיקון.',
      type: 'info',
      tenantId,
    }).catch(() => {});
    return true;
  }

  const m = msg.match(/^([1-5])$/);
  if (!m) { await clear(); return false; }   // not a rating — let the bot answer normally
  const rating = Number(m[1]);

  await db().from('orders').update({ csat_rating: rating }).eq('id', pending.order_id);

  if (rating <= 2) {
    await updateSession(phone, {
      pending_csat: { ...pending, rating, awaiting_comment: true, asked_at: new Date().toISOString() },
    }, tenantId).catch(() => {});
    await sendMessage(phone, 'מצטערים לשמוע. מה נוכל לשפר?', tenantId).catch(() => {});
  } else {
    await clear();
    await sendMessage(phone, 'תודה על הדירוג!', tenantId).catch(() => {});
  }
  console.log(`[csat] #${pending.order_number} rated ${rating}`);
  return true;
}

module.exports = { askCsat, handleCsatReply, ASK_TTL_HOURS };
