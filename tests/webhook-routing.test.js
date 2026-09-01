'use strict';

/**
 * Webhook routing — verifies:
 * 1. /webhook and /webhook/:tenantId route to the correct handler
 * 2. Admin users (in admin_users table) are routed to handleAdminMessage
 * 3. Non-admin users are routed to handleMessage (customer bot)
 * 4. Payment webhook (/webhook/payment) is handled by paymentRouter first
 * 5. tenant_id is passed correctly from the URL segment
 */

// Green API's only authentication is the instance id in the payload, so the
// routing tests need one configured to be accepted at all.
process.env.GREEN_API_INSTANCE_ID = 'test-instance-1';

// This suite tests ROUTING, not signatures — its Meta payloads are unsigned.
// Signature verification enforces whenever META_APP_SECRET is set, so a
// developer who sources .env.production before running the tests got 403s and
// four red tests that are green in CI. A test that only passes when a variable
// happens to be absent is a test whose result depends on who ran it: state the
// environment the suite needs rather than assuming an empty one.
delete process.env.META_APP_SECRET;
const TEST_INSTANCE = process.env.GREEN_API_INSTANCE_ID;

// ── Service mocks (must be before require) ────────────────────────────────────
const mockHandleAdminMessage = jest.fn(async () => {});
const mockHandleMessage      = jest.fn(async () => {});
const mockResolveMetaTenant  = jest.fn(async () => null);
const mockGetAdminUser       = jest.fn(async () => null); // no admin user by default

jest.mock('../src/bot/ai-handler',    () => ({ handleMessage:      mockHandleMessage }));
jest.mock('../src/bot/admin-handler', () => ({ handleAdminMessage: mockHandleAdminMessage }));

jest.mock('../src/services/supabase', () => ({
  getAdminUser:               mockGetAdminUser,
  resolveTenantByMetaPhoneId: mockResolveMetaTenant,
  getSession:                 jest.fn(async () => ({ conversation_history: [], pending_order: {} })),
  updateSession:              jest.fn(async () => {}),
  getAllPendingPayments:       jest.fn(async () => []),
  autoCompleteDeliveredOrders: jest.fn(async () => {}),
  pruneOldSessions:            jest.fn(async () => {}),
}));

jest.mock('../src/services/greenapi',       () => ({ sendMessage: jest.fn(async () => {}), formatPhone: (raw) => raw.replace(/[^0-9]/g, ''), toChatId: (p) => `${p}@c.us` }));
jest.mock('../src/services/vendor-alerts',  () => ({ alert: jest.fn(async () => {}), alerts: { serverError: jest.fn(async () => {}), serverRestart: jest.fn(async () => {}), onboardingComplete: jest.fn(async () => {}) } }));
jest.mock('../src/services/push-notifier',  () => ({ notifyNewOrder: jest.fn(async () => {}), saveSubscription: jest.fn() }));
jest.mock('../src/services/cardcom',        () => ({
  readCallbackOutcome: jest.fn(() => ({ success: false, hasCode: false })),
  cancelDeal:          jest.fn(async () => ({ success: false })),
}));
jest.mock('../src/services/settings', () => ({
  loadAll:          jest.fn(async () => ({})),
  get:              jest.fn(async (key) => (key === 'green_api_instance' ? 'test-instance-1' : null)),
  isOpen:           jest.fn(async () => true),
  set:              jest.fn(async () => {}),
  _clearCache:      jest.fn(),
  DEFAULT_TENANT_ID:'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('../src/services/menu-service',      () => ({ getMenu: jest.fn(async () => []), invalidateCache: jest.fn() }));
jest.mock('../src/services/status-notifier',   () => ({ notifyStatusChange: jest.fn(async () => {}) }));

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

let app;
beforeAll(() => {
  app = require('../src/index');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAdminUser.mockResolvedValue(null); // default: customer
});

// ── Helper: build a minimal Green API webhook body ────────────────────────────
// instanceData is the only authentication Green API offers, so a payload
// without it is rejected — see the "unauthenticated payloads" tests below.
function webhookBody(phone, text, instanceId = process.env.GREEN_API_INSTANCE_ID) {
  return {
    typeWebhook:     'incomingMessageReceived',
    instanceData:    instanceId ? { idInstance: instanceId } : undefined,
    senderData:      { sender: `${phone}@c.us`, chatId: `${phone}@c.us`, senderName: 'Test' },
    messageData:     { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
  };
}

// ── Customer routing ──────────────────────────────────────────────────────────
describe('POST /webhook — customer routing', () => {
  test('non-admin sender goes to handleMessage', async () => {
    mockGetAdminUser.mockResolvedValue(null);

    await request(app)
      .post('/webhook')
      .send(webhookBody('972501111111', 'שלום'))
      .expect(200);

    // Give the async chain time to resolve
    await new Promise(r => setImmediate(r));

    expect(mockHandleMessage).toHaveBeenCalledWith(
      '972501111111', 'שלום',
      expect.any(String) // tenantId
    );
    expect(mockHandleAdminMessage).not.toHaveBeenCalled();
  });
});

// ── Admin routing ─────────────────────────────────────────────────────────────
describe('POST /webhook — admin routing', () => {
  test('admin sender goes to handleAdminMessage', async () => {
    const adminUser = { id: 'au-1', name: 'מנהל', phone: '972502222222', role: 'admin' };
    mockGetAdminUser.mockResolvedValue(adminUser);

    await request(app)
      .post('/webhook')
      .send(webhookBody('972502222222', 'הזמנות?'))
      .expect(200);

    await new Promise(r => setImmediate(r));

    expect(mockHandleAdminMessage).toHaveBeenCalledWith(
      '972502222222', 'הזמנות?', adminUser, expect.any(String)
    );
    expect(mockHandleMessage).not.toHaveBeenCalled();
  });
});

// ── Per-tenant webhook routing ─────────────────────────────────────────────────
describe('POST /webhook/:tenantId — per-tenant routing', () => {
  test('tenant ID from URL is passed to getAdminUser and handlers', async () => {
    const tenantId = 'cccccccc-1111-2222-3333-444444444444';

    await request(app)
      .post(`/webhook/${tenantId}`)
      .send(webhookBody('972503333333', 'הזמנה'))
      .expect(200);

    await new Promise(r => setImmediate(r));

    // getAdminUser must be called with the tenant from the URL
    expect(mockGetAdminUser).toHaveBeenCalledWith('972503333333', tenantId);
    // Customer handler should receive the tenant ID
    expect(mockHandleMessage).toHaveBeenCalledWith('972503333333', 'הזמנה', tenantId);
  });

  test('tenant-A message does not bleed into tenant-B routing', async () => {
    const tenantA = 'aaaaaaaa-1111-0000-0000-000000000000';
    const tenantB = 'bbbbbbbb-2222-0000-0000-000000000000';

    await request(app).post(`/webhook/${tenantA}`).send(webhookBody('972501111111', 'A')).expect(200);
    await new Promise(r => setImmediate(r));

    const callsA = mockHandleMessage.mock.calls.filter(c => c[2] === tenantA);
    const callsB = mockHandleMessage.mock.calls.filter(c => c[2] === tenantB);
    expect(callsA).toHaveLength(1);
    expect(callsB).toHaveLength(0);
  });
});

// ── Non-message webhooks are ignored ─────────────────────────────────────────
describe('ignored webhook types', () => {
  test('outgoing message webhooks are not processed', async () => {
    await request(app)
      .post('/webhook')
      .send({ typeWebhook: 'outgoingMessageStatus', status: 'sent' })
      .expect(200);

    await new Promise(r => setImmediate(r));

    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleAdminMessage).not.toHaveBeenCalled();
  });
});


// ── Meta Cloud API multi-tenant routing ───────────────────────────────────────
function metaBody(phone, text, phoneNumberId) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: phoneNumberId },
          messages: [{ from: phone, type: 'text', text: { body: text } }],
        },
      }],
    }],
  };
}

describe('POST /webhook — Meta multi-tenant routing', () => {
  test('unknown phone_number_id resolves tenant via settings lookup', async () => {
    mockResolveMetaTenant.mockResolvedValue('tenant-pilot-1');

    await request(app)
      .post('/webhook')
      .send(metaBody('972502222222', 'הי', 'PNID-PILOT'))
      .expect(200);
    await new Promise(r => setImmediate(r));

    expect(mockResolveMetaTenant).toHaveBeenCalledWith('PNID-PILOT');
    expect(mockHandleMessage).toHaveBeenCalledWith('972502222222', 'הי', 'tenant-pilot-1');
  });

  test('unresolvable phone_number_id is dropped without handling', async () => {
    mockResolveMetaTenant.mockResolvedValue(null);

    await request(app)
      .post('/webhook')
      .send(metaBody('972503333333', 'הי', 'PNID-UNKNOWN'))
      .expect(200);
    await new Promise(r => setImmediate(r));

    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleAdminMessage).not.toHaveBeenCalled();
  });

  test('admin sender on a Meta tenant goes to handleAdminMessage', async () => {
    mockResolveMetaTenant.mockResolvedValue('tenant-pilot-1');
    mockGetAdminUser.mockResolvedValue({ phone: '972504444444', name: 'מנהל', role: 'admin' });

    await request(app)
      .post('/webhook')
      .send(metaBody('972504444444', 'נגמרה בולגרית', 'PNID-PILOT'))
      .expect(200);
    await new Promise(r => setImmediate(r));

    expect(mockHandleAdminMessage).toHaveBeenCalledWith(
      '972504444444', 'נגמרה בולגרית',
      expect.objectContaining({ role: 'admin' }), 'tenant-pilot-1', null
    );
  });
});

// ── Webhook authentication ────────────────────────────────────────────────────
// These are regression tests for a live hole: the Green API check was written
// as `if (instanceId && ...)`, so omitting instanceData skipped verification
// entirely and any sender — including one claiming to be an admin — was handled.
describe('unauthenticated payloads are rejected', () => {
  test('Green payload with no instanceData is dropped', async () => {
    await request(app)
      .post('/webhook')
      .send(webhookBody('972501111111', 'שלום', null))
      .expect(200);
    await new Promise(r => setImmediate(r));

    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleAdminMessage).not.toHaveBeenCalled();
  });

  test('forged admin message with no instanceData never reaches the admin bot', async () => {
    mockGetAdminUser.mockResolvedValue({ phone: '972504444444', name: 'מנהל', role: 'admin' });

    await request(app)
      .post('/webhook')
      .send(webhookBody('972504444444', 'בטל הזמנה 1042', null))
      .expect(200);
    await new Promise(r => setImmediate(r));

    expect(mockHandleAdminMessage).not.toHaveBeenCalled();
  });

  test('Green payload from a different instance is dropped', async () => {
    await request(app)
      .post('/webhook')
      .send(webhookBody('972501111111', 'שלום', 'someone-elses-instance'))
      .expect(200);
    await new Promise(r => setImmediate(r));

    expect(mockHandleMessage).not.toHaveBeenCalled();
  });

  test('per-tenant route drops a payload whose instance is not that tenant', async () => {
    await request(app)
      .post('/webhook/tenant-xyz')
      .send(webhookBody('972501111111', 'שלום', 'not-the-tenant-instance'))
      .expect(200);
    await new Promise(r => setImmediate(r));

    expect(mockHandleMessage).not.toHaveBeenCalled();
  });
});
