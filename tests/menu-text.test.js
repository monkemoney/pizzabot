'use strict';

/**
 * The menu text the BOT reads.
 *
 * Toppings were filtered out of it entirely, so the model had no way to know
 * what one costs and simply guessed. A live eval caught it pricing mushrooms at
 * 0 and quoting the customer $62.99 on an order the server then charged $69.99
 * for: pricing.js protects the charge, but nothing protected the quote, and a
 * quote wrong by a topping is still a dispute.
 */

const mockRows = {
  categories: [
    { id: 'c1', name_he: 'פיצות',  name_en: 'Pizzas',  emoji: '🍕', is_topping_addon: false, sort_order: 0 },
    { id: 'c2', name_he: 'תוספות', name_en: 'Toppings', emoji: '🧀', is_topping_addon: true,  sort_order: 1 },
  ],
  products: [
    { id: 'p1', category_id: 'c1', name_he: 'פיצה משפחתית', name_en: 'Family Pizza', price: 58, is_available: true, sort_order: 0 },
    { id: 'p2', category_id: 'c2', name_he: 'פטריות',       name_en: 'Mushrooms',    price: 7,  is_available: true, sort_order: 0 },
    { id: 'p3', category_id: 'c2', name_he: 'זיתים',        name_en: '',             price: 15, is_available: true, sort_order: 1 },
  ],
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const b = {
        select: () => b, eq: () => b, order: () => b,
        then: (res) => res({ data: mockRows[table] || [], error: null }),
      };
      return b;
    },
  }),
}));

const { buildMenuText, invalidateCache } = require('../src/services/menu-service');
const TID = 'aaaaaaaa-0000-0000-0000-000000000001';
const S = { delivery_enabled: true, pickup_enabled: true, delivery_price: 30 };

beforeEach(() => { if (invalidateCache) invalidateCache(TID); });

describe('toppings carry their prices', () => {
  test('Hebrew menu lists toppings with prices', async () => {
    const t = await buildMenuText(S, TID, 'he');
    expect(t).toContain('פטריות — 7₪');
    expect(t).toContain('זיתים — 15₪');
  });

  test('English menu lists them too, in the tenant\'s currency', async () => {
    const t = await buildMenuText({ ...S, region: 'US', currency: 'USD', delivery_price: 4.99 }, TID, 'en');
    expect(t).toContain('Mushrooms — $7');
    expect(t).toContain('$58');
  });

  test('a topping with no English name falls back to Hebrew rather than vanishing', async () => {
    const t = await buildMenuText({ ...S, region: 'US', currency: 'USD' }, TID, 'en');
    expect(t).toContain('זיתים — $15');
  });

  test('the delivery line no longer names a hardcoded city', async () => {
    const t = await buildMenuText(S, TID, 'he');
    expect(t).not.toContain('לתל אביב בלבד');
    expect(t).toContain('משלוח: 30₪');
  });
});
