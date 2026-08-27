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
const { feeForAddress, zoneForAddress } = require('./delivery-fee');
const { resolveLocale, localeForZone, taxOf, taxableBase } = require('./locale');

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
  const map = new Map();   // normName → {price, name_he, name_en}
  try {
    const ids = (products || []).map((p) => p.id);
    if (ids.length) {
      const { data } = await db().from('product_additions')
        .select('name_he, name_en, price').in('product_id', ids);
      for (const a of data || []) {
        const n = norm(a.name_he);
        // Same topping across products: keep the lowest configured price so a
        // recompute can never inflate what the customer was quoted.
        const rec = { price: Number(a.price), name_he: a.name_he, name_en: a.name_en || '' };
        // Indexed under both names for the same reason products are: the public
        // menu now sends whichever one the customer was reading.
        for (const key of [n, norm(a.name_en)]) {
          if (!key) continue;
          const prev = map.get(key);
          if (!prev || rec.price < prev.price) map.set(key, rec);
        }
      }
    }
  } catch (e) { console.error('[pricing] additions fetch:', e.message); }
  _additionsCache.set(tenantId, { map, time: Date.now() });
  return map;
}

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/["'`־–—]/g, '').replace(/\s+/g, ' ');
}

/**
 * A copy of `obj` carrying the matched menu row's names.
 *
 * Additive only: the original `name` is never rewritten, because it is what the
 * customer and the bot actually said, and `name_en` is only set when the menu
 * has a real one (the column used to be backfilled with the Hebrew name, so
 * "has a translation" and "never got one" were indistinguishable).
 */
function withNames(obj, row) {
  if (!row) return { ...obj };
  const he = String(row.name_he || '').trim();
  const en = String(row.name_en || '').trim();
  return {
    ...obj,
    ...(he ? { name_he: he } : {}),
    ...(en && en !== he ? { name_en: en } : {}),
  };
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
 * In an `exclusive`-tax region (US) the tax is part of what the customer is
 * charged and therefore part of this number. In an `inclusive` region (IL) the
 * menu price already contains it and the total is unchanged from before this
 * function knew about tax at all — which is what keeps every existing Israeli
 * tenant pricing identically.
 *
 * @param {Array}  items      [{name, price, qty, toppings:[{name, price, portion}]}]
 * @param {object} opts       {delivery_method, address, tenantId}
 * @returns {Promise<{total, subtotal, tax, taxRate, taxMode, deliveryFee, unmatched, itemsTotal}>}
 */
async function computeTotal(items = [], { delivery_method, address, tenantId } = {}) {
  const [menu, allSettings] = await Promise.all([
    menuService.getProducts(tenantId).catch(() => ({ main: [] })),
    settings.loadAll(tenantId).catch(() => ({})),
  ]);

  const products = menu.main || [];
  const unmatched = [];

  // name → menu row. Matched against BOTH names: since the public menu became
  // bilingual, a US customer's WhatsApp message says "2× Family Pizza", so a
  // Hebrew-only match would score every American order as unmatched — losing
  // the server's pricing authority on exactly the orders it was built for.
  const productRow = (name) => {
    const n = norm(name);
    if (!n) return null;
    const names = (p) => [norm(p.name_he), norm(p.name_en)].filter(Boolean);
    return products.find((p) => names(p).includes(n)) ||
           products.find((p) => names(p).some((x) => x.includes(n) || n.includes(x))) ||
           null;
  };

  const toppingIndex = await toppingPrices(tenantId, products);

  // Per-category taxability (C10). `taxable` defaults to TRUE in the schema and
  // is absent from any row that predates it, so a tenant who has never opened
  // the setting is taxed exactly as before — only an explicit `false` exempts.
  const catIndex = new Map(
    (menu.categories || []).map((c) => [String(c.id), c.taxable !== false]));
  const isExempt = (row) => {
    if (!row) return false;
    if (row.categories && row.categories.taxable === false) return true;
    const known = catIndex.get(String(row.category_id));
    return known === false;
  };

  // The matched row's names are copied onto the item that gets STORED.
  // orders.items is a JSONB snapshot that historically held only `name` — the
  // language the bot happened to be speaking — so a finished order could never
  // be rendered in the other language, and no later fix could recover it. The
  // lookup was already happening here for pricing; it just threw the row away.
  const enriched = [];

  let itemsTotal = 0;
  let exemptTotal = 0;   // the part of itemsTotal in a category marked non-taxable
  for (const it of items) {
    const qty = Number(it.qty || it.quantity || 1) || 1;
    const row = productRow(it.name || it.name_he);
    // An unmatched item is taxed: the tenant's default is the safe reading, and
    // claiming an exemption we cannot substantiate is the expensive mistake.
    const exempt = !!row && isExempt(row);
    let lineTotal = 0;
    if (!row) {
      unmatched.push(String(it.name || it.name_he || '?'));
      // Trust the model's line price for this item rather than dropping it.
      lineTotal += (Number(it.price) || 0) * qty;
    } else {
      lineTotal += Number(row.price) * qty;
    }

    const tops = [];
    for (const top of it.toppings || []) {
      const tname = norm(top.name || top.name_he);
      const trow  = toppingIndex.get(tname) || null;
      let tprice  = trow ? trow.price : null;
      if (tprice == null) {
        // Unknown topping: keep the model's price, note it.
        tprice = Number(top.price) || 0;
        if (tname) unmatched.push(`תוספת ${top.name || top.name_he}`);
      }
      lineTotal += tprice * portionFactor(top.portion, allSettings) * qty;
      tops.push(withNames(top, trow));
    }

    // A topping is part of the dish it is on, so it follows the dish's
    // taxability rather than the topping category's.
    itemsTotal += lineTotal;
    if (exempt) exemptTotal += lineTotal;

    // An unmatched item is stored exactly as it arrived — never invent a name.
    enriched.push({
      ...withNames(it, row),
      ...((it.toppings || []).length ? { toppings: tops } : {}),
    });
  }

  const isDelivery  = delivery_method === 'delivery';
  const deliveryFee = isDelivery ? feeForAddress(address, allSettings) : 0;
  const subtotal = Math.round((itemsTotal + (deliveryFee || 0)) * 100) / 100;

  // The tax is computed either way, because the receipt itemises it in both
  // regions. Only `exclusive` adds it to what is charged.
  //
  // A delivery is taxed where it lands, so the zone's own rate wins for it. A
  // pickup order is collected at the counter and is taxed at the business's own
  // address, which is what the tenant default already is.
  const zone = isDelivery ? zoneForAddress(address, allSettings) : null;
  const loc = localeForZone(resolveLocale(allSettings), zone);
  const tax = taxOf(taxableBase(itemsTotal, deliveryFee, loc, exemptTotal), loc);
  const total = loc.addsTaxAtCheckout
    ? Math.round((subtotal + tax) * 100) / 100
    : subtotal;

  return {
    total, subtotal, tax, loc,
    taxRate: loc.taxRate, taxMode: loc.taxMode,
    deliveryFee, unmatched, itemsTotal, exemptTotal,
    items: enriched,
  };
}

/**
 * Decide the authoritative total for an order payload.
 *
 * The model is only ever asked to price the *basket*, never the tax: it quotes
 * from a menu, and in an exclusive-tax region the menu is pre-tax. So its number
 * is checked against the server's pre-tax subtotal, and the tax is then added by
 * the server on whichever base survived that check. Comparing its quote against
 * a tax-inclusive server total would instead flag every single US order as a
 * model error and drown the insight feed.
 *
 * Returns {total, subtotal, tax, taxRate, taxMode, deliveryFee, items,
 *          corrected, serverTotal, claimedTotal, unmatched, diff}.
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

    // Compare like with like: both sides pre-tax.
    const diff = Math.abs(r.subtotal - claimed);
    const corrected = r.unmatched.length === 0 && diff > TOLERANCE;
    const subtotal = corrected ? r.subtotal : claimed;

    // Recompute the tax from the base actually accepted, so the itemised tax
    // always reconciles with the total beside it. The exempt share is the
    // server's — it comes from the menu rows, which the model never sees.
    const base = Math.max(0,
      subtotal
      - (r.exemptTotal || 0)
      - (r.loc.taxOnDelivery ? 0 : (r.deliveryFee || 0)));
    const tax = taxOf(base, r.loc);
    const total = r.loc.addsTaxAtCheckout
      ? Math.round((subtotal + tax) * 100) / 100
      : subtotal;

    return {
      total, subtotal, tax,
      taxRate: r.loc.taxRate,
      taxMode: r.loc.taxMode,
      deliveryFee: r.deliveryFee,
      // Items carrying the matched menu row's names, for storing on the order.
      items: r.items,
      corrected,
      serverTotal: r.total,
      claimedTotal: claimed,
      unmatched: r.unmatched,
      diff,
    };
  } catch (err) {
    console.error('[pricing] compute failed, keeping model total:', err.message);
    return {
      total: claimed, subtotal: claimed, tax: 0, taxRate: null, taxMode: null,
      // No enrichment when the lookup failed — the caller keeps the original
      // items rather than storing a half-populated snapshot.
      deliveryFee: null, items: null, corrected: false, serverTotal: null,
      claimedTotal: claimed, unmatched: ['<error>'], diff: 0,
    };
  }
}

module.exports = { computeTotal, authoritativeTotal, portionFactor, TOLERANCE };
