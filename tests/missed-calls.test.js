'use strict';

/**
 * Missed-call recovery webhook (/webhook/calls/:tenantId) — verifies:
 * 1. Token auth: unconfigured → 403, wrong token → 403
 * 2. Disabled tenants ack 200 without processing (no provider retry storm)
 * 3. Unanswered CDR → recovery template sent through the greenapi facade
 * 4. Answered CDR → nothing sent
 * 5. Per-caller throttle absorbs duplicate/repeat events
 * 6. Admin callers, the forward-target phone, and couriers are never messaged
 * 7. Business-hours gate (missed_call_when_closed)
 * 8. parseCallEvents handles DIDWW shapes + field-name variants
 */

// ── Service mocks (must be before require) ────────────────────────────────────
const mockSendTemplate  = jest.fn(async () => ({ ok: true }));
const mockSendMessage   = jest.fn(async () => ({ ok: true }));
const mockGetAdminUser  = jest.fn(async () => null);
const mockIsOpen        = jest.fn(async () => true);
let   mockSettingsStore = {};

jest.mock('../src/bot/ai-handler',    () => ({ handleMessage:      jest.fn(async () => {}) }));
jest.mock('../src/bot/admin-handler', () => ({ handleAdminMessage: jest.fn(async () => {}) }));

const mockOptedOut = new Set();   // phones that asked to be left alone

jest.mock('../src/services/supabase', () => ({
  getAdminUser:               mockGetAdminUser,
  getOptedOutPhones:          jest.fn(async (phones) => new Set(phones.filter(p => mockOptedOut.has(p)))),
  resolveTenantByMetaPhoneId: jest.fn(async () => null),
  getSession:                 jest.fn(async () => ({ conversation_history: [], pending_order: {} })),
  updateSession:              jest.fn(async () => {}),
  getAllPendingPayments:       jest.fn(async () => []),
  autoCompleteDeliveredOrders: jest.fn(async () => {}),
  pruneOldSessions:            jest.fn(async () => {}),
}));

jest.mock('../src/services/greenapi', () => ({
  sendMessage:  mockSendMessage,
  sendTemplate: mockSendTemplate,
  formatPhone: (raw) => {
    let p = String(raw || '').split('@')[0].replace(/\D/g, '');
    if (p.startsWith('0') && p.length === 10) p = '972' + p.slice(1);
    return p;
  },
  toChatId: (p) => `${p}@c.us`,
}));

const mockSendSms = jest.fn(async () => ({ ok: true }));
jest.mock('../src/services/sms', () => ({ sendSms: mockSendSms }));

const mockRecordCallEvent    = jest.fn(async () => {});
const mockLastRecoverySentAt = jest.fn(async () => null);
jest.mock('../src/services/recovery-attribution', () => ({
  recordCallEvent:    mockRecordCallEvent,
  lastRecoverySentAt: mockLastRecoverySentAt,
  markResponded:      jest.fn(async () => false),
  markOrder:          jest.fn(async () => false),
  ATTRIBUTION_HOURS:  24,
}));

jest.mock('../src/services/vendor-alerts',  () => ({ alert: jest.fn(async () => {}), alerts: { serverError: jest.fn(async () => {}), serverRestart: jest.fn(async () => {}), onboardingComplete: jest.fn(async () => {}) } }));
jest.mock('../src/services/push-notifier',  () => ({ notifyNewOrder: jest.fn(async () => {}), saveSubscription: jest.fn() }));
jest.mock('../src/services/cardcom',        () => ({
  verifyPayment: jest.fn(async () => ({ success: false })),
  cancelDeal:    jest.fn(async () => ({ success: false })),
}));
jest.mock('../src/services/settings', () => ({
  loadAll:          jest.fn(async () => mockSettingsStore),
  get:              jest.fn(async (key) => mockSettingsStore[key]),
  isOpen:           mockIsOpen,
  set:              jest.fn(async () => {}),
  _clearCache:      jest.fn(),
  DEFAULT_TENANT_ID:'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('../src/services/menu-service',    () => ({ getMenu: jest.fn(async () => []), invalidateCache: jest.fn() }));
jest.mock('../src/services/status-notifier', () => ({ notifyStatusChange: jest.fn(async () => {}) }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select:  () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
      insert:  () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update:  () => ({ eq: () => ({ error: null }) }),
      upsert:  () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      delete:  () => ({ eq: () => ({ error: null }) }),
    }),
  }),
}));

const request = require('supertest');
const { parseCallEvents, _lastNotified } = require('../src/routes/call-events');

const TENANT = 'cccccccc-1111-2222-3333-444444444444';
const TOKEN  = 'test-webhook-secret';

let app;
beforeAll(() => {
  app = require('../src/index');
});

beforeEach(() => {
  jest.clearAllMocks();
  _lastNotified.clear();
  mockGetAdminUser.mockResolvedValue(null);
  mockIsOpen.mockResolvedValue(true);
  mockSettingsStore = {
    missed_call_enabled:       true,
    missed_call_webhook_token: TOKEN,
  };
});

const flush = () => new Promise((r) => setImmediate(r));

// DIDWW Voice IN CDR Streamer shape
function cdrBody(caller, { answered = false, duration = 0 } = {}) {
  return {
    data: [{
      type: 'inbound-cdr',
      attributes: {
        src_number:   caller,
        success:      answered,
        duration,
        time_connect: answered ? '2026-07-17T10:00:00.000000' : null,
      },
    }],
  };
}

function post(body, token = TOKEN) {
  return request(app).post(`/webhook/calls/${TENANT}?token=${token}`).send(body);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('token auth', () => {
  test('403 when no token is configured for the tenant', async () => {
    delete mockSettingsStore.missed_call_webhook_token;
    await post(cdrBody('+972501111111')).expect(403);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('403 on wrong token', async () => {
    await post(cdrBody('+972501111111'), 'wrong-token').expect(403);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('403 on missing token param', async () => {
    await request(app).post(`/webhook/calls/${TENANT}`).send(cdrBody('+972501111111')).expect(403);
  });
});

// ── Enable switch ─────────────────────────────────────────────────────────────
describe('missed_call_enabled', () => {
  test('disabled tenant acks 200 but sends nothing', async () => {
    mockSettingsStore.missed_call_enabled = false;
    const res = await post(cdrBody('+972501111111')).expect(200);
    expect(res.body.skipped).toBe('disabled');
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});

// ── Core flow ─────────────────────────────────────────────────────────────────
describe('unanswered call → recovery message', () => {
  test('sends the template through the greenapi facade with tenant + fallback', async () => {
    mockSettingsStore.missed_call_template = 'missed_call_recovery';
    await post(cdrBody('+972501111111')).expect(200);
    await flush();

    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    const [phone, template, tenantId, fallback] = mockSendTemplate.mock.calls[0];
    expect(phone).toBe('972501111111');
    expect(template).toEqual(expect.objectContaining({ name: 'missed_call_recovery', lang: 'he' }));
    expect(tenantId).toBe(TENANT);
    expect(typeof fallback).toBe('string');
    expect(fallback.length).toBeGreaterThan(0);
  });

  test('custom template name, lang and params from settings are used', async () => {
    mockSettingsStore.missed_call_template        = 'custom_tpl';
    mockSettingsStore.missed_call_template_lang   = 'en';
    mockSettingsStore.missed_call_template_params = ['Pizza Place'];
    await post(cdrBody('+972501111111')).expect(200);
    await flush();

    expect(mockSendTemplate).toHaveBeenCalledWith(
      '972501111111',
      { name: 'custom_tpl', lang: 'en', params: ['Pizza Place'] },
      TENANT,
      expect.any(String)
    );
  });

  test('answered call sends nothing', async () => {
    await post(cdrBody('+972501111111', { answered: true, duration: 42 })).expect(200);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('unusable caller id (anonymous) is skipped', async () => {
    await post(cdrBody('anonymous')).expect(200);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});

// ── Throttle ──────────────────────────────────────────────────────────────────
describe('per-caller throttle', () => {
  test('second event for the same caller within the window is not re-sent', async () => {
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
  });

  test('different callers are each messaged', async () => {
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    await post(cdrBody('+972502222222')).expect(200);
    await flush();
    expect(mockSendTemplate).toHaveBeenCalledTimes(2);
  });
});

// ── Exclusions ────────────────────────────────────────────────────────────────
describe('excluded callers', () => {
  test('admin caller is never messaged', async () => {
    mockGetAdminUser.mockResolvedValue({ phone: '972501111111', role: 'admin' });
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('the forward-target phone is never messaged', async () => {
    mockSettingsStore.missed_call_forward_number = '0501111111';
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('couriers are never messaged', async () => {
    mockSettingsStore.couriers = [{ name: 'שליח', phone: '0501111111' }];
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});

// ── Business-hours gate ───────────────────────────────────────────────────────
describe('business-hours gate', () => {
  test('closed business → no message by default', async () => {
    mockIsOpen.mockResolvedValue(false);
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('closed business + missed_call_when_closed → message sent', async () => {
    mockIsOpen.mockResolvedValue(false);
    mockSettingsStore.missed_call_when_closed = true;
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
  });
});

// ── Send failure → throttle released ─────────────────────────────────────────
describe('send failure', () => {
  test('failed send releases the throttle so the next event retries', async () => {
    mockSendTemplate.mockRejectedValueOnce(new Error('meta 500'));
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).toHaveBeenCalledTimes(2); // first failed, second retried
  });
});

// ── Payload parsing ───────────────────────────────────────────────────────────
describe('parseCallEvents', () => {
  test('DIDWW data-array shape with attributes', () => {
    const events = parseCallEvents(cdrBody('+972501234567'));
    expect(events).toHaveLength(1);
    expect(events[0].caller).toBe('+972501234567');
    expect(events[0].answered).toBe(false);
  });

  test('bare object without data wrapper', () => {
    const events = parseCallEvents({ src_number: '972501234567', success: false, duration: 0 });
    expect(events).toEqual([expect.objectContaining({ caller: '972501234567', answered: false })]);
  });

  test('alternative caller field names (cli / from / source)', () => {
    expect(parseCallEvents({ cli: '972501', success: false })[0].caller).toBe('972501');
    expect(parseCallEvents({ from: '972502', success: false })[0].caller).toBe('972502');
    expect(parseCallEvents({ source: '972503', success: false })[0].caller).toBe('972503');
  });

  test('no success field: time_connect or positive duration mean answered', () => {
    expect(parseCallEvents({ src_number: 'x', time_connect: '2026-07-17T10:00:00' })[0].answered).toBe(true);
    expect(parseCallEvents({ src_number: 'x', duration: 9 })[0].answered).toBe(true);
    expect(parseCallEvents({ src_number: 'x', duration: 0 })[0].answered).toBe(false);
  });

  test('garbage bodies parse to empty/harmless', () => {
    expect(parseCallEvents(null)).toEqual([]);
    expect(parseCallEvents('str')).toEqual([]);
    expect(parseCallEvents({ data: [] })).toEqual([]);
  });
});

// ── SMS channel ───────────────────────────────────────────────────────────────
describe('missed_call_channel = sms', () => {
  test('sends SMS with wa.me link instead of a WhatsApp template', async () => {
    mockSettingsStore.missed_call_channel = 'sms';
    mockSettingsStore.bot_whatsapp        = '97233741407';
    mockSettingsStore.business_name       = 'פיצה דליבריס';
    await post(cdrBody('+972501111111')).expect(200);
    await flush();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    const [to, text, source, tenantId] = mockSendSms.mock.calls[0];
    expect(to).toBe('972501111111');
    expect(text).toContain('https://wa.me/97233741407');
    expect(text).toContain('פיצה דליבריס');
    expect(source).toBe('97233741407');
    expect(tenantId).toBe(TENANT);
  });

  test('custom sms text and explicit sender override the defaults', async () => {
    mockSettingsStore.missed_call_channel    = 'sms';
    mockSettingsStore.missed_call_sms_text   = 'טקסט מותאם';
    mockSettingsStore.missed_call_sms_sender = '0521112222';
    await post(cdrBody('+972501111111')).expect(200);
    await flush();

    expect(mockSendSms).toHaveBeenCalledWith('972501111111', 'טקסט מותאם', '972521112222', TENANT);
  });

  test('sms failure releases the throttle for retry', async () => {
    mockSettingsStore.missed_call_channel = 'sms';
    mockSettingsStore.bot_whatsapp        = '97233741407';
    mockSendSms.mockRejectedValueOnce(new Error('didww 403'));
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendSms).toHaveBeenCalledTimes(2);
  });

  test('default channel stays whatsapp when setting is absent', async () => {
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    expect(mockSendSms).not.toHaveBeenCalled();
  });
});

// ── Content-type tolerance: DIDWW posts JSON as text/plain ───────────────────
describe('text/plain body (DIDWW production behavior)', () => {
  test('JSON sent as text/plain is parsed and processed', async () => {
    await request(app)
      .post(`/webhook/calls/${TENANT}?token=${TOKEN}`)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(cdrBody('+972501111111')))
      .expect(200);
    await flush();
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    expect(mockSendTemplate.mock.calls[0][0]).toBe('972501111111');
  });

  test('garbage text body acks 200 without crashing', async () => {
    await request(app)
      .post(`/webhook/calls/${TENANT}?token=${TOKEN}`)
      .set('Content-Type', 'text/plain')
      .send('not json at all')
      .expect(200);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});

// ── Wiring: the route is not swallowed by /webhook/:tenantId ─────────────────
describe('route mounting order', () => {
  test('GET /webhook/calls/:tenantId answers the sanity check (not Meta verify 403)', async () => {
    const res = await request(app).get(`/webhook/calls/${TENANT}`).expect(200);
    expect(res.body.service).toBe('call-events');
  });
});

// ── Funnel recording: every processed CDR lands in call_events ───────────────
describe('call_events recording', () => {
  const outcomes = () => mockRecordCallEvent.mock.calls.map(([e]) => e.outcome);

  test('sent recovery records recovery_sent with caller + channel + tenant', async () => {
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockRecordCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: '972501111111', answered: false,
        outcome: 'recovery_sent', channel: 'whatsapp',
      }),
      TENANT
    );
  });

  test('answered call records answered', async () => {
    await post(cdrBody('+972501111111', { answered: true, duration: 42 })).expect(200);
    await flush();
    expect(outcomes()).toEqual(['answered']);
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('unusable caller records unusable_caller with null caller', async () => {
    await post(cdrBody('anonymous')).expect(200);
    await flush();
    expect(mockRecordCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ caller: null, outcome: 'unusable_caller' }),
      TENANT
    );
  });

  test('each skip reason is recorded distinctly', async () => {
    mockIsOpen.mockResolvedValue(false);
    await post(cdrBody('+972501111111')).expect(200);
    await flush();

    mockIsOpen.mockResolvedValue(true);
    mockGetAdminUser.mockResolvedValue({ phone: '972502222222', role: 'admin' });
    await post(cdrBody('+972502222222')).expect(200);
    await flush();

    mockGetAdminUser.mockResolvedValue(null);
    mockOptedOut.add('972503333333');
    await post(cdrBody('+972503333333')).expect(200);
    await flush();
    mockOptedOut.clear();

    mockSettingsStore.missed_call_forward_number = '0504444444';
    await post(cdrBody('+972504444444')).expect(200);
    await flush();

    expect(outcomes()).toEqual([
      'skipped_closed', 'skipped_admin', 'skipped_opted_out', 'skipped_forward',
    ]);
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('throttled repeat records skipped_throttled', async () => {
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(outcomes()).toEqual(['recovery_sent', 'skipped_throttled']);
  });

  test('failed send records send_failed and not recovery_sent', async () => {
    mockSendTemplate.mockRejectedValueOnce(new Error('meta 500'));
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(outcomes()).toEqual(['send_failed']);
  });

  test('sms channel records recovery_sent with channel sms', async () => {
    mockSettingsStore.missed_call_channel = 'sms';
    mockSettingsStore.bot_whatsapp        = '97233741407';
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockRecordCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'recovery_sent', channel: 'sms' }),
      TENANT
    );
  });
});

// ── Durable throttle: call_events backs the in-memory map across deploys ──────
describe('durable throttle (DB-backed)', () => {
  test('a recovery_sent row from before the deploy throttles the send', async () => {
    mockLastRecoverySentAt.mockResolvedValueOnce(Date.now() - 10 * 60000); // 10m ago
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockRecordCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'skipped_throttled' }),
      TENANT
    );
  });

  test('a recovery_sent row older than the window does not throttle', async () => {
    mockLastRecoverySentAt.mockResolvedValueOnce(Date.now() - 10 * 3600000); // 10h > 3h default
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
  });

  test('the DB is only consulted when the in-memory map has no entry', async () => {
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    mockLastRecoverySentAt.mockClear();
    await post(cdrBody('+972501111111')).expect(200);
    await flush();
    expect(mockLastRecoverySentAt).not.toHaveBeenCalled(); // memory hit answered it
  });
});

// ── Opt-out ───────────────────────────────────────────────────────────────────
// Recovery is business-initiated marketing, so a caller who asked to be removed
// must not receive it — the same suppression list the broadcast honours.
describe('marketing opt-out', () => {
  beforeEach(() => mockOptedOut.clear());
  afterEach(() => mockOptedOut.clear());

  test('a caller who opted out gets no recovery message', async () => {
    mockOptedOut.add('972501111111');

    await post(cdrBody('+972501111111'));
    await flush();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  test('other callers are unaffected by someone else opting out', async () => {
    mockOptedOut.add('972509999999');

    await post(cdrBody('+972501111111'));
    await flush();

    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
  });
});
