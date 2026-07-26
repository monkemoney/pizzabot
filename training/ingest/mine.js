'use strict';

// CLI: LLM pass over the real ordering sessions to extract:
//   - real-cases.jsonl : discrete order cases (customer turn sequences + intent +
//                        historical outcome) — the replay eval feeds these to the bot.
//   - insights.md      : aggregated new edge cases + real slang + recurring failures,
//                        to enrich the personas.
//
//   node training/ingest/mine.js            # all useful sessions
//   node training/ingest/mine.js --limit 10 # first 10 (quick)

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production'), override: true });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const { chatJSON, chat } = require('../lib/llm');
const { SIM_MODEL, IMPROVE_MODEL } = require('../config');

const DATA = path.join(__dirname, 'data', 'sessions.jsonl');
const CASES_OUT = path.join(__dirname, 'real-cases.jsonl');
const INSIGHTS_OUT = path.join(__dirname, 'insights.md');

const EXTRACT_SYS = `אתה מנתח תמלילים אמיתיים של שיחות בין לקוחות לבוט הזמנות פיצה (הבוט הישן, עם אמוג'ים).
קיבלת תמליל אמיתי אחד (יתכן שהוא מכיל כמה ניסיונות הזמנה נפרדים).

חלץ ממנו "מקרי הזמנה" בדידים. לכל מקרה — רק את הודעות הלקוח לפי הסדר (בלי תשובות הבוט), מה הלקוח רצה, ומה קרה בפועל.

החזר JSON דחוס בלבד:
{"cases":[{"customer_turns":["<הודעת לקוח>", ...],"intent":"<מה הלקוח רצה במשפט>","outcome":"completed|abandoned|failed|unclear","failure":"<אם הבוט הישן נכשל/בלבל — מה קרה, אחרת null>","edge_tags":["<תגית מקרה קצה>"]}],"session_edge_cases":["<מקרה קצה/דפוס אמיתי ששווה לבדוק שוב>"],"slang":["<ביטוי/סלנג/שגיאת כתיב אמיתית שלקוחות השתמשו>"]}

כללים:
- customer_turns = טקסט אמיתי של הלקוח בלבד, מנוקה, לפי הסדר. השמט הודעות dev/בדיקה ריקות ('123','test').
- אם אין באמת מקרה הזמנה — החזר cases ריק אבל עדיין מלא slang/edge אם יש.
- אל תמציא. חלץ רק מה שקיים בתמליל.
- שמור על קיצור.`;

const SYNTH_SYS = `אתה מהנדס איכות בכיר. קיבלת אוסף מקרי קצה, סלנג וכשלים שחולצו משיחות אמיתיות של בוט פיצה.
סנתז מסמך תובנות קצר וממוקד בעברית (Markdown) שישמש להעשרת בדיקות הבוט. כלול:
## מקרי קצה חדשים לבדוק (רשימה, כל אחד שורה אחת אופרטיבית)
## דפוסי שפה/סלנג אמיתיים (רשימה קצרה)
## כשלים חוזרים של הבוט הישן (רשימה, מה נשבר ולמה)
## פרסונות מוצעות (2-4 פרסונות חדשות שכדאי להוסיף, כל אחת: שם + מה היא בודקת)
בלי הקדמות. רק המסמך.`;

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const cur = i++;
      try { results[cur] = await fn(items[cur], cur); }
      catch (err) { results[cur] = { error: err.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function renderTurns(session, cap = 90) {
  return session.turns.slice(0, cap)
    .map((t) => `${t.role === 'bot' ? 'בוט' : 'לקוח'}: ${t.text.replace(/\n/g, ' ')}`)
    .join('\n');
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  if (!fs.existsSync(DATA)) {
    console.error(`❌ ${DATA} not found — run: node training/ingest/parse-exports.js`);
    process.exit(1);
  }
  let sessions = fs.readFileSync(DATA, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (Number.isFinite(limit)) sessions = sessions.slice(0, limit);
  console.log(`⛏️  mining ${sessions.length} real sessions...\n`);

  const extracted = await mapLimit(sessions, 5, async (session, idx) => {
    const res = await chatJSON({
      model: SIM_MODEL,
      system: EXTRACT_SYS,
      messages: [{ role: 'user', content: `תמליל אמיתי (מקור: ${session.source}):\n\n${renderTurns(session)}\n\nחלץ JSON.` }],
      maxTokens: 2500,
    });
    process.stdout.write(`  [${idx + 1}/${sessions.length}] ${res?.cases?.length || 0} cases\r`);
    return { session, res };
  });

  // Flatten cases.
  const cases = [];
  const allEdge = [];
  const allSlang = [];
  const allFailures = [];
  for (const { session, res } of extracted) {
    if (!res || res.error) continue;
    for (const c of res.cases || []) {
      if (!c.customer_turns || !c.customer_turns.length) continue;
      cases.push({
        id: session.id + '-' + cases.length,
        source: session.source,
        customer_turns: c.customer_turns,
        intent: c.intent || '',
        outcome: c.outcome || 'unclear',
        failure: c.failure || null,
        edge_tags: c.edge_tags || [],
      });
      if (c.failure) allFailures.push(c.failure);
    }
    for (const e of res.session_edge_cases || []) allEdge.push(e);
    for (const s of res.slang || []) allSlang.push(s);
  }

  fs.writeFileSync(CASES_OUT, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
  console.log(`\n\n✅ ${cases.length} real order cases → ${path.relative(process.cwd(), CASES_OUT)}`);
  const byOutcome = cases.reduce((m, c) => ((m[c.outcome] = (m[c.outcome] || 0) + 1), m), {});
  console.log(`   outcomes: ${Object.entries(byOutcome).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`   raw signals: ${allEdge.length} edge, ${allSlang.length} slang, ${allFailures.length} failures`);

  // Synthesize insights.md.
  console.log(`\n🔬 synthesizing insights...`);
  const insights = await chat({
    model: IMPROVE_MODEL,
    system: SYNTH_SYS,
    messages: [{
      role: 'user',
      content: `מקרי קצה (${allEdge.length}):\n${dedupe(allEdge).join('\n')}\n\nסלנג (${allSlang.length}):\n${dedupe(allSlang).join('\n')}\n\nכשלים (${allFailures.length}):\n${dedupe(allFailures).join('\n')}\n\nסנתז מסמך תובנות.`,
    }],
    maxTokens: 2500,
  });
  const header = `# תובנות משיחות אמיתיות\n\n_נוצר מ-${cases.length} מקרי הזמנה אמיתיים ב-${sessions.length} שיחות._\n\n`;
  fs.writeFileSync(INSIGHTS_OUT, header + insights + '\n');
  console.log(`✅ insights → ${path.relative(process.cwd(), INSIGHTS_OUT)}`);
}

function dedupe(arr) {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

main().catch((err) => { console.error('❌ mine failed:', err); process.exit(1); });
