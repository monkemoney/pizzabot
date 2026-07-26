'use strict';

/**
 * Order state machine (src/services/order-state.js) — unit tests.
 * Verifies: transition validation, force override, optimistic concurrency
 * guard, status_history append, accept() stamping + custom customer message,
 * and afterCreate() manual/auto acceptance modes.
 */

process.env.TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT = process.env.TENANT_ID;

// ── In-memory mockOrders store ────────────────────────────────────────────────────
const mockOrders = {};   // id → row
let mockUpdateCalls = [];

function seedOrder(overrides = {}) {
  const id = `ord-${Object.keys(mockOrders).length + 1}`;
  mockOrders[id] = {
    id, order_number: 1000 + Object.keys(mockOrders).length,
    phone: '972501111111', status: 'new', status_history: [],
    tenant_id: TENANT, delivery_method: 'delivery', payment_method: 'cash',
    payment_status: 'paid', total_price: 100, items: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
  return mockOrders[id];
}

// ── @supabase/supabase-js mock (supports order-state's exact chains) ──────────
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      let _filters = {};
      let _updateVals = null;
      const b = {
        select: () => b,
        eq: (col, val) => { _filters[col] = val; return b; },
        single: async () => {
          const row = Object.values(mockOrders).find(r =>
            Object.entries(_filters).every(([k, v]) => r[k] === v));
          return { data: row || null, error: row ? null : { code: 'PGRST116' } };
        },
        update: (vals) => {
          _updateVals = vals;
          const u = {
            eq: (col, val) => { _filters[col] = val; return u; },
            select: async () => {
              const row = Object.values(mockOrders).find(r =>
                Object.entries(_filters).every(([k, v]) => r[k] === v));
              mockUpdateCalls.push({ vals: { ..._updateVals }, filters: { ..._filters } });
              if (!row) return { data: [], error: null };
              Object.assign(row, _updateVals);
              return { data: [row], error: null };
            },
          };
          return u;
        },
      };
      return b;
    },
  }),
}));

const mockSseBroadcast = jest.fn();
jest.mock('../src/services/sse', () => ({ broadcast: (...a) => mockSseBroadcast(...a) }));

const mockSendLog = [];
jest.mock('../src/services/greenapi', () => ({
  sendMessage: jest.fn(async (phone, text) => { mockSendLog.push({ phone, text }); }),
}));

const mockNotify = jest.fn(async () => {});
jest.mock('../src/services/status-notifier', () => ({
  notifyStatusChange: (...a) => mockNotify(...a),
}));

let mockSettingsValues = {};
jest.mock('../src/services/settings', () => ({
  get: jest.fn(async (key) => mockSettingsValues[key] ?? null),
}));

const orderState = require('../src/services/order-state');

beforeEach(() => {
  for (const k of Object.keys(mockOrders)) delete mockOrders[k];
  mockUpdateCalls = [];
  mockSendLog.length = 0;
  mockSettingsValues = {};
  mockSseBroadcast.mockClear();
  mockNotify.mockClear();
});

// ── transition ────────────────────────────────────────────────────────────────

describe('transition', () => {
  test('valid transition new → preparing updates row, appends history, broadcasts SSE, notifies', async () => {
    const o = seedOrder();
    const { order, changed } = await orderState.transition(o.id, 'preparing', { by: 'kitchen' });

    expect(changed).toBe(true);
    expect(order.status).toBe('preparing');
    expect(order.status_history).toHaveLength(1);
    expect(order.status_history[0]).toMatchObject({ status: 'preparing', by: 'kitchen' });
    expect(mockSseBroadcast).toHaveBeenCalledWith(TENANT, 'order_updated', expect.objectContaining({ id: o.id }));
    expect(mockNotify).toHaveBeenCalled();
  });

  test('invalid transition new → delivered throws INVALID_TRANSITION', async () => {
    const o = seedOrder();
    await expect(orderState.transition(o.id, 'delivered'))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(mockOrders[o.id].status).toBe('new');
  });

  test('force overrides the transition table (but not the concurrency guard)', async () => {
    const o = seedOrder({ status: 'delivered' });
    const { order } = await orderState.transition(o.id, 'preparing', { force: true });
    expect(order.status).toBe('preparing');
  });

  test('concurrency guard: update filters on the from-status', async () => {
    const o = seedOrder();
    await orderState.transition(o.id, 'preparing');
    expect(mockUpdateCalls[0].filters).toMatchObject({ id: o.id, status: 'new' });
  });

  test('same-status transition is a no-op (changed=false, no notify)', async () => {
    const o = seedOrder({ status: 'preparing' });
    const { changed } = await orderState.transition(o.id, 'preparing');
    expect(changed).toBe(false);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  test('notify:false suppresses the standard customer notification', async () => {
    const o = seedOrder();
    await orderState.transition(o.id, 'cancelled', { notify: false, extra: { cancelled_by: 'business' } });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockOrders[o.id].cancelled_by).toBe('business');
  });

  test('unknown order throws ORDER_NOT_FOUND', async () => {
    await expect(orderState.transition('nope', 'preparing'))
      .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});

// ── accept ────────────────────────────────────────────────────────────────────

describe('accept', () => {
  test('stamps accepted_at + prep_minutes and sends approval message with ETA', async () => {
    const o = seedOrder();
    const order = await orderState.accept(o.id, { prepMinutes: 40, by: 'dashboard' });

    expect(order.status).toBe('preparing');
    expect(order.accepted_at).toBeTruthy();
    expect(order.prep_minutes).toBe(40);
    expect(mockNotify).not.toHaveBeenCalled();            // custom message instead
    expect(mockSendLog).toHaveLength(1);
    expect(mockSendLog[0].text).toContain('אושרה');
    expect(mockSendLog[0].text).toContain('40');
  });

  test('pickup mockOrders get pickup wording', async () => {
    const o = seedOrder({ delivery_method: 'pickup' });
    await orderState.accept(o.id, { prepMinutes: 20 });
    expect(mockSendLog[0].text).toContain('לאיסוף');
  });

  test('cannot accept a cancelled order', async () => {
    const o = seedOrder({ status: 'cancelled' });
    await expect(orderState.accept(o.id, { prepMinutes: 30 }))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

// ── afterCreate / acceptance mode ────────────────────────────────────────────

describe('afterCreate', () => {
  test('manual mode (default): order stays new, no message', async () => {
    const o = seedOrder();
    const mode = await orderState.afterCreate(o);
    expect(mode).toBe('manual');
    expect(mockOrders[o.id].status).toBe('new');
    expect(mockSendLog).toHaveLength(0);
  });

  test('auto mode: order is accepted immediately with default prep time', async () => {
    mockSettingsValues.order_acceptance = 'auto';
    mockSettingsValues.default_prep_minutes = 25;
    const o = seedOrder();
    const mode = await orderState.afterCreate(o);
    expect(mode).toBe('auto');
    expect(mockOrders[o.id].status).toBe('preparing');
    expect(mockOrders[o.id].prep_minutes).toBe(25);
    expect(mockSendLog[0].text).toContain('אושרה');
  });

  test('auto mode skips Bit mockOrders awaiting payment', async () => {
    mockSettingsValues.order_acceptance = 'auto';
    const o = seedOrder({ payment_method: 'bit', payment_status: 'pending' });
    const mode = await orderState.afterCreate(o);
    expect(mode).toBe('auto');
    expect(mockOrders[o.id].status).toBe('new');
  });
});
