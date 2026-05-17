'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function getProducts() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_available', true)
    .order('sort_order');

  if (error) {
    console.error('[menu-service] load error:', error.message);
    return cache || { main: [], toppings: [] };
  }

  const main     = data.filter((p) => p.category === 'main' || p.category === 'drinks');
  const toppings = data.filter((p) => p.category === 'topping');
  cache     = { main, toppings, raw: data };
  cacheTime = now;
  return cache;
}

/** Invalidate cache (call after product updates) */
function invalidateCache() {
  cacheTime = 0;
}

/** Build Hebrew menu text for the system prompt */
async function buildMenuText(settings) {
  const { main, toppings } = await getProducts();

  const deliveryPrice   = settings?.delivery_price    ?? 30;
  const deliveryEnabled = settings?.delivery_enabled  !== false;
  const pickupEnabled   = settings?.pickup_enabled    !== false;

  const mainItems  = main.filter((p) => p.category === 'main');
  const drinks     = main.filter((p) => p.category === 'drinks');

  const itemLines    = mainItems.map((p) => `• ${p.name_he} — ${p.price}₪`).join('\n');
  const drinkLines   = drinks.map((p) => `• ${p.name_he} — ${p.price}₪`).join('\n');
  const toppingLines = toppings.map((t) => `• ${t.name_he} — +${t.price}₪`).join('\n');

  const deliveryLine = deliveryEnabled ? `משלוח: ${deliveryPrice}₪ (לתל אביב בלבד)` : '';
  const pickupLine   = pickupEnabled   ? 'איסוף עצמי: חינם' : '';

  return [
    'תפריט:',
    '──────────────',
    itemLines,
    '',
    'שתיות:',
    drinkLines,
    '',
    'תוספות לפיצה:',
    toppingLines,
    '',
    [deliveryLine, pickupLine].filter(Boolean).join('\n'),
  ].join('\n').trim();
}

module.exports = { getProducts, buildMenuText, invalidateCache };
