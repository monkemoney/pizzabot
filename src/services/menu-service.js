'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
const CACHE_TTL = 60_000;

// Per-tenant cache: Map<tenantId, { data: null|{}, time: number }>
const _caches = new Map();

function _getCache(tenantId) {
  if (!_caches.has(tenantId)) _caches.set(tenantId, { data: null, time: 0 });
  return _caches.get(tenantId);
}

async function getProducts(tenantId = DEFAULT_TENANT_ID) {
  const c = _getCache(tenantId);
  const now = Date.now();
  if (c.data && now - c.time < CACHE_TTL) return c.data;

  const { data: cats, error: cErr } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order');

  if (cErr) {
    console.error(`[menu-service] categories error (tenant ${tenantId}):`, cErr.message);
    return c.data || { categories: [], main: [], raw: [] };
  }

  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*, categories(id, name_he, name_en, emoji, has_toppings)')
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .order('sort_order');

  if (pErr) {
    console.error(`[menu-service] products error (tenant ${tenantId}):`, pErr.message);
    return c.data || { categories: [], main: [], raw: [] };
  }

  const byCategory = {};
  for (const cat of cats) byCategory[cat.id] = { ...cat, items: [] };
  for (const p of products) {
    if (p.category_id && byCategory[p.category_id]) byCategory[p.category_id].items.push(p);
  }

  c.data = { categories: cats, byCategory, main: products, raw: products };
  c.time = now;
  return c.data;
}

function invalidateCache(tenantId = DEFAULT_TENANT_ID) {
  _getCache(tenantId).time = 0;
}

async function buildMenuText(settingsObj, tenantId = DEFAULT_TENANT_ID) {
  const { categories, byCategory } = await getProducts(tenantId);

  const deliveryPrice   = settingsObj?.delivery_price   ?? 30;
  const deliveryEnabled = settingsObj?.delivery_enabled !== false;
  const pickupEnabled   = settingsObj?.pickup_enabled   !== false;

  const sections = categories.filter((c) => !c.is_topping_addon).map((cat) => {
    const items = byCategory[cat.id]?.items || [];
    if (!items.length) return null;
    const lines = items.map((p) => `• ${p.name_he} — ${p.price}₪`).join('\n');
    return `${cat.emoji} ${cat.name_he}:\n${lines}`;
  }).filter(Boolean);

  const deliveryLine = deliveryEnabled ? `משלוח: ${deliveryPrice}₪ (לתל אביב בלבד)` : '';
  const pickupLine   = pickupEnabled   ? 'איסוף עצמי: חינם' : '';

  return [
    'תפריט:',
    '──────────────',
    sections.join('\n\n'),
    '',
    [deliveryLine, pickupLine].filter(Boolean).join('\n'),
  ].join('\n').trim();
}

module.exports = { getProducts, buildMenuText, invalidateCache };
