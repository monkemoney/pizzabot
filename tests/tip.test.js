'use strict';

/**
 * Tips (C8).
 *
 * A tip is money the customer is CHARGED, so it goes through the same
 * authoritative path as everything else: the model reports what the customer
 * CHOSE, the server resolves it against its own numbers. The two properties
 * that matter most here are the ones a demo would never surface — that a tip
 * is never taxed, and that an existing tenant does not start asking for one.
 */

const CAT = { id: 'c1', name_he: 'פיצות', name_en: 'Pizzas', taxable: true };
const mockProducts = [
  { id: 'p1', name_he: 'פיצה', name_en: 'Pizza', price: 100, category_id: 'c1' },
];
let mockSettings = {};

jest.mock('../src/services/menu-service', () => ({
  getProducts: jest.fn(async () => ({ main: mockProducts, categories: [CAT] })),
}));
jest.mock('../src/services/settings', () => ({
  loadAll: jest.fn(async () => mockSettings),
  get: jest.fn(async () => null),
  DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }) }),
}));

const { computeTotal, authoritativeTotal } = require('../src/services/pricing');
const { resolveLocale, tipOn, normalisePresets } = require('../src/services/locale');
const TID = 'aaaaaaaa-0000-0000-0000-000000000001';

const US = {
  region: 'US', tax_mode: 'exclusive', tax_rate: 10, tax_label: 'Sales Tax',
  tax_on_delivery: false, tips_enabled: true,
  delivery_zones: [{ city: 'Los Angeles', fee: 5 }],
};
const IL = { delivery_zones: [{ city: 'תל אביב', fee: 30 }] };

beforeEach(() => { mockSettings = { ...US }; jest.clearAllMocks(); });

describe('tips are off until a tenant turns them on', () => {
  test('an existing tenant resolves to no tips, whatever the payload says', async () => {
    mockSettings = { ...IL };
    const r = await computeTotal([{ name: 'פיצה', qty: 1 }],
      { delivery_method: 'pickup', tip_pct: 20, tenantId: TID });
    expect(r.tip).toBe(0);
    expect(r.total).toBe(100);
  });

  test('the region only supplies the ladder, never the switch', () => {
    expect(resolveLocale({ region: 'US' }).tipsEnabled).toBe(false);
    expect(resolveLocale({ region: 'US' }).tipPresets).toEqual([15, 18, 20, 22]);
    expect(resolveLocale({}).tipPresets).toEqual([0, 10, 12, 15]);
  });

  test('a tenant ladder overrides the region one, and junk falls back', () => {
    expect(resolveLocale({ tip_presets: '20, 25, 30' }).tipPresets).toEqual([20, 25, 30]);
    expect(resolveLocale({ tip_presets: 'nonsense' }).tipPresets).toEqual([0, 10, 12, 15]);
    expect(normalisePresets('  ')).toBeNull();
    expect(normalisePresets([18, 18, 200, -5, 22])).toEqual([18, 22]);
  });
});

describe('tipOn', () => {
  const loc = resolveLocale({ region: 'US', tips_enabled: true });

  test('a percentage is resolved against the base it is given', () => {
    expect(tipOn(100, { tip_pct: 18 }, loc)).toEqual({ amount: 18, pct: 18, clamped: false });
  });

  test('a named amount is taken literally', () => {
    expect(tipOn(100, { tip_amount: 7.5 }, loc).amount).toBe(7.5);
  });

  test('a named amount is capped at the food, and the clamp is reported', () => {
    // An uncapped free-text amount is an unbounded charge; a slipped decimal
    // point is a real card transaction. Reported, never silent.
    expect(tipOn(100, { tip_amount: 5000 }, loc)).toEqual({ amount: 100, pct: null, clamped: true });
  });

  test('a percentage wins when the model sends both', () => {
    expect(tipOn(100, { tip_pct: 20, tip_amount: 3 }, loc).amount).toBe(20);
  });

  test('declining, omitting and zero are all no tip', () => {
    for (const p of [{}, { tip_pct: 0 }, { tip_amount: 0 }, { tip_pct: null }]) {
      expect(tipOn(100, p, loc).amount).toBe(0);
    }
  });
});

describe('the tip is never taxed', () => {
  test('the tax is the same with and without a tip', async () => {
    const base = { delivery_method: 'pickup', tenantId: TID };
    const without = await computeTotal([{ name: 'Pizza', qty: 1 }], base);
    const with20  = await computeTotal([{ name: 'Pizza', qty: 1 }], { ...base, tip_pct: 20 });
    expect(without.tax).toBe(10);
    expect(with20.tax).toBe(10);          // 100 × 10%, the tip is not in the base
    expect(with20.total).toBe(130);       // 100 + 10 tax + 20 tip
    expect(with20.total - without.total).toBe(20);
  });

  test('the percentage is on the FOOD, not on the delivery fee or the tax', async () => {
    const r = await computeTotal([{ name: 'Pizza', qty: 1 }],
      { delivery_method: 'delivery', address: '1 Main St, Los Angeles', tip_pct: 20, tenantId: TID });
    expect(r.deliveryFee).toBe(5);
    expect(r.tip).toBe(20);               // 20% of 100, not of 105 and not of 115
    expect(r.total).toBe(135);            // 100 + 5 + 10 tax + 20 tip
  });

  test('an inclusive-tax tenant adds the tip on top of a price that already contains tax', async () => {
    mockSettings = { ...IL, tips_enabled: true, tip_presets: [10] };
    const r = await computeTotal([{ name: 'פיצה', qty: 1 }],
      { delivery_method: 'pickup', tip_pct: 10, tenantId: TID });
    expect(r.total).toBe(110);
    expect(r.tax).toBe(15.25);            // still the VAT inside the 100
  });
});

describe('authoritativeTotal', () => {
  test('the tip is added to the corrected server total', async () => {
    const r = await authoritativeTotal({
      items: [{ name: 'Pizza', qty: 1 }], delivery_method: 'pickup',
      tip_pct: 18, total: 1,              // a wrong quote, so the server wins
    }, TID);
    expect(r.corrected).toBe(true);
    expect(r.subtotal).toBe(100);
    expect(r.tax).toBe(10);
    expect(r.tip).toBe(18);
    expect(r.tipPct).toBe(18);
    expect(r.total).toBe(128);
  });

  test('the model quoting a tip-inclusive total does not double it', async () => {
    // The prompt says `total` is pre-tax AND pre-tip. If the model added the
    // tip anyway, the server compares like with like on the PRE-tax subtotal,
    // so its own number wins and the tip is applied exactly once.
    const r = await authoritativeTotal({
      items: [{ name: 'Pizza', qty: 1 }], delivery_method: 'pickup',
      tip_pct: 18, total: 128,
    }, TID);
    expect(r.tip).toBe(18);
    expect(r.total).toBe(128);
  });

  test('the tip rides on the model total too when an item is unmatched', async () => {
    const r = await authoritativeTotal({
      items: [{ name: 'Mystery', price: 200, qty: 1 }], delivery_method: 'pickup',
      tip_amount: 10, total: 200,
    }, TID);
    expect(r.corrected).toBe(false);
    expect(r.tip).toBe(10);
    expect(r.total).toBe(230);            // 200 + 20 tax + 10 tip
  });

  test('settings we could not read never produce a tip', async () => {
    // tips_enabled is what authorises the charge. If the read failed we do not
    // know it is on, and charging a tip on a guess is the one outcome worse
    // than not charging one.
    const settings = require('../src/services/settings');
    settings.loadAll.mockRejectedValueOnce(new Error('db down'));
    const r = await authoritativeTotal({
      items: [{ name: 'Pizza', qty: 1 }], delivery_method: 'pickup',
      tip_pct: 20, total: 100,
    }, TID);
    expect(r.tip).toBe(0);
    expect(r.total).toBe(100);
  });
});

describe('the prompt only mentions tips when the tenant takes them', () => {
  const { tipRule, actionSpec, EN_LABELS } = require('../src/bot/prompt-en');

  test('tips off produces nothing at all — not even a blank line', () => {
    expect(tipRule(resolveLocale({ region: 'US' }), 'en')).toBe('');
    expect(tipRule(resolveLocale({}), 'he')).toBe('');
  });

  test('tips on names the ladder and pins the ACTION contract', () => {
    const loc = resolveLocale({ region: 'US', tips_enabled: true });
    const en = tipRule(loc, 'en');
    expect(en).toContain('15% / 18% / 20% / 22%');
    expect(en).toContain('"tip_pct"');
    expect(en).toContain('"tip_amount"');
    expect(en).toMatch(/never both/);
    expect(en).toMatch(/Do NOT put the tip inside "total"/);

    const he = tipRule(loc, 'he');
    expect(he).toContain('15% / 18% / 20% / 22%');
    expect(he).toContain('אל תכניס את הטיפ לתוך "total"');
  });

  test('the ACTION fields appear only when tips are on', () => {
    const ctx = { bitEnabled: false, bitPhone: null, prepLeadTime: 30 };
    expect(actionSpec(EN_LABELS, ctx)).not.toContain('tip_pct');
    expect(actionSpec(EN_LABELS, { ...ctx, tipsEnabled: true })).toContain('"tip_pct"');
  });
});
