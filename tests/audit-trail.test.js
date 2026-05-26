'use strict';

/**
 * Audit trail — verifies that updated_at and updated_by are stamped on every
 * mutation that touches onboarding_sessions, and that order mutations include
 * updated_at.
 *
 * Also verifies the updated_by='client' vs 'vendor' distinction.
 */

process.env.JWT_SECRET              = 'test-secret-key';
process.env.TENANT_ID               = 'aaaaaaaa-0000-0000-0000-000000000001';
process.env.DASHBOARD_VENDOR_PASSWORD = 'vendor-audit-pw';
process.env.PUBLIC_URL              = 'https://jasell.test';

// ── In-memory store + update log ──────────────────────────────────────────────
const store     = {};  // table → { id: row }
const updateLog = [];  // { table, data, filter }

function seedRow(table, overrides = {}) {
  const id = `row-${Object.keys(store[table] || {}).length + 1}`;
  if (!store[table]) store[table] = {};
  const row = { id, ...overrides };
  store[table][id] = row;
  return row;
}

// ── Supabase mock ─────────────────────────────────────────────────────────────
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (!store[table]) store[table] = {};
      const rows = store[table];

      let _mode    = 'select';
      let _filters = {};
      let _updateVals = null;
      let _insertVals = null;

      const b = {
        select: () => { _mode = 'select'; return b; },
        insert: (vals) => {
          _insertVals = Array.isArray(vals) ? vals[0] : vals;
          const id = `ins-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const row = { id, token: `tok-${id}`, ..._insertVals };
          rows[id] = row;
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
        update: (vals) => {
          _mode = 'update';
          _updateVals = vals;
          return {
            eq: (col, val) => {
              const target = Object.values(rows).find(r => r[col] === val);
              if (target) Object.assign(target, vals);
              updateLog.push({ table, data: { ..._updateVals }, filter: { [col]: val } });
              const result = { error: null, data: target || null };
              // Support both: await .update().eq() AND .update().eq().select().single()
              const eqResult = Object.assign(Promise.resolve(result), {
                select: () => ({ single: async () => result }),
              });
              return eqResult;
            },
          };
        },
        upsert: (vals) => {
          const row = Array.isArray(vals) ? vals[0] : vals;
          const key = row.id || `ups-${Date.now()}`;
          rows[key] = { ...rows[key], ...row };
          return { select: () => ({ single: async () => ({ data: rows[key], error: null }) }) };
        },
        eq: (col, val) => { _filters[col] = val; return b; },
        single: async () => {
          const row = Object.values(rows).find(r =>
            Object.entries(_filters).every(([k, v]) => r[k] === v)
          ) || null;
          return { data: row, error: row ? null : { code: 'PGRST116' } };
        },
        order: () => b,
        limit: async (n) => ({ data: Object.values(rows).slice(0, n) }),
        gte: () => b, lt: () => b,
      };
      return b;
    },
  }),
}));

// ── Other mocks ───────────────────────────────────────────────────────────────
jest.mock('../src/services/vendor-alerts', () => ({
  alert: jest.fn(async () => {}),
  alerts: { onboardingComplete: jest.fn(async () => {}), serverError: jest.fn(async () => {}), serverRestart: jest.fn(async () => {}) },
}));
jest.mock('../src/services/greenapi',      () => ({ sendMessage: jest.fn(async () => {}), formatPhone: (r) => r.replace(/[^0-9]/g, ''), toChatId: (p) => `${p}@c.us` }));
jest.mock('../src/services/settings',      () => ({ loadAll: jest.fn(async () => ({})), get: jest.fn(async ()=>null), isOpen: jest.fn(async ()=>true), _clearCache: jest.fn(), set: jest.fn(async ()=>{}), DEFAULT_TENANT_ID: 'aaaaaaaa-0000-0000-0000-000000000001' }));
jest.mock('../src/services/menu-service',  () => ({ getMenu: jest.fn(async () => []), invalidateCache: jest.fn() }));
jest.mock('../src/services/status-notifier', () => ({ notifyStatusChange: jest.fn(async () => {}) }));
jest.mock('../src/services/push-notifier', () => ({ notifyNewOrder: jest.fn(async () => {}), saveSubscription: jest.fn() }));
jest.mock('../src/services/cardcom',       () => ({
  verifyPayment: jest.fn(async () => ({ success: false })),
  cancelDeal:    jest.fn(async () => ({ success: false })),
}));
jest.mock('../src/services/supabase', () => ({
  getAdminUser:                jest.fn(async () => null),
  getSession:                  jest.fn(async () => ({ conversation_history: [], pending_order: {} })),
  updateSession:               jest.fn(async () => {}),
  getAllPendingPayments:        jest.fn(async () => []),
  autoCompleteDeliveredOrders: jest.fn(async () => {}),
  pruneOldSessions:            jest.fn(async () => {}),
  getOrderById:                jest.fn(async (id) => store.orders?.[id] || null),
  updateOrderStatus:           jest.fn(async (id, status) => {
    if (store.orders?.[id]) store.orders[id].status = status;
    return store.orders?.[id] || { id, status };
  }),
  updateOrder:                 jest.fn(async () => ({})),
  getPendingByCardcomCode:     jest.fn(async () => null),
  getPendingByReturnValue:     jest.fn(async () => null),
}));
jest.mock('../src/bot/ai-handler',    () => ({ handleMessage:      jest.fn(async () => {}) }));
jest.mock('../src/bot/admin-handler', () => ({ handleAdminMessage: jest.fn(async () => {}) }));

const request = require('supertest');
const { signDashboard } = require('../src/middleware/auth');

const app         = require('../src/index');
const vendorToken = signDashboard('vendor', 'vendor', 'aaaaaaaa-0000-0000-0000-000000000001');
const adminToken  = signDashboard('admin',  'admin',  'aaaaaaaa-0000-0000-0000-000000000001');

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';

beforeEach(() => {
  Object.keys(store).forEach(t => { store[t] = {}; });
  updateLog.length = 0;
  jest.clearAllMocks();
});

// ── PATCH /api/onboarding/:token stamps updated_by='client' ──────────────────
describe('PATCH /api/onboarding/:token — client stamp', () => {
  test('stamps updated_at (ISO string) on client PATCH', async () => {
    const before = Date.now();
    seedRow('onboarding_sessions', {
      token:     'audit-tok-1',
      status:    'pending_client',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      checklist: [],
    });

    await request(app)
      .patch('/api/onboarding/audit-tok-1')
      .send({ business_name: 'בדיקה' })
      .expect(200);

    const upd = updateLog.find(u => u.table === 'onboarding_sessions');
    expect(upd).toBeDefined();

    const updAt = new Date(upd.data.updated_at).getTime();
    expect(updAt).toBeGreaterThanOrEqual(before);
    expect(updAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test('stamps updated_by="client" on client PATCH', async () => {
    seedRow('onboarding_sessions', {
      token:     'audit-tok-2',
      status:    'pending_client',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      checklist: [],
    });

    await request(app)
      .patch('/api/onboarding/audit-tok-2')
      .send({ business_name: 'עדכון' })
      .expect(200);

    const upd = updateLog.find(u => u.table === 'onboarding_sessions');
    expect(upd.data.updated_by).toBe('client');
  });
});

// ── PATCH /api/vendor/onboarding/:id stamps updated_by='vendor' ──────────────
describe('PATCH /api/vendor/onboarding/:id — vendor stamp', () => {
  test('stamps updated_by="vendor" on vendor tech-field PATCH', async () => {
    const row = seedRow('onboarding_sessions', { status: 'pending_vendor' });

    await request(app)
      .patch(`/api/vendor/onboarding/${row.id}`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ green_api_instance: '7105000001', green_api_token: 'tok-xxx' })
      .expect(200);

    const upd = updateLog.find(u =>
      u.table === 'onboarding_sessions' && u.filter.id === row.id
    );
    expect(upd).toBeDefined();
    expect(upd.data.updated_by).toBe('vendor');
    expect(upd.data.updated_at).toBeDefined();
  });
});

// ── PATCH /api/vendor/onboarding/:id/checklist stamps updated_by='vendor' ─────
describe('PATCH /api/vendor/onboarding/:id/checklist — vendor stamp', () => {
  test('stamps updated_by="vendor" on checklist toggle', async () => {
    const row = seedRow('onboarding_sessions', {
      status:   'pending_vendor',
      checklist: [{ key: 'greenapi', label: 'Green API', done: false }],
    });

    await request(app)
      .patch(`/api/vendor/onboarding/${row.id}/checklist`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ key: 'greenapi', done: true })
      .expect(200);

    const upd = updateLog.find(u =>
      u.table === 'onboarding_sessions' && u.data.updated_by === 'vendor'
    );
    expect(upd).toBeDefined();
    expect(upd.data.updated_at).toBeDefined();
  });
});

// ── Order mutations stamp updated_at ─────────────────────────────────────────
describe('Order mutations — updated_at stamp', () => {
  function seedOrder(overrides = {}) {
    const id = `ord-audit-${Date.now()}`;
    if (!store.orders) store.orders = {};
    const row = {
      id,
      order_number:   2001,
      phone:          '972501234567',
      status:         'new',
      payment_method: 'cash',
      payment_status: 'paid',
      total_price:    60,
      tenant_id:      TENANT,
      items:          [],
      ...overrides,
    };
    store.orders[id] = row;
    // Also make getOrderById return it
    require('../src/services/supabase').getOrderById.mockResolvedValue(row);
    return row;
  }

  test('PUT /api/orders/:id stamps updated_at', async () => {
    const before = Date.now();
    const order = seedOrder();

    await request(app)
      .put(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'עדכון הערות' })
      .expect(200);

    const upd = updateLog.find(u => u.table === 'orders');
    expect(upd).toBeDefined();
    const ts = new Date(upd.data.updated_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  test('CANCEL /api/orders/:id/cancel-refund stamps updated_at', async () => {
    const before = Date.now();
    const order = seedOrder({ payment_method: 'cash' });

    await request(app)
      .post(`/api/orders/${order.id}/cancel-refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'בדיקה', cancelled_by: 'business' })
      .expect(200);

    const upd = updateLog.find(u =>
      u.table === 'orders' && u.data.status === 'cancelled'
    );
    expect(upd).toBeDefined();
    const ts = new Date(upd.data.updated_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
  });
});

// ── updated_by differentiates client vs vendor ────────────────────────────────
describe('updated_by attribution', () => {
  test('client PATCH → updated_by is "client"', async () => {
    seedRow('onboarding_sessions', {
      token:     'attr-client-tok',
      status:    'pending_client',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      checklist: [],
    });

    await request(app)
      .patch('/api/onboarding/attr-client-tok')
      .send({ business_name: 'test' })
      .expect(200);

    const clientUpds = updateLog.filter(u => u.data.updated_by === 'client');
    const vendorUpds = updateLog.filter(u => u.data.updated_by === 'vendor');
    expect(clientUpds.length).toBeGreaterThan(0);
    expect(vendorUpds.length).toBe(0);
  });

  test('vendor PATCH → updated_by is "vendor"', async () => {
    const row = seedRow('onboarding_sessions', { status: 'pending_vendor' });

    await request(app)
      .patch(`/api/vendor/onboarding/${row.id}`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ green_api_instance: 'x', green_api_token: 'y' })
      .expect(200);

    const vendorUpds = updateLog.filter(u =>
      u.table === 'onboarding_sessions' && u.data.updated_by === 'vendor'
    );
    expect(vendorUpds.length).toBeGreaterThan(0);
  });
});
