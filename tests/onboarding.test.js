'use strict';

/**
 * Onboarding flow — two sides:
 *   Client side:  GET/PATCH /api/onboarding/:token  (public, no auth)
 *   Vendor side:  POST/GET/PATCH /api/vendor/onboarding (requireVendor)
 */

process.env.JWT_SECRET              = 'test-secret-key';
process.env.TENANT_ID               = 'aaaaaaaa-0000-0000-0000-000000000001';
process.env.DASHBOARD_VENDOR_PASSWORD = 'vendor-test-pw';
process.env.PUBLIC_URL              = 'https://jasell.test';

// ── In-memory table store ─────────────────────────────────────────────────────
const tables = {
  onboarding_sessions: {},
  clients:             {},
  tenant_users:        {},
};
const updateLog = []; // { table, data, filter }
const insertLog = []; // { table, data }

function makeSession(token, overrides = {}) {
  const id = `sess-${Object.keys(tables.onboarding_sessions).length + 1}`;
  const s = {
    id,
    token,
    client_id:   `client-${id}`,
    status:      'pending_client',
    business_name: 'בדיקה פיצה',
    expires_at:  new Date(Date.now() + 86400000).toISOString(),
    checklist:   [{ key: 'client_info', label: 'מידע', done: false }],
    ...overrides,
  };
  tables.onboarding_sessions[id] = s;
  return s;
}

// ── Supabase mock ─────────────────────────────────────────────────────────────
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const store = tables[table] || {};
      let _mode    = 'select';
      let _filters = {};
      let _updateData = null;
      let _insertData = null;

      const b = {
        select: () => { _mode = 'select'; return b; },

        insert: (data) => {
          _insertData = Array.isArray(data) ? data[0] : data;
          _mode = 'insert';
          insertLog.push({ table, data: _insertData });
          const id    = `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const token = `tok-${Math.random().toString(36).slice(2)}`;
          const record = { id, token, ..._insertData };
          if (tables[table]) tables[table][id] = record;
          return {
            select: () => ({
              single: async () => ({ data: record, error: null }),
            }),
          };
        },

        update: (data) => {
          _updateData = data;
          _mode = 'update';
          return {
            eq: (col, val) => {
              // Apply update to matching rows
              const updated = Object.values(store).find(r => r[col] === val);
              if (updated) Object.assign(updated, data);
              updateLog.push({ table, data, filter: { [col]: val } });
              return Promise.resolve({ error: null, data: updated || null });
            },
          };
        },

        eq: (col, val) => {
          _filters[col] = val;
          return b;
        },

        single: async () => {
          const row = Object.values(store).find(r =>
            Object.entries(_filters).every(([k, v]) => r[k] === v)
          ) || null;
          return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
        },

        order:  () => b,
        neq:    () => b,
        limit:  async (n) => ({ data: Object.values(store).slice(0, n) }),
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
jest.mock('../src/services/cardcom',       () => ({ verifyPayment: jest.fn(async () => ({ success: false })), cancelDeal: jest.fn(async () => ({ success: false })) }));
jest.mock('../src/services/supabase',      () => ({
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

beforeEach(() => {
  // Clear all tables
  Object.keys(tables).forEach(t => { tables[t] = {}; });
  updateLog.length = 0;
  insertLog.length = 0;
  jest.clearAllMocks();
});

// ── Client side: GET /api/onboarding/:token ───────────────────────────────────
describe('GET /api/onboarding/:token', () => {
  test('returns session data for valid token', async () => {
    const s = makeSession('good-token');

    const res = await request(app)
      .get(`/api/onboarding/good-token`)
      .expect(200);

    expect(res.body.id).toBe(s.id);
    expect(res.body.status).toBe('pending_client');
  });

  test('returns 404 for unknown token', async () => {
    await request(app)
      .get('/api/onboarding/unknown-token')
      .expect(404);
  });

  test('returns 410 for expired link', async () => {
    makeSession('expired-token', { expires_at: new Date(Date.now() - 1000).toISOString() });

    await request(app)
      .get('/api/onboarding/expired-token')
      .expect(410);
  });

  test('returns { status: "approved" } for already-approved session', async () => {
    makeSession('approved-token', { status: 'approved' });

    const res = await request(app)
      .get('/api/onboarding/approved-token')
      .expect(200);

    expect(res.body.status).toBe('approved');
  });
});

// ── Client side: PATCH /api/onboarding/:token ─────────────────────────────────
describe('PATCH /api/onboarding/:token', () => {
  test('saves client business info and changes status to pending_vendor', async () => {
    makeSession('client-patch-token');

    await request(app)
      .patch('/api/onboarding/client-patch-token')
      .send({
        business_name:   'פיצה מגניבה',
        bot_whatsapp:    '972501234567',
        delivery_enabled: true,
        pickup_enabled:   false,
        admin_phones:    ['972501111111'],
      })
      .expect(200);

    const upd = updateLog.find(u => u.table === 'onboarding_sessions');
    expect(upd).toBeDefined();
    expect(upd.data.status).toBe('pending_vendor');
    expect(upd.data.business_name).toBe('פיצה מגניבה');
  });

  test('blocks update on approved session with 409', async () => {
    makeSession('approved-block-token', { status: 'approved' });

    await request(app)
      .patch('/api/onboarding/approved-block-token')
      .send({ business_name: 'נסיון' })
      .expect(409);
  });

  test('blocks update on expired session with 410', async () => {
    makeSession('expired-block-token', { expires_at: new Date(Date.now() - 1000).toISOString() });

    await request(app)
      .patch('/api/onboarding/expired-block-token')
      .send({ business_name: 'נסיון' })
      .expect(410);
  });

  test('returns 404 for unknown token', async () => {
    await request(app)
      .patch('/api/onboarding/no-such-token')
      .send({ business_name: 'נסיון' })
      .expect(404);
  });
});

// ── Vendor side: POST /api/vendor/onboarding ──────────────────────────────────
describe('POST /api/vendor/onboarding', () => {
  test('creates client and session, returns shareable link', async () => {
    const res = await request(app)
      .post('/api/vendor/onboarding')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ name: 'לקוח חדש', contact_phone: '0521234567', plan: 'trial' })
      .expect(200);

    expect(res.body.link).toMatch(/\/onboarding\//);
    expect(res.body.client).toBeDefined();
    expect(res.body.session).toBeDefined();

    const clientInsert = insertLog.find(l => l.table === 'clients');
    expect(clientInsert).toBeDefined();
    expect(clientInsert.data.name).toBe('לקוח חדש');
  });

  test('returns 400 when name is missing', async () => {
    await request(app)
      .post('/api/vendor/onboarding')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ contact_phone: '052' })
      .expect(400);
  });

  test('requires vendor auth — rejects unauthenticated request', async () => {
    await request(app)
      .post('/api/vendor/onboarding')
      .send({ name: 'לקוח' })
      .expect(401);
  });
});

// ── Vendor side: GET /api/vendor/onboarding ───────────────────────────────────
describe('GET /api/vendor/onboarding', () => {
  test('requires vendor auth', async () => {
    await request(app)
      .get('/api/vendor/onboarding')
      .expect(401);
  });

  test('returns list with vendor token', async () => {
    makeSession('v-tok-1');
    makeSession('v-tok-2', { status: 'pending_vendor' });

    const res = await request(app)
      .get('/api/vendor/onboarding')
      .set('Authorization', `Bearer ${vendorToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Vendor side: PATCH /api/vendor/onboarding/:id ────────────────────────────
describe('PATCH /api/vendor/onboarding/:id', () => {
  test('saves tech fields and requires vendor auth', async () => {
    const s = makeSession('v-tech-tok');

    const res = await request(app)
      .patch(`/api/vendor/onboarding/${s.id}`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ green_api_instance: '7105000001', green_api_token: 'tok-abc' })
      .expect(200);

    expect(res.body.success).toBe(true);

    const upd = updateLog.find(u => u.table === 'onboarding_sessions' && u.data.green_api_instance);
    expect(upd).toBeDefined();
  });

  test('rejects non-vendor token with 403', async () => {
    const adminTok = signDashboard('admin', 'admin');
    await request(app)
      .patch('/api/vendor/onboarding/any-id')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ green_api_instance: 'x' })
      .expect(403);
  });
});
