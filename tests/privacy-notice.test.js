'use strict';

/**
 * privacy-notice.test.js
 *
 * The privacy-policy link is sent ONCE PER CUSTOMER LIFETIME (sessions.privacy_sent_at),
 * not once per conversation. A conversation reset (3h staleness / post-order clear)
 * must NOT re-send it; only a brand-new customer gets it, and the stamp is written
 * only after a delivered send.
 */

const mockSendMessage   = jest.fn(async () => ({}));
const mockGetSession    = jest.fn();
const mockUpdateSession = jest.fn(async () => {});
const mockCallClaude    = jest.fn(async () => 'שלום! מה תרצה להזמין?');

jest.mock('../src/services/supabase', () => ({
  getSession:                  mockGetSession,
  updateSession:               mockUpdateSession,
  getAdminUser:                jest.fn(async () => null),
  getLastOrderByPhone:         jest.fn(async () => null),
  saveOrder:                   jest.fn(async () => ({ orderNumber: 1001 })),
  savePendingPayment:          jest.fn(async () => {}),
  saveCustomerProfile:         jest.fn(async () => {}),
  getCustomerProfile:          jest.fn(async () => null),
  getOrderById:                jest.fn(async () => null),
  updateOrderStatus:           jest.fn(async () => ({})),
  updateOrder:                 jest.fn(async () => ({})),
  setOptedOut:                 jest.fn(async () => {}),
}));

jest.mock('../src/services/greenapi', () => ({
  sendMessage:      mockSendMessage,
  sendToppingsPoll: jest.fn(async () => {}),
  formatPhone:      (raw) => raw.replace(/[^0-9]/g, ''),
  toChatId:         (p) => `${p}@c.us`,
}));

jest.mock('../src/services/claude', () => ({ callClaude: mockCallClaude }));
jest.mock('../src/bot/prompts',     () => ({ buildSystemPrompt: async () => 'SYSTEM PROMPT' }));
jest.mock('../src/services/sse',    () => ({ broadcast: jest.fn(), subscribe: jest.fn() }));
jest.mock('../src/services/vendor-alerts', () => ({
  alert: jest.fn(async () => {}),
  alerts: { botError: jest.fn(async () => {}), deliveryFailed: jest.fn(async () => {}) },
}));
jest.mock('../src/services/settings', () => ({
  loadAll:        jest.fn(async () => ({ business_name: 'טסט פיצה', public_slug: 'test' })),
  get:            jest.fn(async () => null),
  set:            jest.fn(async () => {}),
  isOpen:         jest.fn(async () => true),
  isDeliveryOpen: jest.fn(async () => true),
  DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: [] }), in: async () => ({ data: [] }) }),
    }),
  }),
}));

const { handleMessage } = require('../src/bot/ai-handler');

const TID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PRIVACY_MARK = 'מדיניות הפרטיות';

function makeSession(overrides = {}) {
  return {
    phone: '972500000001',
    tenant_id: TID,
    conversation_history: [],
    pending_order: {},
    is_bot_active: true,
    unread_count: 0,
    customer_profile: {},
    ...overrides,
  };
}

function sentTexts() {
  return mockSendMessage.mock.calls.map((c) => c[1]).join('\n===\n');
}

function privacyStampCalls() {
  return mockUpdateSession.mock.calls.filter((c) => c[1] && c[1].privacy_sent_at);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('privacy notice — once per customer lifetime', () => {
  test('new customer (no privacy_sent_at): first reply includes the notice and stamps the session', async () => {
    mockGetSession.mockResolvedValue(makeSession({ privacy_sent_at: null }));

    await handleMessage('972500000001', 'היי', TID);

    expect(sentTexts()).toContain(PRIVACY_MARK);
    expect(privacyStampCalls().length).toBe(1);
  });

  test('returning customer (privacy_sent_at set): fresh conversation gets NO notice and no re-stamp', async () => {
    mockGetSession.mockResolvedValue(makeSession({ privacy_sent_at: '2026-07-01T10:00:00Z' }));

    await handleMessage('972500000001', 'היי, אפשר להזמין?', TID);

    expect(mockSendMessage).toHaveBeenCalled();          // bot still greets
    expect(sentTexts()).not.toContain(PRIVACY_MARK);     // but no privacy link
    expect(privacyStampCalls().length).toBe(0);
  });

  test('mid-conversation message never carries the notice', async () => {
    mockGetSession.mockResolvedValue(makeSession({
      privacy_sent_at: null,
      updated_at: new Date().toISOString(), // fresh — keep the stale-session guard out
      conversation_history: [
        { role: 'user', content: 'היי' },
        { role: 'assistant', content: 'שלום! משלוח או איסוף?' },
      ],
    }));

    await handleMessage('972500000001', 'איסוף', TID);

    expect(sentTexts()).not.toContain(PRIVACY_MARK);
    expect(privacyStampCalls().length).toBe(0);
  });

  test('failed send does NOT stamp — notice retries on the next conversation', async () => {
    mockGetSession.mockResolvedValue(makeSession({ privacy_sent_at: null }));
    mockSendMessage.mockRejectedValueOnce(new Error('channel down'));

    await handleMessage('972500000001', 'היי', TID);

    expect(privacyStampCalls().length).toBe(0);
  });
});
