'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Sessions ────────────────────────────────────────────────────────────────

const DEFAULT_SESSION = (phone) => ({
  phone,
  state: 'IDLE',
  language: 'he',
  cart: [],
  current_item: {},
  data: {},
  conversation_history: [],
  pending_order: {},
  updated_at: new Date().toISOString(),
});

async function getSession(phone) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error && error.code === 'PGRST116') {
    const defaultSession = DEFAULT_SESSION(phone);
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
    return DEFAULT_SESSION(phone);
  }

  if (!Array.isArray(data.conversation_history)) data.conversation_history = [];
  if (!data.pending_order || typeof data.pending_order !== 'object') data.pending_order = {};

  return data;
}

async function updateSession(phone, updates) {
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('sessions')
    .upsert({ phone, ...payload }, { onConflict: 'phone' });

  if (error) console.error('[supabase] updateSession error:', error.message);
}

async function clearSession(phone) {
  // Keep customer_profile across resets — it's permanent per-customer memory
  await updateSession(phone, {
    state: 'IDLE',
    language: 'he',
    cart: [],
    current_item: {},
    data: {},
    conversation_history: [],
    pending_order: {},
  });
}

async function saveCustomerProfile(phone, profile) {
  await updateSession(phone, { customer_profile: profile });
}

async function getCustomerProfile(phone) {
  const { data, error } = await supabase
    .from('sessions')
    .select('customer_profile')
    .eq('phone', phone)
    .single();
  if (error || !data) return null;
  const p = data.customer_profile;
  return p && Object.keys(p).length > 0 ? p : null;
}

// ─── Pending payments ─────────────────────────────────────────────────────────

async function savePendingPayment({ phone, cardcomCode, returnValue, orderData }) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
  const { data, error } = await supabase
    .from('pending_payments')
    .insert({ phone, cardcom_code: cardcomCode, return_value: returnValue, order_data: orderData, expires_at: expiresAt })
    .select('id')
    .single();

  if (error) throw new Error('[supabase] savePendingPayment: ' + error.message);
  return data.id;
}

async function getPendingByCardcomCode(cardcomCode) {
  const { data, error } = await supabase
    .from('pending_payments')
    .select('*')
    .eq('cardcom_code', cardcomCode)
    .single();

  if (error) return null;
  return data;
}

async function getPendingByReturnValue(returnValue) {
  const { data, error } = await supabase
    .from('pending_payments')
    .select('*')
    .eq('return_value', returnValue)
    .single();

  if (error) return null;
  return data;
}

async function deletePendingPayment(id) {
  await supabase.from('pending_payments').delete().eq('id', id);
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

// ─── Orders ───────────────────────────────────────────────────────────────────

async function saveOrder(orderData) {
  const { data, error } = await supabase
    .from('orders')
    .insert(orderData)
    .select('id, order_number, customer_name, total_price')
    .single();

  if (error) throw new Error('Failed to save order: ' + error.message);

  // Fire-and-forget push notification to all subscribed dashboard browsers
  require('./push-notifier').notifyNewOrder(data).catch((err) =>
    console.error('[push] notifyNewOrder error:', err.message)
  );

  return { id: data.id, orderNumber: data.order_number };
}

async function getOrders(status) {
  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error('Failed to fetch orders: ' + error.message);
  return data;
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
async function getLastOrderByPhone(phone) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

async function updateOrderStatus(id, status) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, order_number, phone, status, delivery_method')
    .single();

  if (error) throw new Error('Failed to update order: ' + error.message);
  return data;
}

// Auto-complete delivered orders older than 1 hour
async function autoCompleteDeliveredOrders() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('orders')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('status', 'delivered')
    .lt('updated_at', oneHourAgo);

  if (error) console.error('[supabase] autoComplete error:', error.message);
}

module.exports = {
  getSession,
  updateSession,
  clearSession,
  saveCustomerProfile,
  getCustomerProfile,
  savePendingPayment,
  getPendingByCardcomCode,
  getPendingByReturnValue,
  deletePendingPayment,
  getAllPendingPayments,
  saveOrder,
  getOrders,
  getOrderById,
  getLastOrderByPhone,
  updateOrderStatus,
  autoCompleteDeliveredOrders,
};
