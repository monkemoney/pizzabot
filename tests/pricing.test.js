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
  { id: 'p1', name_he: 'פיצה משפחתית', name_en: 'Family Pizza', price: 58 },
  { id: 'p2', name_he: 'קולה',        name_en: 'קולה',         price: 17 },  // legacy backfill
];
const mockAdditions = [
  { name_he: 'זיתים',   name_en: 'Olives',    price: 5, product_id: 'p1' },
  { name_he: 'פטריות',  name_en: '',          price: 6, product_id: 'p1' },  // never translated
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

/**
 * Item name snapshots.
 *
 * orders.items is a JSONB snapshot that historically held only `name` — the
 * language the bot happened to be speaking. So a finished order could never be
 * shown in the other language, and no later fix could recover it: the menu row
 * it came from may have been renamed or deleted by then. The match was already
 * happening here for pricing; it just threw the row away.
 */
describe('item name enrichment', () => {
  test('a matched item carries both names', async () => {
    const r = await computeTotal([{ name: 'פיצה משפחתית', qty: 1 }], { delivery_method: 'pickup', tenantId: TID });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe('פיצה משפחתית');      // what the bot said, untouched
    expect(r.items[0].name_he).toBe('פיצה משפחתית');
    expect(r.items[0].name_en).toBe('Family Pizza');
  });

  test('a legacy backfilled row contributes no English name', async () => {
    // name_en === name_he means "never translated", not "translates to itself".
    const r = await computeTotal([{ name: 'קולה', qty: 1 }], { delivery_method: 'pickup', tenantId: TID });
    expect(r.items[0].name_he).toBe('קולה');
    expect(r.items[0]).not.toHaveProperty('name_en');
  });

  test('an unmatched item is stored exactly as it arrived', async () => {
    // Never invent a name for something that is not on the menu.
    const r = await computeTotal(
      [{ name: 'משהו חדש בתפריט', qty: 1, price: 70 }],
      { delivery_method: 'pickup', tenantId: TID },
    );
    expect(r.items[0]).toEqual({ name: 'משהו חדש בתפריט', qty: 1, price: 70 });
  });

  test('toppings are enriched too, and keep their portion', async () => {
    const r = await computeTotal(
      [{ name: 'פיצה משפחתית', qty: 1, toppings: [
        { name: 'זיתים', portion: 'חצי' },
        { name: 'פטריות' },
      ] }],
      { delivery_method: 'pickup', tenantId: TID },
    );
    const tops = r.items[0].toppings;
    expect(tops[0]).toMatchObject({ name: 'זיתים', name_he: 'זיתים', name_en: 'Olives', portion: 'חצי' });
    expect(tops[1]).toMatchObject({ name: 'פטריות', name_he: 'פטריות' });
    expect(tops[1]).not.toHaveProperty('name_en');   // that topping has no English name
  });

  test('an item with no toppings does not gain an empty toppings array', async () => {
    const r = await computeTotal([{ name: 'קולה', qty: 2 }], { delivery_method: 'pickup', tenantId: TID });
    expect(r.items[0]).not.toHaveProperty('toppings');
  });

  test('enrichment never changes the money', async () => {
    const withTops = [{ name: 'פיצה משפחתית', qty: 2, toppings: [{ name: 'זיתים', portion: 'חצי' }] }];
    mockSettings = { delivery_price: 30, delivery_zones: [], topping_half_pct: 50 };
    const r = await computeTotal(withTops, { delivery_method: 'pickup', tenantId: TID });
    expect(r.itemsTotal).toBe(58 * 2 + 2.5 * 2);
  });

  test('authoritativeTotal passes the enriched items through', async () => {
    const r = await authoritativeTotal(
      { items: [{ name: 'פיצה משפחתית', qty: 1 }], delivery_method: 'pickup', total: 58 },
      TID,
    );
    expect(r.items[0].name_en).toBe('Family Pizza');
  });
});

/**
 * Bilingual matching.
 *
 * The public menu composes the WhatsApp message in the customer's language, so
 * a US order arrives saying "Family Pizza". Matching only on name_he would mark
 * every American order unmatched — which silently hands pricing authority back
 * to the model on exactly the orders this server-side recompute exists for.
 */
describe('matching by either name', () => {
  test('an English item name resolves to the menu row and its price', async () => {
    const r = await computeTotal([{ name: 'Family Pizza', qty: 1, price: 999 }],
      { delivery_method: 'pickup', tenantId: TID });
    expect(r.unmatched).toEqual([]);
    expect(r.itemsTotal).toBe(58);              // menu price, not the model's 999
    expect(r.items[0].name_he).toBe('פיצה משפחתית');
    expect(r.items[0].name_en).toBe('Family Pizza');
  });

  test('an English topping name resolves too', async () => {
    const r = await computeTotal(
      [{ name: 'Family Pizza', qty: 1, toppings: [{ name: 'Olives', price: 999 }] }],
      { delivery_method: 'pickup', tenantId: TID });
    expect(r.unmatched).toEqual([]);
    expect(r.itemsTotal).toBe(58 + 5);          // menu topping price
    expect(r.items[0].toppings[0].name_he).toBe('זיתים');
  });

  test('a US order is priced and corrected end to end', async () => {
    mockSettings = { region: 'US', tax_rate: 9.5, delivery_zones: [] };
    const r = await authoritativeTotal(
      { items: [{ name: 'Family Pizza', qty: 1 }], delivery_method: 'pickup', total: 40 },
      TID);
    expect(r.corrected).toBe(true);             // the model's 40 loses to the menu
    expect(r.subtotal).toBe(58);
    expect(r.total).toBeCloseTo(63.51, 2);      // plus LA sales tax
  });

  test('Hebrew matching is unchanged', async () => {
    const r = await computeTotal([{ name: 'פיצה משפחתית', qty: 1 }],
      { delivery_method: 'pickup', tenantId: TID });
    expect(r.unmatched).toEqual([]);
    expect(r.itemsTotal).toBe(58);
  });
});
