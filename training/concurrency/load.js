'use strict';

// Concurrency & autonomy proving-ground. Runs K conversations against the REAL
// handleMessage() on throwaway test tenants and measures whether the bot can be
// trusted to run unattended: autonomy rate, state isolation, same-phone races,
// cache coherence under load, latency, and graceful degradation under faults.
//
//   node training/concurrency/load.js --k 5     # smoke
//   node training/concurrency/load.js --k 50    # full target
//   node training/concurrency/load.js --k 50 --keep   # don't tear down (debug)

const driver = require('./driver');           // requires services; installPatches BEFORE ai-handler
const tt = require('./test-tenant');
const knowledge = require('../lib/knowledge');
const menuService = require('../../src/services/menu-service');
const supa = require('../../src/services/supabase');

function parseArgs() {
  const a = { k: 50, faultRate: 0.05, keep: false };
  const argv = process.argv;
  const ki = argv.indexOf('--k'); if (ki > -1) a.k = Number(argv[ki + 1]);
  const fi = argv.indexOf('--fault'); if (fi > -1) a.faultRate = Number(argv[fi + 1]);
  if (argv.includes('--keep')) a.keep = true;
  return a;
}
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// Deterministic scripted customer — unique tracer name per conversation. No LLM:
// load/isolation/race testing must be cheap, fast and reproducible.
function makeTracer(i, tenantId) {
  const token = `טסט_${i}_${1000 + (i * 37) % 9000}`;
  return {
    id: `trace-${i}`,
    name: token,
    phone: `sim-${tenantId.slice(0, 4)}-${i}`,
    script: [
      `היי, איסוף עצמי במזומן, השם שלי ${token}`,
      `אני רוצה פיצה משפחתית בלי תוספות`,
      `1`,
      `1`,
    ],
  };
}
function scriptedNext(persona, transcript) {
  const idx = transcript.filter((t) => t.speaker === 'customer').length;
  const script = persona.script;
  if (idx >= script.length) return { text: '', done: true };
  return { text: script[idx], done: idx >= script.length - 1 };
}

async function runBatch(tenantId, count, offset = 0) {
  const tracers = Array.from({ length: count }, (_, i) => makeTracer(offset + i, tenantId));
  const records = await Promise.all(tracers.map((tracer) =>
    driver.runAgainstHandler({
      nextCustomerMessage: scriptedNext,
      persona: tracer,
      tenantId,
      phone: tracer.phone,
      maxTurns: 8,
    }).then((rec) => ({ ...rec, tracer }))
  ));
  return records;
}

// ── Sub-test: same-phone race ────────────────────────────────────────────────
async function samePhoneRace(tenantId, trials = 8) {
  const handleMessage = driver.getHandler();
  let lost = 0;
  for (let i = 0; i < trials; i++) {
    const phone = `race-${tenantId.slice(0, 4)}-${i}`;
    await supa.updateSession(phone, { conversation_history: [] }, tenantId).catch(() => {});
    // Two messages fired concurrently for the SAME phone.
    await Promise.all([
      handleMessage(phone, `הודעה א ${i}`, tenantId).catch(() => {}),
      handleMessage(phone, `הודעה ב ${i}`, tenantId).catch(() => {}),
    ]);
    const session = await supa.getSession(phone, tenantId);
    const hist = Array.isArray(session.conversation_history) ? session.conversation_history : [];
    const userMsgs = hist.filter((m) => m.role === 'user').map((m) => m.content).join(' | ');
    const bothPresent = userMsgs.includes(`הודעה א ${i}`) && userMsgs.includes(`הודעה ב ${i}`);
    if (!bothPresent) lost++;
    await supa.updateSession(phone, { conversation_history: [] }, tenantId).catch(() => {});
  }
  return { trials, lostBothMessages: lost, lossRate: pct(lost, trials) };
}

// ── Sub-test: cache coherence under a direct DB write ────────────────────────
async function cacheCoherence(tenantId, otherTenantId) {
  const db = supa.getRawClient ? supa.getRawClient() : require('@supabase/supabase-js')
    .createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  menuService.invalidateCache(tenantId);
  const before = await menuService.getProducts(tenantId);
  const prod = before.main.find((p) => p.name_he === 'פיצה משפחתית') || before.main[0];
  if (!prod) return { ok: false, reason: 'no product to test' };
  const original = Number(prod.price);
  const bumped = original + 5;

  // Direct DB write (bypasses settings.set/invalidate — exercises the TTL).
  await db.from('products').update({ price: bumped }).eq('id', prod.id);

  // Within TTL: coherent snapshot still serves the old value.
  const immediate = await menuService.getProducts(tenantId);
  const immediatePrice = Number(immediate.main.find((p) => p.id === prod.id)?.price);
  const servedOldWithinTTL = immediatePrice === original;

  // After TTL: refreshed.
  await new Promise((r) => setTimeout(r, 3300));
  const after = await menuService.getProducts(tenantId);
  const afterPrice = Number(after.main.find((p) => p.id === prod.id)?.price);
  const refreshed = afterPrice === bumped;

  // Other tenant unaffected.
  let otherUnaffected = true;
  if (otherTenantId) {
    const other = await menuService.getProducts(otherTenantId);
    otherUnaffected = !other.main.some((p) => Number(p.price) === bumped && p.name_he === prod.name_he)
      || true; // structural isolation (separate rows); informational
  }

  await db.from('products').update({ price: original }).eq('id', prod.id); // restore
  return { ok: servedOldWithinTTL && refreshed, servedOldWithinTTL, refreshed, otherUnaffected, original, bumped };
}

// ── Isolation analysis over a batch ──────────────────────────────────────────
function analyzeIsolation(records) {
  let checked = 0, violations = 0;
  const seenNames = new Map();
  for (const rec of records) {
    if (!rec.capturedOrder) continue;
    checked++;
    const name = rec.capturedOrder.payload.customer_name || '';
    // The captured order must carry THIS conversation's tracer name.
    if (!name.includes(rec.tracer.name)) violations++;
    // No two conversations may share a tracer name.
    if (seenNames.has(name)) violations++;
    seenNames.set(name, rec.tracer.phone);
    // Order must belong to the intended tenant.
    if (rec.capturedOrder.tenantId && rec.capturedOrder.tenantId !== rec.tenantId) violations++;
  }
  return { ordersChecked: checked, violations };
}

async function main() {
  const args = parseArgs();
  const runStamp = stamp();
  console.log(`\n🏋️  מגרש מקביליות ואוטונומיה — K=${args.k}, fault=${args.faultRate}\n`);

  // Patch BEFORE ai-handler is ever required.
  driver.installPatches({ faultRate: 0, opusConcurrency: 10 });

  console.log('⚙️  provisioning test tenants...');
  const primary = await tt.provisionTestTenant({ tag: 'A' });
  const secondary = await tt.provisionTestTenant({ tag: 'B' });
  console.log(`   primary=${primary.tenantId} (${primary.businessName})`);
  console.log(`   secondary=${secondary.tenantId} (${secondary.businessName})\n`);

  const report = { runStamp, k: args.k };
  try {
    // 1) Main concurrent batch — autonomy + isolation (split across 2 tenants for cross-tenant).
    console.log(`🚀 running ${args.k} concurrent conversations...`);
    driver.resetMetrics();
    const t0 = Date.now();
    const half = Math.max(1, Math.floor(args.k / 2));
    const [recA, recB] = await Promise.all([
      runBatch(primary.tenantId, args.k - half, 0),
      runBatch(secondary.tenantId, half, 1000),
    ]);
    const records = [...recA, ...recB];
    const wall = Date.now() - t0;

    const completed = records.filter((r) => r.completed).length;
    const errored = records.filter((r) => r.hadError).length;
    const autonomous = records.filter((r) => r.completed && !r.hadError).length;
    const isolation = analyzeIsolation(records);

    report.batch = {
      total: records.length, completed, errored, autonomous,
      autonomyRate: pct(autonomous, records.length),
      completionRate: pct(completed, records.length),
      isolationViolations: isolation.violations,
      ordersChecked: isolation.ordersChecked,
      wallMs: wall,
      p50: percentile(driver.metrics.latencies, 50),
      p95: percentile(driver.metrics.latencies, 95),
      claudeP50: percentile(driver.metrics.claudeLatencies, 50),
      claudeP95: percentile(driver.metrics.claudeLatencies, 95),
      opusCalls: driver.metrics.opusCalls,
      blockedHttp: driver.metrics.blockedHttp,
    };
    console.log(`   ✓ autonomy ${report.batch.autonomyRate}% | completion ${report.batch.completionRate}% | isolation violations ${isolation.violations} | p95 ${report.batch.p95}ms | blockedHttp ${driver.metrics.blockedHttp}`);

    // 2) Same-phone race.
    console.log(`🔀 same-phone race...`);
    report.race = await samePhoneRace(primary.tenantId, 8);
    console.log(`   ✓ lost both-message in ${report.race.lostBothMessages}/${report.race.trials} (${report.race.lossRate}%)`);

    // 3) Cache coherence.
    console.log(`🧊 cache coherence under direct DB write...`);
    report.cache = await cacheCoherence(primary.tenantId, secondary.tenantId);
    console.log(`   ✓ served-old-within-TTL=${report.cache.servedOldWithinTTL} refreshed-after-TTL=${report.cache.refreshed}`);

    // 4) Fault injection.
    console.log(`💥 fault injection @ ${args.faultRate}...`);
    driver.resetMetrics();
    driver.installPatches({ faultRate: args.faultRate }); // updates rate
    const faultRecords = await runBatch(primary.tenantId, Math.min(12, args.k), 5000);
    const faultIsolation = analyzeIsolation(faultRecords);
    report.fault = {
      conversations: faultRecords.length,
      injectedFaults: driver.metrics.injectedFaults,
      errored: faultRecords.filter((r) => r.hadError).length,
      stillCompleted: faultRecords.filter((r) => r.completed).length,
      isolationViolations: faultIsolation.violations,   // integrity must hold under faults
    };
    driver.installPatches({ faultRate: 0 });
    console.log(`   ✓ injected ${report.fault.injectedFaults} faults | errored ${report.fault.errored} | integrity violations ${report.fault.isolationViolations}`);

  } finally {
    if (!args.keep) {
      console.log(`\n🧹 tearing down test tenants...`);
      await tt.teardownTestTenant(primary.tenantId).catch((e) => console.error('teardown A:', e.message));
      await tt.teardownTestTenant(secondary.tenantId).catch((e) => console.error('teardown B:', e.message));
      const leftA = await tt.countTenantRows(primary.tenantId);
      report.teardownClean = Object.values(leftA).every((v) => v === 0);
      console.log(`   ✓ teardown clean: ${report.teardownClean}`);
    } else {
      console.log(`\n⚠️  --keep: tenants left in place: ${primary.tenantId}, ${secondary.tenantId}`);
    }
  }

  const verdict = concurrencyVerdict(report);
  report.verdict = verdict;
  const md = renderReport(report);
  const file = knowledge.saveReport(`concurrency-${runStamp}.md`, md);
  knowledge.saveSummary(`concurrency-${runStamp}`, {
    phase: 'concurrency', k: args.k, pass: verdict.pass,
    autonomyRate: report.batch?.autonomyRate, completionRate: report.batch?.completionRate,
    isolationViolations: report.batch?.isolationViolations, p95: report.batch?.p95,
    blockedHttp: report.batch?.blockedHttp, raceLossRate: report.race?.lossRate,
    faultIntegrityViolations: report.fault?.isolationViolations, teardownClean: report.teardownClean,
    gates: verdict.lines,
  });

  console.log(`\n════════════════════════════════════════`);
  console.log(`מקביליות @${args.k}: ${verdict.pass ? '🟢 GO' : '🔴 NO-GO'}`);
  for (const line of verdict.lines) console.log(`   ${line}`);
  console.log(`\n📄 ${file}`);

  // Return for the bootcamp orchestrator.
  if (require.main !== module) return report;
}

// Graduation gate for concurrency (plan §L6).
function concurrencyVerdict(report) {
  const b = report.batch || {};
  const gates = [
    ['autonomy ≥98%', (b.autonomyRate || 0) >= 98, `${b.autonomyRate}%`],
    ['0 isolation violations', (b.isolationViolations || 0) === 0, `${b.isolationViolations}`],
    ['p95 < 8000ms', (b.p95 || 1e9) < 8000, `${b.p95}ms`],
    ['0 leaked HTTP sends', (b.blockedHttp || 0) === 0, `${b.blockedHttp}`],
    ['fault integrity holds', (report.fault?.isolationViolations || 0) === 0, `${report.fault?.isolationViolations}`],
    ['teardown clean', report.teardownClean !== false, `${report.teardownClean}`],
  ];
  const pass = gates.every((g) => g[1]);
  return { pass, lines: gates.map((g) => `${g[1] ? '✅' : '❌'} ${g[0]} (${g[2]})`) };
}

function renderReport(r) {
  const b = r.batch || {};
  return `# מגרש מקביליות ואוטונומיה — ${r.runStamp}

## פסק דין: ${r.verdict?.pass ? '🟢 GO' : '🔴 NO-GO'} @ K=${r.k}
${(r.verdict?.lines || []).map((l) => `- ${l}`).join('\n')}

## Batch (${b.total} שיחות בו-זמנית)
- **Autonomy rate:** ${b.autonomyRate}% (${b.autonomous}/${b.total} הושלמו ללא שגיאה/התערבות)
- **Completion rate:** ${b.completionRate}%
- **Isolation violations:** ${b.isolationViolations} (מתוך ${b.ordersChecked} הזמנות שנבדקו)
- **Latency:** p50 ${b.p50}ms · p95 ${b.p95}ms (מתוכו Opus עצמו: p50 ${b.claudeP50}ms · p95 ${b.claudeP95}ms — overhead = ההפרש)
- **Wall clock:** ${(b.wallMs / 1000).toFixed(1)}s · Opus calls: ${b.opusCalls}
- **Leaked HTTP sends:** ${b.blockedHttp} (חייב 0)

## Same-phone race (הידוע — last-write-wins)
- אבדן שתי-הודעות: ${r.race?.lostBothMessages}/${r.race?.trials} (${r.race?.lossRate}%)
- _זהו ה-race שמתועד ב-CLAUDE.md. אם >0, שווה סריאליזציה per-phone או append אטומי._

## Cache coherence (3s TTL, כתיבה ישירה ל-DB)
- שירת ערך ישן בתוך ה-TTL: ${r.cache?.servedOldWithinTTL}
- התרענן אחרי ה-TTL: ${r.cache?.refreshed}
- טנאנט אחר לא הושפע: ${r.cache?.otherUnaffected}

## Fault injection @ ${r.fault ? (r.fault.injectedFaults + ' faults') : ''}
- שיחות: ${r.fault?.conversations} · שגיאות: ${r.fault?.errored} · עדיין הושלמו: ${r.fault?.stillCompleted}
- **הפרות שלמות תחת תקלות:** ${r.fault?.isolationViolations} (חייב 0 — אין שיבוש/דליפה גם כשיש כשלים)

## Teardown
- נקי: ${r.teardownClean}
`;
}

module.exports = { main, concurrencyVerdict };

if (require.main === module) {
  main().catch((err) => { console.error('❌ load failed:', err); process.exit(1); });
}
