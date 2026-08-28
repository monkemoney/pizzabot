'use strict';

/**
 * Per-address tax rate (C9) and per-category exemption (C10).
 *
 * One tenant can owe two different rates: US sales tax is set per jurisdiction,
 * so a Los Angeles restaurant delivering into Santa Monica owes Santa Monica's
 * rate. And within one order, some items may not be taxable at all — California
 * taxes hot prepared food but often exempts cold food sold to go.
 *
 * Both are additions to a system that had exactly one rate for everything. The
 * point of these tests is as much what does NOT change: a zone with no rate of
 * its own, and a category that predates the column, must behave exactly as they
 * did — which is what every Israeli tenant is.
 */

const CAT_HOT  = { id: 'c1', name_he: 'פיצות',  name_en: 'Pizzas',  taxable: true  };
const CAT_COLD = { id: 'c2', name_he: 'שתייה',  name_en: 'Drinks',  taxable: false };
const CAT_OLD  = { id: 'c3', name_he: 'קינוחים', name_en: 'Desserts' };   // predates the column

const mockProducts = [
  { id: 'p1', name_he: 'פיצה משפחתית', name_en: 'Family Pizza', price: 100, category_id: 'c1' },
  { id: 'p2', name_he: 'קולה',         name_en: 'Cola',         price: 50,  category_id: 'c2' },
  { id: 'p3', name_he: 'עוגה',         name_en: 'Cake',         price: 20,  category_id: 'c3' },
];
const mockAdditions = [
  { name_he: 'זיתים', name_en: 'Olives', price: 10, product_id: 'p1' },
];
let mockSettings = {};

jest.mock('../src/services/menu-service', () => ({
  getProducts: jest.fn(async () => ({
    main: mockProducts, categories: [CAT_HOT, CAT_COLD, CAT_OLD], byCategory: {}, raw: mockProducts,
  })),
}));
jest.mock('../src/services/settings', () => ({
  loadAll: jest.fn(async () => mockSettings),
  get: jest.fn(async () => null),
  DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ in: async () => ({ data: mockAdditions }) }) }) }),
}));

const { computeTotal, authoritativeTotal } = require('../src/services/pricing');
const { zoneForAddress } = require('../src/services/delivery-fee');
const { localeForZone, resolveLocale, taxableBase, normaliseZones, zipsOf, extractPostal } = require('../src/services/locale');
const TID = 'aaaaaaaa-0000-0000-0000-000000000001';

const US = {
  region: 'US', currency: 'USD', tax_mode: 'exclusive', tax_rate: 9.5,
  tax_label: 'Sales Tax', tax_on_delivery: false,
  delivery_price: 5,
  delivery_zones: [
    { city: 'Los Angeles',  fee: 5 },                    // no rate → the tenant's 9.5%
    { city: 'Santa Monica', fee: 6, tax_rate: 10.25 },
    { city: 'Hollywood',      fee: 5, tax_rate: 9.5 },
    { city: 'West Hollywood', fee: 7, tax_rate: 10.25 }, // must beat "Hollywood"
  ],
};
const IL = { delivery_price: 30, delivery_zones: [{ city: 'תל אביב', fee: 30 }] };

beforeEach(() => { mockSettings = { ...US }; jest.clearAllMocks(); });

// ── C9: the rate follows the address ─────────────────────────────────────────

describe('zoneForAddress', () => {
  test('longest city name wins — West Hollywood is not Hollywood', () => {
    expect(zoneForAddress('8000 Sunset Blvd, West Hollywood, CA', US).city).toBe('West Hollywood');
    expect(zoneForAddress('6801 Hollywood Blvd, Hollywood, CA', US).city).toBe('Hollywood');
  });

  test('no match and no address are both null, never a guess', () => {
    expect(zoneForAddress('742 Evergreen Terrace, Springfield', US)).toBeNull();
    expect(zoneForAddress('', US)).toBeNull();
  });
});

describe('localeForZone', () => {
  const loc = resolveLocale(US);

  test('a zone with its own rate overrides the tenant rate', () => {
    expect(localeForZone(loc, { tax_rate: 10.25 }).taxRate).toBe(10.25);
  });

  test('a zone with no rate leaves the locale untouched — the same object', () => {
    expect(localeForZone(loc, { city: 'Los Angeles', fee: 5 })).toBe(loc);
    expect(localeForZone(loc, null)).toBe(loc);
  });

  test('a zone can never flip the tax MODEL, only the rate', () => {
    // Inclusive vs exclusive is a fact about the country, not the street. One
    // zone row silently repricing a whole basket is the failure this prevents.
    const l = localeForZone(loc, { tax_rate: 10.25, tax_mode: 'inclusive', currency: 'ILS' });
    expect(l.taxMode).toBe('exclusive');
    expect(l.currency).toBe('USD');
  });

  test('an out-of-range or unparseable rate is ignored, not clamped into a charge', () => {
    expect(localeForZone(loc, { tax_rate: 'abc' })).toBe(loc);
    expect(localeForZone(loc, { tax_rate: null })).toBe(loc);
    expect(localeForZone(loc, { tax_rate: 200 }).taxRate).toBe(100);
  });
});

describe('computeTotal charges the destination\'s rate', () => {
  test('Santa Monica pays 10.25%, Los Angeles pays 9.5% — same tenant, same basket', async () => {
    const items = [{ name: 'Family Pizza', qty: 1 }];
    const sm = await computeTotal(items, { delivery_method: 'delivery', address: '1200 Ocean Ave, Santa Monica, CA', tenantId: TID });
    const la = await computeTotal(items, { delivery_method: 'delivery', address: '500 S Main St, Los Angeles, CA', tenantId: TID });

    expect(sm.taxRate).toBe(10.25);
    expect(sm.tax).toBe(10.25);                 // 100 × 10.25% (delivery not taxed)
    expect(sm.total).toBe(100 + 6 + 10.25);

    expect(la.taxRate).toBe(9.5);
    expect(la.tax).toBe(9.5);
    expect(la.total).toBe(100 + 5 + 9.5);
  });

  test('pickup is taxed at the business address, not at any zone', async () => {
    const r = await computeTotal([{ name: 'Family Pizza', qty: 1 }],
      { delivery_method: 'pickup', address: '1200 Ocean Ave, Santa Monica, CA', tenantId: TID });
    expect(r.taxRate).toBe(9.5);
    expect(r.total).toBe(109.5);
  });

  test('an unmapped address falls back to the tenant rate', async () => {
    const r = await computeTotal([{ name: 'Family Pizza', qty: 1 }],
      { delivery_method: 'delivery', address: '742 Evergreen Terrace, Springfield', tenantId: TID });
    expect(r.taxRate).toBe(9.5);
  });

  test('taxOnDelivery brings the zone fee into the zone\'s own base', async () => {
    mockSettings = { ...US, tax_on_delivery: true };
    const r = await computeTotal([{ name: 'Family Pizza', qty: 1 }],
      { delivery_method: 'delivery', address: '1200 Ocean Ave, Santa Monica, CA', tenantId: TID });
    expect(r.tax).toBe(Math.round((106 * 0.1025) * 100) / 100);
  });

  test('an Israeli tenant is untouched — no zone carries a rate', async () => {
    mockSettings = { ...IL };
    const r = await computeTotal([{ name: 'פיצה משפחתית', qty: 1 }],
      { delivery_method: 'delivery', address: 'רוטשילד 5, תל אביב', tenantId: TID });
    expect(r.taxRate).toBe(18);
    expect(r.total).toBe(130);      // inclusive: the tax is already inside
  });
});

// ── C10: some items are not taxable ──────────────────────────────────────────

describe('taxableBase', () => {
  const loc = resolveLocale(US);

  test('the exempt share comes off the items, never off the delivery fee', () => {
    expect(taxableBase(150, 5, { ...loc, taxOnDelivery: true }, 50)).toBe(105);
    expect(taxableBase(150, 5, loc, 50)).toBe(100);
  });

  test('zero exempt is the pre-C10 answer exactly', () => {
    expect(taxableBase(150, 5, loc, 0)).toBe(taxableBase(150, 5, loc));
  });

  test('an exemption can never exceed the items or drive the base negative', () => {
    expect(taxableBase(100, 5, loc, 999)).toBe(0);
    expect(taxableBase(100, 5, loc, -50)).toBe(100);
  });
});

describe('computeTotal exempts a non-taxable category', () => {
  test('the drink is not taxed, the pizza is', async () => {
    const r = await computeTotal(
      [{ name: 'Family Pizza', qty: 1 }, { name: 'Cola', qty: 1 }],
      { delivery_method: 'pickup', tenantId: TID });
    expect(r.itemsTotal).toBe(150);
    expect(r.exemptTotal).toBe(50);
    expect(r.tax).toBe(9.5);            // 100 × 9.5%, not 150
    expect(r.total).toBe(159.5);
  });

  test('a topping follows the dish it is on', async () => {
    // A topping's own category says nothing about the plate it arrives on.
    const r = await computeTotal(
      [{ name: 'Cola', qty: 1, toppings: [{ name: 'Olives' }] }],
      { delivery_method: 'pickup', tenantId: TID });
    expect(r.exemptTotal).toBe(60);
    expect(r.tax).toBe(0);
  });

  test('a category that predates the column is taxable', async () => {
    const r = await computeTotal([{ name: 'Cake', qty: 1 }], { delivery_method: 'pickup', tenantId: TID });
    expect(r.exemptTotal).toBe(0);
    expect(r.tax).toBe(1.9);
  });

  test('an unmatched item is taxed — an exemption we cannot substantiate is the expensive guess', async () => {
    const r = await computeTotal([{ name: 'Mystery Special', price: 100, qty: 1 }],
      { delivery_method: 'pickup', tenantId: TID });
    expect(r.unmatched).toEqual(['Mystery Special']);
    expect(r.exemptTotal).toBe(0);
    expect(r.tax).toBe(9.5);
  });

  test('a menu whose categories have no `taxable` column yet is fully taxable', async () => {
    // The state of the live database until the migration runs. Reading the flag
    // from the categories list (select('*')) rather than from the products JOIN
    // is what makes this work: a join naming a column that does not exist fails
    // the whole query, and getProducts turns a query error into an EMPTY MENU —
    // deploying before the migration would have left the bot with no menu.
    const svc = require('../src/services/menu-service');
    const preMigration = [CAT_HOT, CAT_COLD, CAT_OLD].map(({ taxable, ...rest }) => rest);
    svc.getProducts.mockResolvedValueOnce({ main: mockProducts, categories: preMigration });
    const r = await computeTotal(
      [{ name: 'Family Pizza', qty: 1 }, { name: 'Cola', qty: 1 }],
      { delivery_method: 'pickup', tenantId: TID });
    expect(r.itemsTotal).toBe(150);
    expect(r.exemptTotal).toBe(0);
    expect(r.tax).toBe(14.25);      // 150 × 9.5% — exactly the pre-C10 answer
  });

  test('a menu with no category rows at all still prices — nothing is exempt', async () => {
    // The path a tenant mid-migration takes, and the shape the frozen Israeli
    // pricing test mocks.
    const svc = require('../src/services/menu-service');
    svc.getProducts.mockResolvedValueOnce({ main: mockProducts });
    const r = await computeTotal([{ name: 'Cola', qty: 1 }], { delivery_method: 'pickup', tenantId: TID });
    expect(r.exemptTotal).toBe(0);
  });
});

describe('authoritativeTotal carries both through', () => {
  test('the server total wins and is taxed at the destination, minus the exempt item', async () => {
    const r = await authoritativeTotal({
      items: [{ name: 'Family Pizza', qty: 1 }, { name: 'Cola', qty: 1 }],
      delivery_method: 'delivery', address: '1200 Ocean Ave, Santa Monica, CA',
      total: 1,   // a wrong quote, so the server's number is the one used
    }, TID);

    expect(r.corrected).toBe(true);
    expect(r.subtotal).toBe(156);        // 100 + 50 + 6 delivery, pre-tax
    expect(r.taxRate).toBe(10.25);
    expect(r.tax).toBe(10.25);           // only the pizza is taxable
    expect(r.total).toBe(166.25);
  });

  test('when the model\'s quote stands, the exempt share still comes off the base', async () => {
    // The exemption is the server's knowledge — it comes from the menu rows,
    // which the model never sees. An unmatched item keeps the model's total,
    // and the tax still must not be charged on the exempt part.
    const r = await authoritativeTotal({
      items: [{ name: 'Cola', qty: 1 }, { name: 'Mystery Special', price: 100, qty: 1 }],
      delivery_method: 'pickup', total: 150,
    }, TID);

    expect(r.corrected).toBe(false);
    expect(r.subtotal).toBe(150);
    expect(r.tax).toBe(9.5);             // (150 − 50 exempt) × 9.5%
    expect(r.total).toBe(159.5);
  });

  test('an Israeli order is unchanged end to end', async () => {
    mockSettings = { ...IL };
    const r = await authoritativeTotal({
      items: [{ name: 'פיצה משפחתית', qty: 1 }],
      delivery_method: 'delivery', address: 'רוטשילד 5, תל אביב', total: 130,
    }, TID);
    expect(r.total).toBe(130);
    expect(r.taxRate).toBe(18);
  });
});

describe('normaliseZones — the door PATCH /settings puts a zone row through', () => {
  test('an empty field is REMOVED, not stored as 0', () => {
    // "use the tenant's rate" and "charge no tax here" are different
    // instructions and must not collapse into the same stored value.
    const zones = [{ city: 'LA', tax_rate: '' }, { city: 'SM', tax_rate: null }];
    expect(normaliseZones(zones)).toBeNull();
    expect('tax_rate' in zones[0]).toBe(false);
    expect('tax_rate' in zones[1]).toBe(false);
  });

  test('an explicit 0 survives — it is a real instruction', () => {
    const zones = [{ city: 'Portland', tax_rate: 0 }];
    expect(normaliseZones(zones)).toBeNull();
    expect(zones[0].tax_rate).toBe(0);
  });

  test('a numeric string is coerced, so the comparison in pricing is a number', () => {
    const zones = [{ city: 'SM', tax_rate: '10.25' }];
    normaliseZones(zones);
    expect(zones[0].tax_rate).toBe(10.25);
  });

  test('an out-of-range or unparseable rate names the offending city', () => {
    expect(normaliseZones([{ city: 'SM', tax_rate: 150 }])).toBe('SM');
    expect(normaliseZones([{ city: 'SM', tax_rate: -1 }])).toBe('SM');
    expect(normaliseZones([{ city: 'SM', tax_rate: 'abc' }])).toBe('SM');
  });

  test('a zone array with no rates at all is untouched — every zone today', () => {
    const zones = [{ city: 'תל אביב', fee: 30, min_order: 0, eta_minutes: 45 }];
    expect(normaliseZones(zones)).toBeNull();
    expect(zones).toEqual([{ city: 'תל אביב', fee: 30, min_order: 0, eta_minutes: 45 }]);
  });

  test('a non-array is not an error — the caller may be patching something else', () => {
    expect(normaliseZones(undefined)).toBeNull();
    expect(normaliseZones('nope')).toBeNull();
  });
});


// ── D7: the ZIP is the lookup key, not the city name ─────────────────────────

describe('extractPostal is region-shaped', () => {
  const us = resolveLocale({ region: 'US' });
  const il = resolveLocale({});

  test('a US ZIP is found, and ZIP+4 reduces to the base five', () => {
    expect(extractPostal('1200 Ocean Ave, Santa Monica, CA 90401', us)).toBe('90401');
    expect(extractPostal('123 Main St #4, Los Angeles, CA 90012-1234', us)).toBe('90012');
  });

  test('an Israeli 7-digit מיקוד is never read as a 5-digit ZIP', () => {
    // A bare \d{5} would hand back "67011" — and there is no useful difference
    // between a wrong postal code and no postal code; both resolve an order to
    // the wrong place.
    expect(extractPostal('דרך מנחם בגין 132, תל אביב 6701101', us)).toBeNull();
    expect(extractPostal('דרך מנחם בגין 132, תל אביב 6701101', il)).toBe('6701101');
  });

  test('an address with no postal code at all is null, not a house number', () => {
    expect(extractPostal('רוטשילד 5, תל אביב', il)).toBeNull();
    expect(extractPostal('1200 Ocean Ave, Santa Monica', us)).toBeNull();
  });
});

describe('zipsOf accepts what the field actually produces', () => {
  test('a typed line, an array, and duplicates all normalise the same', () => {
    expect(zipsOf({ zips: '90401, 90402 90403' })).toEqual(['90401', '90402', '90403']);
    expect(zipsOf({ zips: ['90401', '90401'] })).toEqual(['90401']);
  });

  test('nothing configured is an empty list, which is what turns the branch off', () => {
    expect(zipsOf({})).toEqual([]);
    expect(zipsOf({ zips: '' })).toEqual([]);
    expect(zipsOf({ zips: 'not a zip' })).toEqual([]);
  });
});

describe('zoneForAddress resolves by ZIP first', () => {
  const ZIPPED = {
    region: 'US',
    delivery_zones: [
      { city: 'Los Angeles',  fee: 5, zips: ['90012', '90013'] },
      { city: 'Santa Monica', fee: 6, tax_rate: 10.25, zips: '90401, 90402' },
      { city: 'Venice',       fee: 7 },                              // city-matched only
      { city: 'Long Beach',   fee: 9, tax_rate: 10.25, zips: ['908'] }, // a prefix
    ],
  };

  test('a ZIP resolves a city string that would never have matched', () => {
    // "LA" is not "Los Angeles". This is the case city matching silently loses.
    expect(zoneForAddress('500 S Main St, LA, CA 90013', ZIPPED).city).toBe('Los Angeles');
  });

  test('a street and a ZIP alone are enough', () => {
    expect(zoneForAddress('1200 Ocean Ave, 90402', ZIPPED).city).toBe('Santa Monica');
  });

  test('the ZIP beats a conflicting city name in the same string', () => {
    // Whatever the customer typed, the ZIP is the part that names a jurisdiction.
    expect(zoneForAddress('1200 Ocean Ave, Los Angeles, CA 90401', ZIPPED).city).toBe('Santa Monica');
  });

  test('a prefix covers a range, and an exact ZIP still wins over it', () => {
    const withBoth = { ...ZIPPED, delivery_zones: [
      ...ZIPPED.delivery_zones, { city: 'Signal Hill', fee: 11, zips: ['90806'] }] };
    expect(zoneForAddress('1 Ocean Blvd, CA 90802', withBoth).city).toBe('Long Beach');
    expect(zoneForAddress('1 Hill St, CA 90806', withBoth).city).toBe('Signal Hill');
  });

  test('a zone with no ZIPs still matches by city', () => {
    // A half-configured tenant keeps the answer it had before.
    expect(zoneForAddress('99 Abbot Kinney Blvd, Venice, CA 90291', ZIPPED).city).toBe('Venice');
  });

  test('an unclaimed ZIP falls through to the city, it does not fail the lookup', () => {
    expect(zoneForAddress('1 Nowhere Rd, Venice, CA 90291', ZIPPED).city).toBe('Venice');
    expect(zoneForAddress('1 Nowhere Rd, Nowhere, CA 99999', ZIPPED)).toBeNull();
  });

  test('an Israeli tenant never enters the ZIP branch — no zone declares one', () => {
    const il = { delivery_zones: [{ city: 'תל אביב יפו', fee: 30 }, { city: 'תל אביב', fee: 25 }] };
    expect(zoneForAddress('רוטשילד 5, תל אביב יפו', il).fee).toBe(30);
    expect(zoneForAddress('הרצל 10, תל אביב 6701101', il).fee).toBe(25);
  });
});

describe('the ZIP carries the fee AND the rate, from one match', () => {
  test('an order that only names a ZIP is priced and taxed at that zone', async () => {
    mockSettings = { ...US, delivery_zones: [
      { city: 'Los Angeles',  fee: 5, zips: ['90012'] },
      { city: 'Santa Monica', fee: 6, tax_rate: 10.25, zips: ['90401'] },
    ] };
    const r = await computeTotal([{ name: 'Family Pizza', qty: 1 }],
      { delivery_method: 'delivery', address: '1200 Ocean Ave, 90401', tenantId: TID });
    expect(r.deliveryFee).toBe(6);
    expect(r.taxRate).toBe(10.25);
    expect(r.total).toBe(100 + 6 + 10.25);
  });
});

describe('normaliseZones handles the zips field too', () => {
  test('a typed line becomes the stored array', () => {
    const zones = [{ city: 'SM', zips: '90401, 90402' }];
    expect(normaliseZones(zones)).toBeNull();
    expect(zones[0].zips).toEqual(['90401', '90402']);
  });

  test('an emptied field removes the key — a zone covering no ZIP would match nothing', () => {
    const zones = [{ city: 'SM', zips: '' }, { city: 'LA', zips: [] }];
    normaliseZones(zones);
    expect('zips' in zones[0]).toBe(false);
    expect('zips' in zones[1]).toBe(false);
  });
});
