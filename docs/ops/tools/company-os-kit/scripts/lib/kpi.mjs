// Company OS kit — the KPI engine (1.3), pure half. Computes the owner (D) and process (E) KPIs from the registers every
// instance already has, decides breaches, compares with the previous snapshot and lists the cases a breach should open.
// No I/O and no `new Date()` here: the CLI (scripts/kpi.mjs) reads the files and passes `now`. Tested in kpi.test.mjs.
//
// The week is the 7 local calendar days ending today (cfg.timezone, default UTC). A KPI the engine has no computer for —
// a project's own domain, before its adapter exists — is recorded with an empty value and never breaches, so the
// catalogue can grow ahead of the code without lying about it.
import { parseDate, cells, parseOpenDecisions, decisionStatus, parseCases, caseSummary, ledgerAges, askCounts } from './registers.mjs';
import { parseLedger, lastByRole, parseUsage } from './ledger.mjs';

const DAY = 86_400_000;

/** Rows the engine opened itself (refs `KPI <id> · <week>`). KPIs that judge the problems log's hygiene (E6–E8) skip them:
 *  otherwise the cases a breach opens — same class, same area, no guard yet — breach E6/E7 on the next run, and the engine
 *  breeds cases about its own cases. E5 still counts them: an open breach is real open work. */
const humanCases = (text) => parseCases(text).filter((r) => !/^KPI\s/.test(r.refs));

/** `YYYY-MM-DD` of `d` in `tz`. */
export function localDay(d, tz = 'UTC') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const keyOf = (date) => date.toISOString().slice(0, 10);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (x) => Math.round(x * 10) / 10;

/** ISO week `YYYY-Www` — the idempotence key for a breach case. */
export function weekKey(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wd);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

/** up = breach below the threshold · down / zero = breach at or above it · no value = no breach. */
export function isBreach(def, value) {
  if (value == null || def.threshold == null) return false;
  return def.direction === 'up' ? value < def.threshold : value >= def.threshold;
}

/** Ledger events with an absolute time (UTC built from `d.m HH:MM`, the year from `now` — same rule as ledgerAges). */
function timedLedger(text, now) {
  return parseLedger(text).map((e) => {
    const d = parseDate(e.day, now.getUTCFullYear());
    if (d && e.time) { const [h, m] = e.time.split(':').map(Number); d.setUTCHours(h, m); }
    return { ...e, at: d };
  });
}

/** `## 0.` silence table → id → When (the day the question was first put). */
function askedOn(decisionsOpen) {
  const out = new Map();
  let section = '';
  for (const line of String(decisionsOpen ?? '').split('\n')) {
    if (line.startsWith('## ')) section = line.slice(3).trim();
    const c = cells(line);
    if (section.startsWith('0.') && c && /^[A-Z]-\d+$/.test(c[1] ?? '')) { const d = parseDate(c[0]); if (d) out.set(c[1], d); }
  }
  return out;
}

const gateLines = (text) => String(text ?? '').split('\n').map((line) => {
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(line)?.[1];
  if (!day) return null;
  return { day, ms: Number(/ms=(\d+)/.exec(line)?.[1] ?? NaN), verdict: /verdict=(.*)$/.exec(line)?.[1]?.trim() ?? '' };
}).filter(Boolean);

/** The computers: id → (ctx) → { value, note }. ctx = { src, now, cfg, inWeek(dayKey), week: [start, end] }. */
const COMPUTERS = {
  D1: ({ src, now }) => {
    const open = parseOpenDecisions(src.decisionsOpen).filter((d) => !/<.*>/.test(d.deadline));
    const when = askedOn(src.decisionsOpen);
    const ages = open.map((d) => when.get(d.id)).filter(Boolean).map((d) => (now - d) / DAY);
    return { value: open.length, note: ages.length ? `median age ${round1(median(ages))} d` : 'no ask dates in §0' };
  },
  D2: ({ src, now, cfg }) => {
    const st = decisionStatus(parseOpenDecisions(src.decisionsOpen), now, cfg.silenceHours).filter((d) => !d.placeholder);
    return { value: st.filter((d) => d.overdue).length, note: '' };
  },
  D3: ({ src, inWeek }) => {
    let n = 0;
    for (const line of String(src.decisions ?? '').split('\n')) {
      const c = cells(line);
      const d = c && /^\d+$/.test(c[0]) && parseDate(c[1]);
      if (d && inWeek(keyOf(d)) && /\(default, no answer\)/i.test(line)) n++;
    }
    return { value: n, note: 'defaults taken this week' };
  },
  D4: ({ src }) => {
    const loops = [...askCounts(src.changesLog, src.inbox)].filter(([, c]) => c.round >= 2);
    return { value: loops.length, note: loops.map(([id, c]) => `${id} round ${c.round}`).join(' · ') };
  },
  D5: ({ src, week, inWeek }) => {
    const sent = new Set((src.reports ?? []).map((f) => /^(\d{4}-\d{2}-\d{2})-owner-morning\.md$/.exec(f)?.[1]).filter(Boolean));
    let working = 0, done = 0;
    for (let t = Date.parse(week[0]); t <= Date.parse(week[1]); t += DAY) {
      const d = new Date(t), wd = d.getUTCDay();
      if (wd === 0 || wd === 6) continue;
      working++;
      if (sent.has(keyOf(d))) done++;
    }
    return working ? { value: Math.round((100 * done) / working), note: `${done} of ${working} working days` } : { value: null, note: 'no working days' };
  },
  E1: ({ src, now, cfg }) => {
    const idle = ledgerAges(lastByRole(parseLedger(src.ledger)), now, cfg.pausedAlertHours).filter((a) => a.flag);
    return { value: idle.length, note: idle.map((a) => a.role).join(' · ') };
  },
  E2: ({ src, now, inWeek }) => {
    const lastResumed = new Map(), cycles = [];
    for (const e of timedLedger(src.ledger, now)) {
      if (!e.at) continue;
      if (e.kind === 'resumed') lastResumed.set(e.role, e.at);
      if (e.kind === 'closed-for-day' && lastResumed.has(e.role) && inWeek(keyOf(e.at))) {
        cycles.push((e.at - lastResumed.get(e.role)) / 3.6e6);
        lastResumed.delete(e.role);
      }
    }
    return cycles.length ? { value: round1(median(cycles)), note: `${cycles.length} brief(s) closed` } : { value: null, note: 'no brief closed this week' };
  },
  E3: ({ src, inWeek }) => {
    const runs = gateLines(src.gateRuns).filter((g) => inWeek(g.day));
    if (!runs.length) return { value: null, note: 'no gate runs this week' };
    const pass = runs.filter((g) => !/^FAIL/.test(g.verdict)).length;
    const ms = median(runs.map((g) => g.ms).filter((x) => !Number.isNaN(x)));
    return { value: Math.round((100 * pass) / runs.length), note: `${pass}/${runs.length} passed · median ${ms} ms` };
  },
  E4: ({ src, inWeek }) => ({
    value: gateLines(src.gateRuns).filter((g) => inWeek(g.day) && /^FAIL:.*\blint\b/.test(g.verdict)).length, note: 'gate runs failed on the docs lint',
  }),
  E5: ({ src, now, cfg }) => {
    const rows = parseCases(src.cases);
    const ttr = rows.map((r) => {
      const opened = parseDate(r.date), closed = parseDate(/closed\s+(\S+)/i.exec(r.status)?.[1] ?? '');
      return opened && closed ? (closed - opened) / DAY : null;
    }).filter((x) => x != null);
    return { value: caseSummary(rows, now, cfg.caseStaleDays).open, note: ttr.length ? `MTTR ${round1(median(ttr))} d` : 'no closed case yet' };
  },
  E6: ({ src, now }) => {
    const recent = humanCases(src.cases).map((r) => ({ ...r, d: parseDate(r.date) })).filter((r) => r.d && (now - r.d) / DAY <= 30);
    const groups = new Map();
    for (const r of recent) { const k = `${r.class}·${r.area}`; groups.set(k, (groups.get(k) ?? 0) + 1); }
    const rec = [...groups].filter(([, n]) => n >= 2).map(([k]) => k);
    return { value: rec.length, note: rec.join(' · ') };
  },
  E7: ({ src, now, cfg }) => ({ value: caseSummary(humanCases(src.cases), now, cfg.caseStaleDays).noGuard, note: 'guard empty or "to come"' }),
  E8: ({ src, now }) => ({
    value: humanCases(src.cases).filter((r) => { const d = parseDate(r.date); return !r.checked.startsWith('✓') && d && (now - d) / DAY > 7; }).length,
    note: 'not checked by Debug, older than 7 days',
  }),
  E9: (ctx) => cost(ctx).week,
  E10: (ctx) => cost(ctx).perBrief,
};

/** Week tokens, priced only when cfg.modelRates ($ per million tokens, by model) exists — the kit ships no rates. */
function cost({ src, cfg, inWeek, tz, now }) {
  const rows = parseUsage(src.usage).filter((u) => { const d = new Date(u.at); return !Number.isNaN(+d) && inWeek(localDay(d, tz)); });
  const tokens = rows.reduce((s, u) => s + u.tokens, 0);
  const note = `${tokens.toLocaleString('en-US')} tokens this week`;
  const rates = cfg.modelRates;
  if (!rates) return { week: { value: null, note: `${note}; no model rates` }, perBrief: { value: null, note: 'no model rates' } };
  const usd = Math.round(rows.reduce((s, u) => s + (u.tokens / 1e6) * (rates[u.model] ?? 0), 0) * 100) / 100;
  const closed = timedLedger(src.ledger, now).filter((e) => e.kind === 'closed-for-day' && e.at && inWeek(keyOf(e.at))).length;
  return { week: { value: usd, note }, perBrief: closed ? { value: Math.round((usd / closed) * 100) / 100, note: `${closed} brief(s) closed` } : { value: null, note: 'no brief closed' } };
}

/** → [{ id, name, domain, value, target, threshold, direction, breach, note }], one per definition, in catalogue order. */
export function computeKpis(defs, sources, now, cfg = {}) {
  const tz = cfg.timezone ?? 'UTC';
  const today = localDay(now, tz);
  const start = keyOf(new Date(Date.parse(today) - 6 * DAY));
  const ctx = { src: sources, now, cfg: { pausedAlertHours: 24, silenceHours: 48, caseStaleDays: 14, ...cfg }, tz,
                week: [start, today], inWeek: (k) => k >= start && k <= today };
  return defs.map((def) => {
    const fn = COMPUTERS[def.id];
    const r = fn ? fn(ctx) : { value: null, note: 'no source adapter yet' };
    return { id: def.id, name: def.name, domain: def.domain ?? '', value: r.value, target: def.target ?? null, threshold: def.threshold ?? null,
             direction: def.direction, breach: isBreach(def, r.value), note: r.note ?? '' };
  });
}

/** previous snapshot rows (strings from kpi.csv) vs current results → id → ▲ ▼ = or '' (no comparable value). */
export function trend(previousRows, currentRows) {
  const prev = new Map(previousRows.map((r) => [r.id, r.value === '' || r.value == null ? null : Number(r.value)]));
  const out = {};
  for (const r of currentRows) {
    const p = prev.get(r.id), v = r.value === '' || r.value == null ? null : Number(r.value);
    out[r.id] = p == null || v == null ? '' : v > p ? '▲' : v < p ? '▼' : '=';
  }
  return out;
}

/** The cases a run should open: one per breach whose `KPI <id> · <week>` ref is not already in the problems log. */
export function breachesToOpen(current, existingCases, wk) {
  const refs = new Set(existingCases.map((c) => c.refs));
  return current.filter((r) => r.breach).map((r) => ({
    kpi: r.id, refs: `KPI ${r.id} · ${wk}`,
    problem: `KPI ${r.id} ${r.name} breached: ${r.value} vs threshold ${r.threshold} (${r.direction})${r.note ? ` — ${r.note}` : ''}`,
  })).filter((c) => !refs.has(c.refs));
}

/** kpi.csv rows for one snapshot: `date · id · value · target · breach`, one per definition. */
export function snapshotRows(results, date) {
  return results.map((r) => ({ date, id: r.id, value: r.value ?? '', target: r.target ?? '', breach: r.breach }));
}

const HEADER = 'date,id,value,target,breach';
const csvLine = (r) => [r.date, r.id, r.value ?? '', r.target ?? '', r.breach].join(',');

/** The new kpi.csv text: the existing snapshots, minus any with this snapshot's key (a re-run in the same minute replaces
 *  it rather than doubling it), plus this one. Earlier snapshots are never touched. */
export function withSnapshot(csv, rows) {
  const key = rows[0]?.date;
  const kept = String(csv ?? '').split('\n').slice(1).filter((l) => l.trim() && l.split(',')[0] !== key);
  return [HEADER, ...kept, ...rows.map(csvLine)].join('\n') + '\n';
}

export function parseSnapshots(csv) {
  return String(csv ?? '').split('\n').slice(1).filter((l) => l.trim()).map((l) => {
    const [date, id, value, target, breach] = l.split(',');
    return { date, id, value, target, breach: breach === 'true' };
  });
}

/** Lint: every snapshot (rows sharing a date) carries exactly `n` rows, no id twice. */
export function snapshotProblems(rows, n) {
  const by = new Map();
  for (const r of rows) { if (!by.has(r.date)) by.set(r.date, []); by.get(r.date).push(r.id); }
  const out = [];
  for (const [date, ids] of by) {
    if (ids.length !== n) out.push(`kpi.csv snapshot ${date} has ${ids.length} rows, expected ${n}`);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) out.push(`kpi.csv snapshot ${date} repeats ${[...new Set(dup)].join(', ')}`);
  }
  return out;
}

/** The latest snapshot in kpi.csv, and the one before it. */
export function lastTwo(rows) {
  const dates = [...new Set(rows.map((r) => r.date))];
  const pick = (d) => rows.filter((r) => r.date === d);
  return { latest: dates.length ? pick(dates.at(-1)) : [], previous: dates.length > 1 ? pick(dates.at(-2)) : [] };
}
