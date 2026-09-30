import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLedger, lastByRole, parseUsage, usageTotals, mergeClaims, claimSha } from './ledger.mjs';

const LEDGER = `# header
resumed: head-a 2.1 09:15 LA — brief docs/shifts/2026-01-02-head-a-1.md
closed-for-day: head-a 2.1 — run 1 (docs/shifts/2026-01-02-head-a-1.md): the thing
paused: head-a 2.1 17:40 LA — waits for the owner's word on L-01
resumed: head-b 2.1 10:00 — brief x
`;

test('ledger lines parse with kind, role, day, time and text', () => {
  const ev = parseLedger(LEDGER);
  assert.equal(ev.length, 4);
  assert.deepEqual(ev[0], { kind: 'resumed', role: 'head-a', day: '2.1', time: '09:15', text: 'brief docs/shifts/2026-01-02-head-a-1.md' });
  assert.equal(ev[1].kind, 'closed-for-day');
  assert.equal(ev[1].time, null);
  assert.equal(lastByRole(ev).get('head-a').kind, 'paused');
  assert.equal(lastByRole(ev).get('head-b').kind, 'resumed');
});

const USAGE = `# header
2026-01-02T17:00-08:00 · head-a run 1 · head/a · opus · tokens=1000 · tools=10 · min=5 · merged=head/a@abc1234
2026-01-02T18:00-08:00 · head-a run 2 · head/a · opus · tokens=2000 · tools=20 · min=7 · merged=head/a@def5678
2026-01-02T18:30-08:00 · cos eod · team/cos · sonnet · tokens=500 · tools=5 · min=3 · merged=team/cos@9999999
`;

test('usage lines parse and total per branch', () => {
  const rows = parseUsage(USAGE);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].tokens, 1000);
  assert.equal(rows[1].mergedSha, 'def5678');
  const t = usageTotals(rows);
  assert.deepEqual(t.get('head/a'), { runs: 2, tokens: 3000, tools: 30, min: 12 });
});

test('merge claims are found, matched to a sha, and retracted by a CORRECTION line', () => {
  const log = `2026-01-02 · Lead · 17:05 LA: merged head/a run 1 · tests pass
2026-01-02 · Lead · 18:05 LA: merged head/a run 2 and merged team/cos · pushed
2026-01-02 · Lead · 18:40 LA: CORRECTION of the 18:05 line: head/a run 2 was NOT merged`;
  const claims = mergeClaims(log);
  assert.equal(claims.length, 3);
  assert.deepEqual(claims.map((c) => [c.branch, c.run, c.retracted]), [['head/a', 1, false], ['head/a', 2, true], ['team/cos', null, true]]);
  const usage = parseUsage(USAGE);
  assert.equal(claimSha(claims[0], usage), 'abc1234');
  assert.equal(claimSha(claims[1], usage), 'def5678');
  assert.equal(claimSha(claims[2], usage), '9999999');
  assert.equal(claimSha({ branch: 'head/z', run: null }, usage), null);
});
