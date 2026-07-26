'use strict';

/**
 * Delivery fee resolution.
 *
 * The fee was never recorded on an order and `orders.delivery_fee` did not
 * exist, so every surface fell back to a literal ₪30 — a tenant charging 25
 * printed 30 on every receipt, which is a tax document with a wrong number.
 */

jest.mock('../src/services/settings', () => ({ loadAll: jest.fn(async () => ({})) }));

const { feeForAddress } = require('../src/services/delivery-fee');

const zones = [
  { city: 'תל אביב',     fee: 30 },
  { city: 'תל אביב יפו', fee: 35 },
  { city: 'רמת גן',      fee: 25 },
  { city: 'הרצליה',      fee: 40 },
];

describe('feeForAddress', () => {
  test('matches the city inside a free-text address', () => {
    expect(feeForAddress('הרצל 5, רמת גן', { delivery_zones: zones })).toBe(25);
  });

  test('prefers the most specific city name', () => {
    // "תל אביב" is a substring of "תל אביב יפו" — the longer zone must win
    expect(feeForAddress('דיזנגוף 100, תל אביב יפו', { delivery_zones: zones })).toBe(35);
  });

  test('falls back to the flat delivery_price when no zone matches', () => {
    expect(feeForAddress('רחוב כלשהו, אילת', { delivery_zones: zones, delivery_price: 45 })).toBe(45);
  });

  test('returns null rather than inventing a number when nothing is configured', () => {
    expect(feeForAddress('רחוב כלשהו, אילת', { delivery_zones: zones })).toBeNull();
    expect(feeForAddress('', {})).toBeNull();
  });

  test('a zone fee of 0 is honoured, not treated as missing', () => {
    expect(feeForAddress('בן יהודה 1, חולון', { delivery_zones: [{ city: 'חולון', fee: 0 }] })).toBe(0);
  });

  test('quotes and stray punctuation in the zone name do not break matching', () => {
    expect(feeForAddress('ז׳בוטינסקי 3, פתח תקווה', { delivery_zones: [{ city: 'פתח תקווה', fee: 28 }] })).toBe(28);
  });
});
