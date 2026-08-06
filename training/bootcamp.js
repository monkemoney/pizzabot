'use strict';

// Bootcamp orchestrator — runs the graduation exam and issues a report card with
// a GO/NO-GO decision on running the order bot autonomously.
//
// Three phases, each spawned as its OWN process (load.js monkeypatches services
// globally, so it must be isolated from the clean-path evals):
//   1. synthetic competence  (run.js)        — controlled personas
//   2. real-data competence  (eval/replay.js)— honest, real WhatsApp conversations
//   3. concurrency/autonomy  (concurrency/load.js) — 50 concurrent, isolation, faults
//
//   node training/bootcamp.js                 # full exam (K=50)
//   node training/bootcamp.js --quick         # fast (small N/K) — for wiring checks
//   node training/bootcamp.js --with-lessons  # inject accumulated lessons into the bot

const { spawn } = require('child_process');
const path = require('path');
const knowledge = require('./lib/knowledge');

const ROOT = __dirname;
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const WITH_LESSONS = args.includes('--with-lessons');

const CFG = QUICK
  ? { syntheticN: 4, replayN: 6, loadK: 5 }
  : { syntheticN: 12, replayN: 20, loadK: 50 };

function run(label, script, scriptArgs) {
  return new Promise((resolve) => {
    console.log(`\n▶️  ${label}: node ${path.relative(ROOT, script)} ${scriptArgs.join(' ')}`);
    const child = spawn('node', [script, ...scriptArgs], { cwd: path.join(ROOT, '..'), stdio: 'inherit' });
    child.on('exit', (code) => resolve(code));
  });
}

// Graduation gates (plan). Each returns {name, pass, detail}.
function grade(synthetic, replay, concurrency) {
  const gates = [];
  const g = (name, pass, detail) => gates.push({ name, pass: !!pass, detail });

  if (synthetic) {
    g('L1–4 סינתטי: ממוצע ≥90', synthetic.avg >= 90, `${synthetic.avg}`);
    g('L1–4 סינתטי: 0 באגים קריטיים', (synthetic.critical || 0) === 0, `${synthetic.critical}`);
  } else g('L1–4 סינתטי', false, 'לא רץ');

  if (replay) {
    g('L5 דאטה אמיתי: ממוצע ≥80', replay.avg >= 80, `${replay.avg}`);
    g('L5 דאטה אמיתי: <25% חלשים', (replay.weak / (replay.count || 1)) < 0.25, `${replay.weak}/${replay.count}`);
  } else g('L5 דאטה אמיתי', false, 'לא רץ');

  if (concurrency) {
    g('L6 מקביליות: autonomy ≥98%', (concurrency.autonomyRate || 0) >= 98, `${concurrency.autonomyRate}%`);
    g('L6 מקביליות: 0 הפרות isolation', (concurrency.isolationViolations || 0) === 0, `${concurrency.isolationViolations}`);
    g('L6 מקביליות: 0 דליפת HTTP', (concurrency.blockedHttp || 0) === 0, `${concurrency.blockedHttp}`);
    g('L6 מקביליות: p95 < 8000ms', (concurrency.p95 || 1e9) < 8000, `${concurrency.p95}ms`);
    g('L6 מקביליות: שלמות תחת תקלות', (concurrency.faultIntegrityViolations || 0) === 0, `${concurrency.faultIntegrityViolations}`);
  } else g('L6 מקביליות', false, 'לא רץ');

  return gates;
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

async function main() {
  const runStamp = stamp();
  console.log(`\n🎓 בוטקאמפ בוט ההזמנות — ${QUICK ? 'QUICK' : 'FULL'}${WITH_LESSONS ? ' + lessons' : ''}`);
  console.log(`   synthetic=${CFG.syntheticN} · replay=${CFG.replayN} · load K=${CFG.loadK}`);

  // Bot Brain heartbeat: a run row opens FIRST — a silent death still leaves a
  // 'started' row behind, so the portal can show staleness instead of nothing.
  const dbSink = require('./lib/db-sink');
  const runId = await dbSink.startRun(QUICK ? 'manual' : 'weekly', { quick: QUICK, withLessons: WITH_LESSONS });
  if (runId) console.log(`   run id: ${runId}`);

  try {
    const lessonFlag = WITH_LESSONS ? ['--with-lessons'] : [];

    // Phase 1 — synthetic competence (writes/updates knowledge only if you add --apply; here read-only via --dry).
    await run('שלב 1 — כשירות סינתטית', path.join(ROOT, 'run.js'), ['--n', String(CFG.syntheticN), '--dry', ...lessonFlag]);
    const synthetic = knowledge.latestSummary('run-');

    // Phase 2 — real-data competence.
    await run('שלב 2 — כשירות על דאטה אמיתי', path.join(ROOT, 'eval', 'replay.js'), ['--n', String(CFG.replayN), ...lessonFlag]);
    const replay = knowledge.latestSummary('replay-');

    // Phase 3 — concurrency / autonomy.
    await run('שלב 3 — מקביליות ואוטונומיה', path.join(ROOT, 'concurrency', 'load.js'), ['--k', String(CFG.loadK)]);
    const concurrency = knowledge.latestSummary('concurrency-');

    // Report card.
    const gates = grade(synthetic, replay, concurrency);
    const pass = gates.every((x) => x.pass);
    const md = renderCard({ runStamp, CFG, synthetic, replay, concurrency, gates, pass });
    const file = knowledge.saveReport(`bootcamp-${runStamp}.md`, md);

    console.log(`\n╔══════════════════════════════════════╗`);
    console.log(`  תעודת בוגר: ${pass ? '🎓 GO — מוכן לאוטונומיה' : '⛔ NO-GO — עדיין לא'}`);
    console.log(`╚══════════════════════════════════════╝`);
    for (const x of gates) console.log(`  ${x.pass ? '✅' : '❌'} ${x.name} (${x.detail})`);
    console.log(`\n📄 report card: ${file}`);

    // ── Bot Brain: persist scores + failed gates as insights + digest ─────────
    const verdict = pass ? 'GO' : 'NO-GO';
    const scores = {
      synthetic: synthetic?.avg ?? null,
      replay: replay?.avg ?? null,
      autonomy_pct: concurrency?.autonomyRate ?? null,
      p95_ms: concurrency?.p95 ?? null,
      race_loss_pct: concurrency?.raceLossRate ?? null,
    };
    for (const g of gates.filter((x) => !x.pass)) {
      await dbSink.addInsight({
        source: 'bootcamp',
        title: `שער נכשל: ${g.name}`,
        evidence: `ערך בפועל: ${g.detail} (ריצת ${runStamp})`,
        metrics: { sample_size: CFG.replayN },
        type: 'info',
        runId,
      });
    }
    await dbSink.finishRun(runId, { status: 'completed', verdict, scores, meta: { report_file: file } });

    const { sendWeeklyDigest } = require('./lib/digest');
    const digestResult = await sendWeeklyDigest({ runId, verdict, scores });
    console.log(`📨 digest: ${digestResult}`);
    await dbSink.finishRun(runId, { status: 'completed', verdict, scores, meta: { report_file: file, digest: digestResult } });
  } catch (err) {
    await dbSink.finishRun(runId, { status: 'failed', meta: { error: String(err.message || err).slice(0, 300) } });
    throw err;
  }
}

function renderCard({ runStamp, CFG, synthetic, replay, concurrency, gates, pass }) {
  const L = [];
  L.push(`# תעודת בוגר — בוטקאמפ בוט ההזמנות`);
  L.push(`_${runStamp}_\n`);
  L.push(`## פסק דין: ${pass ? '🎓 GO — מוכן להפעלה אוטונומית' : '⛔ NO-GO — לא מוכן עדיין'}\n`);
  L.push(`| שער | תוצאה | ערך |`);
  L.push(`|------|-------|-----|`);
  for (const x of gates) L.push(`| ${x.name} | ${x.pass ? '✅' : '❌'} | ${x.detail} |`);
  L.push('');
  L.push(`## שלב 1 — כשירות סינתטית (${CFG.syntheticN} שיחות)`);
  L.push(synthetic ? `- ממוצע **${synthetic.avg}** · הושלמו ${synthetic.completed}/${synthetic.total} · באגים ${synthetic.bugs} (${synthetic.critical} קריטיים)` : '- לא רץ');
  L.push(`\n## שלב 2 — כשירות על שיחות אמיתיות (${CFG.replayN})`);
  L.push(replay ? `- ממוצע **${replay.avg}** · חלשים ${replay.weak}/${replay.count} · רגרסיות ${replay.regressions}` : '- לא רץ');
  L.push(`\n## שלב 3 — מקביליות ואוטונומיה (K=${CFG.loadK})`);
  L.push(concurrency
    ? `- autonomy **${concurrency.autonomyRate}%** · completion ${concurrency.completionRate}% · isolation ${concurrency.isolationViolations} · p95 ${concurrency.p95}ms · leaked HTTP ${concurrency.blockedHttp}\n- same-phone race loss **${concurrency.raceLossRate}%** · fault integrity ${concurrency.faultIntegrityViolations} · teardown נקי ${concurrency.teardownClean}`
    : '- לא רץ');
  L.push(`\n---\n_דוחות מפורטים: run-*.md, replay-*.md, concurrency-*.md באותה תיקייה._`);
  return L.join('\n');
}

main().catch((err) => { console.error('❌ bootcamp failed:', err); process.exit(1); });
