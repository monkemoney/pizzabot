'use strict';

/**
 * Payment webhook — tests the confirmPending() function and the
 * POST /webhook/payment endpoint (Cardcom IndicatorUrl).
 */

// ── Mutable state (prefixed mock* so Jest allows them in factory closures) ────
let mockPendingStore  = {};
const mockSavedOrders = [];
const mockSentMessages= [];
let mockVerifyResult  = { success: true };

// ── Service mocks ─────────────────────────────────────────────────────────────
jest.mock('../src/services/cardcom', () => ({
  verifyPayment:     jest.fn(async () => mockVerifyResult),
  cancelDeal:        jest.fn(async () => ({ success: false })),
  createPaymentPage: jest.fn(async () => ({ url: 'https://cardcom.test', code: 'CODE123' })),
}));

jest.mock('../src/services/supabase', () => ({
  getPendingByCardcomCode: jest.fn(async (code) =>
    Object.values(mockPendingStore).find(p => p.cardcom_code === code) || null
  ),
  getPendingByReturnValue: jest.fn(async (rv) =>
    Object.values(mockPendingStore).find(p => p.return_value === rv) || null
  ),
  getAllPendingPayments:        jest.fn(async () => Object.values(mockPendingStore)),
  deletePendingPayment:        jest.fn(async (id) => { delete mockPendingStore[id]; }),
  saveOrder:                   jest.fn(async (data) => {
    const orderNumber = 1000 + mockSavedOrders.length;
    mockSavedOrders.push({ ...data, orderNumber });
    return { id: `ord-${orderNumber}`, orderNumber };
  }),
  getAdminUser:                jest.fn(async () => null),
  getSession:                  jest.fn(async () => ({ conversation_history: [], pending_order: {} })),
  updateSession:               jest.fn(async () => {}),
  autoCompleteDeliveredOrders: jest.fn(async () => {}),
  pruneOldSessions:            jest.fn(async () => {}),
}));

jest.mock('../src/services/greenapi', () => ({
  sendMessage:  jest.fn(async (phone, text) => { mockSentMessages.push({ phone, text }); }),
  formatPhone:  (raw) => raw.replace(/[^0-9]/g, ''),
  toChatId:     (p)   => `${p}@c.us`,
}));

jest.mock('../src/services/vendor-alerts',  () => ({ alert: jest.fn(async () => {}), alerts: { serverRestart: jest.fn(async () => {}), serverError: jest.fn(async () => {}) } }));
jest.mock('../src/services/push-notifier',  () => ({ notifyNewOrder: jest.fn(async () => {}), saveSubscription: jest.fn() }));
jest.mock('../src/services/settings',       () => ({ loadAll: jest.fn(async () => ({})), get: jest.fn(async () => null), isOpen: jest.fn(async () => true), _clearCache: jest.fn(), DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001' }));
jest.mock('../src/services/menu-service',   () => ({ getMenu: jest.fn(async () => []), invalidateCache: jest.fn() }));
jest.mock('../src/services/status-notifier',() => ({ notifyStatusChange: jest.fn(async () => {}) }));
jest.mock('../src/bot/ai-handler',          () => ({ handleMessage:      jest.fn(async () => {}) }));
jest.mock('../src/bot/admin-handler',       () => ({ handleAdminMessage: jest.fn(async () => {}) }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Object.assign(Promise.resolve({ error: null }), { select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
      upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      delete: () => ({ eq: () => ({ error: null }) }),
      limit:  async () => ({ data: [], error: null }),
    }),
  }),
}));

const request = require('supertest');
const app = require('../src/index');

function makePending(overrides = {}) {
  const id = `pending-${Date.now()}-${Math.random()}`;
  const p = {
    id,
    phone:        '972501234567',
    cardcom_code: 'CODE-001',
    return_value: 'PB-0001',
    order_data: {
      customer_name:   'ישראל ישראלי',
      items:           [{ name: 'פיצה', qty: 1, price: 60 }],
      delivery_method: 'delivery',
      address:         'תל אביב',
      total:           60,
    },
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    ...overrides,
  };
  mockPendingStore[id] = p;
  return p;
}

beforeEach(() => {
  mockPendingStore  = {};
  mockSavedOrders.length  = 0;
  mockSentMessages.length = 0;
  mockVerifyResult        = { success: true };
  jest.clearAllMocks();
});

// ── POST /webhook/payment ─────────────────────────────────────────────────────
describe('POST /webhook/payment — Cardcom IndicatorUrl', () => {
  test('creates order and notifies customer on success', async () => {
    const p = makePending({ cardcom_code: 'CODE-SUCCESS', return_value: 'PB-SUCCESS' });

    await request(app)
      .post('/webhook/payment')
      .type('form')
      .send({ LowProfileCode: 'CODE-SUCCESS', DealNumber: 'DN-42' })
      .expect(200);

    await new Promise(r => setTimeout(r, 50));

    expect(mockSavedOrders).toHaveLength(1);
    expect(mockSavedOrders[0].cardcom_deal_number).toBe('DN-42');
    expect(mockSavedOrders[0].payment_status).toBe('paid');

    const notif = mockSentMessages.find(s => s.phone === p.phone && s.text.includes('הזמנה'));
    expect(notif).toBeDefined();
  });

  test('does not create order when verification fails', async () => {
    makePending({ cardcom_code: 'CODE-FAIL' });
    mockVerifyResult = { success: false, responseCode: 1 };

    await request(app)
      .post('/webhook/payment')
      .type('form')
      .send({ LowProfileCode: 'CODE-FAIL' })
      .expect(200);

    await new Promise(r => setTimeout(r, 50));

    expect(mockSavedOrders).toHaveLength(0);
  });

  test('saves DealNumber as cardcom_deal_number', async () => {
    makePending({ cardcom_code: 'CODE-DEAL', return_value: 'PB-DEAL' });

    await request(app)
      .post('/webhook/payment')
      .type('form')
      .send({ LowProfileCode: 'CODE-DEAL', DealNumber: 'DN-999' })
      .expect(200);

    await new Promise(r => setTimeout(r, 50));

    expect(mockSavedOrders[0].cardcom_deal_number).toBe('DN-999');
  });

  test('ignores webhook with no code or return value', async () => {
    await request(app)
      .post('/webhook/payment')
      .type('form')
      .send({ Operation: 'LowProfile', SomeOtherField: 'x' })
      .expect(200);

    await new Promise(r => setTimeout(r, 50));

    expect(mockSavedOrders).toHaveLength(0);
  });

  test('falls back to ReturnValue lookup when LowProfileCode not found', async () => {
    makePending({ cardcom_code: 'DIFFERENT', return_value: 'PB-RV-FALLBACK' });

    await request(app)
      .post('/webhook/payment')
      .type('form')
      .send({ ReturnValue: 'PB-RV-FALLBACK' })
      .expect(200);

    await new Promise(r => setTimeout(r, 50));

    expect(mockSavedOrders).toHaveLength(1);
  });
});

// ── GET /payment/success ──────────────────────────────────────────────────────
describe('GET /payment/success', () => {
  test('confirms pending by rv= param and shows success page', async () => {
    makePending({ cardcom_code: 'CODE-SR', return_value: 'PB-SR-001' });

    const res = await request(app)
      .get('/payment/success?rv=PB-SR-001')
      .expect(200);

    await new Promise(r => setTimeout(r, 50));

    expect(res.text).toContain('התשלום בוצע בהצלחה');
    expect(mockSavedOrders).toHaveLength(1);
  });

  test('renders success page even when pending already consumed', async () => {
    const res = await request(app)
      .get('/payment/success?rv=PB-ALREADY-GONE')
      .expect(200);

    expect(res.text).toContain('התשלום בוצע');
    expect(mockSavedOrders).toHaveLength(0);
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────
describe('idempotency — no double processing', () => {
  test('second webhook for same code is ignored after pending is deleted', async () => {
    makePending({ cardcom_code: 'CODE-IDEM', return_value: 'PB-IDEM' });

    await request(app).post('/webhook/payment').type('form').send({ LowProfileCode: 'CODE-IDEM' }).expect(200);
    await new Promise(r => setTimeout(r, 50));

    // Pending is now deleted — second call finds nothing
    await request(app).post('/webhook/payment').type('form').send({ LowProfileCode: 'CODE-IDEM' }).expect(200);
    await new Promise(r => setTimeout(r, 50));

    expect(mockSavedOrders).toHaveLength(1);
  });
});
