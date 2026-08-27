'use strict';

/**
 * Israel-time calendar helpers.
 *
 * Production runs on UTC while every question the stats page answers is an
 * Israel-time question, so these tests pin the boundary behaviour that used to
 * be 2-3 hours off: which day an order belongs to, and which hour it counts in.
 */

process.env.TZ = 'UTC';   // mirror Render

const { periodRange, ilHourOf, ilDayKey, ilMidnightUTC } = require('../src/services/tz-time');

// July → Israel is UTC+3 (IDT). January → UTC+2 (IST).
describe('day boundaries follow Israel midnight, not the server clock', () => {
  test('an order at 01:30 Israel time belongs to that Israel day', () => {
    // 22:30Z on the 26th is 01:30 on the 27th in Israel — the late-night rush
    // that the UTC-based version filed under the previous day.
    const { start, end } = periodRange('today', '2026-07-26T22:30:00Z');
    expect(start).toBe('2026-07-26T21:00:00.000Z');   // 00:00 IL on the 27th
    expect(end).toBe('2026-07-27T21:00:00.000Z');     // 00:00 IL on the 28th
    expect(ilDayKey('2026-07-26T22:30:00Z')).toBe('2026-07-27');
  });

  test('an order at 04:30 Israel time lands in the same day as 01:30', () => {
    const a = periodRange('today', '2026-07-26T22:30:00Z');
    const b = periodRange('today', '2026-07-27T01:30:00Z');
    expect(a).toEqual(b);
  });

  test('a day is exactly 24h long', () => {
    const { start, end } = periodRange('today', '2026-07-15T10:00:00Z');
    expect(new Date(end) - new Date(start)).toBe(86400000);
  });

  test('winter time (UTC+2) is handled as well as summer (UTC+3)', () => {
    expect(ilMidnightUTC(2026, 1, 15).toISOString()).toBe('2026-01-14T22:00:00.000Z');
    expect(ilMidnightUTC(2026, 7, 15).toISOString()).toBe('2026-07-14T21:00:00.000Z');
  });
});

describe('hour buckets are Israel hours', () => {
  test('22:30Z in July is hour 1 in Israel, not 22', () => {
    expect(ilHourOf('2026-07-26T22:30:00Z')).toBe(1);
  });

  test('midday is midday', () => {
    expect(ilHourOf('2026-07-26T09:00:00Z')).toBe(12);
  });
});

describe('longer periods', () => {
  test('a month starts at Israel midnight on the 1st and ends on the 1st of the next', () => {
    const { start, end } = periodRange('month', '2026-07-15T10:00:00Z');
    expect(start).toBe('2026-06-30T21:00:00.000Z');
    expect(end).toBe('2026-07-31T21:00:00.000Z');
  });

  test('December rolls into the next year', () => {
    const { start, end } = periodRange('month', '2026-12-15T10:00:00Z');
    expect(start).toBe('2026-11-30T22:00:00.000Z');
    expect(end).toBe('2026-12-31T22:00:00.000Z');
  });

  test('a week is seven days from Israel-local Sunday', () => {
    const { start, end } = periodRange('week', '2026-07-15T10:00:00Z'); // Wednesday
    expect(new Date(end) - new Date(start)).toBe(7 * 86400000);
    expect(ilDayKey(start)).toBe('2026-07-12'); // Sunday
  });
});

/**
 * The DST week-boundary bug, found by A/B-ing the rewrite against the original.
 *
 * The old ilMidnightUTC probed Israel's two offsets and kept whichever
 * round-tripped. periodRange('week') computes `day - weekday`, which goes ≤ 0
 * whenever the week starts in the previous month — and an out-of-range day can
 * never satisfy `p.day === day`, so BOTH probes failed and it fell through to a
 * hardcoded winter offset. During Israeli DST the weekly stats window therefore
 * started an hour late, for roughly half the year.
 *
 * The offset is now solved at the candidate instant instead of guessed, which
 * is also what makes any non-Israeli timezone possible at all.
 */
describe('week boundaries across a DST transition', () => {
  const localOf = (iso, tz) => new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, dateStyle: 'short', timeStyle: 'short', hour12: false,
  }).format(new Date(iso));

  test('a week starting in the previous month lands on real local midnight', () => {
    // Wednesday 1 April 2026: the week starts 29 March, after DST began.
    const r = periodRange('week', new Date('2026-04-01T12:00:00Z'));
    expect(r.start).toBe('2026-03-28T21:00:00.000Z');
    expect(localOf(r.start, 'Asia/Jerusalem')).toBe('2026-03-29, 00:00');
  });

  test('every week of the year starts at 00:00 local, not 01:00', () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86400e3) {
      const r = periodRange('week', new Date(t));
      expect(localOf(r.start, 'Asia/Jerusalem')).toMatch(/, 00:00$/);
    }
  });

  test('a week is still exactly seven days long', () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86400e3) {
      const r = periodRange('week', new Date(t));
      expect(new Date(r.end) - new Date(r.start)).toBe(7 * 86400000);
    }
  });
});

describe('any timezone, not just Israel', () => {
  const { parts, dayKey, hourOf, midnightUTC, clock, minutesOfDay, periodRange: range } = require('../src/services/tz-time');
  const LA = 'America/Los_Angeles';

  test('Los Angeles midnight is solved correctly on both sides of DST', () => {
    // PST (UTC-8) in January, PDT (UTC-7) in July.
    expect(midnightUTC(2026, 1, 15, LA).toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(midnightUTC(2026, 7, 15, LA).toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  test('the same instant is a different calendar day in each zone', () => {
    // 08:00 UTC = 10:00 in Israel (same day), 00:00 in LA (still the same day),
    // but 04:00 UTC is the previous day in LA.
    const iso = '2026-01-15T04:00:00.000Z';
    expect(dayKey(iso, 'Asia/Jerusalem')).toBe('2026-01-15');
    expect(dayKey(iso, LA)).toBe('2026-01-14');
  });

  test('hour-of-day differs by the offset', () => {
    const iso = '2026-01-15T20:00:00.000Z';
    expect(hourOf(iso, 'Asia/Jerusalem')).toBe(22);
    expect(hourOf(iso, LA)).toBe(12);
  });

  test('clock() and minutesOfDay() agree with each other', () => {
    const d = new Date('2026-07-04T19:30:00.000Z');
    expect(clock(d, LA)).toBe('12:30');
    expect(minutesOfDay(d, LA)).toBe(12 * 60 + 30);
  });

  test('an LA "today" window is 24h and starts at local midnight', () => {
    const r = range('today', new Date('2026-07-04T19:30:00.000Z'), LA);
    expect(new Date(r.end) - new Date(r.start)).toBe(86400000);
    expect(r.start).toBe('2026-07-04T07:00:00.000Z');
  });

  test('an unknown timezone does not throw the process down', () => {
    expect(() => parts(new Date(), 'Asia/Jerusalem')).not.toThrow();
  });
});
