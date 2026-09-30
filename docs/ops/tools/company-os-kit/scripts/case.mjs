#!/usr/bin/env node
// Company OS kit — opens a case: the next number, today's date, status open, checked "not checked". Problems are data;
// a problem that never got a row is the one that repeats.
//   node scripts/case.mjs "<what happened, one sentence>" --area <area> [--cost "<owner min · money · Lead min>"] [--class <cause class>] [--cause "<evidence>"]
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { loadConfig, stamp } from './lib/config.mjs';
import { parseCases } from './lib/registers.mjs';

const args = process.argv.slice(2);
const problem = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
const opt = (n, d = '') => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
if (!problem || !opt('--area')) { console.error('usage: case.mjs "<problem>" --area <area> [--cost …] [--class …] [--cause …]'); process.exit(2); }
const cls = opt('--class', '?');
const CLASSES = ['unwalked', 'drift', 'monitor', 'session', 'process', '?'];
if (!CLASSES.includes(cls)) { console.error(`class must be one of ${CLASSES.slice(0, -1).join(' | ')}`); process.exit(2); }
const file = 'docs/cases/LOG.md';
if (!existsSync(file)) { console.error(`${file} missing`); process.exit(2); }
const rows = parseCases(readFileSync(file, 'utf8'));
const n = rows.length ? Math.max(...rows.map((r) => r.n)) + 1 : 1;
const today = stamp(loadConfig().timezone).slice(0, 10);
const clean = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
const line = `| ${n} | ${today} | ${clean(problem)} | ${clean(opt('--area'))} | ${clean(opt('--cost', '?'))} | ${clean(opt('--cause', 'not proven yet'))} | ${cls} | — | to come: … | open | — | not checked |`;
appendFileSync(file, `${line}\n`);
console.log(`case #${n} opened → ${file}`);
console.log(line);
