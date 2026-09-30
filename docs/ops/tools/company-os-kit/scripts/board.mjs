#!/usr/bin/env node
// Company OS kit — the board: per role its last ledger event and how long ago; open decisions with deadlines and the
// silence rule; the problems log in numbers; usage per branch; the merge-lines verdict. Reads files only.
//   node scripts/board.mjs [--write docs/BOARD.md]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadConfig, stamp } from './lib/config.mjs';
import { parseLedger, lastByRole, parseUsage, usageTotals } from './lib/ledger.mjs';
import { parseOpenDecisions, decisionStatus, parseCases, caseSummary, ledgerAges } from './lib/registers.mjs';

const cfg = loadConfig();
const now = new Date();
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const h = (x) => (x == null ? '?' : x < 48 ? `${Math.round(x)}h` : `${Math.round(x / 24)}d`);
const out = [`# Board — ${stamp(cfg.timezone, now)} (${cfg.timezone})`];

// roles + timing
const ages = ledgerAges(lastByRole(parseLedger(read('docs/okr/delivery-ledger.md'))), now, cfg.pausedAlertHours);
out.push('', '## Roles', '| Role | Last event | Since | Why / what |', '|---|---|---|---|');
for (const a of ages) out.push(`| ${a.role} | ${a.kind}${a.flag ? ' ⚠' : ''} | ${h(a.hours)} | ${a.text} |`);
if (!ages.length) out.push('| — | no ledger lines yet | | |');
const owed = ages.filter((a) => a.flag);
if (owed.length) out.push('', `⚠ owed a next brief or a fresh paused reason (older than ${cfg.pausedAlertHours}h): ${owed.map((a) => a.role).join(', ')}`);

// decisions
const dec = decisionStatus(parseOpenDecisions(read('docs/DECISIONS-OPEN.md')), now, cfg.silenceHours).filter((d) => !d.placeholder);
out.push('', `## Open decisions (${dec.length})`, '| id | Class | Deadline | State | Default |', '|---|---|---|---|---|');
for (const d of dec) {
  const state = d.silenceFires ? `silence → default applies` : d.waits ? 'overdue · waits (not reversible)' : d.overdue ? 'overdue' : d.deadlineDate ? `${h(-((now - d.deadlineDate) / 3.6e6))} left` : 'no date';
  out.push(`| ${d.id} | ${d.class} | ${d.deadline} | ${state} | ${d.default} |`);
}
if (!dec.length) out.push('| — | | | nothing open | |');

// problems
const cs = caseSummary(parseCases(read('docs/cases/LOG.md')), now, cfg.caseStaleDays);
out.push('', '## Problems log', `open ${cs.open} · closed ${cs.closed} · oldest open ${cs.oldestOpenDays}d · unchecked by Debug ${cs.unchecked} · without a guard ${cs.noGuard}` +
  (cs.stale.length ? ` · ⚠ stale (> ${cfg.caseStaleDays}d): #${cs.stale.join(', #')}` : ''),
  Object.keys(cs.byClass).length ? 'by class: ' + Object.entries(cs.byClass).map(([k, v]) => `${k} ${v}`).join(' · ') : 'by class: —');

// usage
const usage = parseUsage(read('docs/okr/agent-usage.log'));
out.push('', '## Usage', '| Branch | Runs | Tokens | Tool calls | Minutes |', '|---|---|---|---|---|');
let tot = { runs: 0, tokens: 0, tools: 0, min: 0 };
for (const [b, t] of usageTotals(usage)) { out.push(`| ${b} | ${t.runs} | ${t.tokens.toLocaleString('en-US')} | ${t.tools} | ${t.min} |`); tot = { runs: tot.runs + t.runs, tokens: tot.tokens + t.tokens, tools: tot.tools + t.tools, min: tot.min + t.min }; }
out.push(`| **all** | ${tot.runs} | ${tot.tokens.toLocaleString('en-US')} | ${tot.tools} | ${tot.min} |`);

// merge lines
const ml = spawnSync('node', ['scripts/merge-lines-check.mjs', '--main', cfg.mainBranch], { encoding: 'utf8' });
out.push('', '## Merge lines ↔ git', (ml.stdout.trim().split('\n').pop() ?? '') + (ml.status ? '  ⚠ FAIL' : ''));

const text = out.join('\n');
console.log(text);
const w = process.argv.indexOf('--write');
if (w > 0) { writeFileSync(process.argv[w + 1], `${text}\n`); console.log(`\nwrote ${process.argv[w + 1]}`); }
