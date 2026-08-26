'use strict';

/**
 * pricing.test.js
 *
 * The order total is money. Until 2026-08-06 it was whatever the language model
 * wrote in the ACTION payload — charged to a card with no server-side check.
 * These tests pin the recompute: server price wins when everything is matched,
 * the model's total survives when an item can't be matched (never block a real
 * order over a name-match miss), and portions/delivery are priced from settings.
 */

const mockProducts = [
  { id: 'p1', name_he: 'פיצה משפחתית', price: 58 },
  { id: 'p2', name_he: 'קולה',        price: 17 },
];
const mockAdditions = [
  { name_he: 'זיתים',   price: 5, product_id: 'p1' },
  { name_he: 'פטריות',  price: 6, product_id: 'p1' },
];
let mockSettings = {};

jest.mock('../src/services/menu-service', () => ({
  getProducts: jest.fn(async () => ({ main: mockProducts, categories: [], byCategory: {}, raw: mockProducts })),
}));
jest.mock('../src/services/settings', () => ({
  loadAll: jest.fn(async () => mockSettings),
  get: jest.fn(async () => null),
  DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ in: async () => ({ data: mockAdditions }) }),
    }),
  }),
}));

const { computeTotal, authoritativeTotal, portionFactor } = require('../src/services/pricing');
const TID = 'aaaaaaaa-0000-0000-0000-000000000001';

beforeEach(() => {
  mockSettings = { delivery_price: 30, delivery_zones: [{ city: 'תל אביב', fee: 30 }] };
  jest.clearAllMocks();
});

describe('computeTotal', () => {
  test('items only, pickup', async () => {
    const r = await computeTotal(
      [{ name: 'פיצה משפחתית', qty: 2 }, { name: 'קולה', qty: 1 }],
      { delivery_method: 'pickup', tenantId: TID },
    );
    expect(r.total).toBe(58 * 2 + 17);
    expect(r.unmatched).toEqual([]);
  });

  test('adds delivery fee from the matching zone', async () => {
    const r = await computeTotal(
      [{ name: 'פיצה משפחתית', qty: 1 }],
      { delivery_method: 'delivery', address: 'רוטשילד 5, תל אביב', tenantId: TID },
    );
    expect(r.deliveryFee).toBe(30);
    expect(r.total).toBe(88);
  });

  test('toppings priced from product_additions', async () => {
    const r = await computeTotal(
      [{ name: 'פיצה משפחתית', qty: 1, toppings: [{ name: 'זיתים' }, { name: 'פטריות' }] }],
      { delivery_method: 'pickup', tenantId: TID },
    );
    expect(r.total).toBe(58 + 5 + 6);
  });

  test('partial toppings cost full price by default', async () => {
    const r = await computeTotal(
      [{ name: 'פיצה משפחתית', qty: 1, toppings: [{ name: 'זיתים', portion: 'חצי' }] }],
      { delivery_method: 'pickup', tenantId: TID },
    );
    expect(r.total).toBe(63);
  });

  test('partial toppings honour the tenant discount settings', async () => {
    mockSettings.topping_half_pct = 50;
    mockSettings.topping_quarter_pct = 25;
    const r = await computeTotal(
      [{ name: 'פיצה משפחתית', qty: 1, toppings: [{ name: 'זיתים', portion: 'חצי' }, { name: 'פטריות', portion: 'רבע' }] }],
      { delivery_method: 'pickup', tenantId: TID },
    );
    expect(r.total).toBe(58 + 2.5 + 1.5);
  });

  test('unmatched item keeps the model line price and is reported', async () => {
    const r = await computeTotal(
      [{ name: 'מנה שלא קיימת', qty: 1, price: 40 }],
      { delivery_method: 'pickup', tenantId: TID },
    );
    expect(r.unmatched).toContain('מנה שלא קיימת');
    expect(r.total).toBe(40);
  });
});

describe('authoritativeTotal', () => {
  test('corrects an inflated model total', async () => {
    const r = await authoritativeTotal(
      { items: [{ name: 'פיצה משפחתית', qty: 1 }], delivery_method: 'pickup', total: 500 },
      TID,
    );
    expect(r.corrected).toBe(true);
    expect(r.total).toBe(58);
  });

  test('corrects a discounted (too low) model total — the manipulation case', async () => {
    const r = await authoritativeTotal(
      { items: [{ name: 'פיצה משפחתית', qty: 2 }], delivery_method: 'pickup', total: 1 },
      TID,
    );
    expect(r.corrected).toBe(true);
    expect(r.total).toBe(116);
  });

  test('tolerates rounding differences up to ₪1', async () => {
    const r = await authoritativeTotal(
      { items: [{ name: 'פיצה משפחתית', qty: 1 }], delivery_method: 'pickup', total: 58.5 },
      TID,
    );
    expect(r.corrected).toBe(false);
    expect(r.total).toBe(58.5);
  });

  test('never overrides when an item is unmatched', async () => {
    const r = await authoritativeTotal(
      { items: [{ name: 'משהו חדש בתפריט', qty: 1, price: 70 }], delivery_method: 'pickup', total: 70 },
      TID,
    );
    expect(r.corrected).toBe(false);
    expect(r.total).toBe(70);
  });
});

describe('portionFactor', () => {
  test('defaults to full price, honours settings, ignores unknown portions', () => {
    expect(portionFactor('', {})).toBe(1);
    expect(portionFactor('חצי', {})).toBe(1);
    expect(portionFactor('חצי', { topping_half_pct: 50 })).toBe(0.5);
    expect(portionFactor('רבע', { topping_quarter_pct: 25 })).toBe(0.25);
    expect(portionFactor('על הכל', { topping_half_pct: 50 })).toBe(1);
  });
});

/**
 * Region-dependent tax. This is the one part of pricing that changes what the
 * card is charged, so both halves are pinned: an Israeli tenant must price
 * EXACTLY as it did before this code knew about tax at all, and a Los Angeles
 * tenant must have the tax inside the number handed to the payment processor —
 * the defect being closed here is a receipt that itemises a tax nobody collected.
 */
describe('tax by region', () => {
  const pizza = { items: [{ name: 'פיצה משפחתית', qty: 1 }], delivery_method: 'pickup' };

  test('Israel (default, inclusive): the total is unchanged by tax', async () => {
    const r = await computeTotal(pizza.items, { delivery_method: 'pickup', tenantId: TID });
    expect(r.total).toBe(58);            // exactly the pre-2026-08-26 number
    expect(r.subtotal).toBe(58);
    expect(r.taxMode).toBe('inclusive');
    expect(r.tax).toBeCloseTo(8.85, 2);  // itemised on the receipt, already inside 58
  });

  test('an unconfigured tenant is Israeli — no silent reprice on upgrade', async () => {
    mockSettings = { delivery_price: 30, delivery_zones: [], vat_rate: 18 };
    const r = await computeTotal(pizza.items, { delivery_method: 'pickup', tenantId: TID });
    expect(r.total).toBe(58);
  });

  test('Los Angeles (exclusive): the tax is ADDED to what is charged', async () => {
    mockSettings = { region: 'US', tax_rate: 9.5, delivery_zones: [] };
    const r = await computeTotal(pizza.items, { delivery_method: 'pickup', tenantId: TID });
    expect(r.subtotal).toBe(58);
    expect(r.tax).toBeCloseTo(5.51, 2);
    expect(r.total).toBeCloseTo(63.51, 2);
    expect(r.total).toBeGreaterThan(r.subtotal);
  });

  test('exclusive: the delivery fee is taxed only when the tenant says so', async () => {
    const items = [{ name: 'פיצה משפחתית', qty: 1 }];
    const opts  = { delivery_method: 'delivery', address: 'תל אביב 1', tenantId: TID };

    mockSettings = { region: 'US', tax_rate: 10, tax_on_delivery: false,
                     delivery_zones: [{ city: 'תל אביב', fee: 20 }] };
    const off = await computeTotal(items, opts);
    expect(off.tax).toBeCloseTo(5.8, 2);       // 58 only
    expect(off.total).toBeCloseTo(83.8, 2);    // 58 + 20 + 5.80

    mockSettings = { region: 'US', tax_rate: 10, tax_on_delivery: true,
                     delivery_zones: [{ city: 'תל אביב', fee: 20 }] };
    const on = await computeTotal(items, opts);
    expect(on.tax).toBeCloseTo(7.8, 2);        // 58 + 20
    expect(on.total).toBeCloseTo(85.8, 2);
  });

  test('the model is judged on the PRE-TAX basket, not the taxed total', async () => {
    // The bot quotes from a pre-tax menu in an exclusive region. Comparing its
    // quote against a tax-inclusive server total would flag every US order as a
    // model error and drown the insight queue.
    mockSettings = { region: 'US', tax_rate: 9.5, delivery_zones: [] };
    const r = await authoritativeTotal({ ...pizza, total: 58 }, TID);
    expect(r.corrected).toBe(false);
    expect(r.subtotal).toBe(58);
    expect(r.total).toBeCloseTo(63.51, 2);
  });

  test('a real model error is still corrected, and then taxed', async () => {
    mockSettings = { region: 'US', tax_rate: 10, delivery_zones: [] };
    const r = await authoritativeTotal({ ...pizza, total: 40 }, TID);
    expect(r.corrected).toBe(true);
    expect(r.subtotal).toBe(58);
    expect(r.total).toBeCloseTo(63.8, 2);
  });

  test('an unmatched item keeps the model basket AND still charges tax on it', async () => {
    // Never block a real order over a name-match miss — but a US customer is
    // still owed a correctly taxed receipt.
    mockSettings = { region: 'US', tax_rate: 10, delivery_zones: [] };
    const r = await authoritativeTotal(
      { items: [{ name: 'משהו חדש בתפריט', qty: 1, price: 70 }], delivery_method: 'pickup', total: 70 },
      TID,
    );
    expect(r.corrected).toBe(false);
    expect(r.subtotal).toBe(70);
    expect(r.total).toBeCloseTo(77, 2);
  });

  test('the itemised tax always reconciles with the total beside it', async () => {
    for (const settings of [
      { region: 'US', tax_rate: 9.5,  delivery_zones: [] },
      { region: 'US', tax_rate: 10.25, delivery_zones: [] },
      { region: 'IL', tax_rate: 18,   delivery_zones: [] },
    ]) {
      mockSettings = settings;
      const r = await authoritativeTotal({ ...pizza, total: 58 }, TID);
      const net = Math.round((r.total - r.tax) * 100) / 100;
      expect(net).toBeGreaterThan(0);
      expect(Math.round((net + r.tax) * 100) / 100).toBeCloseTo(r.total, 2);
    }
  });

  test('the frozen rate is reported so the order row can record it', async () => {
    mockSettings = { region: 'US', tax_rate: 9.5, delivery_zones: [] };
    const r = await authoritativeTotal({ ...pizza, total: 58 }, TID);
    expect(r.taxRate).toBe(9.5);
    expect(r.taxMode).toBe('exclusive');
  });
});
