'use strict';

// Load env BEFORE anything that reads process.env at module load (settings.js does).
// Prefer .env.production — it holds the working Anthropic + Supabase keys the
// deployed bot uses (local .env has a disabled legacy Supabase key + empty Anthropic key).
{
  const p = require('path');
  require('dotenv').config({ path: p.join(__dirname, '..', '.env.production'), override: true });
  require('dotenv').config({ path: p.join(__dirname, '..', '.env') }); // fill any gaps, no override
}

// Orchestrator for the bot-training network.
//
//   node training/run.js                 # default batch (config.DEFAULT_RUNS convos)
//   node training/run.js --n 24          # 24 conversations, personas round-robin
//   node training/run.js --persona toppings-heavy --n 5
//   node training/run.js --with-lessons  # A/B: inject accumulated lessons into the bot
//   node training/run.js --apply         # after synth, append lessons+examples+dataset to the store
//   node training/run.js --dry           # don't grow the knowledge store (report only)
//
// Flow:  personas -> conversations (parallel, bounded) -> judge each -> synthesize
//        -> write report -> optionally grow knowledge store.

const { personas } = require('./personas');
const { runConversation, renderTranscript } = require('./lib/runner');
const { judgeConversation } = require('./lib/judge');
const { synthesize, harvestExamples, harvestDataset } = require('./lib/improve');
const knowledge = require('./lib/knowledge');
const { DEFAULT_RUNS, CONCURRENCY } = require('./config');

function parseArgs(argv) {
  const args = { n: DEFAULT_RUNS, persona: null, withLessons: false, apply: false, dry: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') args.n = Number(argv[++i]);
    else if (a === '--persona') args.persona = argv[++i];
    else if (a === '--with-lessons') args.withLessons = true;
    else if (a === '--apply') args.apply = true;
    else if (a === '--dry') args.dry = true;
  }
  return args;
}

// Simple timestamp without Date.now()-free constraints (this is plain node).
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// Bounded-concurrency map.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function buildSchedule(args) {
  const pool = args.persona
    ? personas.filter((p) => p.id === args.persona)
    : personas;
  if (pool.length === 0) throw new Error(`unknown persona: ${args.persona}`);
  const schedule = [];
  for (let i = 0; i < args.n; i++) schedule.push(pool[i % pool.length]);
  return schedule;
}

async function main() {
  const args = parseArgs(process.argv);
  const runStamp = stamp();
  // Same source the live bot reads (bot_lessons), so an A/B measures production.
  const lessons = args.withLessons ? await require('./lib/db-sink').getActiveLessonsText() : '';

  console.log(`\n🍕 רשת אימון בוט ההזמנות`);
  console.log(`   שיחות: ${args.n} | מקביליות: ${CONCURRENCY} | לקחים מוזרקים: ${args.withLessons ? 'כן' : 'לא'}`);
  if (args.persona) console.log(`   פרסונה: ${args.persona}`);
  console.log('');

  const schedule = buildSchedule(args);

  // 1) Run + judge each conversation as a pipeline (judge as soon as a convo finishes).
  let done = 0;
  const judged = await mapLimit(schedule, CONCURRENCY, async (persona, i) => {
    const record = await runConversation(persona, { lessons });
    const judgment = await judgeConversation(record);
    done++;
    const bar = judgment.score >= 85 ? '🟢' : judgment.score >= 65 ? '🟡' : '🔴';
    console.log(`   ${bar} [${done}/${schedule.length}] ${persona.title.padEnd(24)} ציון=${String(judgment.score).padStart(3)} ${record.completed ? '✓ הזמנה' : '· ללא הזמנה'} — ${judgment.summary || ''}`);
    return { record, judgment };
  });

  // 2) Synthesize batch-level insights.
  console.log(`\n🔬 מסנתז תובנות מ-${judged.length} שיחות...`);
  const synthesis = await synthesize(judged);

  const avg = Math.round(judged.reduce((s, j) => s + (j.judgment.score || 0), 0) / (judged.length || 1));
  const completedCount = judged.filter((j) => j.record.completed).length;
  const bugs = synthesis.bugs || [];
  const critical = bugs.filter((b) => b.severity === 'critical');

  // 3) Write the report.
  const report = buildReport({ runStamp, args, judged, synthesis, avg, completedCount });
  const reportFile = knowledge.saveReport(`run-${runStamp}.md`, report);
  knowledge.saveSummary(`run-${runStamp}`, {
    phase: 'synthetic', total: judged.length, avg, completed: completedCount,
    bugs: bugs.length, critical: critical.length,
  });

  // 4) Grow the knowledge store (unless --dry).
  const examples = harvestExamples(judged);
  const dataset = harvestDataset(judged);
  if (args.apply && !args.dry) {
    knowledge.appendLessons(synthesis.lessons || [], runStamp);
    knowledge.appendExamples(examples);
    knowledge.appendDataset(dataset);
  }

  // 5) Summary to stdout.
  console.log(`\n════════════════════════════════════════`);
  console.log(`ציון ממוצע: ${avg}/100   |   הזמנות שהושלמו: ${completedCount}/${judged.length}`);
  console.log(`באגים שזוהו: ${bugs.length} (${critical.length} קריטיים)`);
  console.log(`לקחים חדשים: ${(synthesis.lessons || []).length} | דוגמאות: ${examples.length} | רשומות דאטהסט: ${dataset.length}`);
  if (args.apply && !args.dry) {
    console.log(`\n✅ הוותק עודכן:`);
    console.log(`   lessons.md   — סה"כ ${knowledge.readLessons().split('\n').filter(l => l.startsWith('- ')).length} לקחים`);
    console.log(`   examples.jsonl — סה"כ ${knowledge.countJSONL(knowledge.paths.examples)} דוגמאות`);
    console.log(`   dataset.jsonl  — סה"כ ${knowledge.countJSONL(knowledge.paths.dataset)} רשומות אימון`);
  } else {
    console.log(`\n(לא נשמר לוותק — הרץ עם --apply כדי לצבור. או --dry לדוח בלבד.)`);
  }
  console.log(`\n📄 דוח מלא: ${reportFile}`);
  if (synthesis.overall_summary) console.log(`\n${synthesis.overall_summary}`);
}

function buildReport({ runStamp, args, judged, synthesis, avg, completedCount }) {
  const lines = [];
  lines.push(`# דוח אימון — ${runStamp}`);
  lines.push('');
  lines.push(`- שיחות: **${judged.length}** | ציון ממוצע: **${avg}/100** | הושלמו: **${completedCount}/${judged.length}**`);
  lines.push(`- לקחים מוזרקים בריצה זו: **${args.withLessons ? 'כן' : 'לא'}**`);
  lines.push('');
  lines.push(synthesis.overall_summary || '');
  lines.push('');

  // Bugs
  lines.push(`## 🐞 באגים (stress-test)`);
  if ((synthesis.bugs || []).length === 0) lines.push('_לא זוהו באגים._');
  for (const b of synthesis.bugs || []) {
    lines.push(`### [${b.severity}] ${b.title}  \`${b.where}\``);
    lines.push(`${b.description}`);
    if (b.repro) lines.push(`- **שחזור:** ${b.repro}`);
    if (b.fix) lines.push(`- **תיקון מוצע:** ${b.fix}`);
    lines.push('');
  }

  // Lessons
  lines.push(`## 🎓 לקחים חדשים (ה"וותק")`);
  if ((synthesis.lessons || []).length === 0) lines.push('_אין._');
  for (const l of synthesis.lessons || []) lines.push(`- ${l}`);
  lines.push('');
  if (synthesis.prompt_patch_suggestion) {
    lines.push(`### שינוי הפרומפט המומלץ ביותר`);
    lines.push(synthesis.prompt_patch_suggestion);
    lines.push('');
  }

  // Themes
  lines.push(`## 📊 נושאים חוזרים`);
  for (const t of synthesis.themes || []) {
    lines.push(`- **${t.theme}** ×${t.count} — ${(t.affected_personas || []).join(', ')}`);
  }
  lines.push('');

  // Per-conversation detail
  lines.push(`## 🗂️ פירוט שיחות`);
  judged.forEach(({ record, judgment }, i) => {
    lines.push(`### #${i + 1} — ${record.persona.title} — ציון ${judgment.score} ${record.completed ? '✓' : '✗'}`);
    lines.push(`- מטרה: ${record.persona.goal}`);
    lines.push(`- ${judgment.summary || ''}`);
    for (const issue of judgment.issues || []) {
      lines.push(`  - [${issue.severity}${issue.is_bug ? '/bug' : ''}] **${issue.category}**: ${issue.description}${issue.suggestion ? ` → _${issue.suggestion}_` : ''}`);
    }
    lines.push('');
    lines.push('<details><summary>תמליל</summary>');
    lines.push('');
    lines.push('```');
    lines.push(renderTranscript(record.transcript));
    if (record.capturedOrder) {
      lines.push('');
      lines.push('— הזמנה שנקלטה —');
      lines.push(JSON.stringify(record.capturedOrder, null, 2));
    }
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  });

  return lines.join('\n');
}

main().catch((err) => {
  console.error('\n❌ ריצת האימון נכשלה:', err);
  process.exit(1);
});
