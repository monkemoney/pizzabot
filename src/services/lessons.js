'use strict';

/**
 * Living lessons — what the bot has learned, served from the DB.
 *
 * Lessons used to live in training/knowledge/lessons.md, read once into a
 * module variable that never refreshed: changing what the bot knows required a
 * commit AND a deploy, and the file was invisible to the person making the
 * decision. Now the vendor approves a lesson in the portal and the live prompt
 * picks it up within one cache TTL — no deploy, no session.
 *
 * The file remains the fallback (and is regenerated from the DB by the weekly
 * run) so a DB outage degrades to yesterday's lessons rather than none.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
const CACHE_TTL = 60_000; // lessons change by human decision, not by the second

// class-11 (module-level mutable state) — both questions answered:
//   • on reset (deploy): the cache is empty and the next message refetches;
//     no state is lost, only one extra query.
//   • on two instances: each holds its own ≤60s-stale copy, so a just-approved
//     lesson can take up to a minute to reach every instance. The DB is the
//     source of truth; nothing is ever written from the cache.
let _db = null;
const _cache = new Map(); // tenantId → { text, time }

function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

function fileFallback() {
  try {
    return fs.readFileSync(path.join(__dirname, '../../training/knowledge/lessons.md'), 'utf8').trim();
  } catch (_) { return ''; }
}

/** Active lessons for a tenant (global rows + that tenant's own), as prompt text. */
async function getLessonsText(tenantId = DEFAULT_TENANT_ID) {
  const hit = _cache.get(tenantId);
  if (hit && Date.now() - hit.time < CACHE_TTL) return hit.text;

  let text;
  try {
    const { data, error } = await db().from('bot_lessons')
      .select('text, tenant_id')
      .eq('active', true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    text = (data || []).map((r) => `- ${r.text}`).join('\n');
    // An empty table means "no lessons yet", not "DB is broken" — but before the
    // migration runs it would silently drop everything, so fall back when empty.
    if (!text) text = fileFallback();
  } catch (e) {
    console.error('[lessons] DB read failed, using file fallback:', e.message);
    text = fileFallback();
  }

  _cache.set(tenantId, { text, time: Date.now() });
  return text;
}

/** Drop the cache so an approval shows up on the very next message. */
function invalidate() {
  _cache.clear();
}

/** Is lesson injection on? Setting wins; env var kept for the legacy rollout. */
async function isEnabled(tenantId = DEFAULT_TENANT_ID) {
  try {
    const settings = require('./settings');
    const v = await settings.get('bot_lessons_enabled', tenantId);
    if (v !== null && v !== undefined) return v === true || v === 'true';
  } catch (_) { /* fall through to env */ }
  return process.env.BOT_LESSONS_ENABLED === 'true';
}

module.exports = { getLessonsText, invalidate, isEnabled, CACHE_TTL };
