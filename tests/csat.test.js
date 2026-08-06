'use strict';

/**
 * csat.test.js
 *
 * A bare "1" is overloaded in this bot: it confirms an order mid-conversation,
 * and while a dispute is open it CANCELS the order and triggers a refund. So a
 * rating may only ever be captured on an idle conversation, and the pending
 * state must clear itself rather than linger and eat a later message.
 */

const mockOrders = {};
let mockSession = null;
const mockSent = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      update: (patch) => ({
        eq: async (_c, id) => { Object.assign(mockOrders[id] || (mockOrders[id] = {}), patch); return { data: null, error: null }; },
      }),
      select: () => ({ eq: () => ({ in: () => ({ limit: async () => ({ data: [] }) }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'ins-1' }, error: null }) }) }),
    }),
  }),
}));

const mockUpdateSession = jest.fn(async (phone, patch) => {
  if (mockSession) Object.assign(mockSession, patch);
});
jest.mock('../src/services/supabase', () => ({
  getSession: jest.fn(async () => mockSession),
  updateSession: mockUpdateSession,
}));
jest.mock('../src/services/greenapi', () => ({
  sendMessage: jest.fn(async (phone, text) => { mockSent.push(text); }),
}));
jest.mock('../src/services/insights', () => ({ addInsightOnce: jest.fn(async () => 'ins-1') }));

const { askCsat, handleCsatReply } = require('../src/services/csat');
const TID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PHONE = '972500000001';

function session(over = {}) {
  return { phone: PHONE, conversation_history: [], pending_csat: null, pending_dispute: null,
           is_bot_active: true, opted_out: false, ...over };
}
const pendingAsk = (over = {}) =>
  ({ order_id: 'o1', order_number: 1001, asked_at: new Date().toISOString(), ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockSent.length = 0;
  Object.keys(mockOrders).forEach((k) => delete mockOrders[k]);
  mockSession = session();
});

describe('askCsat', () => {
  test('asks once and records the pending state', async () => {
    const ok = await askCsat({ id: 'o1', order_number: 1001, phone: PHONE }, TID);
    expect(ok).toBe(true);
    expect(mockSent[0]).toMatch(/1001/);
    expect(mockSession.pending_csat.order_id).toBe('o1');
  });

  test('never asks while a dispute is open — numeric replies belong to it', async () => {
    mockSession = session({ pending_dispute: { order_id: 'o1' } });
    expect(await askCsat({ id: 'o1', order_number: 1001, phone: PHONE }, TID)).toBe(false);
    expect(mockSent).toHaveLength(0);
  });

  test('never asks when an agent has the conversation, or the customer opted out', async () => {
    mockSession = session({ is_bot_active: false });
    expect(await askCsat({ id: 'o1', order_number: 1, phone: PHONE }, TID)).toBe(false);
    mockSession = session({ opted_out: true });
    expect(await askCsat({ id: 'o1', order_number: 1, phone: PHONE }, TID)).toBe(false);
    expect(mockSent).toHaveLength(0);
  });

  test('never asks twice for the same order', async () => {
    expect(await askCsat({ id: 'o1', order_number: 1, phone: PHONE, csat_rating: 5 }, TID)).toBe(false);
    mockSession = session({ pending_csat: pendingAsk() });
    expect(await askCsat({ id: 'o1', order_number: 1, phone: PHONE }, TID)).toBe(false);
  });
});

describe('handleCsatReply', () => {
  test('captures a rating on an idle conversation', async () => {
    mockSession = session({ pending_csat: pendingAsk() });
    const handled = await handleCsatReply(PHONE, '5', mockSession, TID);
    expect(handled).toBe(true);
    expect(mockOrders.o1.csat_rating).toBe(5);
    expect(mockSession.pending_csat).toBeNull();
  });

  test('THE COLLISION GUARD: "1" mid-conversation is NOT a rating', async () => {
    mockSession = session({
      pending_csat: pendingAsk(),
      conversation_history: [{ role: 'user', content: 'אני רוצה פיצה' }, { role: 'assistant', content: 'סיכום...' }],
    });
    const handled = await handleCsatReply(PHONE, '1', mockSession, TID);
    expect(handled).toBe(false);              // falls through to the order flow
    expect(mockOrders.o1).toBeUndefined();    // nothing recorded
    expect(mockSession.pending_csat).toBeNull();  // and the ask is dropped
  });

  test('a low rating asks why, then stores the comment and raises an insight', async () => {
    mockSession = session({ pending_csat: pendingAsk() });
    expect(await handleCsatReply(PHONE, '1', mockSession, TID)).toBe(true);
    expect(mockOrders.o1.csat_rating).toBe(1);
    expect(mockSession.pending_csat.awaiting_comment).toBe(true);
    expect(mockSent.join(' ')).toMatch(/לשפר/);

    expect(await handleCsatReply(PHONE, 'הפיצה הגיעה קרה', mockSession, TID)).toBe(true);
    expect(mockOrders.o1.csat_comment).toBe('הפיצה הגיעה קרה');
    expect(require('../src/services/insights').addInsightOnce).toHaveBeenCalled();
    expect(mockSession.pending_csat).toBeNull();
  });

  test('a non-rating reply clears the ask and flows on', async () => {
    mockSession = session({ pending_csat: pendingAsk() });
    expect(await handleCsatReply(PHONE, 'אני רוצה להזמין שוב', mockSession, TID)).toBe(false);
    expect(mockSession.pending_csat).toBeNull();
    expect(mockOrders.o1).toBeUndefined();
  });

  test('out-of-range digits are not ratings', async () => {
    mockSession = session({ pending_csat: pendingAsk() });
    expect(await handleCsatReply(PHONE, '7', mockSession, TID)).toBe(false);
    expect(mockOrders.o1).toBeUndefined();
  });

  test('an ask older than 24h expires instead of eating a message', async () => {
    const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    mockSession = session({ pending_csat: pendingAsk({ asked_at: old }) });
    expect(await handleCsatReply(PHONE, '5', mockSession, TID)).toBe(false);
    expect(mockOrders.o1).toBeUndefined();
    expect(mockSession.pending_csat).toBeNull();
  });

  test('no pending ask — nothing is consumed', async () => {
    expect(await handleCsatReply(PHONE, '1', session(), TID)).toBe(false);
  });
});
