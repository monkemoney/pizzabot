'use strict';

/**
 * Bot Brain endpoints — the decision surface for the learning loop.
 *
 * These routes are how insights stop evaporating into chat: the queue lives in
 * the DB, the vendor decides in the portal, and decisions are recorded with
 * who/when. Vendor-only; a decided insight must not be re-decided.
 */

process.env.JWT_SECRET                = 'test-secret-key';
process.env.TENANT_ID                 = 'aaaaaaaa-0000-0000-0000-000000000001';
process.env.DASHBOARD_VENDOR_PASSWORD = 'vendor-test-pw';

const TENANT = 'cccccccc-1111-2222-3333-444444444444';

// ── In-memory table store (PostgREST-shaped, same pattern as onboarding suite) ─
const tables = { orders: {}, call_events: {}, api_usage: {}, sessions: {}, bot_runs: {}, bot_insights: {}, settings: {} };

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (!tables[table]) tables[table] = {};
      const store = tables[table];
      const preds = [];
      let mode = 'select';
      let payload = null;
      let wantCount = false, headOnly = false, limitN = null, orderBy = null;

      const matching = () => Object.values(store).filter((r) => preds.every((p) => p(r)));

      async function exec() {
        if (mode === 'select') {
          let out = matching();
          if (orderBy) {
            out = [...out].sort((x, y) => {
              const a = x[orderBy.col], b2 = y[orderBy.col];
              if (a === b2) return 0;
              return (a > b2 ? 1 : -1) * (orderBy.asc ? 1 : -1);
            });
          }
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
        order: (col, opts) => { orderBy = { col, asc: opts?.ascending !== false }; return b; },
        not: (c, op, v) => {
          // only 'like' is used by these routes: NOT phone LIKE 'admin:%'
          const rx = new RegExp('^' + String(v).replace(/%/g, '.*') + '$');
          preds.push((r) => !(r[c] != null && rx.test(String(r[c]))));
          return b;
        },
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



// Real UUIDs: the brain: button-id regex requires one, as production ids are.
const I1 = '11111111-1111-4111-8111-111111111111';
const I2 = '22222222-2222-4222-8222-222222222222';
const I3 = '33333333-3333-4333-8333-333333333333';
const I4 = '44444444-4444-4444-8444-444444444444';

function seedBrain() {
  tables.bot_runs = {
    r1: { id: 'r1', kind: 'weekly', status: 'completed', verdict: 'GO', run_at: '2026-08-01T06:00:00Z',
          finished_at: '2026-08-01T06:40:00Z', scores: { synthetic: 96, replay: 74, autonomy_pct: 100 }, meta: {} },
    r2: { id: 'r2', kind: 'weekly', status: 'completed', verdict: 'NO-GO', run_at: '2026-08-05T06:00:00Z',
          finished_at: '2026-08-05T06:40:00Z', scores: { synthetic: 95, replay: 70, autonomy_pct: 98 }, meta: {} },
    r3: { id: 'r3', kind: 'weekly', status: 'started', verdict: null, run_at: '2026-08-06T06:00:00Z',
          finished_at: null, scores: {}, meta: {} },
  };
  tables.bot_insights = {
    [I1]: { id: I1, source: 'bootcamp', title: 'שער נכשל: p95', status: 'proposed', type: 'info',
          created_at: '2026-08-05T07:00:00Z', metrics: { sample_size: 20 }, evidence: 'p95 9043ms' },
    [I2]: { id: I2, source: 'mine-live', title: 'בדיקת מלאי מאוחרת', status: 'proposed', type: 'lesson',
          created_at: '2026-08-05T07:01:00Z', metrics: {}, evidence: '2 מקרים' },
    [I3]: { id: I3, source: 'user', title: 'כבר הוחלט', status: 'implemented', type: 'code',
          created_at: '2026-07-28T07:00:00Z', metrics: {}, decided_at: '2026-07-28T08:00:00Z', decided_via: 'portal' },
    [I4]: { id: I4, source: 'system', title: 'ממתין למימוש', status: 'approved', type: 'code',
          created_at: '2026-08-05T07:02:00Z', metrics: {} },
  };
  tables.sessions = {
    s1: { id: 's1', tenant_id: TENANT, phone: '972500', is_bot_active: false },
    s2: { id: 's2', tenant_id: TENANT, phone: '972501', is_bot_active: true },
    s3: { id: 's3', tenant_id: TENANT, phone: 'admin:972502', is_bot_active: false },
  };
  tables.api_usage = {};
  tables.orders = {};
}

beforeEach(() => { seedBrain(); });

describe('auth — vendor only', () => {
  const routes = [
    ['get', '/api/vendor/brain/overview'],
    ['get', '/api/vendor/brain/insights'],
    ['get', '/api/vendor/brain/trends'],
    ['get', '/api/vendor/brain/funnel'],
  ];
  test.each(routes)('%s %s rejects a non-vendor token', async (method, path) => {
    const res = await request(app)[method](path).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  test('PATCH insights rejects a non-vendor token', async () => {
    const res = await request(app).patch('/api/vendor/brain/insights/' + I1)
      .set('Authorization', `Bearer ${adminToken}`).send({ action: 'approve' });
    expect(res.status).toBe(403);
  });

  test('no token at all is rejected', async () => {
    expect((await request(app).get('/api/vendor/brain/overview')).status).toBe(401);
  });
});

describe('GET /vendor/brain/overview', () => {
  test('reports the newest run, pending counts and handoffs', async () => {
    const res = await request(app).get('/api/vendor/brain/overview')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.last_run.id).toBe('r3');          // newest by run_at, even mid-run
    expect(res.body.pending_insights).toBe(2);
    expect(res.body.approved_insights).toBe(1);
    expect(res.body.handoffs_pending).toBe(1);        // admin: sessions excluded
    expect(typeof res.body.staleness_days).toBe('number');
  });
});

describe('GET /vendor/brain/insights', () => {
  test('defaults to everything, newest first', async () => {
    const res = await request(app).get('/api/vendor/brain/insights')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
  });

  test('filters by status', async () => {
    const res = await request(app).get('/api/vendor/brain/insights?status=proposed')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.body.map((r) => r.id).sort()).toEqual([I1, I2].sort());
  });
});

describe('PATCH /vendor/brain/insights/:id', () => {
  test('approve records status, timestamp and channel', async () => {
    const res = await request(app).patch('/api/vendor/brain/insights/' + I1)
      .set('Authorization', `Bearer ${vendorToken}`).send({ action: 'approve', notes: 'בוצע' });
    expect(res.status).toBe(200);
    expect(tables.bot_insights[I1].status).toBe('approved');
    expect(tables.bot_insights[I1].decided_via).toBe('portal');
    expect(tables.bot_insights[I1].decided_at).toBeTruthy();
    expect(tables.bot_insights[I1].notes).toBe('בוצע');
  });

  test('reject records the decision too', async () => {
    await request(app).patch('/api/vendor/brain/insights/' + I2)
      .set('Authorization', `Bearer ${vendorToken}`).send({ action: 'reject' });
    expect(tables.bot_insights[I2].status).toBe('rejected');
  });

  test('a decided insight cannot be re-decided — history is not rewritable', async () => {
    const res = await request(app).patch('/api/vendor/brain/insights/' + I3)
      .set('Authorization', `Bearer ${vendorToken}`).send({ action: 'approve' });
    expect(res.status).toBe(409);
    expect(tables.bot_insights[I3].status).toBe('implemented');
  });

  test('an unknown action is refused', async () => {
    const res = await request(app).patch('/api/vendor/brain/insights/' + I1)
      .set('Authorization', `Bearer ${vendorToken}`).send({ action: 'maybe' });
    expect(res.status).toBe(400);
    expect(tables.bot_insights[I1].status).toBe('proposed');
  });

  test('a missing insight is a 404', async () => {
    const res = await request(app).patch('/api/vendor/brain/insights/nope')
      .set('Authorization', `Bearer ${vendorToken}`).send({ action: 'approve' });
    expect(res.status).toBe(404);
  });
});

describe('GET /vendor/brain/trends', () => {
  test('returns completed runs oldest-first for charting', async () => {
    const res = await request(app).get('/api/vendor/brain/trends')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.verdict)).toEqual(['GO', 'NO-GO']);   // r3 is still running
    expect(res.body[0].scores.replay).toBe(74);
  });
});

// ── Vendor reply routing ─────────────────────────────────────────────────────
// The trap: the vendor's phone is in settings.vendor_phone, NOT admin_users.
// Without a dedicated branch a digest button tap falls through to the CUSTOMER
// bot — the vendor gets a pizza greeting and the decision is lost.
describe('brain: replies from WhatsApp', () => {
  const VENDOR = '972501234567';
  const { handleBrainReply } = require('../src/bot/brain-handler');

  beforeEach(() => {
    seedBrain();
    mockSettingsStore = { vendor_phone: VENDOR };
  });

  test('a vendor tap records the decision as decided_via=whatsapp', async () => {
    const handled = await handleBrainReply(VENDOR, 'brain:approve:' + I1, '', TENANT);
    expect(handled).toBe(true);
    expect(tables.bot_insights[I1].status).toBe('approved');
    expect(tables.bot_insights[I1].decided_via).toBe('whatsapp');
  });

  test('reject works the same way', async () => {
    await handleBrainReply(VENDOR, 'brain:reject:' + I2, '', TENANT);
    expect(tables.bot_insights[I2].status).toBe('rejected');
  });

  test('a NON-vendor sender is consumed but changes nothing', async () => {
    const handled = await handleBrainReply('972509999999', 'brain:approve:' + I1, '', TENANT);
    expect(handled).toBe(true);                       // consumed: never leaks to the customer bot
    expect(tables.bot_insights[I1].status).toBe('proposed');
  });

  test('an ordinary message is not consumed — normal routing continues', async () => {
    expect(await handleBrainReply(VENDOR, null, 'היי, אפשר פיצה?', TENANT)).toBe(false);
    expect(await handleBrainReply(VENDOR, 'accept:some-order-id', '', TENANT)).toBe(false);
  });

  test('an already-decided insight is not re-decided', async () => {
    await handleBrainReply(VENDOR, 'brain:approve:' + I3, '', TENANT);
    expect(tables.bot_insights[I3].status).toBe('implemented');
  });
});
