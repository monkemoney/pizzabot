'use strict';

/**
 * The English system prompt.
 *
 * The Hebrew prompt is pinned byte-for-byte elsewhere (prompt-he-frozen).
 * What matters here is the other half: that an American tenant's bot actually
 * opens in English, that it tells the truth about tax, and — the structural
 * one — that both languages specify the SAME ACTION contract. A field name that
 * drifts in one language is not a wording difference; it is orders silently
 * failing for those customers only.
 */

const mockSettingsRef = { current: {} };

jest.mock('../src/services/settings', () => ({
  loadAll: jest.fn(async () => mockSettingsRef.current),
  get: jest.fn(async () => null),
  isOpen: jest.fn(async () => true),
  isDeliveryOpen: jest.fn(async () => true),
  DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('../src/services/menu-service', () => ({
  buildMenuText: jest.fn(async () => '<<MENU>>'),
}));
jest.mock('../src/services/lessons', () => ({
  isEnabled: jest.fn(async () => false),
  getLessonsText: jest.fn(async () => ''),
}));

const { buildSystemPrompt } = require('../src/bot/prompts');
const { taxRule } = require('../src/bot/prompt-en');

const BASE = {
  business_name: 'Tony\'s Pizza',
  pickup_address: '123 Main St, Los Angeles, CA 90012',
  delivery_enabled: true, pickup_enabled: true,
  payment_cash: true, payment_credit: true,
  delivery_zones: [{ city: 'Santa Monica', fee: 4.99, eta_minutes: 40 }],
  prep_lead_time: 30,
};
const US = { ...BASE, region: 'US', currency: 'USD', tax_mode: 'exclusive', tax_rate: 9.5, tax_label: 'Sales Tax' };
const IL = { business_name: 'פיצה בדיקה', delivery_zones: [{ city: 'תל אביב', fee: 30 }] };

const build = async (settings, lang) => {
  mockSettingsRef.current = settings;
  return buildSystemPrompt(null, 'aaaaaaaa-0000-0000-0000-000000000001', lang);
};

describe('language follows the tenant', () => {
  test('a US tenant gets English without waiting for the customer to write it', async () => {
    const p = await build(US);
    expect(p).toContain('You are Jasell');
    expect(p).toMatch(/Delivery or pickup\?/);
    expect(p).not.toMatch(/אתה ג׳אסל/);
  });

  test('an Israeli tenant still gets Hebrew', async () => {
    const p = await build(IL);
    expect(p).toContain('אתה ג׳אסל');
    expect(p).not.toContain('You are Jasell');
  });

  test('an explicit language wins — a customer who writes the other one', async () => {
    expect(await build(US, 'he')).toContain('אתה ג׳אסל');
    expect(await build(IL, 'en')).toContain('You are Jasell');
  });

  test('an unconfigured tenant is Israeli', async () => {
    expect(await build({})).toContain('אתה ג׳אסל');
  });
});

describe('tax guidance (C5)', () => {
  test('exclusive: the bot is told prices are pre-tax and must say so', async () => {
    const p = await build(US);
    expect(p).toContain('Menu prices are BEFORE tax');
    expect(p).toContain('Sales Tax 9.5%');
    expect(p).toMatch(/before tax/i);
  });

  test('exclusive: the ACTION total stays PRE-tax', async () => {
    // pricing.js compares the model's number against the server's pre-tax
    // subtotal and adds the tax itself. If the model also added it, the
    // customer would be taxed twice.
    const p = await build(US);
    expect(p).toMatch(/"total" is the PRE-TAX amount/);
    expect(p).toMatch(/do not add it yourself/i);
  });

  test('inclusive: the bot is told the menu price is final', async () => {
    expect(taxRule({ addsTaxAtCheckout: false, taxRate: 18 }, 'en'))
      .toMatch(/already included/);
    expect(taxRule({ addsTaxAtCheckout: false, taxRate: 18 }, 'he'))
      .toMatch(/כבר כלול/);
  });

  test('a zero rate never produces a tax instruction', () => {
    expect(taxRule({ addsTaxAtCheckout: true, taxRate: 0 }, 'en')).toMatch(/already included/);
  });
});

describe('money in the prompt', () => {
  test('the US menu quotes dollars, the Israeli one shekels', async () => {
    expect(await build(US)).toContain('$4.99');
    expect(await build(IL)).toContain('30₪');
  });

  test('no directional marks leak into the prompt', async () => {
    // Intl emits ‏ for Hebrew currency; in prompt text that becomes
    // invisible characters the bot repeats back to customers.
    for (const s of [US, IL]) {
      expect(await build(s)).not.toMatch(/[‎‏]/);
    }
  });
});

describe('the ACTION contract is identical in both languages', () => {
  const FIELDS = [
    'customer_name', 'customer_phone', 'items', 'delivery_method',
    'address', 'payment_method', 'total', 'notes', 'scheduled_for',
    'name', 'price', 'qty', 'toppings', 'portion',
  ];

  test('every field name appears in both', async () => {
    const he = await build(IL);
    const en = await build(US);
    for (const f of FIELDS) {
      expect(he).toContain(`"${f}"`);
      expect(en).toContain(`"${f}"`);
    }
  });

  test('both emit the same set of ACTION types', async () => {
    const types = (p) => [...new Set([...p.matchAll(/<!--ACTION:([A-Z_]+)/g)].map((m) => m[1]))].sort();
    expect(types(await build(US))).toEqual(types(await build(IL)));
  });

  test('both carry the same payment_method values', async () => {
    for (const p of [await build(US), await build(IL)]) {
      expect(p).toContain('"payment_method":"credit"');
      expect(p).toContain('"payment_method":"cash"');
      expect(p).toContain('"payment_method":"bit"');
    }
  });
});

describe('no Hebrew leaks into the English prompt', () => {
  /**
   * Three leaks got past the structural tests above and were only caught by
   * reading the rendered prompt: the live-state block (the one section the
   * prompt says to answer from EXCLUSIVELY), the zone ETA suffix, and the
   * greeting questions — which are the bot's literal first message to a
   * customer. This is that reading, mechanised.
   */
  const HEBREW_LETTER = /[א-ת]/;

  const FULL_US = {
    ...US,
    payment_bit: true, bit_phone: '13105551234', payment_paybox: true,
    business_hours: { sun: { is_open: true, open: '11:00', close: '22:00' } },
    delivery_hours: { sun: { is_open: true, open: '12:00', close: '21:00' } },
    topping_half_pct: 50, topping_quarter_pct: 25,
  };

  test('a fully configured US tenant produces no Hebrew at all', async () => {
    const p = await build(FULL_US);
    const bad = p.split('\n').filter((l) => HEBREW_LETTER.test(l));
    expect(bad).toEqual([]);
  });

  test('…including with a returning customer and a closed business', async () => {
    mockSettingsRef.current = { ...FULL_US, business_hours: { sun: { is_open: false } } };
    const p = await buildSystemPrompt(
      { name: 'Dana', last_address: '5 Ocean Ave', delivery_method: 'delivery' }, 'x', 'en');
    expect(p.split('\n').filter((l) => HEBREW_LETTER.test(l))).toEqual([]);
    expect(p).toContain('Dana');
  });

  test('…and with no delivery configured', async () => {
    const p = await build({ ...FULL_US, delivery_enabled: false, delivery_zones: [] });
    expect(p.split('\n').filter((l) => HEBREW_LETTER.test(l))).toEqual([]);
  });

  test('the Hebrew prompt is unaffected by all of this', async () => {
    const p = await build(IL);
    expect(HEBREW_LETTER.test(p)).toBe(true);
    expect(p).not.toContain('You are Jasell');
  });
});
