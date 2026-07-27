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
  setOptedOut:                 jest.fn(async () => {}),
  getOptedOutPhones:           jest.fn(async () => new Set()),
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
            deliveryFailed: jest.fn(async () => {}),
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

  test('bot-handled message ALSO stamps the feed + broadcasts — without unread increment', async () => {
    mockGetSession.mockResolvedValue({
      phone: '972501111111', is_bot_active: true, unread_count: 2,
      conversation_history: [], updated_at: new Date().toISOString(),
    });

    await handleMessage('972501111111', 'מה בתפריט?', TID);

    const stamp = mockUpdateSession.mock.calls.find(c => c[1].last_customer_message);
    expect(stamp).toBeDefined();
    expect(stamp[1].last_customer_message).toBe('מה בתפריט?');
    expect(stamp[1].last_message_at).toBeTruthy();
    expect(stamp[1].unread_count).toBeUndefined(); // bot answered it — not "unread"

    expect(mockBroadcast).toHaveBeenCalledWith(TID, 'inbox_message',
      expect.objectContaining({ phone: '972501111111', is_bot_active: true, unread_count: 2 }));
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

// ── The handoff must be visible to the customer and must have an exit ────────
// Before this, the bot simply went mute mid-conversation and, if the agent
// never came back, stayed mute until the 90-day session prune.
describe('handoff is explained to the customer', () => {
  test('taking over tells the customer a human is joining', async () => {
    await request(app).post('/api/inbox/972501111111/handoff')
      .set('Authorization', `Bearer ${adminToken()}`).expect(200);

    const msg = mockSendMessage.mock.calls.find(c => c[0] === '972501111111');
    expect(msg).toBeDefined();
    expect(msg[1]).toContain('נציג');
    expect(msg[2]).toBe(TID);
  });

  test('handing back tells the customer the bot is available again', async () => {
    await request(app).post('/api/inbox/972501111111/return')
      .set('Authorization', `Bearer ${adminToken()}`).expect(200);

    const msg = mockSendMessage.mock.calls.find(c => c[0] === '972501111111');
    expect(msg[1]).toContain('להזמין');
  });

  test('notify_customer:false stays silent (bot already spoke, agent takes over quietly)', async () => {
    await request(app).post('/api/inbox/972501111111/handoff')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ notify_customer: false }).expect(200);

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test('an agent reply restarts the handoff clock so the watchdog cannot cut in', async () => {
    mockGetSession.mockResolvedValue({ phone: '972501111111', conversation_history: [] });
    await request(app).post('/api/inbox/972501111111/reply')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ message: 'כבר בודק' }).expect(200);

    const updates = mockUpdateSession.mock.calls[0][1];
    expect(updates.handoff_at).toBeTruthy();
    expect(updates.handoff_alerted_at).toBeNull();
    // and other agents see it
    expect(mockBroadcast).toHaveBeenCalledWith(TID, 'inbox_message',
      expect.objectContaining({ from: 'agent' }));
  });
});

// ── Marketing opt-out ─────────────────────────────────────────────────────────
// Commercial messaging with no way out is a legal exposure, not just bad UX.
// The keyword is handled deterministically and before everything else: it has
// to work while an agent holds the conversation and outside business hours.
describe('opt-out keyword', () => {
  const { handleMessage } = require('../src/bot/ai-handler');
  const supa = require('../src/services/supabase');

  test('"הסר" opts the customer out and confirms, without reaching Claude', async () => {
    mockGetSession.mockResolvedValue({ phone: '972501111111', conversation_history: [], pending_order: {} });

    await handleMessage('972501111111', 'הסר', TID);

    expect(supa.setOptedOut).toHaveBeenCalledWith('972501111111', true, TID);
    const msg = mockSendMessage.mock.calls.find(c => c[0] === '972501111111');
    expect(msg[1]).toContain('הוסרת');
  });

  test('opt-out works even while a human agent holds the conversation', async () => {
    mockGetSession.mockResolvedValue({
      phone: '972501111111', conversation_history: [], pending_order: {}, is_bot_active: false,
    });

    await handleMessage('972501111111', 'stop', TID);

    expect(supa.setOptedOut).toHaveBeenCalledWith('972501111111', true, TID);
  });

  test('"הסר" inside a sentence is NOT an unsubscribe', async () => {
    mockGetSession.mockResolvedValue({ phone: '972501111111', conversation_history: [], pending_order: {} });

    await handleMessage('972501111111', 'תסיר לי את הזיתים מהפיצה', TID);

    expect(supa.setOptedOut).not.toHaveBeenCalled();
  });

  test('an opted-out customer can come back with "הצטרף"', async () => {
    mockGetSession.mockResolvedValue({
      phone: '972501111111', conversation_history: [], pending_order: {}, opted_out: true,
    });

    await handleMessage('972501111111', 'הצטרף', TID);

    expect(supa.setOptedOut).toHaveBeenCalledWith('972501111111', false, TID);
  });
});

// ── Delivery integrity ────────────────────────────────────────────────────────
// reply() used to swallow every send failure, so a rejected message still had
// its text written into conversation_history as though the customer had read
// it — and Claude reasoned from that fiction on the next turn.
describe('a failed send is not recorded as delivered', () => {
  const { handleMessage } = require('../src/bot/ai-handler');
  const { callClaude } = require('../src/services/claude');

  test('the assistant turn is left out of history when the send fails', async () => {
    mockGetSession.mockResolvedValue({ phone: '972501111111', conversation_history: [{ role: 'user', content: 'קודם' }], pending_order: {}, updated_at: new Date().toISOString() });
    callClaude.mockResolvedValue('הנה התפריט שלנו');
    mockSendMessage.mockRejectedValueOnce(new Error('#131026 recipient not on WhatsApp'));

    await handleMessage('972501111111', 'מה יש לכם?', TID);

    const withHistory = mockUpdateSession.mock.calls.map(c => c[1]).filter(u => u.conversation_history);
    const saved = withHistory.at(-1);
    expect(saved).toBeDefined();
    const roles = saved.conversation_history.map(m => m.role);
    expect(roles.filter(r => r === 'assistant')).toHaveLength(0);
    expect(saved.conversation_history.at(-1)).toEqual({ role: 'user', content: 'מה יש לכם?' });
  });

  test('a successful send is recorded normally', async () => {
    mockGetSession.mockResolvedValue({ phone: '972501111111', conversation_history: [{ role: 'user', content: 'קודם' }], pending_order: {}, updated_at: new Date().toISOString() });
    callClaude.mockResolvedValue('הנה התפריט שלנו');
    mockSendMessage.mockResolvedValue(undefined);

    await handleMessage('972501111111', 'מה יש לכם?', TID);

    const withHistory = mockUpdateSession.mock.calls.map(c => c[1]).filter(u => u.conversation_history);
    const saved = withHistory.at(-1);
    expect(saved.conversation_history.at(-1)).toEqual({ role: 'assistant', content: 'הנה התפריט שלנו' });
  });
});
