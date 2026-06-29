'use strict';

/**
 * Admin bot — dispatchActions tests.
 * Tests all ACTION blocks that the admin bot emits:
 * SET_AVAILABLE, ORDER_STATUS, CANCEL_ORDER, DISPUTE, LIST_ORDERS, CONFIRM_PAYMENT
 */

// ── Mutable state shared between mock and tests ───────────────────────────────
const dbRows   = {
  products:          [],
  product_additions: [],
  orders:            [],
};
const updateLog      = [];  // { table, vals, filter }
const sendLog        = [];  // { phone, text }
let mockClaudeReturn = '';  // what callClaude returns for this test

// ── @supabase/supabase-js mock ────────────────────────────────────────────────
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const rows = dbRows[table] || [];

      let mode       = 'select';
      let updateVals = null;
      let filters    = {};
      let ilikeCol   = null;
      let ilikeVal   = null;

      let inCol = null;
      let inVals = null;

      const b = {
        select: () => { mode = 'select'; return b; },
        update: (vals) => {
          mode       = 'update';
          updateVals = vals;
          return b;
        },
        eq: (col, val) => {
          if (mode === 'update') {
            updateLog.push({ table, vals: { ...updateVals }, filter: { [col]: val } });
            return Promise.resolve({ error: null });
          }
          filters[col] = val;
          return b;
        },
        in: (col, vals) => {
          inCol  = col;
          inVals = vals;
          return b;
        },
        ilike: (col, pattern) => {
          ilikeCol = col;
          ilikeVal = pattern.replace(/%/g, '');
          return b;
        },
        limit: async (n) => {
          let result = rows;
          if (Object.keys(filters).length) {
            result = result.filter(r => Object.entries(filters).every(([k, v]) => r[k] === v));
          }
          if (inCol && inVals) {
            result = result.filter(r => inVals.includes(r[inCol]));
          }
          if (ilikeCol) {
            result = result.filter(r => String(r[ilikeCol] || '').includes(ilikeVal));
          }
          return { data: result.slice(0, n) };
        },
        single: async () => {
          const row = rows.find(r =>
            Object.entries(filters).every(([k, v]) => r[k] === v)
          ) || null;
          return { data: row };
        },
        order: () => b,
      };
      return b;
    },
  }),
}));

// ── Service mocks ─────────────────────────────────────────────────────────────
jest.mock('../src/services/claude', () => ({
  callClaude: jest.fn(async () => mockClaudeReturn),
}));

jest.mock('../src/services/greenapi', () => ({
  sendMessage: jest.fn(async (phone, text) => { sendLog.push({ phone, text }); }),
}));

jest.mock('../src/services/supabase', () => ({
  getSession:        jest.fn(async (phone) => ({
    phone,
    conversation_history: [],
    pending_order: {},
  })),
  updateSession:     jest.fn(async () => {}),
  getOrders:         jest.fn(async () => dbRows.orders),
  updateOrderStatus: jest.fn(async (id, status) => ({ id, status })),
  getOrderById:      jest.fn(async (id) => dbRows.orders.find(o => o.id === id) || null),
}));

jest.mock('../src/services/settings', () => ({
  loadAll:      jest.fn(async () => ({ is_open: true, delivery_enabled: true })),
  set:          jest.fn(async () => {}),
  _clearCache:  jest.fn(),
  get:          jest.fn(async () => null),
}));

jest.mock('../src/services/menu-service', () => ({
  invalidateCache: jest.fn(),
}));

jest.mock('../src/services/status-notifier', () => ({
  notifyStatusChange: jest.fn(async () => {}),
}));

const { handleAdminMessage } = require('../src/bot/admin-handler');

const ADMIN_USER = { name: 'ישראל', role: 'admin' };
const PHONE      = '972501234567';
const TENANT     = 'aaaaaaaa-0000-0000-0000-000000000001';

function seedProduct(id, name_he, is_available = true) {
  dbRows.products.push({ id, name_he, price: 50, is_available, tenant_id: TENANT });
}
function seedTopping(id, product_id, name_he, is_available = true) {
  dbRows.product_additions.push({ id, product_id, name_he, price: 5, is_available });
}
function seedOrder(overrides = {}) {
  const order = {
    id:             'ord-1',
    order_number:   1001,
    phone:          '972509876543',
    customer_name:  'לקוח',
    status:         'new',
    payment_method: 'cash',
    payment_status: 'paid',
    total_price:    60,
    tenant_id:      TENANT,
    ...overrides,
  };
  dbRows.orders.push(order);
  return order;
}

beforeEach(() => {
  dbRows.products.length          = 0;
  dbRows.product_additions.length = 0;
  dbRows.orders.length            = 0;
  updateLog.length                = 0;
  sendLog.length                  = 0;
  mockClaudeReturn                = '';
  jest.clearAllMocks();
});

// ── SET_AVAILABLE — product ───────────────────────────────────────────────────
describe('SET_AVAILABLE — product', () => {
  test('marks a product unavailable', async () => {
    seedProduct('p-1', 'פיצה מרגריטה');
    mockClaudeReturn = '<!--ADMIN:SET_AVAILABLE:{"type":"product","name":"מרגריטה","available":false}-->';

    await handleAdminMessage(PHONE, 'נגמרה מרגריטה', ADMIN_USER, TENANT);

    const upd = updateLog.find(u => u.table === 'products');
    expect(upd).toBeDefined();
    expect(upd.vals.is_available).toBe(false);
  });

  test('marks a product available', async () => {
    seedProduct('p-2', 'פיצה ספייסי', false);
    mockClaudeReturn = '<!--ADMIN:SET_AVAILABLE:{"type":"product","name":"ספייסי","available":true}-->';

    await handleAdminMessage(PHONE, 'חזרה ספייסי', ADMIN_USER, TENANT);

    const upd = updateLog.find(u => u.table === 'products');
    expect(upd).toBeDefined();
    expect(upd.vals.is_available).toBe(true);
  });

  test('reports error when product not found', async () => {
    mockClaudeReturn = '<!--ADMIN:SET_AVAILABLE:{"type":"product","name":"לא קיימת","available":false}-->';

    await handleAdminMessage(PHONE, 'נגמרה לא קיימת', ADMIN_USER, TENANT);

    const msg = sendLog.find(s => s.text.includes('לא נמצא'));
    expect(msg).toBeDefined();
  });
});

// ── SET_AVAILABLE — topping ───────────────────────────────────────────────────
describe('SET_AVAILABLE — topping', () => {
  test('marks a topping unavailable', async () => {
    seedProduct('p-1', 'פיצה');
    seedTopping('t-1', 'p-1', 'בולגרית');
    mockClaudeReturn = '<!--ADMIN:SET_AVAILABLE:{"type":"topping","name":"בולגרית","available":false}-->';

    await handleAdminMessage(PHONE, 'נגמרה בולגרית', ADMIN_USER, TENANT);

    const upd = updateLog.find(u => u.table === 'product_additions');
    expect(upd).toBeDefined();
    expect(upd.vals.is_available).toBe(false);
  });
});

// ── ORDER_STATUS ──────────────────────────────────────────────────────────────
describe('ORDER_STATUS', () => {
  test('updates order status to preparing', async () => {
    const order = seedOrder({ order_number: 1002, id: 'ord-2' });
    mockClaudeReturn = `<!--ADMIN:ORDER_STATUS:{"order_number":1002,"status":"preparing"}-->`;

    const { updateOrderStatus } = require('../src/services/supabase');
    await handleAdminMessage(PHONE, 'הזמנה 1002 בהכנה', ADMIN_USER, TENANT);

    expect(updateOrderStatus).toHaveBeenCalledWith(order.id, 'preparing');
  });

  test('reports error when order not found', async () => {
    mockClaudeReturn = '<!--ADMIN:ORDER_STATUS:{"order_number":9999,"status":"preparing"}-->';

    await handleAdminMessage(PHONE, 'הזמנה 9999 בהכנה', ADMIN_USER, TENANT);

    const msg = sendLog.find(s => s.text.includes('לא נמצאה'));
    expect(msg).toBeDefined();
  });
});

// ── CANCEL_ORDER ──────────────────────────────────────────────────────────────
describe('CANCEL_ORDER', () => {
  test('cancels an active order and notifies customer', async () => {
    seedOrder({ order_number: 1003, id: 'ord-3', status: 'new' });
    mockClaudeReturn = '<!--ADMIN:CANCEL_ORDER:{"order_number":1003,"reason":"נגמר חומר","notify_customer":true}-->';

    await handleAdminMessage(PHONE, 'בטל 1003', ADMIN_USER, TENANT);

    const upd = updateLog.find(u => u.table === 'orders' && u.vals.status === 'cancelled');
    expect(upd).toBeDefined();
    expect(upd.vals.cancelled_by).toBe('business');

    const notif = sendLog.find(s => s.text.includes('בוטלה'));
    expect(notif).toBeDefined();
  });

  test('skips notification when notify_customer is false', async () => {
    seedOrder({ order_number: 1004, id: 'ord-4', status: 'new' });
    mockClaudeReturn = '<!--ADMIN:CANCEL_ORDER:{"order_number":1004,"reason":"בדיקה","notify_customer":false}-->';

    await handleAdminMessage(PHONE, 'בטל 1004', ADMIN_USER, TENANT);

    // sendMessage should only be called for admin reply, NOT for customer cancel notification
    const customerCancel = sendLog.find(s => s.phone === '972509876543' && s.text.includes('בוטלה'));
    expect(customerCancel).toBeUndefined();
  });

  test('skips already-cancelled order', async () => {
    seedOrder({ order_number: 1005, id: 'ord-5', status: 'cancelled' });
    mockClaudeReturn = '<!--ADMIN:CANCEL_ORDER:{"order_number":1005,"reason":"","notify_customer":false}-->';

    await handleAdminMessage(PHONE, 'בטל 1005', ADMIN_USER, TENANT);

    const msg = sendLog.find(s => s.text.includes('כבר'));
    expect(msg).toBeDefined();
  });
});

// ── DISPUTE ───────────────────────────────────────────────────────────────────
describe('DISPUTE', () => {
  test('opens a dispute and sends WhatsApp to customer', async () => {
    seedOrder({ order_number: 1006, id: 'ord-6', status: 'preparing' });
    mockClaudeReturn = '<!--ADMIN:DISPUTE:{"order_number":1006,"missing":["גבינה","פטריות"]}-->';

    await handleAdminMessage(PHONE, 'פתח מחלוקת 1006', ADMIN_USER, TENANT);

    const upd = updateLog.find(u => u.table === 'orders' && u.vals.dispute_status === 'pending');
    expect(upd).toBeDefined();
    expect(upd.vals.dispute_item).toContain('גבינה');

    const notif = sendLog.find(s => s.text.includes('אזל'));
    expect(notif).toBeDefined();
    expect(notif.text).toContain('גבינה');
  });
});

// ── LIST_ORDERS ───────────────────────────────────────────────────────────────
describe('LIST_ORDERS', () => {
  test('lists active orders in reply', async () => {
    seedOrder({ order_number: 1007, status: 'preparing', customer_name: 'דנה', total_price: 80 });
    seedOrder({ order_number: 1008, status: 'new',       customer_name: 'עמית', total_price: 55, id: 'ord-8' });
    mockClaudeReturn = '<!--ADMIN:LIST_ORDERS:{"status":"all"}-->';

    await handleAdminMessage(PHONE, 'מה ההזמנות', ADMIN_USER, TENANT);

    const listMsg = sendLog.find(s => s.text.includes('#1007') || s.text.includes('הזמנות'));
    expect(listMsg).toBeDefined();
  });
});

// ── CONFIRM_PAYMENT ───────────────────────────────────────────────────────────
describe('CONFIRM_PAYMENT', () => {
  test('marks Bit payment as paid and notifies customer', async () => {
    seedOrder({ order_number: 1009, id: 'ord-9', payment_method: 'bit', payment_status: 'pending' });
    mockClaudeReturn = '<!--ADMIN:CONFIRM_PAYMENT:{"order_number":1009}-->';

    await handleAdminMessage(PHONE, 'קיבלתי Bit על 1009', ADMIN_USER, TENANT);

    const upd = updateLog.find(u => u.table === 'orders' && u.vals.payment_status === 'paid');
    expect(upd).toBeDefined();

    const notif = sendLog.find(s => s.text.includes('התשלום') && s.text.includes('1009'));
    expect(notif).toBeDefined();
    expect(notif.text).toContain('Bit');
  });

  test('skips order that is already paid', async () => {
    seedOrder({ order_number: 1010, id: 'ord-10', payment_method: 'bit', payment_status: 'paid' });
    mockClaudeReturn = '<!--ADMIN:CONFIRM_PAYMENT:{"order_number":1010}-->';

    await handleAdminMessage(PHONE, 'אשר תשלום 1010', ADMIN_USER, TENANT);

    const upd = updateLog.find(u => u.table === 'orders' && u.vals.payment_status === 'paid');
    expect(upd).toBeUndefined();

    const msg = sendLog.find(s => s.text.includes('כבר שולמה'));
    expect(msg).toBeDefined();
  });
});

// ── SET ───────────────────────────────────────────────────────────────────────
describe('SET', () => {
  test('closes the restaurant', async () => {
    mockClaudeReturn = '<!--ADMIN:SET:{"key":"is_open","value":false}-->';
    const { set } = require('../src/services/settings');

    await handleAdminMessage(PHONE, 'סגור', ADMIN_USER, TENANT);

    expect(set).toHaveBeenCalledWith('is_open', false, TENANT);
  });

  test('rejects unknown keys', async () => {
    mockClaudeReturn = '<!--ADMIN:SET:{"key":"unknown_key","value":true}-->';

    await handleAdminMessage(PHONE, 'שנה משהו', ADMIN_USER, TENANT);

    const msg = sendLog.find(s => s.text.includes('לא מורשה'));
    expect(msg).toBeDefined();
  });
});

// ── reset command ─────────────────────────────────────────────────────────────
describe('reset command', () => {
  test('clears admin session history on "reset"', async () => {
    const { updateSession } = require('../src/services/supabase');
    await handleAdminMessage(PHONE, 'reset', ADMIN_USER, TENANT);
    expect(updateSession).toHaveBeenCalledWith(
      `admin:${PHONE}`,
      { conversation_history: [] },
      TENANT
    );
  });

  test('clears on Hebrew "אפס"', async () => {
    const { updateSession } = require('../src/services/supabase');
    await handleAdminMessage(PHONE, 'אפס', ADMIN_USER, TENANT);
    expect(updateSession).toHaveBeenCalledWith(
      `admin:${PHONE}`,
      { conversation_history: [] },
      TENANT
    );
  });
});
