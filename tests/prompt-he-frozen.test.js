'use strict';

/**
 * The Hebrew system prompt is frozen.
 *
 * prompts.js is the single most behaviour-critical file in the product: it is
 * what the customer actually talks to. Adding an English variant means
 * restructuring it, and a restructure that quietly changes one word of the
 * Hebrew prompt changes how the live Israeli bot behaves — with no test failing
 * and no error anywhere.
 *
 * So the Hebrew output is pinned byte-for-byte against a snapshot captured from
 * the implementation BEFORE the English work. If this test fails, either the
 * Hebrew prompt was changed on purpose (update the snapshot in the same commit,
 * and say why in the message) or the refactor leaked — which is the case this
 * exists to catch.
 */

const fs   = require('fs');
const path = require('path');

const SNAPSHOT = path.join(__dirname, '__snapshots__', 'prompt-he.txt');

// A fixed tenant so the prompt is deterministic. Note the clock and the live
// open/closed state are stubbed — those legitimately vary and are asserted
// separately rather than frozen.
const mockSettingsRef = { current: null };

const SETTINGS = {
  business_name: 'פיצה בדיקה',
  business_address: 'הרצל 1, תל אביב',
  pickup_address: 'הרצל 1, תל אביב',
  bot_url: 'https://example.test',
  public_slug: 'pizza-test',
  prep_lead_time: 45,
  delivery_enabled: true,
  pickup_enabled: true,
  payment_cash: true,
  payment_credit: true,
  payment_bit: true,
  bit_phone: '0501234567',
  payment_paybox: false,
  topping_half_pct: 50,
  topping_quarter_pct: 25,
  delivery_price: 30,
  delivery_zones: [
    { city: 'תל אביב', area: 'מרכז', fee: 30, eta_minutes: 40 },
    { city: 'רמת גן',  fee: 35 },
  ],
  business_hours: { sun: { is_open: true, open: '10:00', close: '22:00' } },
  delivery_hours: { sun: { is_open: true, open: '11:00', close: '21:00' } },
};

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

mockSettingsRef.current = SETTINGS;
const { buildSystemPrompt } = require('../src/bot/prompts');

/** Blank the parts that legitimately move, so the snapshot is about the PROSE. */
function stable(s) {
  return s
    .replace(/\d{2}:\d{2}/g, '<TIME>')
    .replace(/יום (ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/g, 'יום <DAY>')
    .replace(/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/g, '<DAY>');
}

describe('Hebrew system prompt', () => {
  test('is byte-identical to the frozen snapshot', async () => {
    mockSettingsRef.current = SETTINGS;
    const actual = stable(await buildSystemPrompt(null, 'aaaaaaaa-0000-0000-0000-000000000001'));

    if (!fs.existsSync(SNAPSHOT)) {
      fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
      fs.writeFileSync(SNAPSHOT, actual, 'utf8');
      throw new Error('Snapshot created — re-run to verify. It must be committed.');
    }
    expect(actual).toBe(fs.readFileSync(SNAPSHOT, 'utf8'));
  });

  test('the returning-customer block still appears when there is a profile', async () => {
    mockSettingsRef.current = SETTINGS;
    const p = await buildSystemPrompt({ name: 'דנה', last_address: 'ביאליק 3' }, 'x');
    expect(p).toContain('דנה');
    expect(p).toContain('ביאליק 3');
  });
});
