'use strict';

// Provision / tear down a throwaway TEST TENANT in the real Supabase, so the
// concurrency harness exercises the real session/order/cache path in isolation.
//
// A fresh random UUID *is* a new tenant (there is no `tenants` table — tenant_id
// is just a scoping column). We clone the default tenant's menu (categories →
// products → additions, IDs remapped) and its settings (minus channel creds),
// force 24/7 open, and tag it with __test_tenant so teardown can NEVER touch a
// real tenant.
//
//   node training/concurrency/test-tenant.js provision
//   node training/concurrency/test-tenant.js teardown <tenantId>
//   node training/concurrency/test-tenant.js list        # list stray test tenants

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.production'), override: true });
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
const MARKER_KEY = '__test_tenant';

function sb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

const OPEN_24_7 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  .reduce((o, d) => ((o[d] = { is_open: true, open: '00:00', close: '23:59' }), o), {});

/**
 * Clone the default menu + settings into a new test tenant.
 * @param {object} [opts]
 * @param {string} [opts.tag]  short tag → distinct business_name (cross-tenant tracer)
 * @returns {Promise<{tenantId, businessName}>}
 */
async function provisionTestTenant({ tag = '' } = {}) {
  const db = sb();
  const tid = crypto.randomUUID();
  const businessName = `בדיקה${tag ? '-' + tag : ''}-${tid.slice(0, 4)}`;

  // 1) categories (remap ids)
  const { data: cats, error: cErr } = await db.from('categories').select('*').eq('tenant_id', DEFAULT_TENANT_ID);
  if (cErr) throw new Error('read categories: ' + cErr.message);
  const catIdMap = {};
  const newCats = cats.map((c) => {
    const id = crypto.randomUUID();
    catIdMap[c.id] = id;
    const { created_at, ...rest } = c;
    return { ...rest, id, tenant_id: tid };
  });
  if (newCats.length) {
    const { error } = await db.from('categories').insert(newCats);
    if (error) throw new Error('insert categories: ' + error.message);
  }

  // 2) products (remap ids + category_id)
  const { data: prods, error: pErr } = await db.from('products').select('*').eq('tenant_id', DEFAULT_TENANT_ID);
  if (pErr) throw new Error('read products: ' + pErr.message);
  const prodIdMap = {};
  const newProds = prods.map((p) => {
    const id = crypto.randomUUID();
    prodIdMap[p.id] = id;
    const { created_at, updated_at, categories, ...rest } = p;
    return { ...rest, id, tenant_id: tid, category_id: p.category_id ? catIdMap[p.category_id] || null : null };
  });
  if (newProds.length) {
    const { error } = await db.from('products').insert(newProds);
    if (error) throw new Error('insert products: ' + error.message);
  }

  // 3) product_additions (remap product_id; no tenant_id column)
  const oldProdIds = prods.map((p) => p.id);
  if (oldProdIds.length) {
    const { data: adds, error: aErr } = await db.from('product_additions').select('*').in('product_id', oldProdIds);
    if (aErr) throw new Error('read additions: ' + aErr.message);
    const newAdds = (adds || []).map((a) => {
      const { id, created_at, updated_at, ...rest } = a;
      return { ...rest, id: crypto.randomUUID(), product_id: prodIdMap[a.product_id] };
    }).filter((a) => a.product_id);
    for (let i = 0; i < newAdds.length; i += 200) {
      const { error } = await db.from('product_additions').insert(newAdds.slice(i, i + 200));
      if (error) throw new Error('insert additions: ' + error.message);
    }
  }

  // 4) settings — clone default (minus channel creds), force open + distinct identity
  const { data: settings, error: sErr } = await db.from('settings').select('key, value').eq('tenant_id', DEFAULT_TENANT_ID);
  if (sErr) throw new Error('read settings: ' + sErr.message);
  const overrides = {
    business_hours: OPEN_24_7,
    delivery_hours: OPEN_24_7,
    business_name: businessName,
    public_slug: `test-${tid.slice(0, 8)}`,
    delivery_enabled: true,
    pickup_enabled: true,
    payment_cash: true,
    payment_credit: true,
    is_open: true,               // never inherit the live tenant's master switch
    [MARKER_KEY]: true,
  };
  const cloned = (settings || [])
    // Never copy creds — and never copy live open/close state (is_open,
    // open_override): a spontaneously-closed live tenant must not make the
    // test tenant refuse conversations and fake a regression.
    .filter((r) => !/^(meta_|green_api_|__test|is_open$|open_override$)/.test(r.key))
    .map((r) => ({ tenant_id: tid, key: r.key, value: r.value }));
  const overrideRows = Object.entries(overrides).map(([key, value]) => ({ tenant_id: tid, key, value }));
  // overrides win over clones on key collision
  const byKey = new Map();
  for (const row of [...cloned, ...overrideRows]) byKey.set(row.key, row);
  const { error: insErr } = await db.from('settings').insert([...byKey.values()]);
  if (insErr) throw new Error('insert settings: ' + insErr.message);

  return { tenantId: tid, businessName };
}

/** Delete every row belonging to a test tenant. Refuses non-test / default tenants. */
async function teardownTestTenant(tenantId) {
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    throw new Error(`refusing to tear down default/empty tenant: ${tenantId}`);
  }
  const db = sb();
  // Safety: only proceed if the __test_tenant marker exists for this tenant.
  const { data: marker } = await db.from('settings').select('key').eq('tenant_id', tenantId).eq('key', MARKER_KEY).maybeSingle();
  if (!marker) throw new Error(`tenant ${tenantId} is not marked __test_tenant — refusing teardown`);

  // additions first (via product ids), then the rest by tenant_id.
  const { data: prods } = await db.from('products').select('id').eq('tenant_id', tenantId);
  const pids = (prods || []).map((p) => p.id);
  for (let i = 0; i < pids.length; i += 200) {
    await db.from('product_additions').delete().in('product_id', pids.slice(i, i + 200));
  }
  for (const table of ['orders', 'pending_payments', 'push_subscriptions', 'sessions', 'products', 'categories', 'settings']) {
    const { error } = await db.from(table).delete().eq('tenant_id', tenantId);
    if (error) console.error(`[teardown] ${table}: ${error.message}`);
  }
}

/** Count rows for a tenant (verify teardown). */
async function countTenantRows(tenantId) {
  const db = sb();
  const out = {};
  for (const table of ['settings', 'categories', 'products', 'sessions', 'orders']) {
    const { count } = await db.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    out[table] = count || 0;
  }
  return out;
}

/** List stray test tenants (settings marker present). */
async function listTestTenants() {
  const db = sb();
  const { data } = await db.from('settings').select('tenant_id').eq('key', MARKER_KEY);
  return [...new Set((data || []).map((r) => r.tenant_id))];
}

module.exports = { provisionTestTenant, teardownTestTenant, countTenantRows, listTestTenants, DEFAULT_TENANT_ID };

// ── CLI ──
if (require.main === module) {
  (async () => {
    const cmd = process.argv[2];
    if (cmd === 'provision') {
      const t = await provisionTestTenant({ tag: process.argv[3] || '' });
      console.log(`✅ provisioned test tenant: ${t.tenantId} (${t.businessName})`);
      console.log(JSON.stringify(await countTenantRows(t.tenantId)));
    } else if (cmd === 'teardown') {
      await teardownTestTenant(process.argv[3]);
      console.log(`✅ torn down: ${process.argv[3]}`);
      console.log('remaining rows:', JSON.stringify(await countTenantRows(process.argv[3])));
    } else if (cmd === 'list') {
      console.log(await listTestTenants());
    } else {
      console.log('usage: test-tenant.js provision [tag] | teardown <tid> | list');
    }
  })().catch((err) => { console.error('❌', err.message); process.exit(1); });
}
