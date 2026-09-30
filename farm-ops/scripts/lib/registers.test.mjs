import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parseOpenDecisions, decisionStatus, parseCases, caseSummary, checkBrief, ledgerAges, badChangeLines } from './registers.mjs';
import { parseLedger, lastByRole } from './ledger.mjs';

const NOW = new Date(Date.UTC(2026, 0, 10, 12, 0));   // 2026-01-10 12:00Z, pinned

test('dates parse in the three shapes the registers use', () => {
  assert.equal(parseDate('2026-01-02').toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(parseDate('2.1.2026').toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(parseDate('2.1', 2026).toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(parseDate('<date>'), null);
  assert.equal(parseDate('2.1'), null);
});

const OPEN = `# Open decisions
## 0. Deadlines and the silence rule
| When | id | Class | If silent |
|---|---|---|---|
| 2026-01-02 | L-01 | reversible | default: keep the name |
| 2026-01-02 | L-02 | money | wait |

## Open
| id | Question | Proposed default | Impact if delayed | Source | Deadline |
|---|---|---|---|---|---|
| L-01 | Keep the product name? | **yes** | the landing page stalls | PLAN §2 | 2026-01-05 |
| L-02 | Pay the $500 tool? | **no** | slower reports | PLAN §4 | 2026-01-08 |
| L-03 | Colour of the button | **blue** | nothing | — | 2026-02-01 |
| L-04 | Template row | **<default>** | <what stalls> | <file §> | <date> |
`;

test('open decisions: overdue, the silence rule fires only for reversible items, money waits', () => {
  const rows = parseOpenDecisions(OPEN);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].class, 'reversible');
  assert.equal(rows[1].class, 'money');
  assert.equal(rows[2].class, 'unknown');
  const st = decisionStatus(rows, NOW, 48);
  assert.deepEqual(st.map((r) => [r.id, r.overdue, r.silenceFires, r.waits]),
    [['L-01', true, true, false], ['L-02', true, false, true], ['L-03', false, false, false], ['L-04', false, false, false]]);
  assert.equal(st[3].placeholder, true);
});

const CASES = `# log
| # | Date | Problem | Area | Cost | Cause (evidence) | Class | Solution | Guard | Status | Refs | Checked |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | <date> | <what happened> | <area> | <cost> | <proven> | <class> | <what> | <guard> | open / closed <date> | <refs> | not checked |
| 2 | 2025-12-20 | webhook silent | whatsapp | 40 min | not subscribed (proven, screen) | unwalked | subscribeWaba | test | closed 2025-12-21 | — | ✓G |
| 3 | 2025-12-22 | deploy did not run | ops | 10 min | auto-deploy off after rollback | drift | re-enabled | to come: check | open | — | not checked |
| 4 | 2026-01-09 | board empty | docs | 5 min | ledger line shape | process | fixed prefix | lint | open | — | not checked |
`;

test('cases: template row skipped, open/stale/unchecked counted, oldest age in days', () => {
  const rows = parseCases(CASES);
  assert.equal(rows.length, 3);
  const s = caseSummary(rows, NOW, 14);
  assert.equal(s.open, 2);
  assert.equal(s.closed, 1);
  assert.equal(s.unchecked, 2);
  assert.equal(s.noGuard, 1);
  assert.equal(s.oldestOpenDays, 20);   // 2025-12-22 → 2026-01-10 12:00 = 19.5 days, rounded
  assert.deepEqual(s.stale, [3]);
  assert.deepEqual(s.byClass, { unwalked: 1, drift: 1, process: 1 });
});

test('a brief missing parts is named, a complete one passes', () => {
  const parts = ['Goal of the run', 'Read first', 'Never contact'];
  assert.deepEqual(checkBrief('**Goal of the run:** x\nRead first: y', parts), ['Never contact']);
  assert.deepEqual(checkBrief('**Goal of the run:** x\nRead first: y\nNever contact the owner', parts), []);
});

test('ledger ages: a paused role older than the alert window is flagged, a resumed one is not', () => {
  const ev = parseLedger(`paused: head-a 8.1 09:00 LA — waits on L-01\nresumed: head-b 10.1 11:00 — brief\nclosed-for-day: cos 9.1 — eod`);
  const ages = ledgerAges(lastByRole(ev), NOW, 24);
  const by = Object.fromEntries(ages.map((a) => [a.role, a]));
  assert.equal(by['head-a'].flag, true);
  assert.equal(Math.round(by['head-a'].hours), 51);
  assert.equal(by['head-b'].flag, false);
  assert.equal(by['cos'].flag, true);
});

test('changes.log lines off the shape are reported by line number', () => {
  const log = `# header\n2026-01-02 · Lead · 17:05 LA: merged head/a run 1 · tests pass\nmerged something without a date\n2026-01-03 · CEO · 09:00 IL: "keep it simple"`;
  assert.deepEqual(badChangeLines(log), [3]);
});
