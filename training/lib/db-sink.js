'use strict';

// Bot Brain DB sink — the training pipeline's writes into the sustainable
// decision loop (bot_runs / bot_insights in Supabase). Every function swallows
// DB failures with a log line: a network hiccup must never kill an eval run —
// the local file reports (knowledge.saveReport/saveSummary) remain the record.

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production'), override: true });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

let _db = null;
function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

/** Open a run row. Returns the run id, or null on failure. */
async function startRun(kind = 'weekly', meta = {}) {
  try {
    const { data, error } = await db().from('bot_runs')
      .insert({ kind, status: 'started', meta }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id;
  } catch (e) { console.error('[db-sink] startRun:', e.message); return null; }
}

/** Close a run row (status: completed|failed). Merges meta. */
async function finishRun(runId, { status = 'completed', verdict = null, scores = {}, meta = {} } = {}) {
  if (!runId) return;
  try {
    const { data: cur } = await db().from('bot_runs').select('meta').eq('id', runId).single();
    const { error } = await db().from('bot_runs').update({
      status, verdict, scores,
      meta: { ...(cur?.meta || {}), ...meta },
      finished_at: new Date().toISOString(),
    }).eq('id', runId);
    if (error) throw new Error(error.message);
  } catch (e) { console.error('[db-sink] finishRun:', e.message); }
}

/**
 * Insert a proposed insight. Dedup: skips when an OPEN (proposed/approved/monitoring)
 * insight with the same title already exists — weekly runs re-derive similar findings.
 * Returns the new id, existing id, or null.
 */
async function addInsight({ source, title, evidence = null, metrics = {}, proposal = null, type = 'info', runId = null, tenantId = null, status = 'proposed', decidedVia = null, notes = null }) {
  try {
    const { data: dupe } = await db().from('bot_insights').select('id')
      .eq('title', title).in('status', ['proposed', 'approved', 'monitoring']).limit(1);
    if (dupe && dupe.length) {
      console.log(`[db-sink] insight duplicate skipped: "${title.slice(0, 60)}"`);
      return dupe[0].id;
    }
    const { data, error } = await db().from('bot_insights').insert({
      source, title, evidence, metrics, proposal, type, status,
      run_id: runId, tenant_id: tenantId, decided_via: decidedVia,
      decided_at: decidedVia ? new Date().toISOString() : null, notes,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id;
  } catch (e) { console.error('[db-sink] addInsight:', e.message); return null; }
}

/** Open insights, newest first. */
async function openInsights(statuses = ['proposed', 'approved']) {
  try {
    const { data, error } = await db().from('bot_insights')
      .select('id, created_at, source, title, type, status, metrics')
      .in('status', statuses).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  } catch (e) { console.error('[db-sink] openInsights:', e.message); return []; }
}

/** Previous completed weekly run (for deltas). */
async function lastCompletedRun(excludeId = null) {
  try {
    let q = db().from('bot_runs').select('*').eq('status', 'completed').eq('kind', 'weekly')
      .order('run_at', { ascending: false }).limit(1);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q;
    return (data && data[0]) || null;
  } catch (e) { console.error('[db-sink] lastCompletedRun:', e.message); return null; }
}

/**
 * Active lessons, from the same table the live bot reads — so `--with-lessons`
 * measures what production actually has, not a file that drifted from it.
 * Falls back to the markdown file when the DB is unreachable.
 */
async function getActiveLessonsText(tenantId = null) {
  try {
    const tid = tenantId || process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
    const { data, error } = await db().from('bot_lessons')
      .select('text').eq('active', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tid}`)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    const text = (data || []).map((r) => `- ${r.text}`).join('\n');
    if (text) return text;
  } catch (e) { console.error('[db-sink] lessons read, using file:', e.message); }
  const fs = require('fs');
  const path = require('path');
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'knowledge', 'lessons.md'), 'utf8').trim();
  } catch (_) { return ''; }
}

/** Record the exact lesson set a run measured, so a drop can be diffed later. */
async function snapshotLessons(runId) {
  if (!runId) return;
  try {
    const { data } = await db().from('bot_lessons').select('id, text, active').eq('active', true);
    await db().from('bot_lesson_snapshots').insert({ run_id: runId, lessons: data || [] });
  } catch (e) { console.error('[db-sink] snapshotLessons:', e.message); }
}

/** Regenerate the markdown fallback from the DB (keeps it fresh + git history). */
async function writeLessonsFile() {
  try {
    const text = await getActiveLessonsText();
    if (!text) return;
    const fs = require('fs');
    const path = require('path');
    const header = '# לקחים פעילים — נוצר אוטומטית מ-bot_lessons\n\n' +
      '_מקור האמת הוא הטבלה; הקובץ הזה הוא fallback ומעקב היסטורי. אין לערוך ידנית._\n\n';
    fs.writeFileSync(path.join(__dirname, '..', 'knowledge', 'lessons.md'), header + text + '\n');
  } catch (e) { console.error('[db-sink] writeLessonsFile:', e.message); }
}

module.exports = {
  startRun, finishRun, addInsight, openInsights, lastCompletedRun,
  getActiveLessonsText, snapshotLessons, writeLessonsFile,
};
