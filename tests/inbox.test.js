'use strict';

/**
 * inbox.test.js
 *
 * Human-agent handoff: when a conversation is handed to an agent the bot must
 * go silent (no Claude call, message lands in the inbox via SSE), agent
 * replies go out through the tenant's channel, and returning control
 * re-enables the bot. A regression here = customers talking to a wall.
 */

const mockGetAdminUser  = jest.fn(async () => null);
const mockSendMessage   = jest.fn(async () => ({}));
const mockGetSession    = jest.fn();
const mockUpdateSession = jest.fn(async () => {});
const mockSetBotActive  = jest.fn(async () => {});
const mockMarkRead      = jest.fn(async () => {});
const mockGetInbox      = jest.fn(async () => []);
const mockBroadcast     = jest.fn();
const mockCallClaude    = jest.fn(async () => 'תשובת בוט');

jest.mock('../src/services/supabase', () => ({
  getAdminUser:                mockGetAdminUser,
  getSession:                  mockGetSession,
  updateSession:               mockUpdateSession,
  setBotActive:                mockSetBotActive,
  markInboxRead:               mockMarkRead,
  getInboxSessions:            mockGetInbox,
  resolveTenantByMetaPhoneId:  jest.fn(async () => null),
  getAllPendingPayments:       jest.fn(async () => []),
  autoCompleteDeliveredOrders: jest.fn(async () => {}),
  pruneOldSessions:            jest.fn(async () => {}),
  getLastOrderByPhone:         jest.fn(async () => null),
  saveOrder:                   jest.fn(async () => ({ orderNumber: 1001 })),
  savePendingPayment:          jest.fn(async () => {}),
  saveCustomerProfile:         jest.fn(async () => {}),
  getCustomerProfile:          jest.fn(async () => null),
  getOrderById:                jest.fn(async () => null),
  updateOrderStatus:           jest.fn(async () => ({})),
  updateOrder:                 jest.fn(async () => ({})),
}));

jest.mock('../src/services/greenapi', () => ({
  sendMessage:      mockSendMessage,
  sendToppingsPoll: jest.fn(async () => {}),
  formatPhone:      (raw) => raw.replace(/[^0-9]/g, ''),
  toChatId:         (p) => `${p}@c.us`,
}));

jest.mock('../src/services/claude',        () => ({ callClaude: mockCallClaude }));
jest.mock('../src/services/sse',           () => ({ broadcast: mockBroadcast, subscribe: jest.fn() }));
jest.mock('../src/services/vendor-alerts', () => ({
  alert: jest.fn(async () => {}),
  alerts: { serverError: jest.fn(async () => {}), serverRestart: jest.fn(async () => {}),
            botError: jest.fn(async () => {}), onboardingComplete: jest.fn(async () => {}) },
}));
jest.mock('../src/services/settings', () => ({
  loadAll:        jest.fn(async () => ({})),
  get:            jest.fn(async () => null),
  set:            jest.fn(async () => {}),
  isOpen:         jest.fn(async () => true),
  isDeliveryOpen: jest.fn(async () => true),
  _clearCache:    jest.fn(),
  DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const b = { eq: () => b, neq: () => b, in: () => b, not: () => b, or: () => b,
                    order: async () => ({ data: [], error: null }),
                    limit: async () => ({ data: [], error: null }),
                    single: async () => ({ data: null, error: null }) };
        return b;
      },
      update: () => ({ eq: () => ({ error: null }) }),
      upsert: () => ({ error: null }),
    }),
  }),
}));

const request = require('supertest');
const { signDashboard } = require('../src/middleware/auth');
const { handleMessage } = require('../src/bot/ai-handler');

let app;
beforeAll(() => { app = require('../src/index'); });
beforeEach(() => jest.clearAllMocks());

const TID = 'aaaaaaaa-0000-0000-0000-000000000001';
const adminToken = () => signDashboard('admin', 'admin', TID);

// ── Bot silencing (the core of the feature) ───────────────────────────────────
describe('ai-handler — human handoff intercept', () => {
  test('is_bot_active=false → message saved, unread++, SSE fired, Claude NOT called', async () => {
    mockGetSession.mockResolvedValue({
      phone: '972501111111', is_bot_active: false, unread_count: 2,
      conversation_history: [{ role: 'assistant', content: 'שלום' }],
    });

    await handleMessage('972501111111', 'אני רוצה לדבר עם מישהו', TID);

    expect(mockCallClaude).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled(); // bot stays silent

    const [phone, updates, tid] = mockUpdateSession.mock.calls[0];
    expect(phone).toBe('972501111111');
    expect(tid).toBe(TID);
    expect(updates.unread_count).toBe(3);
    expect(updates.last_customer_message).toBe('אני רוצה לדבר עם מישהו');
    expect(updates.conversation_history.at(-1)).toEqual({ role: 'user', content: 'אני רוצה לדבר עם מישהו' });

    expect(mockBroadcast).toHaveBeenCalledWith(TID, 'inbox_message',
      expect.objectContaining({ phone: '972501111111', unread_count: 3 }));
  });

  test('is_bot_active=true → normal flow reaches Claude', async () => {
    mockGetSession.mockResolvedValue({
      phone: '972501111111', is_bot_active: true, conversation_history: [{ role: 'user', content: 'הי' }],
      updated_at: new Date().toISOString(),
    });

    await handleMessage('972501111111', 'מה בתפריט?', TID);
    expect(mockCallClaude).toHaveBeenCalled();
  });
});

// ── Inbox API ─────────────────────────────────────────────────────────────────
describe('inbox API', () => {
  test('GET /api/inbox requires auth', async () => {
    await request(app).get('/api/inbox').expect(401);
  });

  test('GET /api/inbox returns tenant sessions', async () => {
    mockGetInbox.mockResolvedValue([{ phone: '972501111111', unread_count: 1 }]);
    const res = await request(app).get('/api/inbox')
      .set('Authorization', `Bearer ${adminToken()}`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(mockGetInbox).toHaveBeenCalledWith(TID);
  });

  test('handoff silences the bot for the right tenant + broadcasts', async () => {
    await request(app).post('/api/inbox/972501111111/handoff')
      .set('Authorization', `Bearer ${adminToken()}`).expect(200);
    expect(mockSetBotActive).toHaveBeenCalledWith('972501111111', false, TID);
    expect(mockBroadcast).toHaveBeenCalledWith(TID, 'inbox_update',
      expect.objectContaining({ is_bot_active: false }));
  });

  test('return re-enables the bot', async () => {
    await request(app).post('/api/inbox/972501111111/return')
      .set('Authorization', `Bearer ${adminToken()}`).expect(200);
    expect(mockSetBotActive).toHaveBeenCalledWith('972501111111', true, TID);
  });

  test('reply sends via tenant channel and appends [נציג] to history', async () => {
    mockGetSession.mockResolvedValue({ phone: '972501111111', conversation_history: [] });
    await request(app).post('/api/inbox/972501111111/reply')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ message: 'כאן נציג, איך אפשר לעזור?' }).expect(200);

    expect(mockSendMessage).toHaveBeenCalledWith('972501111111', 'כאן נציג, איך אפשר לעזור?', TID);
    const updates = mockUpdateSession.mock.calls[0][1];
    expect(updates.conversation_history.at(-1)).toEqual({ role: 'assistant', content: '[נציג]: כאן נציג, איך אפשר לעזור?' });
  });

  test('reply without message → 400', async () => {
    await request(app).post('/api/inbox/972501111111/reply')
      .set('Authorization', `Bearer ${adminToken()}`).send({}).expect(400);
  });

  test('read clears unread counter', async () => {
    await request(app).post('/api/inbox/972501111111/read')
      .set('Authorization', `Bearer ${adminToken()}`).expect(200);
    expect(mockMarkRead).toHaveBeenCalledWith('972501111111', TID);
  });
});
