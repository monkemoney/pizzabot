'use strict';

/**
 * Daily Claude spend rollup + budget alarm.
 *
 * The vendor pages aggregated raw api_usage on every load (six months of rows
 * for /vendor/usage), and nothing watched the total — the API credits ran out
 * mid-week once and the first symptom was the bot failing to answer customers.
 * This rolls each Israel-day into api_usage_daily and shouts before that again.
 */

const { createClient } = require('@supabase/supabase-js');
const { costOf } = require('./claude-pricing');
const { periodRange, ilDayKey } = require('./tz-time');

// class-11 (module-level mutable state): lazy client handle only — no data,
// rebuilt after a deploy, per-instance duplication harmless.
let _db = null;
function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

/**
 * Recompute the rollup for the last `days` Israel-days (default today +
 * yesterday, so a run near midnight cannot leave a half day behind).
 * Idempotent: upserts on (day, tenant_id).
 */
async function rollup(days = 2) {
  const now = new Date();
  const out = [];
  for (let d = 0; d < days; d++) {
    const at = new Date(now.getTime() - d * 864e5).toISOString();
    const { start, end } = periodRange('day', at);
    const dayKey = ilDayKey(at);

    const { data, error } = await db().from('api_usage')
      .select('tenant_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens')
      .gte('created_at', start).lt('created_at', end);
    if (error) { console.error('[usage-rollup] read:', error.message); continue; }

    const byTenant = new Map();
    for (const r of data || []) {
      const key = r.tenant_id;
      if (!byTenant.has(key)) {
        byTenant.set(key, { day: dayKey, tenant_id: key, calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0 });
      }
      const t = byTenant.get(key);
      t.calls++;
      t.input_tokens += r.input_tokens || 0;
      t.output_tokens += r.output_tokens || 0;
      t.cache_read_tokens += r.cache_read_tokens || 0;
      t.cache_write_tokens += r.cache_write_tokens || 0;
      t.cost_usd += costOf(r);
    }

    const rows = [...byTenant.values()].map((t) => ({ ...t, cost_usd: Math.round(t.cost_usd * 10000) / 10000, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error: upErr } = await db().from('api_usage_daily').upsert(rows, { onConflict: 'day,tenant_id' });
      if (upErr) console.error('[usage-rollup] upsert:', upErr.message);
      else out.push({ day: dayKey, tenants: rows.length, cost: rows.reduce((s, r) => s + r.cost_usd, 0) });
    }
  }
  return out;
}

/**
 * Alert the vendor when today's spend crosses `claude_daily_budget_usd`.
 * The alert service throttles per type, so this is safe to call hourly.
 */
async function checkBudget() {
  try {
    const settings = require('./settings');
    const budget = Number(await settings.get('claude_daily_budget_usd'));
    if (!Number.isFinite(budget) || budget <= 0) return null;   // unset = no alarm

    const today = ilDayKey(new Date().toISOString());
    const { data } = await db().from('api_usage_daily').select('cost_usd').eq('day', today);
    const spent = (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    if (spent <= budget) return { spent, budget, alerted: false };

    const { alert } = require('./vendor-alerts');
    await alert('cost_threshold', '💸', 'חריגה מתקציב Claude יומי',
      `נוצלו $${spent.toFixed(2)} מתוך תקציב של $${budget.toFixed(2)} (${today})`);
    return { spent, budget, alerted: true };
  } catch (err) {
    console.error('[usage-rollup] budget check:', err.message);
    return null;
  }
}

module.exports = { rollup, checkBudget };
