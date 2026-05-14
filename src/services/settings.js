'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// In-memory cache — refreshed every 60 seconds
let cache = {};
let cacheTime = 0;
const CACHE_TTL = 60_000;

async function loadAll() {
  const now = Date.now();
  if (now - cacheTime < CACHE_TTL) return cache;

  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) {
    console.error('[settings] load error:', error.message);
    return cache; // return stale cache on error
  }

  const fresh = {};
  for (const row of data) {
    fresh[row.key] = row.value; // already parsed JSONB
  }
  cache = fresh;
  cacheTime = now;
  return cache;
}

async function get(key) {
  const all = await loadAll();
  return all[key];
}

async function set(key, value) {
  const { error } = await supabase.from('settings').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error('[settings] set error: ' + error.message);
  // Invalidate cache
  cacheTime = 0;
}

async function isOpen() {
  const open = await get('is_open');
  if (open === false || open === 'false') return false;

  // Check business hours
  const hours = await get('business_hours');
  if (!hours) return true;

  const now = new Date();
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const day  = days[now.getDay()];
  const todayHours = hours[day];
  if (!todayHours) return false;

  const [openH, openM]   = todayHours.open.split(':').map(Number);
  const [closeH, closeM] = todayHours.close.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes  = openH  * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return nowMinutes >= openMinutes && nowMinutes <= closeMinutes;
}

module.exports = { get, set, loadAll, isOpen };
