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
// A small in-memory PostgREST-shaped query builder. The provisioning flow uses
// upsert, in(), count/head selects, maybeSingle and embedded selects, so a
// stub that only understands select/eq/single cannot exercise it at all — and
// this is the one endpoint in the system that can duplicate a client's menu.
let mockFailOn = {};   // `${table}:${mode}` → error message, consumed once

function mockRowsOf(table) {
  if (!tables[table]) tables[table] = {};
  return tables[table];
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const store = mockRowsOf(table);
      const preds = [];
      let mode = 'select';
      let payload = null;
      let wantCount = false, headOnly = false, limitN = null, conflictCols = null;

      const matching = () => Object.values(store).filter((r) => preds.every((p) => p(r)));
      const newId = () => `${table}-${Object.keys(store).length + 1}-${Math.random().toString(36).slice(2, 6)}`;

      const injected = () => {
        const key = `${table}:${mode}`;
        if (mockFailOn[key]) { const msg = mockFailOn[key]; delete mockFailOn[key]; return { message: msg }; }
        return null;
      };

      async function exec() {
        const err = injected();
        if (err) return { data: null, count: null, error: err };

        if (mode === 'select') {
          let out = matching();
          if (limitN !== null) out = out.slice(0, limitN);
          return { data: headOnly ? null : out, count: wantCount ? matching().length : null, error: null };
        }
        if (mode === 'update') {
          const hit = matching();
          hit.forEach((r) => Object.assign(r, payload));
          updateLog.push({ table, data: payload });
          return { data: hit, error: null };
        }
        if (mode === 'insert') {
          const list = Array.isArray(payload) ? payload : [payload];
          const created = list.map((row) => {
            const id = row.id || newId();
            store[id] = { id, token: `tok-${id}`, ...row };
            insertLog.push({ table, data: row });
            return store[id];
          });
          return { data: created, error: null };
        }
        if (mode === 'upsert') {
          const cols = (conflictCols || 'id').split(',').map((c) => c.trim());
          const existing = Object.values(store).find((r) => cols.every((c) => r[c] === payload[c]));
          if (existing) {
            Object.assign(existing, payload);
            updateLog.push({ table, data: payload });
            return { data: [existing], error: null };
          }
          const id = payload.id || newId();
          store[id] = { id, ...payload };
          insertLog.push({ table, data: payload });
          return { data: [store[id]], error: null };
        }
        if (mode === 'delete') {
          const hit = matching();
          hit.forEach((r) => { delete store[r.id]; });
          return { data: hit, error: null };
        }
        return { data: null, error: null };
      }

      const b = {
        select: (_cols, opts) => {
          if (mode === 'select') { wantCount = opts?.count === 'exact'; headOnly = !!opts?.head; }
          return b;
        },
        insert: (data) => { mode = 'insert'; payload = data; return b; },
        update: (data) => { mode = 'update'; payload = data; return b; },
        upsert: (data, opts) => { mode = 'upsert'; payload = Array.isArray(data) ? data[0] : data; conflictCols = opts?.onConflict; return b; },
        delete: () => { mode = 'delete'; return b; },

        eq:  (c, v) => { preds.push((r) => r[c] === v); return b; },
        neq: (c, v) => { preds.push((r) => r[c] !== v); return b; },
        in:  (c, vs) => { preds.push((r) => vs.includes(r[c])); return b; },
        is:  (c, v) => { preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
        gt:  (c, v) => { preds.push((r) => r[c] > v); return b; },
        gte: (c, v) => { preds.push((r) => r[c] >= v); return b; },
        lt:  (c, v) => { preds.push((r) => r[c] < v); return b; },
        not: () => b,
        order: () => b,
        limit: (n) => { limitN = n; return b; },

        single: async () => {
          const { data, error } = await exec();
          if (error) return { data: null, error };
          const row = Array.isArray(data) ? data[0] : data;
          return { data: row || null, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
        },
        maybeSingle: async () => {
          const { data, error } = await exec();
          const row = Array.isArray(data) ? data[0] : data;
          return { data: row || null, error: error || null };
        },
        then: (resolve, reject) => exec().then(resolve, reject),
      };
      return b;
    },
  }),
}));

jest.mock('../src/services/vendor-alerts', () => ({
  alert: jest.fn(async () => {}),
  alerts: {
    onboardingComplete: jest.fn(async () => {}),
    serverError:        jest.fn(async () => {}),
    serverRestart:      jest.fn(async () => {}),
    provisioningFailed: jest.fn(async () => {}),
  },
}));
jest.mock('../src/services/greenapi',      () => ({
  sendMessage: jest.fn(async () => {}),
  setWebhook:  jest.fn(async () => ({ ok: true })),
  formatPhone: (r) => r.replace(/[^0-9]/g, ''),
  toChatId:    (p) => `${p}@c.us`,
}));
jest.mock('../src/services/meta-whatsapp', () => ({
  subscribeWaba: jest.fn(async () => ({ success: true })),
  sendMessage:   jest.fn(async () => {}),
  formatPhone:   (r) => r.replace(/[^0-9]/g, ''),
  parseIncoming: () => null,
  verifyWebhook: () => null,
  verifySignature: () => 'unconfigured',
  ENV_CREDS: {},
}));
jest.mock('../src/services/slug', () => ({
  assignSlug: jest.fn(async () => 'test-slug'),
  resolveTenantBySlug: jest.fn(async () => null),
}));
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

  // The rate is chosen with the region, by the only person who can look it up.
  // REGIONS.US.tax_rate is 9.5 labelled "verify per address" — an unsourced
  // number that no published figure for Los Angeles agrees with.
  test('a US link cannot be created without an explicit rate', async () => {
    const res = await request(app)
      .post('/api/vendor/onboarding')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ name: 'LA Pizza', region: 'US' })
      .expect(400);

    expect(res.body.field).toBe('tax_rate');
    // Rejected BEFORE the client row is written — validating after the insert
    // would leave an orphan client with no session attached to it.
    expect(insertLog.find(l => l.table === 'clients' && l.data.name === 'LA Pizza')).toBeUndefined();
  });

  test('a US link stores the rate the vendor verified, to three decimals', async () => {
    await request(app)
      .post('/api/vendor/onboarding')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ name: 'LA Pizza', region: 'US', tax_rate: '9.125' })
      .expect(200);

    const session = insertLog.find(l => l.table === 'onboarding_sessions');
    expect(session.data.region).toBe('US');
    expect(session.data.tax_rate).toBe(9.125);
  });

  test('an Israeli link needs no rate — the national rate is the authority', async () => {
    await request(app)
      .post('/api/vendor/onboarding')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ name: 'פיצה תל אביב', region: 'IL' })
      .expect(200);

    const session = insertLog.find(l => l.table === 'onboarding_sessions');
    expect(session.data.region).toBe('IL');
    expect(session.data.tax_rate).toBeNull();
  });

  test('a rate outside 0-100 is refused', async () => {
    for (const bad of ['-1', '101', 'abc']) {
      await request(app)
        .post('/api/vendor/onboarding')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ name: 'X', region: 'US', tax_rate: bad })
        .expect(400);
    }
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

// ── Draft autosave (wizard step transitions) ──────────────────────────────────
describe('PATCH /api/onboarding/:token — draft mode', () => {
  test('draft:true saves fields but keeps status pending_client and checklist unticked', async () => {
    const s = makeSession('tok-draft-1');

    await request(app)
      .patch(`/api/onboarding/tok-draft-1`)
      .send({ business_name: 'טיוטה בע"מ', bot_whatsapp: '0501111111', draft: true })
      .expect(200);

    const row = tables.onboarding_sessions[s.id];
    expect(row.business_name).toBe('טיוטה בע"מ');
    expect(row.status).toBe('pending_client');               // NOT flipped
    expect(row.checklist?.[0]?.done ?? false).toBe(false);   // client_info NOT ticked

    const upd = updateLog.filter(u => u.table === 'onboarding_sessions').at(-1);
    expect(upd.data.status).toBeUndefined();
  });

  test('final submit (no draft flag) flips status and ticks client_info', async () => {
    const s = makeSession('tok-final-1');

    await request(app)
      .patch(`/api/onboarding/tok-final-1`)
      .send({ business_name: 'סופי בע"מ', bot_whatsapp: '0502222222' })
      .expect(200);

    const row = tables.onboarding_sessions[s.id];
    expect(row.status).toBe('pending_vendor');
    expect(row.checklist.find(i => i.key === 'client_info').done).toBe(true);
  });

  test('menu_notes free text is persisted', async () => {
    const s = makeSession('tok-menu-1');
    await request(app)
      .patch(`/api/onboarding/tok-menu-1`)
      .send({ business_name: 'עם תפריט', bot_whatsapp: '0503333333', menu_notes: 'פיצה — 50₪', draft: true })
      .expect(200);
    expect(tables.onboarding_sessions[s.id].menu_notes).toBe('פיצה — 50₪');
  });
});

// ── Embedded Signup endpoint (pre Tech-Provider approval) ─────────────────────
describe('POST /api/onboarding/:token/whatsapp-signup', () => {
  test('returns 501 while META_APP_ID/SECRET are not configured', async () => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    makeSession('tok-signup-1');

    const res = await request(app)
      .post('/api/onboarding/tok-signup-1/whatsapp-signup')
      .send({ code: 'c', waba_id: 'w', phone_number_id: 'p' })
      .expect(501);
    expect(res.body.error).toMatch(/עדיין לא זמין/);
  });
});

// ── Vendor side: POST /api/vendor/onboarding/:id/approve — guards ────────────
// This endpoint provisions settings, a menu copy, admin users, a login and the
// WhatsApp channel. It used to run with no state check at all: approving twice
// duplicated the client's whole menu and minted a second working login, and a
// session the client had never submitted could be provisioned empty.
describe('POST /api/vendor/onboarding/:id/approve — guards', () => {
  const withClient = (over = {}) =>
    makeSession(`appr-${Math.random().toString(36).slice(2)}`, {
      clients: { id: 'c-1', tenant_id: 'tenant-appr-1', name: 'בדיקה' },
      ...over,
    });

  test('refuses a session that is already approved (no duplicate menu / second login)', async () => {
    const s = withClient({ status: 'approved' });

    const res = await request(app)
      .post(`/api/vendor/onboarding/${s.id}/approve`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .expect(409);

    expect(res.body.error).toContain('כבר אושר');
  });

  test('refuses a session the client has not submitted yet', async () => {
    const s = withClient({ status: 'pending_client' });

    const res = await request(app)
      .post(`/api/vendor/onboarding/${s.id}/approve`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .expect(409);

    expect(res.body.error).toContain('עדיין לא שלח');
  });

  test('refuses an expired session, like every other reader of expires_at', async () => {
    const s = withClient({
      status: 'pending_vendor',
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    });

    await request(app)
      .post(`/api/vendor/onboarding/${s.id}/approve`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .expect(410);
  });

  test('requires vendor auth', async () => {
    const s = withClient({ status: 'pending_vendor' });
    await request(app).post(`/api/vendor/onboarding/${s.id}/approve`).expect(401);
  });
});

// ── Vendor side: the provisioning transaction itself ─────────────────────────
describe('POST /api/vendor/onboarding/:id/approve — provisioning', () => {
  const TENANT = 'tenant-prov-1';
  const DEFAULT = 'aaaaaaaa-0000-0000-0000-000000000001';

  function seedSourceMenu() {
    tables.categories = {
      'c-src-1': { id: 'c-src-1', tenant_id: DEFAULT, name_he: 'פיצות', sort_order: 1 },
      'c-src-2': { id: 'c-src-2', tenant_id: DEFAULT, name_he: 'שתייה', sort_order: 2 },
    };
    tables.products = {
      'p-src-1': { id: 'p-src-1', tenant_id: DEFAULT, category_id: 'c-src-1', name_he: 'משפחתית', price: 58,
                   product_additions: [{ id: 'a-1', product_id: 'p-src-1', name_he: 'זיתים', price: 3 }] },
      'p-src-2': { id: 'p-src-2', tenant_id: DEFAULT, category_id: 'c-src-2', name_he: 'קולה', price: 12,
                   product_additions: [] },
    };
    tables.product_additions = {};
    tables.admin_users = {};
    tables.settings = {};
  }

  function readySession(over = {}) {
    return makeSession(`prov-${Math.random().toString(36).slice(2)}`, {
      status: 'pending_vendor',
      business_name: 'פיצה בדיקה',
      admin_phones: [{ name: 'בעלים', phone: '972501234567' }],
      meta_waba_id: 'WABA-1',
      meta_access_token: 'META-TOKEN',
      clients: { id: 'client-prov-1', tenant_id: TENANT, name: 'פיצה בדיקה' },
      ...over,
    });
  }

  const approve = (id) => request(app)
    .post(`/api/vendor/onboarding/${id}/approve`)
    .set('Authorization', `Bearer ${vendorToken}`);

  beforeEach(() => {
    seedSourceMenu();
    tables.tenant_users = {};
    mockFailOn = {};
  });

  test('provisions everything and reports the credentials once', async () => {
    const s = readySession();
    const res = await approve(s.id).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.username).toMatch(/^client-/);
    expect(res.body.password).toBeTruthy();
    expect(res.body).toHaveProperty('credentialsDelivered');

    // settings seeded for THIS tenant
    const seeded = Object.values(tables.settings).filter(r => r.tenant_id === TENANT);
    expect(seeded.find(r => r.key === 'business_name').value).toBe('פיצה בדיקה');

    // menu copied once, under the new tenant, with additions re-pointed
    const cats  = Object.values(tables.categories).filter(r => r.tenant_id === TENANT);
    const prods = Object.values(tables.products).filter(r => r.tenant_id === TENANT);
    expect(cats).toHaveLength(2);
    expect(prods).toHaveLength(2);
    expect(Object.values(tables.product_additions)).toHaveLength(1);

    // admin + login exist, session approved, client active
    expect(Object.values(tables.admin_users).filter(r => r.tenant_id === TENANT)).toHaveLength(1);
    expect(Object.values(tables.tenant_users).filter(r => r.tenant_id === TENANT)).toHaveLength(1);
    expect(tables.onboarding_sessions[s.id].status).toBe('approved');
  });

  /**
   * The region chosen when the link was created decides the tenant's currency,
   * tax model and receipt label — one choice, made at the only moment the vendor
   * is thinking about which country the client is in.
   */
  test('the region seeds the tenant\'s whole tax model', async () => {
    // 10.25, not the region default: the seeded rate is the one the vendor
    // verified, and REGIONS.US.tax_rate must never reach a live tenant.
    const s = readySession({ region: 'US', tax_rate: 10.25 });
    await approve(s.id).expect(200);

    const seeded = Object.fromEntries(
      Object.values(tables.settings).filter(r => r.tenant_id === TENANT).map(r => [r.key, r.value]));
    expect(seeded.region).toBe('US');
    expect(seeded.currency).toBe('USD');
    expect(seeded.tax_mode).toBe('exclusive');
    expect(seeded.tax_label).toBe('Sales Tax');
    expect(seeded.tax_rate).toBe(10.25);
  });

  // The rate 9.5 was carried in REGIONS.US as "City of Los Angeles — verify per
  // address" and seeded straight into settings, where it read as a decision
  // somebody made. No published source agrees on Los Angeles and seventeen
  // district rates apply inside the city. Approving is the moment a business
  // starts charging real customers, so an unverified rate is refused outright.
  test('a US session with no explicit rate cannot be approved', async () => {
    const s = readySession({ region: 'US' });
    const res = await approve(s.id).expect(400);
    expect(res.body.field).toBe('tax_rate');

    // and nothing was provisioned on the way to that refusal
    expect(Object.values(tables.settings).filter(r => r.tenant_id === TENANT)).toHaveLength(0);
  });

  test('an unset or unknown region provisions a working Israeli tenant', async () => {
    // A normalisation slip here meant an unset region resolved to the string
    // 'UNDEFINED' and threw mid-provision, leaving the business half-created.
    for (const region of [undefined, '', 'ZZ']) {
      seedSourceMenu();
      tables.tenant_users = {};
      const s = readySession(region === undefined ? {} : { region });
      await approve(s.id).expect(200);
      const seeded = Object.fromEntries(
        Object.values(tables.settings).filter(r => r.tenant_id === TENANT).map(r => [r.key, r.value]));
      expect(seeded.region).toBe('IL');
      expect(seeded.tax_mode).toBe('inclusive');
      expect(seeded.currency).toBe('ILS');
    }
  });

  test('a second approve cannot duplicate the menu or mint a second login', async () => {
    const s = readySession();
    await approve(s.id).expect(200);

    const catsAfterFirst  = Object.values(tables.categories).filter(r => r.tenant_id === TENANT).length;
    const usersAfterFirst = Object.values(tables.tenant_users).filter(r => r.tenant_id === TENANT).length;

    await approve(s.id).expect(409);

    expect(Object.values(tables.categories).filter(r => r.tenant_id === TENANT)).toHaveLength(catsAfterFirst);
    expect(Object.values(tables.tenant_users).filter(r => r.tenant_id === TENANT)).toHaveLength(usersAfterFirst);
  });

  test('a failing step aborts with its name and leaves the session retryable', async () => {
    const s = readySession();
    mockFailOn['admin_users:upsert'] = 'permission denied';

    const res = await approve(s.id).expect(500);
    expect(res.body.step).toBe('admins');
    expect(res.body.resumable).toBe(true);

    const after = tables.onboarding_sessions[s.id];
    expect(after.status).toBe('pending_vendor');        // not left mid-flight
    expect(after.provisioning.failed_step).toBe('admins');
    expect(after.provisioning.settings).toBe(true);      // earlier steps recorded
    expect(after.provisioning.menu).toBe(true);
  });

  test('the retry after a failure resumes instead of re-copying the menu', async () => {
    const s = readySession();
    mockFailOn['admin_users:upsert'] = 'transient';
    await approve(s.id).expect(500);

    const catsAfterFailure = Object.values(tables.categories).filter(r => r.tenant_id === TENANT).length;
    expect(catsAfterFailure).toBe(2);

    await approve(s.id).expect(200);

    expect(Object.values(tables.categories).filter(r => r.tenant_id === TENANT)).toHaveLength(2);
    expect(tables.onboarding_sessions[s.id].status).toBe('approved');
  });

  test('a dead WhatsApp channel fails the approval instead of marking the client live', async () => {
    const { subscribeWaba } = require('../src/services/meta-whatsapp');
    subscribeWaba.mockRejectedValueOnce(new Error('waba not found'));

    const s = readySession();
    const res = await approve(s.id).expect(500);

    expect(res.body.step).toBe('channel');
    expect(tables.onboarding_sessions[s.id].status).not.toBe('approved');
  });

  test('a session with no admin phone is refused — nobody would ever get an order alert', async () => {
    const s = readySession({ admin_phones: [] });
    const res = await approve(s.id).expect(500);
    expect(res.body.step).toBe('admins');
  });
});

// ── Credential recovery ───────────────────────────────────────────────────────
describe('POST /api/vendor/onboarding/:id/reset-credentials', () => {
  test('issues a new password for an approved client', async () => {
    const TENANT = 'tenant-reset-1';
    tables.tenant_users = {
      'u-1': { id: 'u-1', tenant_id: TENANT, username: 'client-abc', password: 'old-hash', role: 'admin' },
    };
    const s = makeSession('reset-tok', {
      status: 'approved',
      approved_username: 'client-abc',
      admin_phones: [{ phone: '972501234567' }],
      clients: { id: 'c-r', tenant_id: TENANT, name: 'לקוח' },
    });

    const res = await request(app)
      .post(`/api/vendor/onboarding/${s.id}/reset-credentials`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .expect(200);

    expect(res.body.username).toBe('client-abc');
    expect(res.body.password).toBeTruthy();
    expect(tables.tenant_users['u-1'].password).not.toBe('old-hash');
  });

  test('requires vendor auth', async () => {
    const s = makeSession('reset-tok-2', { status: 'approved', clients: { tenant_id: 't', id: 'c' } });
    await request(app).post(`/api/vendor/onboarding/${s.id}/reset-credentials`).expect(401);
  });
});


// ── Login carries the tenant's language (A1) ─────────────────────────────────
//
// The dashboard's language used to live in localStorage and nowhere else, so it
// was a property of the BROWSER: every new device opened in Hebrew and there
// was no way to say "this business is American". It is returned at login
// because <html dir> has to be right before the first paint.
describe('POST /api/auth/login returns the tenant language', () => {
  const settings = require('../src/services/settings');

  test('an Israeli tenant logs in to Hebrew', async () => {
    settings.loadAll.mockResolvedValueOnce({});
    const res = await request(app).post('/api/auth/login')
      .send({ username: 'vendor', password: 'vendor-test-pw' });
    expect(res.status).toBe(200);
    expect(res.body.lang).toBe('he');
  });

  test('a US tenant logs in to English', async () => {
    settings.loadAll.mockResolvedValueOnce({ region: 'US' });
    const res = await request(app).post('/api/auth/login')
      .send({ username: 'vendor', password: 'vendor-test-pw' });
    expect(res.body.lang).toBe('en');
  });

  test('a settings failure never breaks the login', async () => {
    // Language is a nicety; being able to sign in is not. It falls back to
    // Hebrew rather than turning a settings hiccup into a 500 at the door.
    settings.loadAll.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).post('/api/auth/login')
      .send({ username: 'vendor', password: 'vendor-test-pw' });
    expect(res.status).toBe(200);
    expect(res.body.lang).toBe('he');
    expect(res.body.token).toBeTruthy();
  });

  test('bad credentials still 401, with no language leak', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ username: 'vendor', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.lang).toBeUndefined();
  });
});

// ── The other door into the same decision ────────────────────────────────────
// approve() is not the only way a tenant becomes American: an existing business
// can be switched with a settings PATCH. That path seeded the region default
// too, and silently — nobody reviews a settings write the way somebody reviews
// an approval. Leaving the previous country's rate would be worse still: 18%
// Israeli VAT charged to a Los Angeles customer as sales tax.
describe('PATCH /api/settings — switching region', () => {
  const settingsSvc = require('../src/services/settings');
  const adminToken  = signDashboard('admin', 'admin', 'aaaaaaaa-0000-0000-0000-000000000001');

  const patch = (body) => request(app).patch('/api/settings')
    .set('Authorization', `Bearer ${adminToken}`).send(body);
  const persisted = () => Object.fromEntries(settingsSvc.set.mock.calls.map(([k, v]) => [k, v]));

  beforeEach(() => { settingsSvc.set.mockClear(); });

  test('switching to US without a rate is refused, and writes nothing', async () => {
    const res = await patch({ region: 'US' }).expect(400);
    expect(res.body.field).toBe('tax_rate');
    expect(settingsSvc.set).not.toHaveBeenCalled();
  });

  test('switching to US keeps the rate given in the same request', async () => {
    await patch({ region: 'US', tax_rate: 10.25 }).expect(200);
    const p = persisted();
    expect(p.region).toBe('US');
    expect(p.tax_rate).toBe(10.25);        // NOT REGIONS.US.tax_rate
    expect(p.currency).toBe('USD');
    expect(p.tax_mode).toBe('exclusive');
  });

  test('switching to IL still seeds the national rate, which is the authority there', async () => {
    await patch({ region: 'IL' }).expect(200);
    const p = persisted();
    expect(p.region).toBe('IL');
    expect(p.tax_rate).toBe(18);
    expect(p.currency).toBe('ILS');
  });

  test('an unknown region is refused rather than throwing', async () => {
    await patch({ region: 'ZZ' }).expect(400);
  });
});
