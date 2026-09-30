#!/usr/bin/env node
// Company OS kit — every "merged <branch>" claim in changes.log must be an ancestor of main; exit 1 otherwise.
//   node scripts/merge-lines-check.mjs [--log docs/meetings/changes.log] [--usage docs/okr/agent-usage.log] [--main main]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mergeClaims, claimSha, parseUsage } from './lib/ledger.mjs';
import { loadConfig } from './lib/config.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const log = readFileSync(opt('--log', 'docs/meetings/changes.log'), 'utf8');
const usage = parseUsage(readFileSync(opt('--usage', 'docs/okr/agent-usage.log'), 'utf8'));
const main = opt('--main', loadConfig().mainBranch);
const isAncestor = (sha) => { try { execFileSync('git', ['merge-base', '--is-ancestor', sha, main], { stdio: 'ignore' }); return true; } catch { return false; } };

let bad = 0, unsure = 0, ok = 0;
for (const c of mergeClaims(log)) {
  if (c.retracted) continue;
  const sha = claimSha(c, usage) ?? /tip ([0-9a-f]{7,40})/.exec(log.split('\n')[c.line - 1])?.[1] ?? null;
  if (!sha) { unsure++; console.log(`not sure  ${c.branch}${c.run ? ` run ${c.run}` : ''} · line ${c.line} · no sha in the usage log or the line`); continue; }
  if (isAncestor(sha)) { ok++; } else { bad++; console.log(`FAIL      ${c.branch}${c.run ? ` run ${c.run}` : ''} · tip ${sha} · merged but NOT in ${main} · line ${c.line}`); }
}
console.log(`merge lines: ${ok + bad + unsure} claims — ${ok} in ${main} · ${bad} NOT in ${main} · ${unsure} not sure`);
process.exit(bad ? 1 : 0);
