'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

async function getProducts() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  // Load categories
  const { data: cats, error: cErr } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (cErr) {
    console.error('[menu-service] categories error:', cErr.message);
    return cache || { categories: [], main: [], raw: [] };
  }

  // Load products with category info
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*, categories(id, name_he, name_en, emoji, has_toppings)')
    .eq('is_available', true)
    .order('sort_order');

  if (pErr) {
    console.error('[menu-service] products error:', pErr.message);
    return cache || { categories: [], main: [], raw: [] };
  }

  // Group products by category
  const byCategory = {};
  for (const cat of cats) {
    byCategory[cat.id] = { ...cat, items: [] };
  }
  for (const p of products) {
    const catId = p.category_id;
    if (catId && byCategory[catId]) {
      byCategory[catId].items.push(p);
    }
  }

  cache = {
    categories:  cats,
    byCategory,
    main:        products, // all orderable products
    raw:         products,
  };
  cacheTime = now;
  return cache;
}

function invalidateCache() {
  cacheTime = 0;
}

async function buildMenuText(settings) {
  const { categories, byCategory } = await getProducts();

  const deliveryPrice   = settings?.delivery_price   ?? 30;
  const deliveryEnabled = settings?.delivery_enabled !== false;
  const pickupEnabled   = settings?.pickup_enabled   !== false;

  const sections = categories.map((cat) => {
    const items = (byCategory[cat.id]?.items || []);
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
