'use strict';

// Server-side writer into the Bot Brain queue (bot_insights). Production code
// raises insights here — e.g. a price mismatch, a bad CSAT — so anomalies reach
// the vendor's decision queue instead of only a log line nobody reads.
//
// Fire-and-forget by contract: never throws, never blocks the caller.

const { createClient } = require('@supabase/supabase-js');

// class-11 (module-level mutable state) — both questions answered:
//   • on reset (deploy): the lazily-built Supabase client is rebuilt on next
//     use. It holds no data, so nothing is lost.
//   • on two instances: each builds its own client; dedup is enforced by the
//     DB query (open-title lookup), not in memory, so concurrent instances
//     cannot create duplicate insights beyond a narrow race that the vendor
//     sees as one extra row at worst.
let _db = null;
function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

/**
 * Insert an insight unless an OPEN one with the same title already exists.
 * Dedup matters: a recurring runtime anomaly would otherwise post a row per
 * occurrence and bury the queue.
 */
async function addInsightOnce({ source, title, evidence = null, metrics = {}, proposal = null, type = 'info', tenantId = null }) {
  try {
    const { data: dupe } = await db().from('bot_insights').select('id')
      .eq('title', title).in('status', ['proposed', 'approved', 'monitoring']).limit(1);
    if (dupe && dupe.length) return dupe[0].id;

    const { data, error } = await db().from('bot_insights')
      .insert({ source, title, evidence, metrics, proposal, type, tenant_id: tenantId })
      .select('id').single();
    if (error) throw new Error(error.message);
    console.log(`[insights] raised: ${title.slice(0, 80)}`);
    return data.id;
  } catch (e) {
    console.error('[insights] addInsightOnce:', e.message);
    return null;
  }
}

module.exports = { addInsightOnce };
