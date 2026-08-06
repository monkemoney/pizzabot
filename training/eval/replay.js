'use strict';

// Replay eval — the honest competence test. Feeds each REAL customer's turn
// sequence (from training/ingest/real-cases.jsonl) to a fresh OrderBotSession and
// judges how the CURRENT bot handles real language, slang, typos and edge cases.
//
//   node training/eval/replay.js            # all mined cases
//   node training/eval/replay.js --n 15     # first 15
//   node training/eval/replay.js --with-lessons   # inject accumulated lessons (A/B)

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production'), override: true });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const { OrderBotSession, TERMINAL_ACTIONS } = require('../lib/order-bot');
const { judgeConversation } = require('../lib/judge');
const { renderTranscript } = require('../lib/runner');
const knowledge = require('../lib/knowledge');

const CASES = path.join(__dirname, '..', 'ingest', 'real-cases.jsonl');

function parseArgs() {
  const a = { n: Infinity, withLessons: false, concurrency: 4 };
  const argv = process.argv;
  const ni = argv.indexOf('--n'); if (ni > -1) a.n = Number(argv[ni + 1]);
  if (argv.includes('--with-lessons')) a.withLessons = true;
  const ci = argv.indexOf('--concurrency'); if (ci > -1) a.concurrency = Number(argv[ci + 1]);
  return a;
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) { const c = i++; results[c] = await fn(items[c], c); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Replay one real case against the current bot; returns a judge-compatible record. */
async function replayCase(realCase, lessons) {
  const bot = new OrderBotSession({ lessons });
  await bot.init();

  const transcript = [];
  const actions = [];
  let capturedOrder = null, terminalType = null, error = null;

  try {
    for (const turn of realCase.customer_turns) {
      if (!turn || !turn.trim()) continue;
      transcript.push({ speaker: 'customer', text: turn });
      const { text, action } = await bot.send(turn);
      if (text) transcript.push({ speaker: 'bot', text });
      if (action) {
        actions.push(action);
        if (TERMINAL_ACTIONS.has(action.type) && action.payload) {
          capturedOrder = action.payload; terminalType = action.type; break;
        }
      }
    }
  } catch (err) { error = err.message; }

  return {
    mode: 'replay',
    botLatencies: bot.latencies,
    persona: {
      id: realCase.id,
      title: `שיחה אמיתית (${realCase.outcome})`,
      goal: realCase.intent || 'להזמין (מתוך שיחה אמיתית)',
      probes: realCase.edge_tags && realCase.edge_tags.length ? realCase.edge_tags : ['real-replay'],
    },
    historicalOutcome: realCase.outcome,
    historicalFailure: realCase.failure || null,
    transcript, actions: actions.map((a) => a.type),
    capturedOrder, terminalType, completed: !!capturedOrder,
    turns: realCase.customer_turns.length, error,
  };
}

async function main() {
  const args = parseArgs();
  if (!fs.existsSync(CASES)) {
    console.error(`❌ ${CASES} not found — run: node training/ingest/mine.js`);
    process.exit(1);
  }
  let cases = fs.readFileSync(CASES, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (Number.isFinite(args.n)) cases = cases.slice(0, args.n);
  // Same source the live bot reads (bot_lessons), so an A/B measures production.
  const lessons = args.withLessons ? await require('../lib/db-sink').getActiveLessonsText() : '';

  console.log(`\n🎬 Replay eval — ${cases.length} שיחות אמיתיות | לקחים: ${args.withLessons ? 'כן' : 'לא'}\n`);

  let done = 0;
  const judged = await mapLimit(cases, args.concurrency, async (realCase) => {
    const record = await replayCase(realCase, lessons);
    const judgment = await judgeConversation(record);
    done++;
    const bar = judgment.score >= 85 ? '🟢' : judgment.score >= 65 ? '🟡' : '🔴';
    console.log(`  ${bar} [${done}/${cases.length}] ציון=${String(judgment.score).padStart(3)} ${record.completed ? '✓' : '·'} — ${(judgment.summary || '').slice(0, 80)}`);
    return { record, judgment };
  });

  // A judge infra failure (malformed JSON after retries) is a measurement gap,
  // not a bot score of 0 — exclude it from the average and report it separately.
  const scored = judged.filter((j) => !j.judgment._judgeFailed);
  const judgeFailures = judged.length - scored.length;
  const avg = Math.round(scored.reduce((s, j) => s + (j.judgment.score || 0), 0) / (scored.length || 1));
  const weak = scored.filter((j) => j.judgment.score < 70);

  // Bot model latency across every call in the run (compares bot models).
  const allLat = judged.flatMap((j) => j.record.botLatencies || []).sort((a, b) => a - b);
  const latP = (p) => (allLat.length ? allLat[Math.min(allLat.length - 1, Math.floor((p / 100) * allLat.length))] : 0);
  const maxSpread = Math.max(0, ...scored.map((j) => j.judgment._voteSpread || 0));
  const regressions = judged.filter((j) => j.record.historicalFailure &&
    (j.judgment.issues || []).some((i) => i.severity !== 'minor'));

  const st = stamp();
  const report = buildReport({ stamp: st, judged, avg, args });
  const file = knowledge.saveReport(`replay-${st}.md`, report);
  knowledge.saveSummary(`replay-${st}`, {
    phase: 'replay', count: scored.length, avg,
    weak: weak.length, regressions: regressions.length,
    judgeFailures, withLessons: args.withLessons,
    botModel: process.env.SIM_BOT_MODEL || require('../config').BOT_MODEL,
    botLatencyP50: latP(50), botLatencyP95: latP(95),
    judgeVotes: Number(process.env.SIM_JUDGE_VOTES || 3), maxVoteSpread: maxSpread,
  });

  console.log(`\n════════════════════════════════════════`);
  console.log(`ציון ממוצע על דאטה אמיתי: ${avg}/100  |  חלשים (<70): ${weak.length}/${scored.length}${judgeFailures ? `  |  כשלי שופט (לא נספרו): ${judgeFailures}` : ''}`);
  console.log(`מודל בוט: ${process.env.SIM_BOT_MODEL || require('../config').BOT_MODEL}  |  latency קריאת-בוט: p50 ${latP(50)}ms · p95 ${latP(95)}ms  |  פיזור-קולות מקס': ${maxSpread}`);
  console.log(`מקרים שהבוט הישן נכשל בהם ועדיין יש בעיה: ${regressions.length}`);
  console.log(`📄 ${file}`);
}

function buildReport({ stamp, judged, avg, args }) {
  const L = [];
  L.push(`# Replay eval — ${stamp}`);
  L.push(`\n- שיחות אמיתיות: **${judged.length}** | ממוצע: **${avg}/100** | לקחים מוזרקים: ${args.withLessons ? 'כן' : 'לא'}\n`);
  const sorted = [...judged].sort((a, b) => a.judgment.score - b.judgment.score);
  L.push(`## הכי חלשים`);
  for (const { record, judgment } of sorted.slice(0, 10)) {
    L.push(`### ציון ${judgment.score} — ${record.persona.title} — כוונה: ${record.persona.goal}`);
    if (record.historicalFailure) L.push(`- כשל הבוט הישן: ${record.historicalFailure}`);
    for (const i of judgment.issues || []) {
      L.push(`  - [${i.severity}${i.is_bug ? '/bug' : ''}] ${i.category}: ${i.description}${i.suggestion ? ` → _${i.suggestion}_` : ''}`);
    }
    L.push('<details><summary>תמליל</summary>\n\n```');
    L.push(renderTranscript(record.transcript));
    L.push('```\n</details>\n');
  }
  return L.join('\n');
}

main().catch((err) => { console.error('❌ replay failed:', err); process.exit(1); });
