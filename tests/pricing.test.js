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
