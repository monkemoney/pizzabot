'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

// ─── Sessions ────────────────────────────────────────────────────────────────

const DEFAULT_SESSION = (phone, tenantId) => ({
  phone,
  tenant_id: tenantId,
  state: 'IDLE',
  language: 'he',
  cart: [],
  current_item: {},
  data: {},
  conversation_history: [],
  pending_order: {},
  updated_at: new Date().toISOString(),
});

async function getSession(phone, tenantId = DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .single();

  if (error && error.code === 'PGRST116') {
    const defaultSession = DEFAULT_SESSION(phone, tenantId);
    const { data: created, error: createError } = await supabase
      .from('sessions')
      .insert(defaultSession)
      .select()
      .single();

    if (createError) {
      console.error('[supabase] Failed to create session:', createError.message);
      return defaultSession;
    }
    return created;
  }

  if (error) {
    console.error('[supabase] getSession error:', error.message);
    return DEFAULT_SESSION(phone, tenantId);
  }

  if (!Array.isArray(data.conversation_history)) data.conversation_history = [];
  if (!data.pending_order || typeof data.pending_order !== 'object') data.pending_order = {};

  return data;
}

async function updateSession(phone, updates, tenantId = DEFAULT_TENANT_ID) {
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('sessions')
    .upsert({ phone, tenant_id: tenantId, ...payload }, { onConflict: 'tenant_id,phone' });

  if (error) console.error('[supabase] updateSession error:', error.message);
}

async function clearSession(phone, tenantId = DEFAULT_TENANT_ID) {
  // Keep customer_profile across resets — it's permanent per-customer memory
  await updateSession(phone, {
    state: 'IDLE',
    language: 'he',
    cart: [],
    current_item: {},
    data: {},
    conversation_history: [],
    pending_order: {},
  }, tenantId);
}

async function saveCustomerProfile(phone, profile, tenantId = DEFAULT_TENANT_ID) {
  await updateSession(phone, { customer_profile: profile }, tenantId);
}

async function getCustomerProfile(phone, tenantId = DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from('sessions')
    .select('customer_profile')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .single();
  if (error || !data) return null;
  const p = data.customer_profile;
  return p && Object.keys(p).length > 0 ? p : null;
}

// ─── Admin users ──────────────────────────────────────────────────────────────

async function getAdminUser(phone, tenantId = DEFAULT_TENANT_ID) {
  const normalised = phone.replace(/\D/g, '');
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone', normalised)
    .single();
  if (error) return null;
  return data;
}

/** All admin users for a tenant (for order-approval notifications) */
async function getAdminUsers(tenantId = DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) { console.error('[supabase] getAdminUsers error:', error.message); return []; }
  return data || [];
}

// ─── Pending payments ─────────────────────────────────────────────────────────

async function savePendingPayment({ phone, cardcomCode, returnValue, orderData }) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
  const tenantId = orderData?.tenant_id || DEFAULT_TENANT_ID;
  const { data, error } = await supabase
    .from('pending_payments')
    .insert({ phone, cardcom_code: cardcomCode, return_value: returnValue, order_data: orderData, expires_at: expiresAt, tenant_id: tenantId })
    .select('id')
    .single();

  if (error) throw new Error('[supabase] savePendingPayment: ' + error.message);
  return data.id;
}

async function getPendingByCardcomCode(cardcomCode, tenantId) {
  let q = supabase.from('pending_payments').select('*').eq('cardcom_code', cardcomCode);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q.single();
  if (error) return null;
  return data;
}

async function getPendingByReturnValue(returnValue, tenantId) {
  let q = supabase.from('pending_payments').select('*').eq('return_value', returnValue);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q.single();
  if (error) return null;
  return data;
}

async function deletePendingPayment(id) {
  await supabase.from('pending_payments').delete().eq('id', id);
}

/**
 * Retire pending payments past their expiry.
 *
 * These rows are NOT deleted: a customer can pay after the window closes, and
 * order_data is the only record of what they ordered — deleting it left money
 * taken with nothing to rebuild the order from. Marking them keeps the lookup
 * working (a late callback still resolves) while taking them out of the
 * open-pendings watchdog.
 */
async function deleteExpiredPendingPayments() {
  const { data, error } = await supabase
    .from('pending_payments')
    .update({ status: 'expired' })
    .lt('expires_at', new Date().toISOString())
    .neq('status', 'expired')
    .select('id');
  if (error) console.error('[supabase] expire pending payments error:', error.message);
  else if (data?.length) console.log(`[supabase] ${data.length} pending payment(s) marked expired`);
}

/** Get all pending payments that haven't expired yet */
async function getAllPendingPayments() {
  const { data, error } = await supabase
    .from('pending_payments')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}

/** Look up an order by its Cardcom low-profile code (the payment idempotency key) */
async function getOrderByCardcomCode(cardcomCode) {
  if (!cardcomCode) return null;
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('cardcom_code', cardcomCode)
    .maybeSingle();
  if (error) { console.error('[supabase] getOrderByCardcomCode error:', error.message); return null; }
  return data || null;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

async function saveOrder(orderData) {
  const { data, error } = await supabase
    .from('orders')
    .insert(orderData)
    .select('*')
    .single();

  if (error) throw new Error('Failed to save order: ' + error.message);

  // Fire-and-forget push notification to all subscribed dashboard browsers
  require('./push-notifier').notifyNewOrder(data).catch((err) =>
    console.error('[push] notifyNewOrder error:', err.message)
  );

  // Broadcast to kitchen SSE connections
  require('./sse').broadcast(orderData.tenant_id, 'new_order', data);

  return { id: data.id, orderNumber: data.order_number, order: data };
}


async function getOrderById(id) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/** Get the most recent order for a phone number */
async function getLastOrderByPhone(phone, tenantId = DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

async function updateOrderStatus(id, status) {
  const { data: current } = await supabase
    .from('orders').select('status_history').eq('id', id).single();
  const history = Array.isArray(current?.status_history) ? current.status_history : [];
  history.push({ status, at: new Date().toISOString() });

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString(), status_history: history })
    .eq('id', id)
    .select('id, order_number, phone, status, delivery_method, tenant_id, customer_name, items, notes, total_price, payment_method, address, status_history')
    .single();

  if (error) throw new Error('Failed to update order: ' + error.message);
  return data;
}

async function updateOrder(id, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error('updateOrder: ' + error.message);
  return data;
}

// Delete sessions inactive for more than 90 days (GDPR hygiene)
async function pruneOldSessions() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase
    .from('sessions')
    .delete({ count: 'exact' })
    .lt('updated_at', cutoff);

  if (error) console.error('[supabase] pruneOldSessions error:', error.message);
  else if (count > 0) console.log(`[supabase] pruneOldSessions: removed ${count} sessions older than 90 days`);
}

// ─── Meta Cloud API tenant resolution ─────────────────────────────────────────

// phone_number_id → tenant_id, cached 60s. The Meta webhook is app-level
// (one endpoint for every tenant), so each incoming message is routed to its
// tenant by the phone_number_id in the payload metadata.
const _metaTenantCache = new Map(); // phoneNumberId → { tenantId, time }

async function resolveTenantByMetaPhoneId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const cached = _metaTenantCache.get(phoneNumberId);
  if (cached && Date.now() - cached.time < 60_000) return cached.tenantId;

  const { data, error } = await supabase
    .from('settings')
    .select('tenant_id')
    .eq('key', 'meta_phone_number_id')
    .eq('value', JSON.stringify(phoneNumberId))
    .limit(1);

  const tenantId = !error && data?.length ? data[0].tenant_id : null;
  _metaTenantCache.set(phoneNumberId, { tenantId, time: Date.now() });
  return tenantId;
}

// ─── Inbox / Human handoff ────────────────────────────────────────────────────

async function getInboxSessions(tenantId = DEFAULT_TENANT_ID) {
  const { data, error } = await supabase
    .from('sessions')
    .select('phone, is_bot_active, unread_count, last_customer_message, last_message_at, customer_profile, conversation_history, updated_at')
    .eq('tenant_id', tenantId)
    .not('phone', 'like', 'admin:%')
    .order('updated_at', { ascending: false });
  if (error) { console.error('[supabase] getInboxSessions error:', error.message); return []; }
  return data || [];
}

/**
 * Hand a conversation to a human (isActive=false) or give it back to the bot.
 *
 * handoff_at is what makes the handoff exitable — without a timestamp there is
 * no way to tell a conversation an agent is working from one they abandoned.
 * Returning to the bot no longer zeroes unread_count: doing so hid still-unread
 * customer messages from the inbox list at the exact moment the agent stepped
 * away from them.
 */
async function setBotActive(phone, isActive, tenantId = DEFAULT_TENANT_ID) {
  const patch = { is_bot_active: isActive };
  if (isActive) {
    patch.handoff_at = null;
    patch.handoff_alerted_at = null;
  } else {
    patch.handoff_at = new Date().toISOString();
    patch.unread_count = 0;   // the agent is looking at it right now
  }
  await updateSession(phone, patch, tenantId);
}

// ─── Marketing opt-out ────────────────────────────────────────────────────────
// Business-initiated messages (broadcasts, missed-call recovery) need a way out;
// transactional order updates the customer's own order triggered do not.

/** Record a customer's opt-out. Creates the session row if they never messaged. */
async function setOptedOut(phone, optedOut, tenantId = DEFAULT_TENANT_ID) {
  await updateSession(phone, {
    opted_out: optedOut,
    opted_out_at: optedOut ? new Date().toISOString() : null,
  }, tenantId);
}

/** Phones that opted out, from a candidate list — the suppression list. */
async function getOptedOutPhones(phones, tenantId = DEFAULT_TENANT_ID) {
  if (!phones?.length) return new Set();
  const { data, error } = await supabase
    .from('sessions')
    .select('phone')
    .eq('tenant_id', tenantId)
    .eq('opted_out', true)
    .in('phone', phones);
  if (error) {
    // Fail closed: if we cannot prove consent, do not send.
    console.error('[supabase] getOptedOutPhones error:', error.message);
    return new Set(phones);
  }
  return new Set((data || []).map((r) => r.phone));
}

/** Conversations sitting in agent mode — the input to the handoff watchdog. */
async function getHandedOffSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('phone, tenant_id, handoff_at, handoff_alerted_at, unread_count, last_message_at, customer_profile')
    .eq('is_bot_active', false)
    .not('phone', 'like', 'admin:%');
  if (error) { console.error('[supabase] getHandedOffSessions error:', error.message); return []; }
  return data || [];
}

async function markInboxRead(phone, tenantId = DEFAULT_TENANT_ID) {
  await updateSession(phone, { unread_count: 0 }, tenantId);
}

// Auto-complete delivered orders older than 1 hour.
// Goes through the state machine one order at a time: the old bulk UPDATE had
// no tenant filter (every open dashboard mutated every tenant's orders), wrote
// no status_history and broadcast no SSE. Volume here is a handful per sweep.
async function autoCompleteDeliveredOrders() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number')
    .eq('status', 'delivered')
    .lt('updated_at', oneHourAgo);

  if (error) { console.error('[supabase] autoComplete query error:', error.message); return; }
  if (!data?.length) return;

  const orderState = require('./order-state');
  for (const row of data) {
    await orderState.transition(row.id, 'done', { by: 'auto-complete', notify: false })
      .catch((err) => console.error(`[supabase] autoComplete #${row.order_number}:`, err.message));
  }
  console.log(`[supabase] autoComplete: ${data.length} delivered order(s) → done`);
}

module.exports = {
  getSession,
  updateSession,
  pruneOldSessions,
  clearSession,
  saveCustomerProfile,
  getCustomerProfile,
  getAdminUser,
  getAdminUsers,
  savePendingPayment,
  getPendingByCardcomCode,
  getPendingByReturnValue,
  deletePendingPayment,
  getAllPendingPayments,
  getOrderByCardcomCode,
  deleteExpiredPendingPayments,
  saveOrder,
  getOrderById,
  getLastOrderByPhone,
  updateOrderStatus,
  updateOrder,
  autoCompleteDeliveredOrders,
  getScheduledOrdersDue,
  getInboxSessions,
  setBotActive,
  getHandedOffSessions,
  setOptedOut,
  getOptedOutPhones,
  markInboxRead,
  resolveTenantByMetaPhoneId,
};

async function getScheduledOrdersDue(leadMinutes) {
  const cutoff = new Date(Date.now() + leadMinutes * 60 * 1000).toISOString();
  // Full row — the scheduler needs accepted_at (approval gate) and tenant_id
  // (per-tenant lead time) as well as the notification fields.
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', cutoff);
  if (error) { console.error('[scheduler] query error:', error.message); return []; }
  return data || [];
}
