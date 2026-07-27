'use strict';

/**
 * PII redaction for error tracking.
 *
 * These tests carry unusual weight: a scrubber that is wrong is worse than no
 * error tracking at all, because it leaks while looking safe. In this system
 * the customer's phone number is the primary key of half the schema, so it
 * turns up in routine error strings — and every event goes to a third party.
 *
 * Everything here asserts on real shapes taken from this codebase's own logs
 * and payloads.
 */

const { scrub, scrubString, scrubValue } = require('../src/services/error-tracker');

// A helper that fails loudly on the thing that actually matters.
function expectNoLeak(serialised) {
  expect(serialised).not.toMatch(/972\d{8}/);
  expect(serialised).not.toMatch(/05\d[\s-]?\d{7}/);
  expect(serialised).not.toMatch(/eyJ[\w-]{10}/);
  expect(serialised).not.toMatch(/sb_secret_|sbp_|EAA[\w-]{10}/);
}

describe('phone numbers — the primary leak vector', () => {
  test.each([
    ['972501234567',                'E.164 without +'],
    ['+972501234567',               'E.164 with +'],
    ['+972-50-123-4567',            'separated with dashes'],
    ['972501234567@c.us',           'Green API chat id'],
    ['0501234567',                  'local format'],
    ['050-123-4567',                'local, separated'],
  ])('%s (%s) is redacted', (phone) => {
    const out = scrubString(`sendMessage failed for ${phone}: timeout`);
    expect(out).not.toContain(phone.replace(/\D/g, '').slice(-7));
    expect(out).toContain('failed');   // the diagnostic survives
  });

  test('the real log line from greenapi.js is safe', () => {
    const line = '[greenapi] sendMessage failed for 972501234567@c.us: {"error":"rate limited"}';
    const out = scrubString(line);
    expectNoLeak(out);
    expect(out).toContain('rate limited');    // still debuggable
    expect(out).toContain('[greenapi]');
  });

  test('a phone inside an exception value is redacted', () => {
    const event = { exception: { values: [{ type: 'Error', value: 'no admin for 972504444444' }] } };
    expectNoLeak(JSON.stringify(scrub(event)));
  });
});

describe('secrets', () => {
  test.each([
    ['Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.abc.def'],
    ['meta_access_token', 'EAAGm0PX4ZCpsBO1234567890abcdef'],
    ['SUPABASE_SERVICE_KEY', 'sb_secret_abcdefghijklmnop'],
    ['green_api_token', 'a1b2c3d4e5f6a7b8c9d0'],
    ['password', 'hunter2'],
    ['cardcom_username', 'Cardcomtest26'],
  ])('key %s is redacted regardless of value', (key, value) => {
    const out = scrubValue({ [key]: value }, '', 1);
    expect(out[key]).toBe('[redacted]');
  });

  test('a JWT appearing loose in a string is redacted', () => {
    const out = scrubString('auth failed: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');
    expectNoLeak(out);
  });

  test('an onboarding link is redacted — the token in the path is a credential', () => {
    const out = scrubString('GET /onboarding/a1b2c3d4e5f6a7b8c9d0e1f2 failed');
    expect(out).toContain('/onboarding/[token]');
    expect(out).not.toContain('a1b2c3d4e5f6');
  });

  test('a ?token= query string is redacted (SSE and the CDR webhook use it)', () => {
    const out = scrubString('GET /api/sse?token=abc123secret went away');
    expect(out).not.toContain('abc123secret');
  });
});

describe('customer personal data', () => {
  test.each(['phone', 'customer_phone', 'address', 'customer_name', 'last_address', 'contact_phone'])(
    'key %s is redacted', (key) => {
      expect(scrubValue({ [key]: 'ישראל ישראלי, הרצל 5' }, '', 1)[key]).toBe('[pii]');
    });

  test('free text is dropped, not pattern-matched — a regex cannot catch an address', () => {
    const out = scrubValue({ message: 'תביא לי לדירה מעל המכולת ליד הגן, קומה 3' }, '', 1);
    expect(out.message).toBe('[text]');
  });

  test('a whole order object is safe to serialise', () => {
    const order = {
      id: 'ord-1', order_number: 1042, tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
      phone: '972501234567', customer_name: 'דמיטרי איוונוב',
      address: 'ברודצקי 36, כניסה 1, קומה 6, תל אביב',
      items: [{ name: 'פיצה', price: 58 }], total_price: 88, status: 'new',
    };
    const out = scrubValue(order, '', 1);
    expectNoLeak(JSON.stringify(out));
    expect(JSON.stringify(out)).not.toContain('ברודצקי');
    // What we keep is what makes the error actionable
    expect(out.order_number).toBe(1042);
    expect(out.status).toBe('new');
    expect(out.tenant_id).toBe('aaaaaaaa-0000-0000-0000-000000000001');
  });
});

describe('the event envelope', () => {
  test('request bodies are dropped entirely — they carry the customer message', () => {
    const event = { request: { url: 'https://x/webhook', data: { messages: [{ text: { body: 'הכתובת שלי היא...' } }] } } };
    const out = scrub(event);
    expect(out.request.data).toBeUndefined();
  });

  test('the user object is removed — identifying a person is the thing to avoid', () => {
    expect(scrub({ user: { id: '972501234567', ip_address: '1.2.3.4' } }).user).toBeUndefined();
  });

  test('cookies and auth headers do not survive', () => {
    const out = scrub({ request: { cookies: { s: 'x' }, headers: { Authorization: 'Bearer abc', 'user-agent': 'Chrome' } } });
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.headers.Authorization).toBe('[redacted]');
    expect(out.request.headers['user-agent']).toBe('Chrome');   // harmless, kept
  });

  test('breadcrumbs are scrubbed in both shapes the SDK uses', () => {
    const arr = scrub({ breadcrumbs: [{ message: 'sent to 972501234567' }] });
    expectNoLeak(JSON.stringify(arr));
    const obj = scrub({ breadcrumbs: { values: [{ message: 'sent to 972501234567' }] } });
    expectNoLeak(JSON.stringify(obj));
  });

  test('tenant_id survives — attribution without identification', () => {
    const out = scrub({ tags: { tenant_id: 'be31c26c-2ecc-4797-b4ac-34400b37f91b', where: 'order-state' } });
    expect(out.tags.tenant_id).toBe('be31c26c-2ecc-4797-b4ac-34400b37f91b');
    expect(out.tags.where).toBe('order-state');
  });
});

describe('robustness', () => {
  test('deeply nested and circular-ish structures do not hang or throw', () => {
    let deep = { phone: '972501234567' };
    for (let i = 0; i < 30; i++) deep = { nested: deep, note: 'call 972501234567' };
    const out = scrubValue(deep, '', 0);
    expectNoLeak(JSON.stringify(out));
  });

  test('null, undefined and odd types pass through without throwing', () => {
    expect(() => scrubValue({ a: null, b: undefined, c: () => {}, d: Symbol('s') }, '', 1)).not.toThrow();
    expect(scrub(null)).toBeNull();
    expect(scrub('not an event')).toBe('not an event');
  });

  test('arrays are capped so one event cannot carry a whole table', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ phone: `97250123${String(i).padStart(4, '0')}` }));
    const out = scrubValue(many, '', 1);
    expect(out.length).toBeLessThanOrEqual(20);
    expectNoLeak(JSON.stringify(out));
  });

  test('a realistic Meta webhook payload leaks nothing', () => {
    const event = {
      message: 'handler error for 972501234567',
      request: {
        url: 'https://www.jasell.com/webhook?token=sekret',
        headers: { 'x-hub-signature-256': 'sha256=abc', authorization: 'Bearer eyJhbGciOi.x.y' },
        data: { entry: [{ changes: [{ value: { messages: [{ from: '972501234567', text: { body: 'רוצה פיצה לרחוב הרצל 5' } }] } }] }] },
      },
      extra: { session: { phone: '972501234567', customer_profile: { name: 'ישראל', last_address: 'הרצל 5' } } },
    };
    const serialised = JSON.stringify(scrub(event));
    expectNoLeak(serialised);
    expect(serialised).not.toContain('הרצל');
    expect(serialised).not.toContain('ישראל');
    expect(serialised).not.toContain('sekret');
  });
});

describe('disabled by default', () => {
  test('with no SENTRY_DSN nothing is sent and nothing throws', () => {
    const tracker = require('../src/services/error-tracker');
    delete process.env.SENTRY_DSN;
    expect(tracker.init()).toBe(false);
    expect(tracker.isEnabled()).toBe(false);
    expect(() => tracker.captureException(new Error('x'), { tenantId: 't' })).not.toThrow();
  });
});

// ── End-to-end: what actually goes on the wire ───────────────────────────────
// The unit tests above only exercise scrub() on hand-built events. They passed
// while the real send path was leaking verbatim source code, because Sentry's
// contextLines integration attaches the failing file's surrounding lines to
// every stack frame. This suite intercepts the transport and inspects the exact
// bytes the SDK would have transmitted.
describe('the real send path leaks nothing', () => {
  let captured;

  beforeAll(async () => {
    jest.resetModules();
    process.env.SENTRY_DSN = 'https://abc123@o0.ingest.sentry.io/1234567';
    captured = [];

    const Sentry = require('@sentry/node');
    const originalInit = Sentry.init;
    Sentry.init = (opts) => originalInit({
      ...opts,
      transport: () => ({ send: async (e) => { captured.push(JSON.stringify(e)); return {}; }, flush: async () => true }),
    });

    const tracker = require('../src/services/error-tracker');
    tracker.init();

    // The shapes this system actually throws.
    for (const make of [
      () => new Error('[greenapi] sendMessage failed for 972501234567@c.us: rate limited'),
      () => new Error('order #1042 for דמיטרי איוונוב at ברודצקי 36 could not be saved'),
      () => new Error('auth failed with Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature'),
      () => new Error('GET /onboarding/a1b2c3d4e5f6a7b8c9d0e1f2 expired'),
      () => new Error('cardcom rejected terminal 1000 user Cardcomtest26'),
    ]) {
      tracker.captureException(make(), { tenantId: 'be31c26c-2ecc-4797-b4ac-34400b37f91b', orderNumber: 1042 });
    }
    await Sentry.flush(2000);
  });

  afterAll(() => { delete process.env.SENTRY_DSN; jest.resetModules(); });

  test('five events were actually transmitted', () => {
    expect(captured.length).toBe(5);
  });

  test.each([
    ['a phone number',        /972501234567/],
    ['a customer name',       /דמיטרי|איוונוב/],
    ['a street address',      /ברודצקי/],
    ['a JWT',                 /eyJhbGciOiJIUzI1NiJ9/],
    ['an onboarding token',   /a1b2c3d4e5f6a7b8c9d0e1f2/],
    ['a Cardcom credential',  /Cardcomtest26/],
    ['verbatim source code',  /context_line|pre_context|post_context/],
  ])('%s never reaches the wire', (_label, re) => {
    expect(captured.join('\n')).not.toMatch(re);
  });

  test.each([
    ['the tenant it happened to', /be31c26c-2ecc-4797-b4ac-34400b37f91b/],
    ['the order number',         /1042/],
    ['a readable error',         /sendMessage failed/],
    ['the file and line',        /error-tracker\.js|filename/],
  ])('%s survives, so the event is still actionable', (_label, re) => {
    expect(captured.join('\n')).toMatch(re);
  });
});
