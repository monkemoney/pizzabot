#!/usr/bin/env node
// Company OS kit — the gate before anything ships. Runs the steps of gate.config.json (tests, lint, your checks), prints
// PASS/FAIL and the time per step, writes one line to docs/okr/gate-runs.log, exits 1 on any FAIL.
// Refuses to run outside a git repo: a log line with HEAD= and branch= blank is a record of nothing.
//   npm run gate            (gate.config.json: [{ "name": "tests", "cmd": "npm", "args": ["test"] }, …])
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { loadConfig, stamp } from './lib/config.mjs';

const cfg = existsSync('gate.config.json') ? JSON.parse(readFileSync('gate.config.json', 'utf8')) : [
  { name: 'tests', cmd: 'npm', args: ['test'] },
  { name: 'docs lint', cmd: 'node', args: ['scripts/lint-docs.mjs'] },
  { name: 'merge lines ↔ git', cmd: 'node', args: ['scripts/merge-lines-check.mjs'] },
];
const git = (a) => { const r = spawnSync('git', a, { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const head = git(['rev-parse', '--short', 'HEAD']), branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (!head || !branch) { console.error('gate: not inside a git repo (or no commit yet) — run it from the repo root; nothing logged'); process.exit(2); }
const t0 = Date.now(), results = [];
for (const step of cfg) {
  const s = Date.now();
  const r = spawnSync(step.cmd, step.args ?? [], { encoding: 'utf8', shell: process.platform === 'win32' });
  const ok = r.status === 0, ms = Date.now() - s;
  results.push({ name: step.name, ok, ms });
  const tail = ((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n').slice(-3).join(' | ');
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step.name}  (${ms} ms)${ok ? '' : ` — ${tail}`}`);
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
const verdict = failed.length ? `FAIL: ${failed.join(', ')}` : `${results.length}/${results.length}`;
const by = process.env.GATE_BY || process.env.USER || 'lead';
const line = `${stamp(loadConfig().timezone)} · HEAD=${head} · branch=${branch} · by=${by} · ms=${Date.now() - t0} · verdict=${verdict}`;
appendFileSync('docs/okr/gate-runs.log', `${line}\n`);
console.log(failed.length ? `\nNOT OK — ${verdict}` : '\nOK — ship is the human\'s click; log "Publish #n … live" in changes.log right after, then smoke.');
process.exit(failed.length ? 1 : 0);
