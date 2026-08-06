'use strict';

// Bot Brain CLI — non-interactive commands for the weekly scheduled task (and
// humans). Thin wrapper over training/lib/db-sink.js. Every command prints a
// single parseable line and exits 0/1 — safe for unattended sessions.
//
//   node scripts/bot-brain.js start-run [kind]                 → prints run id
//   node scripts/bot-brain.js finish-run <id> --status completed|failed [--verdict GO|NO-GO] [--scores-file f.json] [--error "msg"]
//   node scripts/bot-brain.js add-insight --json '{"source":"...","title":"...",...}'
//   node scripts/bot-brain.js list [--status proposed]

const fs = require('fs');
const sink = require('../training/lib/db-sink');

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

(async () => {
  const cmd = process.argv[2];

  if (cmd === 'start-run') {
    const id = await sink.startRun(process.argv[3] || 'weekly');
    if (!id) { console.error('FAILED: could not open run (DB unreachable?)'); process.exit(1); }
    console.log(id);
    return;
  }

  if (cmd === 'finish-run') {
    const id = process.argv[3];
    if (!id) { console.error('usage: finish-run <id> --status ...'); process.exit(1); }
    let scores = {};
    const sf = arg('scores-file');
    if (sf) { try { scores = JSON.parse(fs.readFileSync(sf, 'utf8')); } catch (e) { console.error('scores-file:', e.message); } }
    const meta = {};
    if (arg('error')) meta.error = arg('error');
    await sink.finishRun(id, { status: arg('status', 'completed'), verdict: arg('verdict'), scores, meta });
    console.log('ok');
    return;
  }

  if (cmd === 'add-insight') {
    const raw = arg('json');
    if (!raw) { console.error('usage: add-insight --json \'{...}\''); process.exit(1); }
    let row;
    try { row = JSON.parse(raw); } catch (e) { console.error('bad json:', e.message); process.exit(1); }
    const id = await sink.addInsight(row);
    console.log(id || 'skipped');
    return;
  }

  if (cmd === 'list') {
    const status = arg('status');
    const rows = await sink.openInsights(status ? [status] : ['proposed', 'approved']);
    for (const r of rows) {
      console.log(`${r.id.slice(0, 8)}  [${r.status}] [${r.type}] (${r.source})  ${r.title}`);
    }
    console.log(`total: ${rows.length}`);
    return;
  }

  console.error('unknown command. commands: start-run | finish-run | add-insight | list');
  process.exit(1);
})();
