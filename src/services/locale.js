'use strict';

/**
 * Per-tenant region, currency and tax model.
 *
 * Israel and the United States do not disagree about the *rate* — they disagree
 * about what a price means. In Israel the menu price already contains the tax
 * and the receipt back-computes it; in the US the menu price is pre-tax and the
 * tax is added at checkout. Before this module, `vat_rate` was a bare number and
 * the only formula in the codebase was the Israeli one:
 *
 *     vatOf = gross * r / (100 + r)        // app.js:185
 *     total = itemsTotal + deliveryFee     // pricing.js:133 — no tax line at all
 *
 * Changing 18 to 9.5 under that arrangement does not localise anything: the
 * processor is handed a pre-tax amount while the receipt prints a tax that was
 * never collected. So the setting had to become a *model*, not a rate.
 *
 * `region` supplies defaults; every individual key still overrides it, because a
 * tenant's actual rate is a fact about their address, not about their country.
 * A tenant with no region configured is Israeli — that is what every existing
 * row is, and the defaults below reproduce its previous behaviour exactly.
 */

const REGIONS = {
  IL: {
    currency:        'ILS',
    tax_mode:        'inclusive',   // price shown already contains the tax
    tax_rate:        18,
    tax_label:       'מע"מ',
    tax_on_delivery: true,          // inclusive pricing taxes the whole basket
    locale:          'he-IL',
    dial_code:       '972',
    national_len:    9,             // digits after the country code
    timezone:        'Asia/Jerusalem',
  },
  US: {
    currency:        'USD',
    tax_mode:        'exclusive',   // tax is added on top at checkout
    tax_rate:        9.5,           // City of Los Angeles — verify per address
    tax_label:       'Sales Tax',
    tax_on_delivery: false,         // CA taxes seller delivery only in some cases
    locale:          'en-US',
    dial_code:       '1',
    national_len:    10,
    timezone:        'America/Los_Angeles',
  },
};

const DEFAULT_REGION = 'IL';

const CURRENCIES = {
  ILS: { symbol: '₪', decimals: 2, code: 'ILS' },
  USD: { symbol: '$', decimals: 2, code: 'USD' },
};

/** The region record, always defined — an unknown code falls back to Israel. */
function regionOf(allSettings = {}) {
  const code = String(allSettings.region || DEFAULT_REGION).toUpperCase();
  return REGIONS[code] ? code : DEFAULT_REGION;
}

function _num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve every locale-dependent value for a tenant from its settings.
 *
 * Precedence, per key: explicit setting → region default. Nothing is derived
 * from another tenant's values and nothing is hardcoded at a call site.
 *
 * @param {object} allSettings result of settings.loadAll()
 */
function resolveLocale(allSettings = {}) {
  const region = regionOf(allSettings);
  const d = REGIONS[region];

  // `vat_rate` is the pre-2026-08 name. It stays readable so that upgrading the
  // code does not silently reprice an Israeli tenant that never opened the new
  // settings card.
  const rate = _num(allSettings.tax_rate) ?? _num(allSettings.vat_rate) ?? d.tax_rate;

  const mode = allSettings.tax_mode === 'exclusive' || allSettings.tax_mode === 'inclusive'
    ? allSettings.tax_mode
    : d.tax_mode;

  const currency = CURRENCIES[allSettings.currency] ? allSettings.currency : d.currency;

  return {
    region,
    currency,
    currencySymbol: CURRENCIES[currency].symbol,
    decimals:       CURRENCIES[currency].decimals,
    locale:         allSettings.locale_code || d.locale,
    taxMode:        mode,
    taxRate:        Math.max(0, Math.min(100, rate)),
    taxLabel:       String(allSettings.tax_label || d.tax_label),
    taxOnDelivery:  allSettings.tax_on_delivery == null
      ? d.tax_on_delivery
      : allSettings.tax_on_delivery !== false,
    dialCode:       String(allSettings.dial_code || d.dial_code),
    nationalLen:    d.national_len,
    timezone:       d.timezone,
    // inclusive pricing has nothing to add at checkout — the price is the price
    addsTaxAtCheckout: mode === 'exclusive',
  };
}

/**
 * Tax on a base amount.
 *
 * inclusive → the tax already inside `base` (what the receipt itemises)
 * exclusive → the tax to add on top of `base` (what the customer pays extra)
 *
 * Both return a positive amount; only the caller knows whether to add it.
 */
function taxOf(base, loc) {
  const amount = Number(base) || 0;
  const r = Number(loc?.taxRate) || 0;
  if (!r) return 0;
  const tax = loc?.taxMode === 'exclusive'
    ? amount * r / 100
    : amount * r / (100 + r);
  return Math.round(tax * 100) / 100;
}

/**
 * The taxable base of an order: items, plus delivery where the region taxes it,
 * minus anything the tenant has marked exempt.
 *
 * `exemptTotal` is the part of `itemsTotal` sitting in a category flagged
 * non-taxable. California's 80/80 rule is the reason it exists: hot prepared
 * food is taxable, cold food sold to go often is not, and the distinction is a
 * property of the item, not of the order.
 */
function taxableBase(itemsTotal, deliveryFee, loc, exemptTotal = 0) {
  const items  = Number(itemsTotal) || 0;
  const fee    = Number(deliveryFee) || 0;
  const exempt = Math.min(Math.max(Number(exemptTotal) || 0, 0), Math.max(items, 0));
  const base   = items - exempt;
  return Math.max(0, loc?.taxOnDelivery ? base + fee : base);
}

/**
 * The tenant's locale as it applies AT one delivery address.
 *
 * Sales tax in the US is set per jurisdiction, so a tenant delivering from Los
 * Angeles into Santa Monica owes 10.25% there and 9.5% at home — one tenant,
 * two correct rates. The zone table already resolves an address to a row, so
 * the rate rides along on it as a sixth field; a zone with no rate of its own
 * simply keeps the tenant's, which is every Israeli tenant and every US tenant
 * that has not filled the column in.
 *
 * Only ever an override of the RATE. The tax MODEL (inclusive vs exclusive) is
 * a fact about the country the business trades in, not about the street it
 * delivers to, and letting a zone flip it would let one row silently reprice
 * a whole basket.
 */
function localeForZone(loc, zone) {
  if (!loc || !zone) return loc;
  const rate = _num(zone.tax_rate);
  if (rate == null) return loc;
  const clamped = Math.max(0, Math.min(100, rate));
  return clamped === loc.taxRate ? loc : { ...loc, taxRate: clamped };
}

/** "מע\"מ 18%" / "Sales Tax 9.5%" — the label a receipt line carries. */
function taxLineLabel(loc) {
  const r = Number(loc?.taxRate) || 0;
  const pretty = Number.isInteger(r) ? String(r) : String(r);
  return `${loc?.taxLabel || ''} ${pretty}%`.trim();
}

/**
 * Format an amount in the tenant's currency.
 * Intl handles symbol placement — ₪ trails in Hebrew, $ leads in English — which
 * is exactly the detail a hardcoded '₪' suffix got wrong in the other direction.
 */
function formatMoney(amount, loc) {
  const n = Number(amount) || 0;
  const currency = loc?.currency || 'ILS';
  const decimals = loc?.decimals ?? 2;
  try {
    return new Intl.NumberFormat(loc?.locale || 'he-IL', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  } catch {
    const sym = CURRENCIES[currency]?.symbol || '';
    return `${sym}${n.toFixed(decimals)}`;
  }
}

/**
 * Compact money for the SYSTEM PROMPT, not for a screen.
 *
 * formatMoney() goes through Intl, which for Hebrew emits directional marks and
 * forces two decimals: "30₪" becomes "\u200f30.00 \u200f₪". In a UI that is correct;
 * in the prompt it is text the model reads and echoes back to customers, so it
 * would quietly change how the Israeli bot quotes every price — and embed
 * invisible characters in what it says. This keeps the existing Hebrew form
 * exactly and gives other currencies their own.
 */
function promptMoney(amount, loc) {
  const n = Number(amount) || 0;
  const s = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  return loc?.currency === 'ILS' || !loc ? `${s}₪` : `${loc.currencySymbol}${s}`;
}

/**
 * Validate and normalise the optional per-zone rates on a delivery_zones array,
 * in place. Returns the city of the first bad row, or null when all are fine.
 *
 * A zone's rate is money, and it arrives inside a JSONB blob that nothing else
 * inspects — so it is checked at the door, like `tax_rate` itself. An empty
 * field means "use the tenant's rate" and is REMOVED rather than stored as 0:
 * a stored zero is a real instruction to charge no tax in that zone, and the
 * two must not be the same value.
 */
function normaliseZoneTaxRates(zones) {
  if (!Array.isArray(zones)) return null;
  for (const z of zones) {
    if (!z || typeof z !== 'object') continue;
    if (!('tax_rate' in z)) continue;
    if (z.tax_rate === '' || z.tax_rate == null) { delete z.tax_rate; continue; }
    const r = parseFloat(z.tax_rate);
    if (!Number.isFinite(r) || r < 0 || r > 100) return String(z.city || '?');
    z.tax_rate = r;
  }
  return null;
}

/** Convenience for callers that hold a tenantId rather than loaded settings. */
async function forTenant(tenantId) {
  const settings = require('./settings');
  const all = await settings.loadAll(tenantId).catch(() => ({}));
  return resolveLocale(all);
}

module.exports = {
  REGIONS, CURRENCIES, DEFAULT_REGION,
  regionOf, resolveLocale, localeForZone, normaliseZoneTaxRates, taxOf, taxableBase, taxLineLabel, formatMoney, promptMoney, forTenant,
};
