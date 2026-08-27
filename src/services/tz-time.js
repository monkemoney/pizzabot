'use strict';

/**
 * Calendar helpers in a TENANT'S timezone.
 *
 * Production runs on UTC, but every business question the product answers is a
 * local-calendar question: which orders belong to "today", which hour was the
 * peak, whether the business is open right now. Using the server clock put all
 * three hours off for an Israeli tenant — the 00:00-03:00 rush was filed under
 * the previous day, and the peak-hours chart the owner staffs against was
 * shifted by the offset (failure class 12).
 *
 * This was `il-time.js`, hardcoded to Asia/Jerusalem and probing the two
 * Israeli DST offsets by hand. A file named for one country cannot answer the
 * question for a Los Angeles tenant, so the offset is now derived from the zone
 * itself and works for any IANA timezone. The default stays Asia/Jerusalem, so
 * every existing caller behaves exactly as it did — pinned by
 * tests/il-time.test.js, whose expectations predate this change.
 */

const DEFAULT_TZ = 'Asia/Jerusalem';

// Intl formatters are expensive to construct and are created per call site;
// one per timezone is plenty.
//
// class-11 (module-level state) — both questions answered: on reset the map is
// empty and formatters are rebuilt (pure objects, no correctness impact); with
// two instances each holds its own identical copies. Nothing is written from it.
const _fmt = new Map();
function fmtFor(tz) {
  if (!_fmt.has(tz)) {
    _fmt.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }));
  }
  return _fmt.get(tz);
}

/** Local calendar parts of an instant, in `tz`. */
function parts(d = new Date(), tz = DEFAULT_TZ) {
  const f = fmtFor(tz).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  return {
    year: +f.year, month: +f.month, day: +f.day,
    hour: +(f.hour === '24' ? '0' : f.hour), minute: +f.minute, second: +f.second,
    weekday: new Date(`${f.year}-${f.month}-${f.day}T00:00:00Z`).getUTCDay(),
  };
}

/** Minutes `tz` is ahead of UTC at this instant (negative for the Americas). */
function offsetMinutes(d, tz) {
  const p = parts(d, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - d.getTime()) / 60000);
}

/**
 * The UTC instant of a local midnight in `tz`.
 *
 * Solved rather than probed: the previous version tried Israel's two possible
 * offsets and kept whichever round-tripped, which cannot generalise. Converging
 * on the offset AT the candidate instant handles any zone, and the DST
 * transitions where local midnight is ambiguous or does not exist.
 */
function midnightUTC(year, month, day, tz = DEFAULT_TZ) {
  const localAsUTC = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = new Date(localAsUTC);
  for (let i = 0; i < 3; i++) {
    const next = new Date(localAsUTC - offsetMinutes(guess, tz) * 60000);
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }
  return guess;
}

/** Hour of day (0-23) in `tz`. */
function hourOf(iso, tz = DEFAULT_TZ) {
  return parts(new Date(iso), tz).hour;
}

/** Local YYYY-MM-DD in `tz`, for day bucketing. */
function dayKey(iso, tz = DEFAULT_TZ) {
  const p = parts(new Date(iso), tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Half-open [start, end) ISO range for a dashboard period, in `tz`. */
function periodRange(period, date, tz = DEFAULT_TZ) {
  const t = parts(date ? new Date(date) : new Date(), tz);
  let start, end;
  switch (period) {
    case 'week':
      start = midnightUTC(t.year, t.month, t.day - t.weekday, tz);
      end   = new Date(start.getTime() + 7 * 86400000);
      break;
    case 'month':
      start = midnightUTC(t.year, t.month, 1, tz);
      end   = midnightUTC(t.month === 12 ? t.year + 1 : t.year, t.month === 12 ? 1 : t.month + 1, 1, tz);
      break;
    case 'year':
      start = midnightUTC(t.year, 1, 1, tz);
      end   = midnightUTC(t.year + 1, 1, 1, tz);
      break;
    case 'all':
      start = new Date(Date.UTC(2020, 0, 1));
      end   = new Date(Date.UTC(2100, 0, 1));
      break;
    default: // 'today' or a specific date
      start = midnightUTC(t.year, t.month, t.day, tz);
      end   = new Date(start.getTime() + 86400000);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

/** "HH:MM" wall-clock time in `tz`, 24-hour. */
function clock(d = new Date(), tz = DEFAULT_TZ) {
  const p = parts(d, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Minutes since local midnight — what an opening-hours window compares against. */
function minutesOfDay(d = new Date(), tz = DEFAULT_TZ) {
  const p = parts(d, tz);
  return p.hour * 60 + p.minute;
}

// ── Backward-compatible Israel-bound names ───────────────────────────────────
// Every pre-2026-08-26 caller used these; they are the same functions with the
// timezone bound, so nothing about an Israeli tenant changes.
const IL_TZ = DEFAULT_TZ;
const ilParts       = (d)          => parts(d, IL_TZ);
const ilMidnightUTC = (y, m, d)    => midnightUTC(y, m, d, IL_TZ);
const ilHourOf      = (iso)        => hourOf(iso, IL_TZ);
const ilDayKey      = (iso)        => dayKey(iso, IL_TZ);

module.exports = {
  DEFAULT_TZ, parts, offsetMinutes, midnightUTC, hourOf, dayKey, periodRange,
  clock, minutesOfDay,
  IL_TZ, ilParts, ilMidnightUTC, ilHourOf, ilDayKey,
};
