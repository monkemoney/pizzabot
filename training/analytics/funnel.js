'use strict';

// Funnel analytics — where do real customers fall? Reads orders (+sessions
// counts) for real tenants over a window. READ-ONLY, no LLM calls.
//
//   node training/analytics/funnel.js            # last 7 days
//   node training/analytics/funnel.js --days 30

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production'), override: true });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const knowledge = require('../lib/knowledge');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function parseArgs() {
  const i = process.argv.indexOf('--days');
  return { days: i > -1 ? Number(process.argv[i + 1]) : 7 };
}
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function realTenantIds() {
  // Every tenant present in settings, minus marked test tenants.
  const { data: all } = await db.from('settings').select('tenant_id, key');
  const byTenant = new Map();
  for (const r of all || []) {
    if (!byTenant.has(r.tenant_id)) byTenant.set(r.tenant_id, new Set());
    byTenant.get(r.tenant_id).add(r.key);
  }
  return [...byTenant.entries()]
    .filter(([, keys]) => !keys.has('__test_tenant'))
    .map(([tid]) => tid);
}

async function analyzeTenant(tid, sinceISO) {
  const { data: orders } = await db.from('orders').select(
    'status, status_history, created_at, accepted_at, cancelled_by, dispute_status, payment_method, total_price, escalation_level, scheduled_for'
  ).eq('tenant_id', tid).gte('created_at', sinceISO);

  const { count: convCount } = await db.from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tid)
    .not('phone', 'like', 'admin:%')
    .gte('updated_at', sinceISO);

  const o = orders || [];
  if (!o.length && !convCount) return null;

  const done = o.filter((x) => ['done', 'delivered', 'ready', 'out_for_delivery', 'preparing'].includes(x.status));
  const cancelled = o.filter((x) => x.status === 'cancelled');
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
    avgOrder: o.length ? Math.round(o.reduce((s, x) => s + (parseFloat(x.total_price) || 0), 0) / o.length) : 0,
    paymentSplit: o.reduce((m, x) => ((m[x.payment_method] = (m[x.payment_method] || 0) + 1), m), {}),
  };
}

async function main() {
  const { days } = parseArgs();
  const sinceISO = new Date(Date.now() - days * 864e5).toISOString();
  const tids = await realTenantIds();
  console.log(`\n📈 משפך הזמנות — ${days} ימים אחרונים | ${tids.length} טנאנטים אמיתיים\n`);

  const rows = (await Promise.all(tids.map((t) => analyzeTenant(t, sinceISO)))).filter(Boolean);
  const lines = [`# משפך הזמנות — ${days} ימים (עד ${stamp()})`, ''];
  for (const r of rows) {
    const line = `- **${r.tenant.slice(0, 8)}**: ${r.conversations} שיחות → ${r.orders} הזמנות (${r.conversionPct}%) | הושלמו/פעילות ${r.completedOrActive} | בוטלו ${r.cancelled} (לקוח ${r.cancelledByCustomer}/עסק ${r.cancelledByBusiness}) | disputes ${r.disputes} | escalations ${r.escalated} | חציון אישור ${r.medianAcceptMin ?? '—'} דק' | ממוצע ₪${r.avgOrder} | ${Object.entries(r.paymentSplit).map(([k, v]) => `${k}:${v}`).join(' ')}`;
    console.log(line);
    lines.push(line);
  }
  if (!rows.length) {
    console.log('(אין נתונים בחלון)');
    lines.push('_אין נתונים בחלון._');
  }
  const file = knowledge.saveReport(`funnel-${stamp()}.md`, lines.join('\n'));
  knowledge.saveSummary(`funnel-${stamp()}`, { phase: 'funnel', days, tenants: rows });
  console.log(`\n📄 ${file}`);
}

main().catch((e) => { console.error('❌ funnel failed:', e); process.exit(1); });
