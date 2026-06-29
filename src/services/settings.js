'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
const CACHE_TTL = 60_000;

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

async function isOpen(tenantId = DEFAULT_TENANT_ID) {
  const open = await get('is_open', tenantId);
  if (open === false || open === 'false') return false;

  const hours = await get('business_hours', tenantId);
  if (!hours) return true;

  const nowIL = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
  const now   = new Date(nowIL);

  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const day  = days[now.getDay()];
  const todayHours = hours[day];

  if (!todayHours || todayHours.is_open === false) return false;

  const [openH, openM]   = (todayHours.open  || '00:00').split(':').map(Number);
  const [closeH, closeM] = (todayHours.close || '23:59').split(':').map(Number);
  const nowMinutes   = now.getHours() * 60 + now.getMinutes();
  const openMinutes  = openH  * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  console.log(`[settings] isOpen (tenant ${tenantId}) — IL time: ${now.toLocaleTimeString('he-IL')} day:${day} window:${todayHours.open}-${todayHours.close} → ${nowMinutes >= openMinutes && nowMinutes <= closeMinutes}`);

  return nowMinutes >= openMinutes && nowMinutes <= closeMinutes;
}

function _checkHoursWindow(hours, day) {
  if (!hours) return true;
  const todayHours = hours[day];
  if (!todayHours || todayHours.is_open === false) return false;
  const [openH, openM]   = (todayHours.open  || '00:00').split(':').map(Number);
  const [closeH, closeM] = (todayHours.close || '23:59').split(':').map(Number);
  const nowIL  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const nowMin = nowIL.getHours() * 60 + nowIL.getMinutes();
  return nowMin >= openH * 60 + openM && nowMin <= closeH * 60 + closeM;
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

module.exports = { get, set, loadAll, isOpen, isDeliveryOpen, _clearCache, DEFAULT_TENANT_ID };
