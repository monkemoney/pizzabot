// Company OS kit — pure parsers for the registers the board and the lint read: open decisions (deadlines and the
// silence rule), the problems log (open cases, their age, unchecked rows), briefs (the five parts), and ledger ages.
// No I/O and no `new Date()` here — every function takes `now`, so the tests can pin time. Tested in registers.test.mjs.

const MS_H = 3_600_000;

/** `2026-01-02` · `2.1.2026` · `2.1` (needs `year`) → Date at 00:00 UTC, or null. */
export function parseDate(s, year = null) {
  const t = String(s ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = /^(\d{1,2})\.(\d{1,2})$/.exec(t);
  if (m && year) return new Date(Date.UTC(year, +m[2] - 1, +m[1]));
  return null;
}

export const hoursBetween = (a, b) => (b - a) / MS_H;

/** Split one markdown table row into trimmed cells (outer pipes dropped). */
export function cells(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  return t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
}

/** DECISIONS-OPEN.md → the rows of the "## Open" table: { id, question, default, impact, source, deadline, class }.
 *  `class` comes from the §0 silence table (reversible | money | legal | outward | credentials | autonomy …). */
export function parseOpenDecisions(text) {
  const lines = String(text ?? '').split('\n');
  const classes = new Map();
  const open = [];
  let section = '';
  for (const line of lines) {
    if (line.startsWith('## ')) section = line.slice(3).trim().toLowerCase();
    const c = cells(line);
    if (!c || c.length < 4 || /^-+$/.test(c[0]) || c[0] === 'When' || c[0] === 'id') continue;
    if (section.startsWith('0.') && /^[A-Z]-\d+$/.test(c[1] ?? '')) classes.set(c[1], (c[2] ?? '').toLowerCase());
    if (section === 'open' && /^[A-Z]-\d+$/.test(c[0])) {
      open.push({ id: c[0], question: c[1], default: (c[2] ?? '').replace(/\*\*/g, ''), impact: c[3] ?? '', source: c[4] ?? '',
                  deadline: c[5] ?? '', class: classes.get(c[0]) ?? 'unknown' });
    }
  }
  return open;
}

/** Overdue and silence-rule status per open decision. A reversible item past deadline + silenceHours = the default applies;
 *  money/legal/outward/credentials/autonomy never fire — they wait and are re-asked. */
export function decisionStatus(rows, now, silenceHours = 48) {
  return rows.map((r) => {
    const d = parseDate(r.deadline);
    const overdueH = d ? hoursBetween(d, now) : null;
    const reversible = r.class === 'reversible';
    return { ...r, deadlineDate: d, overdue: overdueH != null && overdueH > 0,
             silenceFires: reversible && overdueH != null && overdueH > silenceHours,
             waits: !reversible && overdueH != null && overdueH > 0, placeholder: !d && /<.*>/.test(r.deadline) };
  });
}

/** docs/cases/LOG.md rows → { n, date, problem, area, cost, cause, class, solution, guard, status, refs, checked }. */
export function parseCases(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const c = cells(line);
    if (!c || c.length < 12 || !/^\d+$/.test(c[0])) continue;
    if (/<date>/.test(c[1])) continue;   // the template row
    out.push({ n: +c[0], date: c[1], problem: c[2], area: c[3], cost: c[4], cause: c[5], class: c[6], solution: c[7],
               guard: c[8], status: c[9], refs: c[10], checked: c[11] });
  }
  return out;
}

export function caseSummary(rows, now, staleDays = 14) {
  const open = rows.filter((r) => /^open/i.test(r.status));
  const ages = open.map((r) => { const d = parseDate(r.date); return d ? hoursBetween(d, now) / 24 : null; }).filter((x) => x != null);
  const byClass = {};
  for (const r of rows) byClass[r.class || '?'] = (byClass[r.class || '?'] ?? 0) + 1;
  return {
    total: rows.length, open: open.length, closed: rows.length - open.length,
    unchecked: rows.filter((r) => !r.checked.startsWith('✓')).length,
    noGuard: rows.filter((r) => !r.guard || /^to come/i.test(r.guard)).length,
    oldestOpenDays: ages.length ? Math.round(Math.max(...ages)) : 0,
    stale: open.filter((r) => { const d = parseDate(r.date); return d && hoursBetween(d, now) / 24 > staleDays; }).map((r) => r.n),
    byClass,
  };
}

/** A brief must carry the parts the spawn prompt relies on. Returns the missing ones. */
export function checkBrief(text, parts) {
  return parts.filter((k) => !String(text ?? '').includes(k));
}

/** Hours since each role's last ledger event; `paused`/`closed-for-day` older than alertHours are flagged.
 *  Ledger days are `d.m` — the year comes from `now` (a ledger spanning New Year needs the year in the line; rare). */
export function ledgerAges(lastByRole, now, alertHours = 24) {
  const out = [];
  for (const [role, e] of lastByRole) {
    const d = parseDate(e.day, now.getUTCFullYear());
    if (d && e.time) { const [h, m] = e.time.split(':').map(Number); d.setUTCHours(h, m); }
    const hours = d ? Math.max(0, hoursBetween(d, now)) : null;
    out.push({ role, kind: e.kind, text: e.text, hours, flag: hours != null && e.kind !== 'resumed' && hours > alertHours });
  }
  return out;
}

/** changes.log lines must read `<YYYY-MM-DD> · <who> · <HH:MM> <tz>: <what>`; returns the offending line numbers. */
export function badChangeLines(text) {
  const bad = [];
  String(text ?? '').split('\n').forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    if (!/^\d{4}-\d{2}-\d{2} · [^·]+ · \d{1,2}:\d{2}[^:]*: .+/.test(line)) bad.push(i + 1);
  });
  return bad;
}

const ASK = /\b(?:re-)?asked\b|שאלנו|נשאל/i;
// `route change: none yet` (the INBOX loop-line template) is not a route change — something must be named after the colon
const ROUTE = /route change:\s*(?!none\b|nothing\b|—|-|\||$)\S/i;

/** Loop alarm (kit §6): per decision id, the number of distinct days it was asked toward the owner since its last
 *  `route change:` line. Reads changes.log lines (`<YYYY-MM-DD> · …`) and INBOX rows (When column first). A line counts
 *  as an ask when it names the id and an ask word ("asked", "re-asked", "שאלנו", "נשאל"); a `route change:` line naming
 *  the id resets that id's count and is not itself an ask. Lines without a date are ignored — an undated ask cannot be
 *  placed on a day. Returns Map id → { round, days, routeChanged }. */
export function askCounts(changesLog, inbox) {
  const events = [];
  for (const line of String(changesLog ?? '').split('\n')) {
    const day = /^(\d{4}-\d{2}-\d{2}) ·/.exec(line)?.[1];
    if (day) events.push({ day, line });
  }
  for (const line of String(inbox ?? '').split('\n')) {
    const c = cells(line);
    const d = c && parseDate(c[0]);
    if (d) events.push({ day: d.toISOString().slice(0, 10), line });
  }
  events.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));   // stable: same-day lines keep file order
  const out = new Map();
  for (const { day, line } of events) {
    for (const id of new Set(line.match(/\b[A-Z]-\d+\b/g) ?? [])) {
      if (ROUTE.test(line)) { out.set(id, { days: new Set(), routeChanged: true }); continue; }
      if (!ASK.test(line)) continue;
      if (!out.has(id)) out.set(id, { days: new Set(), routeChanged: false });
      out.get(id).days.add(day);
    }
  }
  for (const [id, v] of out) {
    if (!v.days.size && !v.routeChanged) out.delete(id);
    else out.set(id, { round: v.days.size, days: [...v.days], routeChanged: v.routeChanged });
  }
  return out;
}

/** Round 2 → WARN (change the route); round 3 or more since the last route change → FAIL. */
export function loopFindings(counts) {
  const warns = [], fails = [];
  for (const [id, c] of counts) {
    if (c.round >= 3) fails.push(`loop round ${c.round}: ${id} asked on ${c.round} days without a route change — do not ask a third time; change the route first`);
    else if (c.round === 2) warns.push(`loop round 2: ${id} asked on 2 days — change the route (default? different person? smaller question?)`);
  }
  return { warns, fails };
}
