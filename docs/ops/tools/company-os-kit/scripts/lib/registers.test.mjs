import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parseOpenDecisions, decisionStatus, parseCases, caseSummary, checkBrief, ledgerAges, badChangeLines, askCounts, loopFindings } from './registers.mjs';
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

// loop alarm (1.2): an ask counts once per distinct day; a `route change:` line resets the count for that id
const LOG = `# changes
2026-01-02 · Lead · 09:00 LA: asked Limor L-05 (date for Day 1)
2026-01-02 · Lead · 18:00 LA: re-asked L-05 the same evening — same day, still round 1
2026-01-03 · Lead · 09:00 LA: L-05 asked again in the report
2026-01-03 · Lead · 09:10 LA: asked L-07 once
2026-01-04 · Lead · 09:00 LA: שאלנו שוב L-09
2026-01-05 · Lead · 09:00 LA: L-09 נשאל בדוח
2026-01-06 · Lead · 09:00 LA: L-09 asked a third time
2026-01-04 · Lead · 10:00 LA: L-11 asked
2026-01-05 · Lead · 10:00 LA: L-11 asked
2026-01-06 · Lead · 10:00 LA: route change: L-11 → default applies, Nave decides
2026-01-07 · Lead · 10:00 LA: L-11 asked with the smaller question
2026-01-07 · Lead · 11:00 LA: L-12 mentioned without asking`;
const INBOX = `| When | From | Line | → Case |
|---|---|---|---|
| 2026-01-08 | cos | loop: ask, owner, round 2 — L-07 asked again in the morning report · first signal 3.1 · route change: none yet | — |`;

test('askCounts: distinct days per id, both registers, Hebrew and English ask words', () => {
  const c = askCounts(LOG, INBOX);
  assert.equal(c.get('L-05').round, 2);                 // two days, three lines
  assert.equal(c.get('L-07').round, 2);                 // one in changes.log + one in the inbox
  assert.equal(c.get('L-09').round, 3);
  assert.equal(c.has('L-12'), false);                   // mentioned, never asked
});

test('askCounts: a route change resets the count for that id only', () => {
  const c = askCounts(LOG, INBOX);
  assert.equal(c.get('L-11').round, 1);
  assert.equal(c.get('L-11').routeChanged, true);
  assert.equal(c.get('L-09').routeChanged, false);
});

test('loopFindings: round 2 warns, round 3 fails, round 1 is silent', () => {
  const f = loopFindings(askCounts(LOG, INBOX));
  assert.deepEqual(f.fails, ['loop round 3: L-09 asked on 3 days without a route change — do not ask a third time; change the route first']);
  assert.deepEqual(f.warns.sort(), [
    'loop round 2: L-05 asked on 2 days — change the route (default? different person? smaller question?)',
    'loop round 2: L-07 asked on 2 days — change the route (default? different person? smaller question?)',
  ]);
  assert.deepEqual(loopFindings(askCounts('', '')), { warns: [], fails: [] });
});

test('askCounts: "route change: none yet" (the INBOX template) does not reset the count', () => {
  const c = askCounts('2026-01-02 · Lead · 09:00 LA: asked L-03', '| 2026-01-03 | cos | loop: ask, owner, round 2 — L-03 asked · route change: none yet | — |');
  assert.equal(c.get('L-03').round, 2);
  assert.equal(c.get('L-03').routeChanged, false);
});
