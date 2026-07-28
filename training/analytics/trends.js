'use strict';

// Trends across bootcamp runs — reads every JSON summary the eval scripts save
// (run-*.json, replay-*.json, concurrency-*.json) and prints score movement
// over time. Pure file reading, no LLM, no DB.
//
//   node training/analytics/trends.js

const fs = require('fs');
const path = require('path');
const { paths } = require('../lib/knowledge');

function load(prefix) {
  return fs.readdirSync(paths.reports)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(paths.reports, f), 'utf8')) }));
}

function ts(file) {
  // run-2026-07-26T16-37-25.json → 07-26 16:37
  const m = file.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : file;
}

function main() {
  const synth = load('run-');
  const replay = load('replay-');
  const conc = load('concurrency-');

  console.log('\n📊 מגמות בין ריצות\n');

  console.log('— סינתטי (פרסונות) —');
  for (const r of synth) console.log(`  ${ts(r.file)}  ממוצע ${String(r.avg).padStart(3)}  הושלמו ${r.completed}/${r.total}  קריטיים ${r.critical}`);
  if (!synth.length) console.log('  (אין)');

  console.log('\n— replay על שיחות אמיתיות —');
  for (const r of replay) {
    const tag = [r.withLessons ? 'lessons' : 'base', r.botModel ? r.botModel.replace('claude-', '') : ''].filter(Boolean).join('+');
    console.log(`  ${ts(r.file)}  ממוצע ${String(r.avg).padStart(3)}  חלשים ${r.weak}/${r.count}  ${tag}${r.judgeFailures ? `  ⚠️שופט×${r.judgeFailures}` : ''}`);
  }
  if (!replay.length) console.log('  (אין)');

  console.log('\n— מקביליות —');
  for (const r of conc) console.log(`  ${ts(r.file)}  K=${r.k}  autonomy ${r.autonomyRate}%  isolation ${r.isolationViolations}  p95 ${r.p95}ms  race-loss ${r.raceLossRate}%  ${r.pass ? '🟢' : '🔴'}`);
  if (!conc.length) console.log('  (אין)');

  // Simple deltas on the latest comparable pair (replay, same config).
  // Runs where most judgments failed (e.g. API-credit exhaustion) are not data.
  const comparable = replay.filter((r) =>
    r.withLessons && (!r.botModel || r.botModel.includes('opus')) &&
    r.count > 0 && (r.judgeFailures || 0) < r.count);
  if (comparable.length >= 2) {
    const [prev, last] = comparable.slice(-2);
    const d = last.avg - prev.avg;
    console.log(`\nΔ replay (opus+lessons): ${d > 0 ? '+' : ''}${d} (${prev.avg} → ${last.avg})${Math.abs(d) <= 4 ? '  — בטווח הרעש (±4)' : d < -5 ? '  ⚠️ רגרסיה' : '  📈 שיפור'}`);
  }
  console.log('');
}

main();
