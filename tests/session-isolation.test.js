'use strict';

/**
 * Session isolation — verifies that sessions are keyed by (phone, tenant_id)
 * and that admin sessions use the 'admin:<phone>' prefix.
 *
 * Tests the getSession / updateSession contract from supabase.js by mocking
 * @supabase/supabase-js and checking which keys are used to read/write.
 */

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Stores sessions as { [tenantId:phone]: session }
const sessionStore = {};
const upsertLog    = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (table !== 'sessions') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
          upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        };
      }

      let _tenantId;
      let _phone;
      let _updateVals;

      const b = {
        select: (_cols) => b,
        insert: (row) => {
          _tenantId  = row.tenant_id;
          _phone     = row.phone;
          _updateVals = row;
          return {
            select: () => ({
              single: async () => ({ data: { ...row, id: 'new-id' }, error: null }),
            }),
          };
        },
        update: (vals) => {
          _updateVals = vals;
          return {
            eq: (col, val) => ({
              select: () => ({
                single: async () => {
                  const key = `${val}:${Object.values(_tenantId || {})[0] || ''}`;
                  return { data: { ...vals, phone: val }, error: null };
                },
              }),
            }),
          };
        },
        upsert: (vals) => {
          _updateVals = vals;
          const key = `${vals.tenant_id}:${vals.phone}`;
          sessionStore[key] = { ...sessionStore[key], ...vals };
          upsertLog.push({ tenant_id: vals.tenant_id, phone: vals.phone });
          return { select: () => ({ single: async () => ({ data: sessionStore[key], error: null }) }) };
        },
        eq: (col, val) => {
          if (col === 'tenant_id') { _tenantId = val; return b; }
          if (col === 'phone')     { _phone    = val; return b; }
          return b;
        },
        single: async () => {
          const key = `${_tenantId}:${_phone}`;
          if (sessionStore[key]) return { data: sessionStore[key], error: null };
          return { data: null, error: { code: 'PGRST116', message: 'Not found' } };
        },
      };
      return b;
    },
  }),
}));

// Must require AFTER the mock is set up
const {
  getSession,
  updateSession,
} = require('../src/services/supabase');

const DEFAULT_TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_B          = 'bbbbbbbb-0000-0000-0000-000000000002';

function seedSession(tenantId, phone, data = {}) {
  const key = `${tenantId}:${phone}`;
  sessionStore[key] = {
    tenant_id:            tenantId,
    phone,
    conversation_history: [],
    pending_order:        {},
    ...data,
  };
}

beforeEach(() => {
  Object.keys(sessionStore).forEach(k => delete sessionStore[k]);
  upsertLog.length = 0;
});

// ── Same phone, different tenants ─────────────────────────────────────────────
describe('cross-tenant isolation', () => {
  test('same phone in two tenants returns different sessions', async () => {
    const phone = '972501111111';
    seedSession(DEFAULT_TENANT_ID, phone, { conversation_history: [{ role: 'user', content: 'tenant-A order' }] });
    seedSession(TENANT_B,          phone, { conversation_history: [{ role: 'user', content: 'tenant-B order' }] });

    const sessA = await getSession(phone, DEFAULT_TENANT_ID);
    const sessB = await getSession(phone, TENANT_B);

    expect(sessA.conversation_history[0].content).toBe('tenant-A order');
    expect(sessB.conversation_history[0].content).toBe('tenant-B order');
    expect(sessA.conversation_history[0].content).not.toBe(sessB.conversation_history[0].content);
  });

  test('updateSession writes to correct tenant key only', async () => {
    const phone = '972502222222';
    seedSession(DEFAULT_TENANT_ID, phone, { conversation_history: [] });
    seedSession(TENANT_B,          phone, { conversation_history: [] });

    await updateSession(phone, { conversation_history: [{ role: 'user', content: 'only-A' }] }, DEFAULT_TENANT_ID);

    // Tenant A should be updated
    expect(sessionStore[`${DEFAULT_TENANT_ID}:${phone}`].conversation_history[0].content).toBe('only-A');
    // Tenant B untouched
    expect(sessionStore[`${TENANT_B}:${phone}`].conversation_history).toHaveLength(0);
  });
});

// ── Admin prefix isolation ────────────────────────────────────────────────────
describe('admin session key prefix', () => {
  test('admin session uses admin:<phone> key — separate from customer session', async () => {
    const phone        = '972503333333';
    const adminPhone   = `admin:${phone}`;

    seedSession(DEFAULT_TENANT_ID, phone,      { conversation_history: [{ role: 'user', content: 'customer msg' }] });
    seedSession(DEFAULT_TENANT_ID, adminPhone, { conversation_history: [{ role: 'user', content: 'admin msg'    }] });

    const customerSess = await getSession(phone,      DEFAULT_TENANT_ID);
    const adminSess    = await getSession(adminPhone,  DEFAULT_TENANT_ID);

    expect(customerSess.conversation_history[0].content).toBe('customer msg');
    expect(adminSess.conversation_history[0].content).toBe('admin msg');
  });

  test('writing to admin session does not touch customer session', async () => {
    const phone      = '972504444444';
    const adminPhone = `admin:${phone}`;

    seedSession(DEFAULT_TENANT_ID, phone,      { conversation_history: [] });
    seedSession(DEFAULT_TENANT_ID, adminPhone, { conversation_history: [] });

    await updateSession(adminPhone, { conversation_history: [{ role: 'assistant', content: 'admin reply' }] }, DEFAULT_TENANT_ID);

    expect(sessionStore[`${DEFAULT_TENANT_ID}:${phone}`].conversation_history).toHaveLength(0);
    expect(sessionStore[`${DEFAULT_TENANT_ID}:${adminPhone}`].conversation_history[0].content).toBe('admin reply');
  });
});

// ── New session creation ──────────────────────────────────────────────────────
describe('session creation for new phone', () => {
  test('getSession creates a default session when none exists', async () => {
    const sess = await getSession('972509999999', DEFAULT_TENANT_ID);
    expect(sess).toBeTruthy();
    expect(Array.isArray(sess.conversation_history)).toBe(true);
    expect(typeof sess.pending_order).toBe('object');
  });
});
