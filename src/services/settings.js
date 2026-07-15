'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
// Short TTL: keeps one coherent snapshot within a single message's processing,
// but any change (even direct DB edits that bypass invalidateCache) is picked
// up within seconds. Admin/dashboard changes are still instant via invalidation.
const CACHE_TTL = 3_000;

// Per-tenant cache: Map<tenantId, { data: {}, time: number }>
const _caches = new Map();

function _getCache(tenantId) {
  if (!_caches.has(tenantId)) _caches.set(tenantId, { data: {}, time: 0 });
  return _caches.get(tenantId);
}

async function loadAll(tenantId = DEFAULT_TENANT_ID) {
  const c = _getCache(tenantId);
  const now = Date.now();
  if (now - c.time < CACHE_TTL) return c.data;

  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error(`[settings] load error (tenant ${tenantId}):`, error.message);
    return c.data;
  }

  const fresh = {};
  for (const row of data) fresh[row.key] = row.value;
  c.data = fresh;
  c.time = now;
  return fresh;
}

async function get(key, tenantId = DEFAULT_TENANT_ID) {
  const all = await loadAll(tenantId);
  return all[key];
}

async function set(key, value, tenantId = DEFAULT_TENANT_ID) {
  const { error } = await supabase.from('settings').upsert(
    { tenant_id: tenantId, key, value, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,key' }
  );
  if (error) throw new Error('[settings] set error: ' + error.message);
  _getCache(tenantId).time = 0;
}

// Overnight-aware window check: a window whose close < open (e.g. 20:00–01:00)
// spills into the next day. Open when either today's window contains now,
// or yesterday's window crossed midnight and its tail still covers now.
function _inHoursWindow(hours, now) {
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const toMin = (t, fallback) => {
    const [h, m] = (t || fallback).split(':').map(Number);
    return h * 60 + m;
  };

  const dayWindow = (d) => {
    const h = hours[d];
    if (!h || h.is_open === false) return null;
    return { open: toMin(h.open, '00:00'), close: toMin(h.close, '23:59') };
  };

  const today = dayWindow(days[now.getDay()]);
  if (today) {
    if (today.close >= today.open) {
      if (nowMin >= today.open && nowMin <= today.close) return true;
    } else if (nowMin >= today.open) {
      return true; // overnight window, before midnight
    }
  }

  const yesterday = dayWindow(days[(now.getDay() + 6) % 7]);
  if (yesterday && yesterday.close < yesterday.open && nowMin <= yesterday.close) {
    return true; // tail of yesterday's overnight window
  }

  return false;
}

async function isOpen(tenantId = DEFAULT_TENANT_ID) {
  const open = await get('is_open', tenantId);
  if (open === false || open === 'false') return false;

  const hours = await get('business_hours', tenantId);
  if (!hours) return true;

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const day  = days[now.getDay()];
  const result = _inHoursWindow(hours, now);

  console.log(`[settings] isOpen (tenant ${tenantId}) — IL time: ${now.toLocaleTimeString('he-IL')} day:${day} window:${hours[day]?.open || '—'}-${hours[day]?.close || '—'} → ${result}`);

  return result;
}

function _checkHoursWindow(hours, _day) {
  if (!hours) return true;
  const nowIL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return _inHoursWindow(hours, nowIL);
}

async function isDeliveryOpen(tenantId = DEFAULT_TENANT_ID) {
  const deliveryEnabled = await get('delivery_enabled', tenantId);
  if (deliveryEnabled === false) return false;
  const hours = await get('delivery_hours', tenantId);
  if (!hours || Object.keys(hours).length === 0) return true;
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const nowIL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return _checkHoursWindow(hours, days[nowIL.getDay()]);
}

function _clearCache(tenantId = DEFAULT_TENANT_ID) {
  _getCache(tenantId).time = 0;
  _getCache(tenantId).data = {};
}

module.exports = { get, set, loadAll, isOpen, isDeliveryOpen, _clearCache, _inHoursWindow, DEFAULT_TENANT_ID };
