'use strict';

/**
 * Israel-time calendar helpers.
 *
 * Production runs on UTC while every question the stats page answers is an
 * Israel-time question, so these tests pin the boundary behaviour that used to
 * be 2-3 hours off: which day an order belongs to, and which hour it counts in.
 */

process.env.TZ = 'UTC';   // mirror Render

const { periodRange, ilHourOf, ilDayKey, ilMidnightUTC } = require('../src/services/il-time');

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
