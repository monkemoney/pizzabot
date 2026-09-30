#!/usr/bin/env node
// Company OS kit — appends one usage line, the moment the agent's notification arrives. Resolves the branch tip itself.
//   node scripts/log-usage.mjs "<who>" <branch|-> <model> <tokens> <tools> <minutes> [--dry-run]
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const [who, branch, model, tokens, tools, minutes] = process.argv.slice(2);
const dry = process.argv.includes('--dry-run');
if (!who || !branch || !model || !tokens || !tools || !minutes) {
  console.error('usage: log-usage.mjs "<who>" <branch|-> <model> <tokens> <tools> <minutes> [--dry-run]');
  process.exit(2);
}
let merged = '-';
if (branch !== '-') {
  try { merged = `${branch}@${execFileSync('git', ['rev-parse', '--short', branch], { encoding: 'utf8' }).trim()}`; } catch {
    try { merged = `${branch}@${execFileSync('git', ['rev-parse', '--short', `origin/${branch}`], { encoding: 'utf8' }).trim()}`; } catch { console.error(`branch not found: ${branch}`); process.exit(1); }
  }
}
const at = new Date();
const off = -at.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', pad = (n) => String(Math.abs(n)).padStart(2, '0');
const iso = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
const line = `${iso} · ${who} · ${branch} · ${model} · tokens=${Number(tokens)} · tools=${Number(tools)} · min=${Number(minutes)} · merged=${merged}`;
if (dry) console.log(line); else { appendFileSync('docs/okr/agent-usage.log', `${line}\n`); console.log(`appended: ${line}`); }
