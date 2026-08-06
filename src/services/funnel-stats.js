'use strict';

/**
 * Order-funnel statistics — where real customers fall out.
 *
 * Ported from training/analytics/funnel.js so the vendor portal can show the
 * same numbers the weekly run computes (report files live on the local Mac and
 * on Render's ephemeral disk; the DB is the only shared surface).
 * READ-ONLY: no writes, no LLM calls.
 */

const { createClient } = require('@supabase/supabase-js');

// class-11 (module-level mutable state): lazy client handle only — holds no
// data, rebuilt after a deploy, and per-instance duplication is harmless.
let _db = null;
function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Tenants that are not throwaway bootcamp tenants. */
async function realTenantIds() {
  const { data: all } = await db().from('settings').select('tenant_id, key');
  const byTenant = new Map();
  for (const r of all || []) {
    if (!byTenant.has(r.tenant_id)) byTenant.set(r.tenant_id, new Set());
    byTenant.get(r.tenant_id).add(r.key);
  }
  return [...byTenant.entries()]
    .filter(([, keys]) => !keys.has('__test_tenant'))
    .map(([tid]) => tid);
}

/** Funnel for one tenant over a window. Returns null when there is no activity. */
async function analyzeTenant(tid, sinceISO) {
  const { data: orders } = await db().from('orders').select(
    'status, created_at, accepted_at, cancelled_by, dispute_status, payment_method, total_price, escalation_level, scheduled_for, csat_rating'
  ).eq('tenant_id', tid).gte('created_at', sinceISO);

  const { count: convCount } = await db().from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid)
    .not('phone', 'like', 'admin:%')
    .gte('updated_at', sinceISO);

  const o = orders || [];
  if (!o.length && !convCount) return null;

  const done = o.filter((x) => ['done', 'delivered', 'ready', 'out_for_delivery', 'preparing'].includes(x.status));
  const cancelled = o.filter((x) => x.status === 'cancelled');
  const rated = o.filter((x) => x.csat_rating != null);
  const acceptLatencies = o
    .filter((x) => x.accepted_at && !x.scheduled_for)
    .map((x) => (new Date(x.accepted_at) - new Date(x.created_at)) / 60000);

  return {
    tenant: tid,
    conversations: convCount || 0,
    orders: o.length,
    conversionPct: pct(o.length, convCount || 0),
    completedOrActive: done.length,
    cancelled: cancelled.length,
    cancelledByCustomer: cancelled.filter((x) => x.cancelled_by === 'customer').length,
    cancelledByBusiness: cancelled.filter((x) => x.cancelled_by === 'business').length,
    disputes: o.filter((x) => x.dispute_status).length,
    escalated: o.filter((x) => (x.escalation_level || 0) > 0).length,
    medianAcceptMin: acceptLatencies.length ? Math.round(median(acceptLatencies)) : null,
    csatCount: rated.length,
    csatAvg: rated.length ? Math.round((rated.reduce((s2, x) => s2 + x.csat_rating, 0) / rated.length) * 10) / 10 : null,
    avgOrder: o.length ? Math.round(o.reduce((s, x) => s + (parseFloat(x.total_price) || 0), 0) / o.length) : 0,
    paymentSplit: o.reduce((m, x) => ((m[x.payment_method] = (m[x.payment_method] || 0) + 1), m), {}),
  };
}

/** Funnel for every real tenant over the last `days`. */
async function funnelForAll(days = 7) {
  const sinceISO = new Date(Date.now() - days * 864e5).toISOString();
  const tids = await realTenantIds();
  const rows = await Promise.all(tids.map((t) => analyzeTenant(t, sinceISO)));
  return rows.filter(Boolean);
}

module.exports = { funnelForAll, analyzeTenant, realTenantIds };
