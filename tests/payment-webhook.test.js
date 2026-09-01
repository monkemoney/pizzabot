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
  // Real parser: these tests are about how we read Cardcom's callback, so
  // stubbing it would test the stub.
  readCallbackOutcome: jest.requireActual('../src/services/cardcom').readCallbackOutcome,
  cancelDeal:          jest.fn(async () => ({ success: false })),
  createPaymentPage:   jest.fn(async () => ({ url: 'https://cardcom.test', code: 'CODE123' })),
}));

jest.mock('../src/services/order-state', () => ({
  afterCreate:          jest.fn(async () => 'manual'),
  notifyAdminsNewOrder: jest.fn(async () => {}),
  confirmPayment:       jest.fn(async (id) => {
    const o = mockSavedOrders.find(x => x.id === id);
    if (o) { o.payment_status = 'paid'; }
    return { order: o || {}, changed: true };
  }),
}));

jest.mock('../src/services/supabase', () => ({
  getPendingByCardcomCode: jest.fn(async (code) =>
    Object.values(mockPendingStore).find(p => p.cardcom_code === code) || null
  ),
  getPendingByReturnValue: jest.fn(async (rv) =>
    Object.values(mockPendingStore).find(p => p.return_value === rv) || null
  ),
  getAllPendingPayments:        jest.fn(async () => Object.values(mockPendingStore)),
  getOrderByCardcomCode:        jest.fn(async (code) =>
    mockSavedOrders.find(o => o.cardcom_code === code) || null
  ),
  updateOrder:                 jest.fn(async (id, patch) => {
    const o = mockSavedOrders.find(x => x.id === id);
    if (o) Object.assign(o, patch);
    return o;
  }),
  deletePendingPayment:        jest.fn(async (id) => { delete mockPendingStore[id]; }),
  saveOrder:                   jest.fn(async (data) => {
    // The partial UNIQUE index on cardcom_code is the real idempotency key
    if (data.cardcom_code && mockSavedOrders.some(o => o.cardcom_code === data.cardcom_code)) {
      throw new Error('duplicate key value violates unique constraint');
    }
    const orderNumber = 1000 + mockSavedOrders.length;
    const order = { ...data, id: `ord-${orderNumber}`, order_number: orderNumber, orderNumber };
    mockSavedOrders.push(order);
    return { id: order.id, orderNumber, order };
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

jest.mock('../src/services/vendor-alerts',  () => ({
  alert: jest.fn(async () => {}),
  alerts: {
    serverRestart:   jest.fn(async () => {}),
    serverError:     jest.fn(async () => {}),
    paymentMismatch: jest.fn(async () => {}),
    orphanPayment:   jest.fn(async () => {}),
    stalePayment:    jest.fn(async () => {}),
  },
}));
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


const vendorAlerts = require('../src/services/vendor-alerts');
const orderState   = require('../src/services/order-state');

const settle = () => new Promise(r => setTimeout(r, 50));

// ── The webhook is the only thing that can mark an order paid ────────────────
describe('POST /webhook/payment — Cardcom IndicatorUrl', () => {
  test('ResponseCode 0 creates a paid order with the deal number', async () => {
    const p = makePending({ cardcom_code: 'CODE-OK', return_value: 'PB-OK' });

    await request(app).post('/webhook/payment').type('form')
      .send({ LowProfileCode: 'CODE-OK', ResponseCode: '0', Amount: '60', DealNumber: 'DN-42' })
      .expect(200);
    await settle();

    expect(mockSavedOrders).toHaveLength(1);
    expect(mockSavedOrders[0].payment_status).toBe('paid');
    expect(mockSavedOrders[0].cardcom_deal_number).toBe('DN-42');
    expect(mockSavedOrders[0].payment_verified_at).toBeTruthy();
    expect(mockSentMessages.find(s => s.phone === p.phone && s.text.includes('התשלום התקבל'))).toBeDefined();
  });

  test('a declined transaction creates NO order and tells the customer', async () => {
    makePending({ cardcom_code: 'CODE-DECLINED' });

    await request(app).post('/webhook/payment').type('form')
      .send({ LowProfileCode: 'CODE-DECLINED', ResponseCode: '5', Description: 'Card declined' })
      .expect(200);
    await settle();

    expect(mockSavedOrders).toHaveLength(0);
    expect(mockSentMessages.find(s => s.text.includes('לא אושר'))).toBeDefined();
  });

  test('a callback with no response code is recorded but not marked paid', async () => {
    makePending({ cardcom_code: 'CODE-NOCODE' });

    await request(app).post('/webhook/payment').type('form')
      .send({ LowProfileCode: 'CODE-NOCODE' })
      .expect(200);
    await settle();

    expect(mockSavedOrders).toHaveLength(1);
    expect(mockSavedOrders[0].payment_status).toBe('pending');
  });

  test('an amount that does not match the order is not accepted as paid, and alerts the vendor', async () => {
    makePending({ cardcom_code: 'CODE-MISMATCH' }); // order total is 60

    await request(app).post('/webhook/payment').type('form')
      .send({ LowProfileCode: 'CODE-MISMATCH', ResponseCode: '0', Amount: '6' })
      .expect(200);
    await settle();

    expect(mockSavedOrders[0].payment_status).toBe('pending');
    expect(vendorAlerts.alerts.paymentMismatch).toHaveBeenCalled();
  });

  test('a callback with no matching pending alerts the vendor (paid after expiry)', async () => {
    await request(app).post('/webhook/payment').type('form')
      .send({ LowProfileCode: 'CODE-GONE', ResponseCode: '0', Amount: '60' })
      .expect(200);
    await settle();

    expect(mockSavedOrders).toHaveLength(0);
    expect(vendorAlerts.alerts.orphanPayment).toHaveBeenCalled();
  });

  test('ignores a webhook with no code and no return value', async () => {
    await request(app).post('/webhook/payment').type('form')
      .send({ Operation: 'LowProfile' })
      .expect(200);
    await settle();

    expect(mockSavedOrders).toHaveLength(0);
    expect(vendorAlerts.alerts.orphanPayment).not.toHaveBeenCalled();
  });

  test('falls back to ReturnValue lookup when LowProfileCode does not match', async () => {
    makePending({ cardcom_code: 'DIFFERENT', return_value: 'PB-RV' });

    await request(app).post('/webhook/payment').type('form')
      .send({ ReturnValue: 'PB-RV', ResponseCode: '0', Amount: '60' })
      .expect(200);
    await settle();

    expect(mockSavedOrders).toHaveLength(1);
    expect(mockSavedOrders[0].payment_status).toBe('paid');
  });
});

// ── The success redirect is the customer's browser, and proves nothing ───────
describe('GET /payment/success', () => {
  test('records the order as awaiting verification, never as paid', async () => {
    makePending({ cardcom_code: 'CODE-SR', return_value: 'PB-SR' });

    const res = await request(app).get('/payment/success?rv=PB-SR').expect(200);
    await settle();

    expect(res.text).toContain('מאמתים את התשלום');
    expect(mockSavedOrders).toHaveLength(1);
    expect(mockSavedOrders[0].payment_status).toBe('pending');
    // The business is told, so an unverified order is not invisible
    expect(orderState.notifyAdminsNewOrder).toHaveBeenCalled();
    expect(orderState.afterCreate).not.toHaveBeenCalled();
  });

  test('renders the page when there is no pending left', async () => {
    const res = await request(app).get('/payment/success?rv=PB-ALREADY-GONE').expect(200);
    expect(res.text).toContain('ההזמנה התקבלה');
    expect(mockSavedOrders).toHaveLength(0);
  });
});

// ── Idempotency ──────────────────────────────────────────────────────────────
describe('idempotency', () => {
  test('a webhook after the redirect upgrades the same order instead of duplicating it', async () => {
    const p = makePending({ cardcom_code: 'CODE-BOTH', return_value: 'PB-BOTH' });

    await request(app).get('/payment/success?rv=PB-BOTH').expect(200);
    await settle();
    expect(mockSavedOrders).toHaveLength(1);
    expect(mockSavedOrders[0].payment_status).toBe('pending');

    // Cardcom's server-to-server callback arrives afterwards
    mockPendingStore[p.id] = p; // redirect consumed it; Cardcom still reports
    await request(app).post('/webhook/payment').type('form')
      .send({ LowProfileCode: 'CODE-BOTH', ResponseCode: '0', Amount: '60', DealNumber: 'DN-7' })
      .expect(200);
    await settle();

    expect(mockSavedOrders).toHaveLength(1);          // no second order
    expect(orderState.confirmPayment).toHaveBeenCalled();
    expect(mockSavedOrders[0].cardcom_deal_number).toBe('DN-7');
  });

  test('two concurrent webhooks produce one order', async () => {
    const p = makePending({ cardcom_code: 'CODE-RACE', return_value: 'PB-RACE' });

    await Promise.all([
      request(app).post('/webhook/payment').type('form').send({ LowProfileCode: 'CODE-RACE', ResponseCode: '0', Amount: '60' }),
      request(app).post('/webhook/payment').type('form').send({ LowProfileCode: 'CODE-RACE', ResponseCode: '0', Amount: '60' }),
    ]);
    await settle();

    expect(mockSavedOrders).toHaveLength(1);
  });
});

// ─── The charged tax is frozen on the order, never recomputed at payment ─────
// The rate a customer was charged is a fact about THEIR order. Jurisdictions
// move — CDTFA publishes new California rates on quarterly effective dates —
// and a receipt reprinted afterwards must still show what was actually taken.
// payment.js rebuilds the order from `pending.order_data` for exactly this
// reason, and `expected` for the amount guard comes from the stored total
// rather than a fresh price. Both were correct by construction and guarded by
// nothing; this is the guard.
describe('tax freeze — the charged rate survives a settings change', () => {
  const FROZEN = {
    tax_rate:   9.125,   // a real three-decimal CDTFA rate (Los Altos Hills)
    tax_amount: 1.83,
    tip_amount: 2.5,
    tip_pct:    18,
    total:      64.33,
  };

  const frozenPending = (cardcom_code) => makePending({
    cardcom_code,
    order_data: {
      customer_name:   'Jane Doe',
      items:           [{ name: 'Pizza', qty: 1, price: 60 }],
      delivery_method: 'delivery',
      address:         '123 Main St, Los Angeles, CA 90012',
      ...FROZEN,
    },
  });

  test('the order carries the stored rate, to three decimals', async () => {
    frozenPending('CODE-FROZEN');

    await request(app).post('/webhook/payment').type('form')
      .send({ LowProfileCode: 'CODE-FROZEN', ResponseCode: '0', Amount: String(FROZEN.total) })
      .expect(200);
    await settle();

    expect(mockSavedOrders).toHaveLength(1);
    const o = mockSavedOrders[0];
    // The settings mock returns {}, so any recomputation would resolve to the
    // Israeli default (18%, inclusive) and none of these would survive.
    expect(o.tax_rate).toBe(9.125);
    expect(o.tax_amount).toBe(1.83);
    expect(o.tip_amount).toBe(2.5);
    expect(o.tip_pct).toBe(18);
    expect(o.total_price).toBe(64.33);
    expect(o.payment_status).toBe('paid');
  });

  test('the amount guard compares against the frozen total, not a fresh price', async () => {
    frozenPending('CODE-FROZEN-2');

    // 60 is the pre-tax items total — what a recomputation would drift toward.
    // The frozen total is 64.33, so this must NOT be accepted as paid.
    await request(app).post('/webhook/payment').type('form')
      .send({ LowProfileCode: 'CODE-FROZEN-2', ResponseCode: '0', Amount: '60' })
      .expect(200);
    await settle();

    expect(mockSavedOrders[0].payment_status).toBe('pending');
    expect(vendorAlerts.alerts.paymentMismatch).toHaveBeenCalled();
  });
});
