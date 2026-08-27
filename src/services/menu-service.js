'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
// Short TTL: one coherent snapshot per message, but direct DB edits that bypass
// invalidateCache are picked up within seconds. Admin changes stay instant via invalidation.
const CACHE_TTL = 3_000;

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
    .select('*, categories(id, name_he, name_en, emoji, has_toppings, taxable)')
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

/**
 * The menu as the bot reads it.
 *
 * @param {string} lang 'he' | 'en' — defaults to the tenant's region. Names fall
 *                      back to Hebrew when a row has no real English one, which
 *                      is honest: inventing a translation would have the bot
 *                      offer an item the kitchen does not recognise.
 */
async function buildMenuText(settingsObj, tenantId = DEFAULT_TENANT_ID, lang = null) {
  const { categories, byCategory } = await getProducts(tenantId);
  const { resolveLocale, promptMoney } = require('./locale');

  const loc  = resolveLocale(settingsObj || {});
  const L    = lang === 'en' || lang === 'he' ? lang : (loc.region === 'IL' ? 'he' : 'en');
  const money = (n) => promptMoney(n, loc);

  // Same rule as everywhere else: name_en equal to name_he means the column was
  // backfilled, not translated.
  const nameOf = (row) => {
    const he = String(row?.name_he || '').trim();
    const en = String(row?.name_en || '').trim();
    return L === 'en' && en && en !== he ? en : (he || en);
  };

  const deliveryPrice   = settingsObj?.delivery_price   ?? 30;
  const deliveryEnabled = settingsObj?.delivery_enabled !== false;
  const pickupEnabled   = settingsObj?.pickup_enabled   !== false;

  const sections = categories.filter((c) => !c.is_topping_addon).map((cat) => {
    const items = byCategory[cat.id]?.items || [];
    if (!items.length) return null;
    const lines = items.map((p) => `• ${nameOf(p)} — ${money(p.price)}`).join('\n');
    return `${cat.emoji} ${nameOf(cat)}:\n${lines}`;
  }).filter(Boolean);

  // Toppings WITH their prices. They were filtered out entirely, so the bot had
  // no way to know what one costs and simply guessed — a live eval caught it
  // pricing mushrooms at 0, quoting the customer $62.99 on an order the server
  // then charged $69.99 for. pricing.js protects the charge; nothing protected
  // the quote, and a quote that is wrong by a topping is still a dispute.
  const toppingCat = categories.find((c) => c.is_topping_addon);
  const toppingItems = toppingCat ? (byCategory[toppingCat.id]?.items || []) : [];
  if (toppingItems.length) {
    const lines = toppingItems.map((p) => `• ${nameOf(p)} — ${money(p.price)}`).join('\n');
    sections.push(`${toppingCat.emoji || '🧀'} ${nameOf(toppingCat)}:\n${lines}`);
  }

  // The delivery line used to read "(לתל אביב בלבד)" — a hardcoded city that
  // stopped being true the moment delivery_zones existed. The zone table in the
  // prompt is the authority on where and for how much, so this line no longer
  // claims to know.
  const t = L === 'en'
    ? { menu: 'Menu:', delivery: 'Delivery', pickup: 'Pickup: free' }
    : { menu: 'תפריט:', delivery: 'משלוח', pickup: 'איסוף עצמי: חינם' };

  const deliveryLine = deliveryEnabled ? `${t.delivery}: ${money(deliveryPrice)}` : '';
  const pickupLine   = pickupEnabled   ? t.pickup : '';

  return [
    t.menu,
    '──────────────',
    sections.join('\n\n'),
    '',
    [deliveryLine, pickupLine].filter(Boolean).join('\n'),
  ].join('\n').trim();
}

module.exports = { getProducts, buildMenuText, invalidateCache };
