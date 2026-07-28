'use strict';

// Mine LIVE production conversations — the current bot's real failures, not the
// old bot's. Reads sessions.conversation_history for every REAL tenant (skips
// admin sessions and __test_tenant tenants), scrubs PII, and reuses the same
// LLM extraction as mine.js. Output is local-only (gitignored).
//
//   node training/ingest/mine-live.js               # all real tenants
//   node training/ingest/mine-live.js --limit 30    # cap sessions (cost control)
//
// Limitation (by design): conversation_history is cleared after an order
// completes and after resets, so this catches recent/active conversations;
// completed-order outcomes come from training/analytics/funnel.js instead.
//
// NOTE: requires Anthropic API credits (LLM extraction).

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production'), override: true });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { scrub, pseudonym } = require('./segment');
const { chatJSON, chat } = require('../lib/llm');
const { SIM_MODEL, IMPROVE_MODEL } = require('../config');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const CASES_OUT = path.join(__dirname, 'live-cases.jsonl');
const INSIGHTS_OUT = path.join(__dirname, 'live-insights.md');

// Same extraction rubric as mine.js, adapted for the CURRENT bot.
const EXTRACT_SYS = `אתה מנתח תמלילי שיחות חיות בין לקוחות לבוט הזמנות פיצה (הבוט הנוכחי, מבוסס LLM).
חלץ מקרים ותובנות. החזר JSON דחוס בלבד:
{"cases":[{"customer_turns":["..."],"intent":"...","outcome":"completed|abandoned|failed|in_progress|unclear","failure":"<כשל של הבוט אם היה, אחרת null>","edge_tags":["..."]}],"session_edge_cases":["..."],"slang":["..."]}
אל תמציא; חלץ רק מה שבתמליל. השמט הודעות בדיקה ('123','test').`;

async function realTenantIds() {
  const { data: all } = await db.from('settings').select('tenant_id, key');
  const byTenant = new Map();
  for (const r of all || []) {
    if (!byTenant.has(r.tenant_id)) byTenant.set(r.tenant_id, new Set());
    byTenant.get(r.tenant_id).add(r.key);
  }
  return [...byTenant.entries()].filter(([, k]) => !k.has('__test_tenant')).map(([t]) => t);
}

async function fetchLiveSessions(limit) {
  const tids = await realTenantIds();
  const sessions = [];
  for (const tid of tids) {
    const { data } = await db.from('sessions')
      .select('phone, conversation_history, updated_at')
      .eq('tenant_id', tid)
      .not('phone', 'like', 'admin:%')
      .order('updated_at', { ascending: false })
      .limit(limit);
    for (const s of data || []) {
      const hist = Array.isArray(s.conversation_history) ? s.conversation_history : [];
      if (hist.length < 4) continue; // too short to learn from
      sessions.push({
        id: `${tid.slice(0, 8)}-${pseudonym(s.phone)}`,
        tenant: tid.slice(0, 8),
        turns: hist.map((m) => ({
          role: m.role === 'assistant' ? 'bot' : 'customer',
          text: scrub(typeof m.content === 'string' ? m.content : ''),
        })).filter((t) => t.text),
      });
    }
  }
  return sessions;
}

async function main() {
  const li = process.argv.indexOf('--limit');
  const limit = li > -1 ? Number(process.argv[li + 1]) : 50;

  const sessions = await fetchLiveSessions(limit);
  console.log(`\n⛏️  mining ${sessions.length} live sessions (scrubbed)...`);
  if (!sessions.length) { console.log('אין שיחות חיות עם תוכן — נסה שוב אחרי תנועה.'); return; }

  const cases = [], edges = [], slang = [], failures = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const transcript = s.turns.map((t) => `${t.role === 'bot' ? 'בוט' : 'לקוח'}: ${t.text.replace(/\n/g, ' ')}`).join('\n');
    try {
      const res = await chatJSON({
        model: SIM_MODEL, system: EXTRACT_SYS,
        messages: [{ role: 'user', content: `תמליל חי:\n${transcript}\n\nחלץ JSON.` }],
        maxTokens: 2000,
      });
      for (const c of res?.cases || []) {
        if (!c.customer_turns?.length) continue;
        cases.push({ id: `${s.id}-${cases.length}`, source: 'live:' + s.tenant, ...c });
        if (c.failure) failures.push(c.failure);
      }
      edges.push(...(res?.session_edge_cases || []));
      slang.push(...(res?.slang || []));
      process.stdout.write(`  [${i + 1}/${sessions.length}]\r`);
    } catch (e) { console.error(`  session ${s.id}: ${e.message}`); }
  }

  fs.writeFileSync(CASES_OUT, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
  console.log(`\n✅ ${cases.length} live cases → ${path.relative(process.cwd(), CASES_OUT)} | ${failures.length} כשלים, ${edges.length} מקרי קצה`);

  if (edges.length || failures.length) {
    const insights = await chat({
      model: IMPROVE_MODEL,
      system: 'סכם תובנות משיחות חיות של בוט הפיצה: מקרי קצה חדשים, כשלים של הבוט הנוכחי, ולקחים מוצעים. Markdown קצר בעברית, בלי הקדמות.',
      messages: [{ role: 'user', content: `כשלים:\n${[...new Set(failures)].join('\n')}\n\nמקרי קצה:\n${[...new Set(edges)].join('\n')}\n\nסלנג:\n${[...new Set(slang)].join('\n')}` }],
      maxTokens: 1500,
    });
    fs.writeFileSync(INSIGHTS_OUT, `# תובנות משיחות חיות\n\n_${new Date().toISOString().slice(0, 10)} — ${cases.length} מקרים_\n\n${insights}\n`);
    console.log(`✅ insights → ${path.relative(process.cwd(), INSIGHTS_OUT)}`);
  }
}

main().catch((e) => { console.error('❌ mine-live failed:', e); process.exit(1); });
