'use strict';

/**
 * Server-side order pricing — the authoritative total.
 *
 * Until 2026-08-06 the number the customer was CHARGED (`payload.total` in the
 * SAVE_ORDER / CREATE_PAYMENT action) was computed by the language model and
 * written to the DB and to Cardcom verbatim, with no server-side check. A model
 * arithmetic slip — or a customer talking the bot into a discount — became a
 * real charge. The delivery fee was already resolved server-side; the total was
 * the odd one out.
 *
 * Policy (deliberately conservative — never block a real order over a name match):
 *   - every item/topping matched   → the server total wins if it differs by > ₪1
 *   - any item unmatched           → keep the model's total, flag it, log
 * Mismatches raise a Bot Brain insight so the pattern is visible, not silent.
 */

const menuService = require('./menu-service');
const settings = require('./settings');
const { feeForAddress } = require('./delivery-fee');

const TOLERANCE = 1; // ₪ — rounding differences are not worth overriding

// Topping prices per tenant. getProducts() does not expose additions, so they
// are fetched directly; cached like the rest of the menu (one coherent snapshot
// per order, seconds-level pickup of price edits).
//
// class-11 (module-level mutable state) — both questions answered:
//   • on reset (deploy): caches are empty, the next order refetches. No
//     correctness impact — the cache only ever avoids a repeat read.
//   • on two instances: each holds its own ≤3s-stale copy of topping prices,
//     the same coherence model as settings/menu-service. Worst case a price
//     edited seconds ago is used for one more order; the DB stays the source
//     of truth and nothing is written from the cache.
let _sb = null;
function db() {
  if (!_sb) {
    const { createClient } = require('@supabase/supabase-js');
    _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _sb;
}
const ADDITIONS_TTL = 3_000;
const _additionsCache = new Map(); // tenantId → {map: Map<normName, price>, time}

async function toppingPrices(tenantId, products) {
  const hit = _additionsCache.get(tenantId);
  if (hit && Date.now() - hit.time < ADDITIONS_TTL) return hit.map;
  const map = new Map();
  try {
    const ids = (products || []).map((p) => p.id);
    if (ids.length) {
      const { data } = await db().from('product_additions')
        .select('name_he, price').in('product_id', ids);
      for (const a of data || []) {
        const n = norm(a.name_he);
        // Same topping across products: keep the lowest configured price so a
        // recompute can never inflate what the customer was quoted.
        if (!map.has(n) || Number(a.price) < map.get(n)) map.set(n, Number(a.price));
      }
    }
  } catch (e) { console.error('[pricing] additions fetch:', e.message); }
  _additionsCache.set(tenantId, { map, time: Date.now() });
  return map;
}

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/["'`־–—]/g, '').replace(/\s+/g, ' ');
}

/** portion → multiplier from tenant settings (default: partial costs full price). */
function portionFactor(portion, allSettings) {
  const p = norm(portion);
  if (!p) return 1;
  if (/חצי|half/.test(p)) return Number(allSettings.topping_half_pct ?? 100) / 100;
  if (/רבע|quarter/.test(p)) return Number(allSettings.topping_quarter_pct ?? 100) / 100;
  return 1;
}

/**
 * Recompute an order's total from the menu.
 *
 * @param {Array}  items      [{name, price, qty, toppings:[{name, price, portion}]}]
 * @param {object} opts       {delivery_method, address, tenantId}
 * @returns {Promise<{total:number, deliveryFee:number|null, unmatched:string[], itemsTotal:number}>}
 */
async function computeTotal(items = [], { delivery_method, address, tenantId } = {}) {
  const [menu, allSettings] = await Promise.all([
    menuService.getProducts(tenantId).catch(() => ({ main: [] })),
    settings.loadAll(tenantId).catch(() => ({})),
  ]);

  const products = menu.main || [];
  const unmatched = [];

  // name → price lookups (products carry their per-product additions separately;
  // topping prices are matched across the tenant's whole addition set).
  const productPrice = (name) => {
    const n = norm(name);
    const hit = products.find((p) => norm(p.name_he) === n) ||
                products.find((p) => n && (norm(p.name_he).includes(n) || n.includes(norm(p.name_he))));
    return hit ? Number(hit.price) : null;
  };

  const toppingIndex = await toppingPrices(tenantId, products);

  let itemsTotal = 0;
  for (const it of items) {
    const qty = Number(it.qty || it.quantity || 1) || 1;
    const base = productPrice(it.name || it.name_he);
    if (base == null) {
      unmatched.push(String(it.name || it.name_he || '?'));
      // Trust the model's line price for this item rather than dropping it.
      itemsTotal += (Number(it.price) || 0) * qty;
    } else {
      itemsTotal += base * qty;
    }

    for (const top of it.toppings || []) {
      const tname = norm(top.name || top.name_he);
      let tprice = toppingIndex.has(tname) ? toppingIndex.get(tname) : null;
      if (tprice == null) {
        // Unknown topping: keep the model's price, note it.
        tprice = Number(top.price) || 0;
        if (tname) unmatched.push(`תוספת ${top.name || top.name_he}`);
      }
      itemsTotal += tprice * portionFactor(top.portion, allSettings) * qty;
    }
  }

  const deliveryFee = delivery_method === 'delivery' ? feeForAddress(address, allSettings) : 0;
  const total = Math.round((itemsTotal + (deliveryFee || 0)) * 100) / 100;

  return { total, deliveryFee, unmatched, itemsTotal };
}

/**
 * Decide the authoritative total for an order payload.
 * Returns {total, deliveryFee, corrected, serverTotal, claimedTotal, unmatched}.
 * Never throws — pricing must not be able to break order taking.
 */
async function authoritativeTotal(payload, tenantId) {
  const claimed = Number(payload.total) || 0;
  try {
    const r = await computeTotal(payload.items || [], {
      delivery_method: payload.delivery_method,
      address: payload.address,
      tenantId,
    });
    const diff = Math.abs(r.total - claimed);
    const corrected = r.unmatched.length === 0 && diff > TOLERANCE;
    return {
      total: corrected ? r.total : claimed,
      deliveryFee: r.deliveryFee,
      corrected,
      serverTotal: r.total,
      claimedTotal: claimed,
      unmatched: r.unmatched,
      diff,
    };
  } catch (err) {
    console.error('[pricing] compute failed, keeping model total:', err.message);
    return { total: claimed, deliveryFee: null, corrected: false, serverTotal: null, claimedTotal: claimed, unmatched: ['<error>'], diff: 0 };
  }
}

module.exports = { computeTotal, authoritativeTotal, portionFactor, TOLERANCE };
