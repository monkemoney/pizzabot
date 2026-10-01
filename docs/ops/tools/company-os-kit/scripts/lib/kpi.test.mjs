import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeKpis, trend, breachesToOpen, snapshotRows, parseSnapshots, snapshotProblems, weekKey, isBreach, withSnapshot } from './kpi.mjs';

const NOW = new Date(Date.UTC(2026, 0, 10, 12, 0));   // Saturday 2026-01-10 12:00Z, pinned; the week window is 4.1–10.1
const DEFS = JSON.parse(readFileSync(new URL('../../kpi.config.json', import.meta.url), 'utf8')).kpis;

const SOURCES = {
  decisionsOpen: `## 0. Deadlines and the silence rule
| When | id | Class | If silent |
|---|---|---|---|
| 2026-01-01 | L-01 | reversible | default |
| 2026-01-05 | L-02 | money | wait |
| 2026-01-09 | L-03 | reversible | default |

## Open
| id | Question | Proposed default | Impact | Source | Deadline |
|---|---|---|---|---|---|
| L-01 | q1 | d1 | i | s | 2026-01-08 |
| L-02 | q2 | d2 | i | s | 2026-01-09 |
| L-03 | q3 | d3 | i | s | 2026-01-20 |`,
  decisions: `| # | Date | Decision | Ref |
|---|---|---|---|
| 17 | 2026-01-07 | took the default (default, no answer) | L-04 |
| 18 | 2025-12-01 | older default (default, no answer) | L-00 |
| 19 | 2026-01-08 | an answer in her words | L-05 |`,
  reports: ['2025-12-30-owner-morning.md', '2026-01-05-owner-morning.md', '2026-01-06-owner-morning.md', '2026-01-08-owner-morning.md', 'DASHBOARD-FORMAT.md'],
  ledger: `resumed: head-d 6.1 09:00 — brief d1
resumed: cos 7.1 09:00 — brief c1
closed-for-day: head-d 7.1 09:00 — done
paused: head-a 7.1 10:00 — waits
resumed: head-c 8.1 08:00 — brief c
closed-for-day: cos 8.1 09:00 — done
closed-for-day: head-c 8.1 14:00 — done
resumed: head-b 9.1 10:00 — brief b`,
  gateRuns: `2025-12-20 10:00 · HEAD=x · branch=main · by=lead · ms=9 · verdict=3/3
2026-01-05 10:00 · HEAD=a · branch=main · by=lead · ms=1000 · verdict=3/3
2026-01-06 10:00 · HEAD=b · branch=main · by=lead · ms=3000 · verdict=FAIL: docs lint
2026-01-07 10:00 · HEAD=c · branch=main · by=lead · ms=2000 · verdict=3/3
2026-01-08 10:00 · HEAD=d · branch=main · by=lead · ms=4000 · verdict=FAIL: tests, docs lint`,
  cases: `| # | Date | Problem | Area | Cost | Cause | Class | Solution | Guard | Status | Refs | Checked |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2025-12-01 | p1 | cloud | c | x | process | s | a test | closed 2025-12-03 | — | not checked |
| 2 | 2026-01-02 | p2 | kit | c | x | drift | s | a test | closed 2026-01-08 | — | ✓G |
| 3 | 2026-01-05 | p3 | kit | c | x | drift | — | to come: … | open | — | not checked |
| 4 | 2026-01-09 | p4 | cloud | c | x | process | — | board | open | — | ✓G |`,
  changesLog: `2026-01-05 · Lead · 09:00 LA: asked L-05
2026-01-06 · Lead · 09:00 LA: L-05 asked again
2026-01-06 · Lead · 09:30 LA: asked L-09`,
  inbox: '',
  usage: `2026-01-06T10:00:00-08:00 · lead · main · m1 · tokens=100000 · tools=10 · min=20 · merged=
2026-01-08T10:00:00-08:00 · head-a · main · m1 · tokens=50000 · tools=5 · min=10 · merged=
2025-12-01T10:00:00-08:00 · head-a · main · m1 · tokens=999999 · tools=5 · min=10 · merged=`,
};
const CFG = { pausedAlertHours: 24, silenceHours: 48 };
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test('D1–D5 from the decision registers, the reports folder and the loop alarm', () => {
  const k = byId(computeKpis(DEFS, SOURCES, NOW, CFG));
  assert.equal(k.D1.value, 3); assert.match(k.D1.note, /median age 5\.5 d/);
  assert.equal(k.D2.value, 2);
  assert.equal(k.D3.value, 1);                          // only the default taken inside the week
  assert.equal(k.D4.value, 1);                          // L-05 on two days; L-09 once
  assert.equal(k.D5.value, 60);                         // 3 reports / 5 working days (5–9.1)
});

test('E1–E8 from the ledger, the gate log and the problems log', () => {
  const k = byId(computeKpis(DEFS, SOURCES, NOW, CFG));
  assert.equal(k.E1.value, 4);                          // head-a, head-c, head-d, cos idle > 24 h; head-b resumed
  assert.equal(k.E2.value, 24);                         // median of 24, 24, 6 h
  assert.equal(k.E3.value, 50); assert.match(k.E3.note, /median 2500 ms/);
  assert.equal(k.E4.value, 2);
  assert.equal(k.E5.value, 2); assert.match(k.E5.note, /MTTR 4 d/);
  assert.equal(k.E6.value, 1);                          // drift·kit twice within 30 days; process·cloud 39 days apart
  assert.equal(k.E7.value, 1);
  assert.equal(k.E8.value, 1);                          // only case 1 is unchecked AND older than 7 days
});

test('breach rule per direction: up below threshold, down/zero at or above it, no value never breaches', () => {
  assert.equal(isBreach({ direction: 'up', threshold: 70 }, 50), true);
  assert.equal(isBreach({ direction: 'up', threshold: 70 }, 70), false);
  assert.equal(isBreach({ direction: 'down', threshold: 3 }, 3), true);
  assert.equal(isBreach({ direction: 'down', threshold: 3 }, 2), false);
  assert.equal(isBreach({ direction: 'zero', threshold: 1 }, 1), true);
  assert.equal(isBreach({ direction: 'down', threshold: 3 }, null), false);
  const breached = computeKpis(DEFS, SOURCES, NOW, CFG).filter((r) => r.breach).map((r) => r.id).sort();
  assert.deepEqual(breached, ['D4', 'E1', 'E3', 'E6']);
});

test('a KPI with no computer (a project domain) is recorded empty, never breached', () => {
  const defs = [...DEFS, { id: 'A1', name: 'Run health', target: 100, direction: 'up', threshold: 100 }];
  const k = byId(computeKpis(defs, SOURCES, NOW, CFG));
  assert.equal(k.A1.value, null); assert.equal(k.A1.breach, false); assert.match(k.A1.note, /no source/);
  assert.equal(computeKpis(defs, SOURCES, NOW, CFG).length, defs.length);
});

test('E9/E10 print dollars only when model rates exist', () => {
  const e9 = { id: 'E9', name: 'Cost per week', target: 60, direction: 'down', threshold: 120 };
  const e10 = { id: 'E10', name: 'Cost per delivered brief', target: 15, direction: 'down', threshold: 40 };
  const off = byId(computeKpis([e9, e10], SOURCES, NOW, CFG));
  assert.equal(off.E9.value, null); assert.match(off.E9.note, /150,000 tokens/);
  const on = byId(computeKpis([e9, e10], SOURCES, NOW, { ...CFG, modelRates: { m1: 10 } }));   // $10 per million tokens
  assert.equal(on.E9.value, 1.5);
  assert.equal(on.E10.value, 0.5);                      // 3 closed-for-day lines in the week
});

test('breaches open one case each, and a re-run in the same week opens none', () => {
  const current = computeKpis(DEFS, SOURCES, NOW, CFG);
  const wk = weekKey(NOW);
  assert.equal(wk, '2026-W02');
  const first = breachesToOpen(current, [], wk);
  assert.deepEqual(first.map((c) => c.kpi).sort(), ['D4', 'E1', 'E3', 'E6']);
  assert.match(first[0].refs, new RegExp(`^KPI ${first[0].kpi} · ${wk}$`));
  const existing = first.map((c) => ({ refs: c.refs }));
  assert.deepEqual(breachesToOpen(current, existing, wk), []);
  assert.equal(breachesToOpen(current, existing, '2026-W03').length, 4);   // next week is a new breach
});

test('trend: ▲▼= against the previous snapshot, nothing without one', () => {
  const prev = [{ id: 'D1', value: '5' }, { id: 'D2', value: '2' }, { id: 'E3', value: '' }];
  const cur = [{ id: 'D1', value: 3 }, { id: 'D2', value: 2 }, { id: 'E3', value: 50 }, { id: 'E4', value: 2 }];
  assert.deepEqual(trend(prev, cur), { D1: '▼', D2: '=', E3: '', E4: '' });
});

test('snapshots: one row per definition; the lint names a snapshot with a missing or repeated id', () => {
  const rows = snapshotRows(computeKpis(DEFS, SOURCES, NOW, CFG), '2026-01-10 04:00');
  assert.equal(rows.length, DEFS.length);
  const csv = ['date,id,value,target,breach', ...rows.map((r) => [r.date, r.id, r.value, r.target, r.breach].join(','))].join('\n');
  assert.deepEqual(snapshotProblems(parseSnapshots(csv), DEFS.length), []);
  const short = csv.split('\n').slice(0, -1).join('\n');
  assert.deepEqual(snapshotProblems(parseSnapshots(short), DEFS.length), [`kpi.csv snapshot 2026-01-10 04:00 has ${DEFS.length - 1} rows, expected ${DEFS.length}`]);
  const dup = `${csv}\n2026-01-10 04:00,D1,3,8,false`;
  assert.match(snapshotProblems(parseSnapshots(dup), DEFS.length).join(' '), /repeats D1/);
});

test('the engine does not breed its own cases: E6–E8 ignore rows it opened; E5 still counts them as open work', () => {
  const current = computeKpis(DEFS, SOURCES, NOW, CFG);
  let n = 5;
  const opened = breachesToOpen(current, [], weekKey(NOW))
    .map((c) => `| ${n++} | 2026-01-10 | ${c.problem} | kpi | ? | KPI threshold | monitor | — | to come: … | open | ${c.refs} | not checked |`);
  const after = byId(computeKpis(DEFS, { ...SOURCES, cases: `${SOURCES.cases}\n${opened.join('\n')}` }, NOW, CFG));
  const before = byId(current);
  for (const id of ['E6', 'E7', 'E8']) assert.equal(after[id].value, before[id].value, id);
  assert.equal(after.E5.value, before.E5.value + opened.length);
});

test('a re-run with the same snapshot key replaces that snapshot instead of doubling it', () => {
  const head = 'date,id,value,target,breach';
  const old = `${head}\n2026-01-03 04:00,D1,5,8,false\n2026-01-10 04:00,D1,9,8,false`;
  const next = withSnapshot(old, [{ date: '2026-01-10 04:00', id: 'D1', value: 3, target: 8, breach: false }]);
  assert.equal(next, `${head}\n2026-01-03 04:00,D1,5,8,false\n2026-01-10 04:00,D1,3,8,false\n`);
  assert.equal(withSnapshot('', [{ date: 'd', id: 'D1', value: '', target: 8, breach: false }]), `${head}\nd,D1,,8,false\n`);
});
