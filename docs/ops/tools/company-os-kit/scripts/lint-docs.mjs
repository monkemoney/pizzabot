#!/usr/bin/env node
// Company OS kit — lint for the paper trail. Runs inside the gate (gate.config.json). FAIL exits 1; WARN does not.
//   node scripts/lint-docs.mjs
// Checks: every brief in docs/shifts carries the parts the spawn prompt relies on and is named <date>-<role>-<n>.md ·
// open decisions carry a real default and deadline · CLAUDE.md stays under 150 lines · changes.log lines keep their shape ·
// a role left closed-for-day/paused past the alert window is named · an open case older than caseStaleDays is named.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadConfig } from './lib/config.mjs';
import { parseLedger, lastByRole } from './lib/ledger.mjs';
import { parseOpenDecisions, decisionStatus, parseCases, caseSummary, checkBrief, ledgerAges, badChangeLines } from './lib/registers.mjs';

const cfg = loadConfig();
const now = new Date();
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const fails = [], warns = [];

// briefs
if (existsSync('docs/shifts')) {
  for (const f of readdirSync('docs/shifts').filter((x) => x.endsWith('.md') && !x.includes('TEMPLATE'))) {
    if (!/^\d{4}-\d{2}-\d{2}-(head-[a-z]|cos|[a-z][1-3])-\d+\.md$/.test(f)) fails.push(`brief name: docs/shifts/${f} is not <date>-<role>-<n>.md`);
    const missing = checkBrief(read(`docs/shifts/${f}`), cfg.briefParts);
    if (missing.length) fails.push(`brief parts: docs/shifts/${f} lacks: ${missing.join(' · ')}`);
  }
}
// open decisions
const decisions = decisionStatus(parseOpenDecisions(read('docs/DECISIONS-OPEN.md')), now, cfg.silenceHours);
for (const d of decisions) {
  if (d.placeholder) continue;   // the template row
  if (!d.default || /<.*>/.test(d.default)) fails.push(`decision ${d.id}: no proposed default`);
  if (!d.deadlineDate) fails.push(`decision ${d.id}: deadline "${d.deadline}" is not a date`);
  if (d.class === 'unknown') warns.push(`decision ${d.id}: not in the §0 silence table (reversible or wait?)`);
  if (d.silenceFires) warns.push(`decision ${d.id}: reversible and ${Math.round((now - d.deadlineDate) / 3.6e6)}h past deadline — the default applies; log it in DECISIONS.md`);
  if (d.waits) warns.push(`decision ${d.id}: past deadline and NOT reversible — re-ask in the next report`);
}
// CLAUDE.md size (rule 8 of the template)
if (existsSync('CLAUDE.md')) { const n = read('CLAUDE.md').split('\n').length; if (n > 150) fails.push(`CLAUDE.md has ${n} lines (rule: under 150)`); }
// changes.log shape
const bad = badChangeLines(read('docs/meetings/changes.log'));
if (bad.length) fails.push(`changes.log: lines off the shape <date> · <who> · <HH:MM> <tz>: … → ${bad.join(', ')}`);
// ledger: nobody idle without a fresh reason
for (const a of ledgerAges(lastByRole(parseLedger(read('docs/okr/delivery-ledger.md'))), now, cfg.pausedAlertHours)) {
  if (a.flag) warns.push(`ledger: ${a.role} is "${a.kind}" for ${Math.round(a.hours)}h (${a.text}) — next brief or a fresh paused line`);
}
// cases
const cs = caseSummary(parseCases(read('docs/cases/LOG.md')), now, cfg.caseStaleDays);
if (cs.stale.length) warns.push(`cases: open for more than ${cfg.caseStaleDays} days: #${cs.stale.join(', #')}`);
if (cs.noGuard) warns.push(`cases: ${cs.noGuard} row(s) without a guard — a fix without a test or watchdog comes back`);

for (const w of warns) console.log(`WARN  ${w}`);
for (const f of fails) console.log(`FAIL  ${f}`);
console.log(`lint-docs: ${fails.length} fail · ${warns.length} warn`);
process.exit(fails.length ? 1 : 0);
