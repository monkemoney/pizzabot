'use strict';

/**
 * Israel-time calendar helpers.
 *
 * Production runs on UTC, but every business question the dashboard answers is
 * an Israel-time question: which orders belong to "today", which hour was the
 * peak. Using the server clock put both 3 hours off — the 00:00-03:00 rush was
 * filed under the previous day, and the peak-hours chart the owner staffs
 * against was shifted by the offset.
 */

const IL_TZ = 'Asia/Jerusalem';

const _fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: IL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** Israel-time calendar parts of an instant. */
function ilParts(d = new Date()) {
  const f = _fmt.formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  return {
    year: +f.year, month: +f.month, day: +f.day,
    hour: +(f.hour === '24' ? '0' : f.hour), minute: +f.minute, second: +f.second,
    weekday: new Date(`${f.year}-${f.month}-${f.day}T00:00:00Z`).getUTCDay(),
  };
}

/**
 * The UTC instant of an Israel-local midnight.
 * Israel is UTC+2 or UTC+3 depending on DST, so both are probed and the one
 * that round-trips to the requested local date is the correct one.
 */
function ilMidnightUTC(year, month, day) {
  for (const offset of [2, 3]) {
    const guess = new Date(Date.UTC(year, month - 1, day, 0 - offset, 0, 0));
    const p = ilParts(guess);
    if (p.year === year && p.month === month && p.day === day && p.hour === 0) return guess;
  }
  return new Date(Date.UTC(year, month - 1, day, -2, 0, 0));
}

/** Hour of day (0-23) in Israel time. */
function ilHourOf(iso) {
  return ilParts(new Date(iso)).hour;
}

/** Israel-local YYYY-MM-DD, for day bucketing. */
function ilDayKey(iso) {
  const p = ilParts(new Date(iso));
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Half-open [start, end) ISO range for a dashboard period, in Israel time. */
function periodRange(period, date) {
  const t = ilParts(date ? new Date(date) : new Date());
  let start, end;
  switch (period) {
    case 'week':
      start = ilMidnightUTC(t.year, t.month, t.day - t.weekday);
      end   = new Date(start.getTime() + 7 * 86400000);
      break;
    case 'month':
      start = ilMidnightUTC(t.year, t.month, 1);
      end   = ilMidnightUTC(t.month === 12 ? t.year + 1 : t.year, t.month === 12 ? 1 : t.month + 1, 1);
      break;
    case 'year':
      start = ilMidnightUTC(t.year, 1, 1);
      end   = ilMidnightUTC(t.year + 1, 1, 1);
      break;
    case 'all':
      start = new Date(Date.UTC(2020, 0, 1));
      end   = new Date(Date.UTC(2100, 0, 1));
      break;
    default: // 'today' or a specific date
      start = ilMidnightUTC(t.year, t.month, t.day);
      end   = new Date(start.getTime() + 86400000);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

module.exports = { IL_TZ, ilParts, ilMidnightUTC, ilHourOf, ilDayKey, periodRange };
