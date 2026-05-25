'use strict';

// Dynamic mock data — tests push rows here, Supabase mock returns them
const dbRows = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: dbRows, error: null }),
      }),
      upsert: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }),
}));

const settings = require('../src/services/settings');

function setSettings(values) {
  dbRows.length = 0;
  Object.entries(values).forEach(([key, value]) => dbRows.push({ key, value }));
  settings._clearCache(); // force fresh load from (mocked) DB
}

afterEach(() => settings._clearCache());

describe('isOpen — manual override', () => {
  test('returns false when is_open is false', async () => {
    setSettings({ is_open: false });
    expect(await settings.isOpen()).toBe(false);
  });

  test('returns true when is_open is true and no business_hours set', async () => {
    setSettings({ is_open: true });
    expect(await settings.isOpen()).toBe(true);
  });
});

describe('isOpen — business hours (Israel timezone)', () => {
  function makeHours(overrides = {}) {
    const days = ['sun','mon','tue','wed','thu','fri','sat'];
    const result = {};
    days.forEach(d => {
      result[d] = overrides[d] ?? { is_open: true, open: '00:00', close: '23:59' };
    });
    return result;
  }

  function todayIL() {
    const nowIL = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
    const days = ['sun','mon','tue','wed','thu','fri','sat'];
    return days[new Date(nowIL).getDay()];
  }

  test('returns false when todays day is marked closed', async () => {
    const today = todayIL();
    const hours = makeHours({ [today]: { is_open: false, open: '09:00', close: '22:00' } });
    setSettings({ is_open: true, business_hours: hours });
    expect(await settings.isOpen()).toBe(false);
  });

  test('returns true when window is 00:00–23:59 (always open)', async () => {
    setSettings({ is_open: true, business_hours: makeHours() });
    expect(await settings.isOpen()).toBe(true);
  });

  test('returns false when window is 00:00–00:01 (always closed)', async () => {
    const today = todayIL();
    const hours = makeHours({ [today]: { is_open: true, open: '00:00', close: '00:01' } });
    setSettings({ is_open: true, business_hours: hours });

    const nowIL = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
    const nowMinutes = new Date(nowIL).getHours() * 60 + new Date(nowIL).getMinutes();

    if (nowMinutes > 1) {
      expect(await settings.isOpen()).toBe(false);
    } else {
      // literally midnight — skip this edge case
      expect(typeof await settings.isOpen()).toBe('boolean');
    }
  });
});
