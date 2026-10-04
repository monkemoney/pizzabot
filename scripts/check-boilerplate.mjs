#!/usr/bin/env node
// check-boilerplate.mjs — fails when a file managed from monkemoney/Saturn- (boilerplate/) was edited in this repo.
// Reads .boilerplate.lock (written by Saturn's boilerplate/sync.mjs). No network, no Saturn checkout needed.
// Fix a failure by moving the change into Saturn and re-syncing, or by restoring the file (git checkout -- <file>).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

if (!existsSync('.boilerplate.lock')) { console.log('check-boilerplate: no .boilerplate.lock — nothing managed here'); process.exit(0); }
const lock = JSON.parse(readFileSync('.boilerplate.lock', 'utf8'));
const bad = [];
for (const [file, want] of Object.entries(lock.files)) {
  if (!existsSync(file)) { bad.push(`missing: ${file}`); continue; }
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== want) bad.push(`edited locally: ${file}`);
}
for (const b of bad) console.log(`FAIL  ${b}`);
console.log(`check-boilerplate: ${Object.keys(lock.files).length} managed files · boilerplate ${lock.version} @ ${lock.saturn} · ${bad.length} problems`);
process.exit(bad.length ? 1 : 0);
