#!/usr/bin/env node
'use strict';

/**
 * Compare supabase/schema.sql against the live database.
 *
 * schema.sql is documentation, not migrations — nothing applies it, so it rots
 * silently. It had drifted into describing a single-tenant system while
 * production was multi-tenant; applying it to a fresh or restored environment
 * would have let one business's settings overwrite another's, with no error.
 *
 * This turns CLAUDE.md's "verify the columns exist in the real DB" rule into
 * something runnable:
 *
 *   SUPABASE_MGMT_TOKEN=sbp_... node scripts/check-schema.js
 *
 * Exits non-zero on drift, so it can gate a release.
 */

const fs   = require('fs');
const path = require('path');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'umoftdmutxhrbknowbyh';
const TOKEN       = process.env.SUPABASE_MGMT_TOKEN;

if (!TOKEN) {
  console.error('SUPABASE_MGMT_TOKEN is required (Supabase account → Access Tokens).');
  process.exit(2);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/**
 * Columns the file claims, per table. Deliberately naive: it reads the
 * identifiers at the start of each line inside a CREATE TABLE block, which is
 * enough to catch the failure mode that matters — a column the code depends on
 * existing in only one of the two places.
 */
function documentedColumns(sql) {
  const tables = {};
  const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql))) {
    const [, table, body] = m;
    tables[table] = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('--'))
      .map((l) => (l.match(/^(\w+)\s+[A-Z]/) || [])[1])
      .filter(Boolean)
      .filter((c) => !['PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN', 'CONSTRAINT'].includes(c.toUpperCase()));
  }
  return tables;
}

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  const documented = documentedColumns(sql);
  const tables = Object.keys(documented);

  const live = await query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN (${tables.map((t) => `'${t}'`).join(',')})
  `);

  const liveByTable = {};
  for (const r of live) (liveByTable[r.table_name] ||= new Set()).add(r.column_name);

  let drift = 0;
  for (const table of tables) {
    const liveCols = liveByTable[table];
    if (!liveCols) {
      console.log(`❌ ${table}: documented but MISSING from the database`);
      drift++;
      continue;
    }
    const onlyInFile = documented[table].filter((c) => !liveCols.has(c));
    const onlyInDb   = [...liveCols].filter((c) => !documented[table].includes(c));

    if (onlyInFile.length) {
      console.log(`❌ ${table}: in schema.sql but NOT in the database → ${onlyInFile.join(', ')}`);
      drift++;
    }
    if (onlyInDb.length) {
      console.log(`⚠️  ${table}: in the database but NOT documented → ${onlyInDb.join(', ')}`);
      drift++;
    }
  }

  // The constraints that carry multi-tenancy. If these regress, tenants merge
  // silently rather than erroring.
  const keys = await query(`
    SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE contype = 'p' AND connamespace = 'public'::regnamespace
  `);
  const pk = Object.fromEntries(keys.map((r) => [r.tbl, r.def]));
  for (const [table, expected] of [['settings', 'tenant_id, key'], ['sessions', 'tenant_id, phone']]) {
    if (!pk[table] || !pk[table].includes(expected)) {
      console.log(`❌ ${table}: primary key must be (${expected}) for tenant isolation — found ${pk[table] || 'none'}`);
      drift++;
    }
  }

  if (drift) {
    console.log(`\n${drift} drift issue(s). schema.sql is the rebuild script for a fresh environment — fix it before it is ever applied.`);
    process.exit(1);
  }
  console.log('✅ schema.sql matches the live database.');
})().catch((err) => {
  console.error('check-schema failed:', err.message);
  process.exit(2);
});
