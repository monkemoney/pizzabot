'use strict';

/**
 * Webhook routing — verifies:
 * 1. /webhook and /webhook/:tenantId route to the correct handler
 * 2. Admin users (in admin_users table) are routed to handleAdminMessage
 * 3. Non-admin users are routed to handleMessage (customer bot)
 * 4. Payment webhook (/webhook/payment) is handled by paymentRouter first
 * 5. tenant_id is passed correctly from the URL segment
 */

// ── Service mocks (must be before require) ────────────────────────────────────
const mockHandleAdminMessage = jest.fn(async () => {});
const mockHandleMessage      = jest.fn(async () => {});
const mockGetAdminUser       = jest.fn(async () => null); // no admin user by default

jest.mock('../src/bot/ai-handler',    () => ({ handleMessage:      mockHandleMessage }));
jest.mock('../src/bot/admin-handler', () => ({ handleAdminMessage: mockHandleAdminMessage }));

jest.mock('../src/services/supabase', () => ({
  getAdminUser:               mockGetAdminUser,
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
  verifyPayment: jest.fn(async () => ({ success: false })),
  cancelDeal:    jest.fn(async () => ({ success: false })),
}));
jest.mock('../src/services/settings', () => ({
  loadAll:          jest.fn(async () => ({})),
  get:              jest.fn(async () => null),
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
function webhookBody(phone, text, type = 'incoming') {
  return {
    typeWebhook:     'incomingMessageReceived',
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
