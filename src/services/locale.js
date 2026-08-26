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

/** The taxable base of an order: items, plus delivery where the region taxes it. */
function taxableBase(itemsTotal, deliveryFee, loc) {
  const items = Number(itemsTotal) || 0;
  const fee   = Number(deliveryFee) || 0;
  return loc?.taxOnDelivery ? items + fee : items;
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

/** Convenience for callers that hold a tenantId rather than loaded settings. */
async function forTenant(tenantId) {
  const settings = require('./settings');
  const all = await settings.loadAll(tenantId).catch(() => ({}));
  return resolveLocale(all);
}

module.exports = {
  REGIONS, CURRENCIES, DEFAULT_REGION,
  regionOf, resolveLocale, taxOf, taxableBase, taxLineLabel, formatMoney, promptMoney, forTenant,
};
