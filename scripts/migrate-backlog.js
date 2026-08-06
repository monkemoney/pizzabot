'use strict';

// One-off: migrate training/knowledge/backlog.md rows into bot_insights.
// Idempotent: refuses to run when backlog-migration rows already exist.

const fs = require('fs');
const path = require('path');
const sink = require('../training/lib/db-sink');
const { createClient } = require('@supabase/supabase-js');

const STATUS_MAP = [
  [/מומש/, 'implemented'],
  [/נדחה/, 'rejected'],
  [/אושר/, 'approved'],
  [/מוצע/, 'proposed'],
];

function mapStatus(cell) {
  for (const [re, s] of STATUS_MAP) if (re.test(cell)) return s;
  return 'proposed';
}

function guessType(proposal, title) {
  const t = proposal + ' ' + title;
  if (/לקח|פרומפט|prompt/.test(t)) return 'lesson';
  if (/הגדר|setting/.test(t)) return 'setting';
  if (/קוד|code|מימוש|תיקון|אימות/.test(t)) return 'code';
  return 'info';
}

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: existing } = await db.from('bot_insights').select('id').eq('source', 'backlog-migration').limit(1);
  if (existing && existing.length) {
    console.log('migration already ran — refusing (idempotence guard)');
    process.exit(0);
  }

  const md = fs.readFileSync(path.join(__dirname, '..', 'training', 'knowledge', 'backlog.md'), 'utf8');
  const rows = md.split('\n')
    .filter((l) => /^\|\s*\d+\s*\|/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()));

  let n = 0;
  for (const cells of rows) {
    // | # | תובנה | ראיות | הצעה | סטטוס | עדכון |
    const [, num, title, evidence, proposal, statusCell, updated] = cells;
    const status = mapStatus(statusCell);
    const id = await sink.addInsight({
      source: 'backlog-migration',
      title: `[backlog #${num}] ${title}`,
      evidence,
      proposal,
      type: guessType(proposal, title),
      status,
      decidedVia: status === 'proposed' ? null : 'migration',
      notes: `סטטוס מקורי: ${statusCell} | עדכון אחרון: ${updated}`,
    });
    console.log(`  #${num} → ${status} (${id ? id.slice(0, 8) : 'FAILED'})`);
    if (id) n++;
  }
  console.log(`migrated ${n}/${rows.length} rows`);
})();
