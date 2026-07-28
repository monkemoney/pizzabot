'use strict';

/**
 * GET /api/vendor/kpi/:tenantId — the per-tenant pilot KPI payload:
 *   - orders: paid-only revenue, new vs returning customers
 *   - recovery funnel: calls → missed → sent → responded → orders → ₪ recovered
 *   - operations: time-to-accept, escalations, handoffs
 *   - costs + commission-saved estimate
 * Vendor-only route.
 */

process.env.JWT_SECRET                = 'test-secret-key';
process.env.TENANT_ID                 = 'aaaaaaaa-0000-0000-0000-000000000001';
process.env.DASHBOARD_VENDOR_PASSWORD = 'vendor-test-pw';

const TENANT = 'cccccccc-1111-2222-3333-444444444444';

// ── In-memory table store (PostgREST-shaped, same pattern as onboarding suite) ─
const tables = { orders: {}, call_events: {}, api_usage: {}, sessions: {} };

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (!tables[table]) tables[table] = {};
      const store = tables[table];
      const preds = [];
      let mode = 'select';
      let payload = null;
      let wantCount = false, headOnly = false, limitN = null;

      const matching = () => Object.values(store).filter((r) => preds.every((p) => p(r)));

      async function exec() {
        if (mode === 'select') {
          let out = matching();
          if (limitN !== null) out = out.slice(0, limitN);
          return { data: headOnly ? null : out, count: wantCount ? matching().length : null, error: null };
        }
        if (mode === 'update') {
          const hit = matching();
          hit.forEach((r) => Object.assign(r, payload));
          return { data: hit, error: null };
        }
        if (mode === 'insert') {
          const list = Array.isArray(payload) ? payload : [payload];
          const created = list.map((row) => {
            const id = row.id || `${table}-${Object.keys(store).length + 1}`;
            store[id] = { id, ...row };
            return store[id];
          });
          return { data: created, error: null };
        }
        return { data: null, error: null };
      }

      const b = {
        select: (_c, opts) => { if (mode === 'select') { wantCount = opts?.count === 'exact'; headOnly = !!opts?.head; } return b; },
        insert: (d) => { mode = 'insert'; payload = d; return b; },
        update: (d) => { mode = 'update'; payload = d; return b; },
        delete: () => { mode = 'delete'; return b; },
        eq:  (c, v) => { preds.push((r) => r[c] === v); return b; },
        neq: (c, v) => { preds.push((r) => r[c] !== v); return b; },
        in:  (c, vs) => { preds.push((r) => vs.includes(r[c])); return b; },
        is:  (c, v) => { preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
        gte: (c, v) => { preds.push((r) => r[c] != null && r[c] >= v); return b; },
        lt:  (c, v) => { preds.push((r) => r[c] != null && r[c] < v); return b; },
        gt:  (c, v) => { preds.push((r) => r[c] != null && r[c] > v); return b; },
        order: () => b,
        limit: (n) => { limitN = n; return b; },
        single:      async () => { const { data, error } = await exec(); const row = Array.isArray(data) ? data[0] : data; return { data: row || null, error: error || (row ? null : { code: 'PGRST116', message: 'Not found' }) }; },
        maybeSingle: async () => { const { data, error } = await exec(); const row = Array.isArray(data) ? data[0] : data; return { data: row || null, error: error || null }; },
        then: (resolve, reject) => exec().then(resolve, reject),
      };
      return b;
    },
  }),
}));

let mockSettingsStore = {};
jest.mock('../src/services/settings', () => ({
  loadAll: jest.fn(async () => mockSettingsStore),
  get:     jest.fn(async (key) => mockSettingsStore[key]),
  isOpen:  jest.fn(async () => true),
  set:     jest.fn(async () => {}),
  _clearCache: jest.fn(),
  DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001',
}));
jest.mock('../src/services/vendor-alerts', () => ({
  alert: jest.fn(async () => {}),
  alerts: { onboardingComplete: jest.fn(async () => {}), serverError: jest.fn(async () => {}), serverRestart: jest.fn(async () => {}), provisioningFailed: jest.fn(async () => {}) },
}));
jest.mock('../src/services/greenapi', () => ({
  sendMessage: jest.fn(async () => {}),
  sendTemplate: jest.fn(async () => {}),
  setWebhook:  jest.fn(async () => ({ ok: true })),
  formatPhone: (r) => String(r || '').replace(/[^0-9]/g, ''),
  toChatId:    (p) => `${p}@c.us`,
}));
jest.mock('../src/services/meta-whatsapp', () => ({
  subscribeWaba: jest.fn(async () => ({ success: true })),
  sendMessage:   jest.fn(async () => {}),
  formatPhone:   (r) => String(r || '').replace(/[^0-9]/g, ''),
  parseIncoming: () => null,
  verifyWebhook: () => null,
  verifySignature: () => 'unconfigured',
  ENV_CREDS: {},
}));
jest.mock('../src/services/slug', () => ({ assignSlug: jest.fn(async () => 'test-slug'), resolveTenantBySlug: jest.fn(async () => null) }));
jest.mock('../src/services/menu-service', () => ({ getMenu: jest.fn(async () => []), invalidateCache: jest.fn() }));
jest.mock('../src/services/status-notifier', () => ({ notifyStatusChange: jest.fn(async () => {}) }));
jest.mock('../src/services/push-notifier', () => ({ notifyNewOrder: jest.fn(async () => {}), saveSubscription: jest.fn() }));
jest.mock('../src/services/cardcom', () => ({ verifyPayment: jest.fn(async () => ({ success: false })), cancelDeal: jest.fn(async () => ({ success: false })) }));
jest.mock('../src/services/supabase', () => ({
  getAdminUser:                jest.fn(async () => null),
  getSession:                  jest.fn(async () => ({ conversation_history: [], pending_order: {} })),
  updateSession:               jest.fn(async () => {}),
  getAllPendingPayments:        jest.fn(async () => []),
  autoCompleteDeliveredOrders: jest.fn(async () => {}),
  pruneOldSessions:            jest.fn(async () => {}),
  getPendingByCardcomCode:     jest.fn(async () => null),
  getPendingByReturnValue:     jest.fn(async () => null),
}));
jest.mock('../src/bot/ai-handler',    () => ({ handleMessage:      jest.fn(async () => {}) }));
jest.mock('../src/bot/admin-handler', () => ({ handleAdminMessage: jest.fn(async () => {}) }));

const request = require('supertest');
const { signDashboard } = require('../src/middleware/auth');

const app         = require('../src/index');
const vendorToken = signDashboard('vendor', 'vendor', 'aaaaaaaa-0000-0000-0000-000000000001');
const adminToken  = signDashboard('admin', 'admin', TENANT);

function seed() {
  // July 2026 orders (IL month window)
  tables.orders = {
    o1: { id: 'o1', tenant_id: TENANT, phone: '972501', status: 'delivered', total_price: 100,
          payment_status: 'paid', refund_status: null, created_at: '2026-07-10T10:00:00Z',
          accepted_at: '2026-07-10T10:05:00Z', escalation_level: 0 },
    o2: { id: 'o2', tenant_id: TENANT, phone: '972502', status: 'new', total_price: 50,
          payment_status: 'pending', refund_status: null, created_at: '2026-07-11T10:00:00Z',
          accepted_at: null, escalation_level: 1 },
    o3: { id: 'o3', tenant_id: TENANT, phone: '972503', status: 'cancelled', total_price: 80,
          payment_status: 'pending', refund_status: null, created_at: '2026-07-12T10:00:00Z',
          accepted_at: null, escalation_level: 0 },
    // recovered order — attributed from a call_events row below
    o5: { id: 'o5', tenant_id: TENANT, phone: '972504', status: 'delivered', total_price: 120,
          payment_status: 'paid', refund_status: null, created_at: '2026-07-12T12:00:00Z',
          accepted_at: '2026-07-12T12:15:00Z', escalation_level: 0 },
    // prior-month order → makes 972501 a returning customer
    o4: { id: 'o4', tenant_id: TENANT, phone: '972501', status: 'done', total_price: 70,
          payment_status: 'paid', refund_status: null, created_at: '2026-06-01T10:00:00Z',
          accepted_at: null, escalation_level: 0 },
    // another tenant — must never leak in
    ox: { id: 'ox', tenant_id: 'other-tenant', phone: '972599', status: 'delivered', total_price: 999,
          payment_status: 'paid', refund_status: null, created_at: '2026-07-13T10:00:00Z',
          accepted_at: null, escalation_level: 0 },
  };
  tables.call_events = {
    c1: { id: 'c1', tenant_id: TENANT, caller: '972505', outcome: 'answered', channel: null,
          responded_at: null, recovered_order_id: null, created_at: '2026-07-10T09:00:00Z' },
    c2: { id: 'c2', tenant_id: TENANT, caller: '972504', outcome: 'recovery_sent', channel: 'whatsapp',
          responded_at: '2026-07-12T11:00:00Z', recovered_order_id: 'o5', created_at: '2026-07-12T10:30:00Z' },
    c3: { id: 'c3', tenant_id: TENANT, caller: '972506', outcome: 'recovery_sent', channel: 'sms',
          responded_at: null, recovered_order_id: null, created_at: '2026-07-13T10:00:00Z' },
    c4: { id: 'c4', tenant_id: TENANT, caller: '972506', outcome: 'skipped_throttled', channel: null,
          responded_at: null, recovered_order_id: null, created_at: '2026-07-13T11:00:00Z' },
    c5: { id: 'c5', tenant_id: TENANT, caller: '972507', outcome: 'send_failed', channel: 'whatsapp',
          responded_at: null, recovered_order_id: null, created_at: '2026-07-14T10:00:00Z' },
  };
  tables.api_usage = {
    u1: { id: 'u1', tenant_id: TENANT, input_tokens: 1000000, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, created_at: '2026-07-10T10:00:00Z' },
    u2: { id: 'u2', tenant_id: TENANT, input_tokens: 0, output_tokens: 100000, cache_read_tokens: 0, cache_write_tokens: 0, created_at: '2026-07-11T10:00:00Z' },
  };
  tables.sessions = {
    s1: { id: 's1', tenant_id: TENANT, phone: '972508', handoff_at: '2026-07-15T10:00:00Z' },
    s2: { id: 's2', tenant_id: TENANT, phone: '972509', handoff_at: null },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSettingsStore = {};
  seed();
});

const get = (month = '2026-07', token = vendorToken) =>
  request(app).get(`/api/vendor/kpi/${TENANT}?month=${month}`).set('Authorization', `Bearer ${token}`);

describe('auth', () => {
  test('401 without a token', async () => {
    await request(app).get(`/api/vendor/kpi/${TENANT}`).expect(401);
  });
  test('403 for a non-vendor role', async () => {
    await get('2026-07', adminToken).expect(403);
  });
});

describe('orders block', () => {
  test('counts, paid-only revenue, and new vs returning customers', async () => {
    const res = await get().expect(200);
    expect(res.body.month).toBe('2026-07');
    expect(res.body.orders).toEqual(expect.objectContaining({
      count: 3,               // o1, o2, o5 — cancelled o3 excluded, June o4 out of range
      cancelled: 1,
      revenue_paid: 220,      // 100 + 120; the pending 50 is NOT income
      revenue_pending: 50,
      new_customers: 2,       // 972502, 972504
      returning_customers: 1, // 972501 ordered in June
    }));
  });

  test('another tenant\'s orders never leak into the numbers', async () => {
    const res = await get().expect(200);
    expect(res.body.orders.revenue_paid).toBe(220); // not 220+999
  });
});

describe('recovery funnel', () => {
  test('full funnel from call_events including attributed revenue', async () => {
    const res = await get().expect(200);
    expect(res.body.recovery).toEqual(expect.objectContaining({
      calls_total: 5,
      answered: 1,
      missed: 4,
      sent: 2,
      sent_whatsapp: 1,
      sent_sms: 1,
      send_failed: 1,
      responded: 1,
      orders_recovered: 1,
      revenue_recovered: 120,
    }));
    expect(res.body.recovery.skipped.throttled).toBe(1);
  });

  test('a cancelled attributed order does not count as recovered revenue', async () => {
    tables.orders.o5.status = 'cancelled';
    const res = await get().expect(200);
    expect(res.body.recovery.revenue_recovered).toBe(0);
    expect(res.body.recovery.orders_recovered).toBe(1); // the attribution happened; the money didn't
  });
});

describe('operations + costs', () => {
  test('time-to-accept, escalations, handoffs', async () => {
    const res = await get().expect(200);
    expect(res.body.operations.accepted).toBe(2);           // o1 (5m), o5 (15m)
    expect(res.body.operations.accept_median_min).not.toBeNull();
    expect(res.body.operations.escalated).toBe(1);          // o2
    expect(res.body.operations.handoffs).toBe(1);           // s1 only
  });

  test('claude cost from api_usage at opus pricing', async () => {
    const res = await get().expect(200);
    // 1M input × $15/M + 100k output × $75/M = 15 + 7.5
    expect(res.body.costs.claude_usd).toBe(22.5);
    expect(res.body.costs.claude_calls).toBe(2);
  });
});

describe('commission saved', () => {
  test('defaults to 25% of paid revenue', async () => {
    const res = await get().expect(200);
    expect(res.body.commission_saved).toEqual({ rate: 0.25, amount: 55 }); // 220 × 0.25
  });

  test('respects the per-tenant aggregator_rate setting', async () => {
    mockSettingsStore.aggregator_rate = 0.3;
    const res = await get().expect(200);
    expect(res.body.commission_saved).toEqual({ rate: 0.3, amount: 66 });
  });
});

describe('month handling', () => {
  test('a month with no data returns zeros, not an error', async () => {
    const res = await get('2026-01').expect(200);
    expect(res.body.orders.count).toBe(0);
    expect(res.body.recovery.calls_total).toBe(0);
    expect(res.body.operations.accept_median_min).toBeNull();
  });

  test('an invalid month param falls back to the current month', async () => {
    const res = await get('not-a-month').expect(200);
    expect(res.body.month).toMatch(/^\d{4}-\d{2}$/);
  });
});
