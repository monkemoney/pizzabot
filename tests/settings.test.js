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

// ── open_override — spontaneous open/close with built-in expiry ───────────────
describe('open_override — temporary open/close', () => {
  const inOneHour   = () => new Date(Date.now() + 3_600_000).toISOString();
  const oneHourAgo  = () => new Date(Date.now() - 3_600_000).toISOString();
  const alwaysClosedHours = () => {
    const h = {};
    ['sun','mon','tue','wed','thu','fri','sat'].forEach(d => { h[d] = { is_open: false }; });
    return h;
  };
  const alwaysOpenHours = () => {
    const h = {};
    ['sun','mon','tue','wed','thu','fri','sat'].forEach(d => { h[d] = { is_open: true, open: '00:00', close: '23:59' }; });
    return h;
  };

  test('open override wins outside business hours (the midnight incident)', async () => {
    setSettings({
      is_open: true,
      business_hours: alwaysClosedHours(),
      open_override: { state: true, until: inOneHour() },
    });
    expect(await settings.isOpen()).toBe(true);
  });

  test('open override wins even over is_open=false', async () => {
    setSettings({ is_open: false, open_override: { state: true, until: inOneHour() } });
    expect(await settings.isOpen()).toBe(true);
  });

  test('close override wins inside business hours', async () => {
    setSettings({
      is_open: true,
      business_hours: alwaysOpenHours(),
      open_override: { state: false, until: inOneHour() },
    });
    expect(await settings.isOpen()).toBe(false);
  });

  test('expired override is ignored — schedule takes back over', async () => {
    setSettings({
      is_open: true,
      business_hours: alwaysClosedHours(),
      open_override: { state: true, until: oneHourAgo() },
    });
    expect(await settings.isOpen()).toBe(false);
  });

  test('malformed / cancelled override markers are ignored', async () => {
    for (const bad of [false, {}, { state: true }, { state: 'yes', until: inOneHour() }, { state: true, until: 'garbage' }]) {
      setSettings({ is_open: true, business_hours: alwaysClosedHours(), open_override: bad });
      expect(await settings.isOpen()).toBe(false);
    }
  });

  test('override opens delivery outside delivery hours', async () => {
    setSettings({
      is_open: true,
      delivery_hours: alwaysClosedHours(),
      open_override: { state: true, until: inOneHour() },
    });
    expect(await settings.isDeliveryOpen()).toBe(true);
  });

  test('delivery_enabled=false is structural — an open override does NOT revive it', async () => {
    setSettings({
      is_open: true,
      delivery_enabled: false,
      open_override: { state: true, until: inOneHour() },
    });
    expect(await settings.isDeliveryOpen()).toBe(false);
  });

  test('activeOverride returns the override only while valid', () => {
    expect(settings.activeOverride({ open_override: { state: true, until: inOneHour() } })).toMatchObject({ state: true });
    expect(settings.activeOverride({ open_override: { state: true, until: oneHourAgo() } })).toBeNull();
    expect(settings.activeOverride({ open_override: false })).toBeNull();
    expect(settings.activeOverride({})).toBeNull();
  });
});

// ── Overnight windows (_inHoursWindow — pure, deterministic) ──────────────────
// Added 2026-07: close < open means the window spills past midnight.
describe('_inHoursWindow — overnight windows', () => {
  const { _inHoursWindow } = settings;
  // now = a specific local time (day: 0=Sun..6=Sat)
  const at = (day, hh, mm) => {
    const d = new Date(2026, 6, 12 + day, hh, mm); // 2026-07-12 is a Sunday
    return d;
  };
  const base = { is_open: true, open: '10:00', close: '22:00' };
  const week = (over = {}) => ({
    sun: base, mon: base, tue: base, wed: base, thu: base, fri: base, sat: base, ...over,
  });

  test('normal window — inside is open, outside is closed', () => {
    expect(_inHoursWindow(week(), at(0, 12, 0))).toBe(true);   // Sun noon
    expect(_inHoursWindow(week(), at(0, 23, 0))).toBe(false);  // Sun 23:00
    expect(_inHoursWindow(week(), at(0, 9, 59))).toBe(false);  // before opening
  });

  test('overnight window — open before midnight', () => {
    const hours = week({ sat: { is_open: true, open: '20:00', close: '01:00' } });
    expect(_inHoursWindow(hours, at(6, 23, 30))).toBe(true);   // Sat 23:30
  });

  test('overnight window — spill past midnight uses yesterday tail', () => {
    const hours = week({
      sat: { is_open: true, open: '20:00', close: '01:00' },
      sun: { is_open: false, open: '10:00', close: '22:00' },  // Sunday itself closed
    });
    expect(_inHoursWindow(hours, at(7, 0, 30))).toBe(true);    // Sun 00:30 — Saturday's tail
    expect(_inHoursWindow(hours, at(7, 1, 30))).toBe(false);   // Sun 01:30 — tail over
  });

  test('overnight tail does not leak when yesterday window is normal', () => {
    // Saturday closes 23:30 (normal) — Sunday 00:30 must be closed
    const hours = week({
      sat: { is_open: true, open: '20:00', close: '23:30' },
      sun: { is_open: false },
    });
    expect(_inHoursWindow(hours, at(7, 0, 30))).toBe(false);
  });

  test('closed day blocks its own window but not yesterday tail', () => {
    const hours = week({
      sat: { is_open: false, open: '20:00', close: '01:00' },  // sat closed entirely
    });
    expect(_inHoursWindow(hours, at(6, 23, 0))).toBe(false);   // Sat night closed
    expect(_inHoursWindow(hours, at(7, 0, 30))).toBe(false);   // no tail from a closed day
  });
});
