'use strict';

/**
 * locale.test.js
 *
 * Israel and Los Angeles disagree about what a menu price MEANS, not about the
 * rate. Storing only `vat_rate` made those two indistinguishable — which is how
 * a receipt could print a tax that was never collected. These tests pin the two
 * models apart, and pin the compatibility path that keeps every existing
 * Israeli tenant pricing exactly as it did before the setting existed.
 */

const {
  resolveLocale, taxOf, taxableBase, taxLineLabel, formatMoney, regionOf, REGIONS,
} = require('../src/services/locale');

describe('region resolution', () => {
  test('no region configured is Israel — every existing row is', () => {
    const loc = resolveLocale({});
    expect(loc.region).toBe('IL');
    expect(loc.taxMode).toBe('inclusive');
    expect(loc.taxRate).toBe(18);
    expect(loc.currency).toBe('ILS');
  });

  test('an unknown region code falls back rather than throwing', () => {
    expect(regionOf({ region: 'ZZ' })).toBe('IL');
    expect(regionOf({ region: 'us' })).toBe('US');
  });

  test('US supplies the Los Angeles defaults', () => {
    const loc = resolveLocale({ region: 'US' });
    expect(loc.taxMode).toBe('exclusive');
    expect(loc.currency).toBe('USD');
    expect(loc.taxLabel).toBe('Sales Tax');
    expect(loc.addsTaxAtCheckout).toBe(true);
  });

  test('an explicit setting overrides the region default', () => {
    // A tenant's real rate is a fact about their address, not their country:
    // Santa Monica is 10.25% while the City of Los Angeles is 9.5%.
    const loc = resolveLocale({ region: 'US', tax_rate: 10.25 });
    expect(loc.taxRate).toBe(10.25);
    expect(loc.taxMode).toBe('exclusive');
  });

  test('legacy vat_rate is still read when tax_rate was never written', () => {
    // Upgrading the code must not reprice a tenant that never opened the card.
    const loc = resolveLocale({ vat_rate: 17 });
    expect(loc.taxRate).toBe(17);
    expect(loc.taxMode).toBe('inclusive');
  });

  test('tax_rate wins over the legacy key once both exist', () => {
    expect(resolveLocale({ vat_rate: 17, tax_rate: 18 }).taxRate).toBe(18);
  });

  test('an out-of-range rate is clamped, not trusted', () => {
    expect(resolveLocale({ tax_rate: 900 }).taxRate).toBe(100);
    expect(resolveLocale({ tax_rate: -5 }).taxRate).toBe(0);
  });
});

describe('taxOf — the two models are different arithmetic', () => {
  const il = resolveLocale({});
  const us = resolveLocale({ region: 'US' });

  test('inclusive extracts the tax already inside the price', () => {
    // ₪118 gross at 18% contains ₪18 of VAT.
    expect(taxOf(118, il)).toBe(18);
  });

  test('exclusive adds the tax on top of the price', () => {
    // $100 pre-tax at 9.5% adds $9.50 — it was not there before.
    expect(taxOf(100, us)).toBe(9.5);
  });

  test('the same base and rate produce different money in each model', () => {
    const rate = { taxRate: 10 };
    const inc = taxOf(100, { ...rate, taxMode: 'inclusive' });
    const exc = taxOf(100, { ...rate, taxMode: 'exclusive' });
    expect(inc).toBeCloseTo(9.09, 2);
    expect(exc).toBe(10);
    expect(inc).not.toBe(exc);
  });

  test('a zero rate is zero tax in both models', () => {
    expect(taxOf(100, { taxMode: 'inclusive', taxRate: 0 })).toBe(0);
    expect(taxOf(100, { taxMode: 'exclusive', taxRate: 0 })).toBe(0);
  });

  test('non-numeric input does not produce NaN money', () => {
    expect(taxOf(undefined, us)).toBe(0);
    expect(taxOf('abc', us)).toBe(0);
  });
});

describe('taxableBase', () => {
  test('includes the delivery fee when the region taxes it', () => {
    expect(taxableBase(100, 20, { taxOnDelivery: true })).toBe(120);
  });

  test('excludes it when it does not', () => {
    expect(taxableBase(100, 20, { taxOnDelivery: false })).toBe(100);
  });
});

describe('presentation', () => {
  test('the receipt label is the tenant\'s own word, not a translation', () => {
    expect(taxLineLabel(resolveLocale({}))).toBe('מע"מ 18%');
    expect(taxLineLabel(resolveLocale({ region: 'US' }))).toBe('Sales Tax 9.5%');
  });

  test('a custom label survives the region default', () => {
    const loc = resolveLocale({ region: 'US', tax_label: 'CA Sales Tax' });
    expect(taxLineLabel(loc)).toBe('CA Sales Tax 9.5%');
  });

  test('currency formatting follows the tenant, symbol placement the locale', () => {
    const usd = formatMoney(12.99, resolveLocale({ region: 'US' }));
    expect(usd).toContain('12.99');
    expect(usd).toMatch(/\$/);

    const ils = formatMoney(50, resolveLocale({}));
    expect(ils).toContain('50');
    expect(ils).toMatch(/₪/);
  });

  test('every declared region is complete — a missing key would resolve undefined', () => {
    for (const [code, r] of Object.entries(REGIONS)) {
      for (const k of ['currency', 'tax_mode', 'tax_rate', 'tax_label', 'locale', 'dial_code', 'timezone']) {
        expect(r[k]).toBeDefined();
      }
      expect(['inclusive', 'exclusive']).toContain(r.tax_mode);
      expect(resolveLocale({ region: code }).region).toBe(code);
    }
  });
});
