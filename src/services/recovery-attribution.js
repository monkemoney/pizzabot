'use strict';

/**
 * Missed-call recovery — persistence + revenue attribution.
 *
 * Every CDR the call-events webhook processes is recorded as a call_events row
 * (including the reason it was skipped), so the recovery funnel — calls →
 * missed → recovery sent → customer replied → order — is measurable per
 * tenant. The vendor KPI endpoint reads this table; before it existed the CDRs
 * lived only in the logs and the platform's strongest value metric ("₪ we
 * recovered from calls you missed") could not be computed at all.
 *
 * The table is also the durable source of truth for the per-caller send
 * throttle (the in-memory map in call-events.js survives only until the next
 * deploy; a recovery_sent row survives it).
 *
 * Attribution window: 24h — Meta's service window. A reply or an order later
 * than that is not credibly the recovery message's doing.
 *
 * Every function here is fire-and-forget-safe: attribution must never break
 * the webhook, the bot or order creation, so nothing throws.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

// Lazy so that loading this module can never throw (it is required from the
// bot's hot path); a missing env surfaces as a caught error on first use.
// Not state, just a connection handle: on restart it is rebuilt on first use,
// and two instances each holding their own client is harmless.
let _client = null;
function supa() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _client;
}

const ATTRIBUTION_HOURS = 24;

function _windowStart() {
  return new Date(Date.now() - ATTRIBUTION_HOURS * 3600000).toISOString();
}

/**
 * Persist one processed CDR with its outcome.
 * outcome: 'answered' | 'recovery_sent' | 'send_failed' | 'unusable_caller'
 *        | 'skipped_forward' | 'skipped_courier' | 'skipped_closed'
 *        | 'skipped_admin' | 'skipped_opted_out' | 'skipped_throttled'
 */
async function recordCallEvent({ caller = null, answered = false, outcome, channel = null, raw = null }, tenantId = DEFAULT_TENANT_ID) {
  try {
    const { error } = await supa().from('call_events').insert({
      tenant_id: tenantId, caller: caller || null, answered, outcome, channel, raw,
    });
    if (error) console.error(`[call-events:${tenantId}] record failed (${outcome}):`, error.message);
  } catch (err) {
    console.error(`[call-events:${tenantId}] record failed (${outcome}):`, err.message);
  }
}

/** Most recent recovery_sent time for this caller (ms epoch), or null. */
async function lastRecoverySentAt(caller, tenantId = DEFAULT_TENANT_ID) {
  try {
    const { data, error } = await supa()
      .from('call_events')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .eq('caller', caller)
      .eq('outcome', 'recovery_sent')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    return new Date(data[0].created_at).getTime();
  } catch {
    return null;
  }
}

/** Latest in-window recovery_sent event for this caller with `column` still unset. */
async function _latestOpenEvent(caller, tenantId, column) {
  const { data, error } = await supa()
    .from('call_events')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('caller', caller)
    .eq('outcome', 'recovery_sent')
    .is(column, null)
    .gte('created_at', _windowStart())
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0].id;
}

/** The caller wrote back within the window — stamp responded_at on the recovery. */
async function markResponded(phone, tenantId = DEFAULT_TENANT_ID) {
  try {
    const id = await _latestOpenEvent(phone, tenantId, 'responded_at');
    if (!id) return false;
    const { error } = await supa()
      .from('call_events')
      .update({ responded_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) {
      console.error(`[call-events:${tenantId}] markResponded failed:`, error.message);
      return false;
    }
    console.log(`[call-events:${tenantId}] ${phone} replied to recovery message`);
    return true;
  } catch (err) {
    console.error(`[call-events:${tenantId}] markResponded failed:`, err.message);
    return false;
  }
}

/**
 * An order landed — credit the most recent un-attributed recovery for this
 * phone, if one exists in the window. Idempotent: once recovered_order_id is
 * set the event no longer matches, so a second call (afterCreate runs again
 * from confirmPayment) and a second order both find nothing to claim.
 */
async function markOrder(order) {
  const tenantId = order?.tenant_id || DEFAULT_TENANT_ID;
  try {
    const caller = order?.phone;
    if (!order?.id || !caller) return false;
    const id = await _latestOpenEvent(caller, tenantId, 'recovered_order_id');
    if (!id) return false;
    const { error } = await supa()
      .from('call_events')
      .update({ recovered_order_id: order.id, recovered_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('recovered_order_id', null);
    if (error) {
      console.error(`[call-events:${tenantId}] markOrder failed:`, error.message);
      return false;
    }
    console.log(`[call-events:${tenantId}] order #${order.order_number} attributed to missed-call recovery`);
    return true;
  } catch (err) {
    console.error(`[call-events:${tenantId}] markOrder failed:`, err.message);
    return false;
  }
}

module.exports = { recordCallEvent, lastRecoverySentAt, markResponded, markOrder, ATTRIBUTION_HOURS };
