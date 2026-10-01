#!/usr/bin/env node
// Company OS kit — the KPI engine (1.3). Computes the catalogue in kpi.config.json from the registers, appends one
// snapshot row per KPI to docs/okr/kpi.csv, renders docs/KPI.md (breaches first, ▲▼ against the previous snapshot) and,
// with --open-cases, opens one problems-log case per NEW breach (idempotent on KPI id + ISO week).
//   node scripts/kpi.mjs [--open-cases] [--dry]
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { loadConfig, stamp } from './lib/config.mjs';
import { parseCases } from './lib/registers.mjs';
import { caseRow, nextCaseNumber } from './lib/cases.mjs';
import { computeKpis, trend, breachesToOpen, snapshotRows, parseSnapshots, lastTwo, weekKey, withSnapshot } from './lib/kpi.mjs';

const args = process.argv.slice(2);
const cfg = loadConfig();
const now = new Date();
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// the catalogue: the project's own file, else the kit's default next to this script
const local = 'kpi.config.json';
const catalogue = existsSync(local) ? local : new URL('../kpi.config.json', import.meta.url);
const defs = JSON.parse(readFileSync(catalogue, 'utf8')).kpis;

const sources = {
  decisionsOpen: read('docs/DECISIONS-OPEN.md'), decisions: read('docs/DECISIONS.md'),
  reports: existsSync('docs/reports') ? readdirSync('docs/reports') : [],
  ledger: read('docs/okr/delivery-ledger.md'), gateRuns: read('docs/okr/gate-runs.log'), usage: read('docs/okr/agent-usage.log'),
  cases: read('docs/cases/LOG.md'), changesLog: read('docs/meetings/changes.log'), inbox: read('docs/cases/INBOX.md'),
};
const results = computeKpis(defs, sources, now, cfg);
const date = stamp(cfg.timezone, now);
const wk = weekKey(now);

// trend against the last snapshot already in the file, then append this one
const csvPath = 'docs/okr/kpi.csv';
const snaps = parseSnapshots(read(csvPath)).filter((r) => r.date !== date);   // a same-minute re-run compares with the one before
const prev = lastTwo(snaps).latest;
const arrows = trend(prev, results);
const fmt = (v) => (v == null ? '—' : String(v));
const show = (r) => `${r.breach ? '⚠ ' : ''}${r.id} ${r.name}: ${fmt(r.value)}${arrows[r.id] ? ` ${arrows[r.id]}` : ''} (target ${fmt(r.target)}, threshold ${fmt(r.threshold)})${r.note ? ` — ${r.note}` : ''}`;
for (const r of results) console.log(show(r));

if (args.includes('--dry')) process.exit(0);
const rows = snapshotRows(results, date);
writeFileSync(csvPath, withSnapshot(read(csvPath), rows));

// KPI.md — breaches first, then by domain
const md = [`# KPIs — snapshot ${date} (${cfg.timezone}) · week ${wk}`, '',
  `Catalogue: \`${existsSync(local) ? local : 'kit default'}\` · ${results.length} KPIs · ${results.filter((r) => r.breach).length} breached · ${results.filter((r) => r.value == null).length} without data. Trend ▲▼ is the value's direction vs the previous snapshot, not good or bad.`];
const table = (rs) => ['| id | KPI | value | trend | target | threshold | note |', '|---|---|---|---|---|---|---|',
  ...rs.map((r) => `| ${r.id} | ${r.name} | ${fmt(r.value)} | ${arrows[r.id] || ''} | ${fmt(r.target)} | ${fmt(r.threshold)} | ${r.note.replace(/\|/g, '/')} |`)];
const breached = results.filter((r) => r.breach);
md.push('', '## Breaches', ...(breached.length ? table(breached) : ['none']));
for (const dom of [...new Set(results.map((r) => r.domain || 'other'))]) md.push('', `## ${dom}`, ...table(results.filter((r) => (r.domain || 'other') === dom)));
writeFileSync('docs/KPI.md', `${md.join('\n')}\n`);
console.log(`\nsnapshot ${date}: ${rows.length} rows → ${csvPath} · docs/KPI.md written`);

// breaches → cases (one per new breach per week)
if (args.includes('--open-cases')) {
  const logPath = 'docs/cases/LOG.md';
  if (!existsSync(logPath)) { console.error(`${logPath} missing — no cases opened`); process.exit(2); }
  const log = read(logPath);
  const todo = breachesToOpen(results, parseCases(log), wk);
  let n = nextCaseNumber(log);
  for (const c of todo) {
    appendFileSync(logPath, `${caseRow({ n, date: date.slice(0, 10), problem: c.problem, area: 'kpi', cause: 'KPI threshold', cls: 'monitor', refs: c.refs })}\n`);
    console.log(`case #${n} opened for ${c.kpi}`);
    n++;
  }
  console.log(`cases: ${todo.length} opened · ${breached.length - todo.length} breach(es) already open this week`);
}
