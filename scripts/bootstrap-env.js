#!/usr/bin/env node
/**
 * bootstrap-env.js — make ANY session fully autonomous on secrets.
 *
 * Creates .env.production when it's missing (fresh clone, cloud container,
 * new machine). Resolution order:
 *   1. .env.production already exists → done (prints status, touches nothing)
 *   2. Secrets present as process env vars (cloud environment config) → write them to the file
 *   3. RENDER_API_KEY available (env var) → pull ALL vars from Render (it holds the full set)
 *
 * The design: one bootstrap secret (RENDER_API_KEY) is enough to reconstruct
 * everything, because Render is the canonical store of the runtime env.
 *
 * Usage:  node scripts/bootstrap-env.js
 * Cloud sessions also need network access to api.render.com (and the service
 * APIs they intend to call: api.supabase.com, *.supabase.co,
 * graph.facebook.com, www.jasell.com, api.green-api.com).
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const ENV_FILE   = path.join(__dirname, '..', '.env.production');
const SERVICE_ID = process.env.SERVICE_ID || 'srv-d831jc8js32c73ef8mng';

// The full expected variable set (names only — values never live in git)
const KNOWN_VARS = [
  'PORT', 'PUBLIC_URL', 'TENANT_ID',
  'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_DB_PASSWORD',
  'ANTHROPIC_API_KEY',
  'META_WA_PHONE_NUMBER_ID', 'META_WA_ACCESS_TOKEN', 'META_WA_WABA_ID',
  'META_WA_VERIFY_TOKEN', 'META_WA_API_VERSION', 'META_APP_ID', 'META_APP_SECRET',
  'GREEN_API_INSTANCE_ID', 'GREEN_API_TOKEN', 'GREEN_API_BASE_URL',
  'CARDCOM_API_URL', 'CARDCOM_TERMINAL', 'CARDCOM_USERNAME',
  'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_EMAIL',
  'ADMIN_SECRET', 'JWT_SECRET',
  'DASHBOARD_ADMIN_PASSWORD', 'DASHBOARD_MANAGER_PASSWORD', 'DASHBOARD_VENDOR_PASSWORD',
  'RENDER_API_KEY',
];

function done(msg) { console.log(msg); process.exit(0); }
function fail(msg) { console.error(msg); process.exit(1); }

// 1. Already there?
if (fs.existsSync(ENV_FILE)) {
  const count = fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(l => /^[A-Z0-9_]+=/.test(l)).length;
  done(`✅  .env.production already exists (${count} vars) — nothing to do.`);
}

// 2. From process env (cloud environment configured with the secrets)
const fromEnv = KNOWN_VARS.filter(k => process.env[k] !== undefined);
if (fromEnv.includes('SUPABASE_SERVICE_KEY')) {
  const lines = fromEnv.sort().map(k => `${k}=${process.env[k]}`);
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
  done(`✅  Built .env.production from ${lines.length} process env vars.`);
}

// 3. From Render — one key reconstructs everything
const RENDER_API_KEY = process.env.RENDER_API_KEY;
if (!RENDER_API_KEY) {
  fail(`❌  Cannot bootstrap: no .env.production, no secret env vars, no RENDER_API_KEY.
    Fix one of:
    - Local machine: the file should exist at ${ENV_FILE} — restore from backup or Render dashboard.
    - Cloud session: add RENDER_API_KEY (or the full secret set) to the environment's
      configured env vars, and allow network to api.render.com.`);
}

https.get({
  hostname: 'api.render.com',
  path: `/v1/services/${SERVICE_ID}/env-vars?limit=100`,
  headers: { Authorization: `Bearer ${RENDER_API_KEY}` },
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    let envVars;
    try { envVars = JSON.parse(data).map(e => e.envVar); }
    catch { return fail(`❌  Render API error: ${data.slice(0, 200)}`); }
    const lines = envVars.sort((a, b) => a.key.localeCompare(b.key)).map(e => `${e.key}=${e.value}`);
    lines.push(`RENDER_API_KEY=${RENDER_API_KEY}`);
    fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
    done(`✅  Built .env.production from Render (${lines.length} vars).`);
  });
}).on('error', (e) => fail(`❌  Network to api.render.com failed: ${e.message} — this environment may have no network access.`));
