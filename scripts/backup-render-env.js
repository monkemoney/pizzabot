#!/usr/bin/env node
/**
 * backup-render-env.js
 *
 * Pulls all env vars from Render and saves them to .env.production.
 * Run this BEFORE making any infrastructure changes (deleting a service, etc).
 *
 * Local-only keys (present in .env.production but not on Render, e.g.
 * RENDER_API_KEY itself) are preserved, not dropped.
 *
 * Usage:
 *   node scripts/backup-render-env.js
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const ENV_FILE = path.join(__dirname, '..', '.env.production');

// Read existing local file — both to find the Render key and to preserve
// local-only vars across the overwrite.
function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const localVars      = parseEnvFile(ENV_FILE);
const RENDER_API_KEY = process.env.RENDER_API_KEY || localVars.RENDER_API_KEY;
const SERVICE_ID     = process.env.SERVICE_ID     || 'srv-d831jc8js32c73ef8mng';

if (!RENDER_API_KEY) {
  console.error('❌  RENDER_API_KEY not found (env var or .env.production)');
  process.exit(1);
}

const options = {
  hostname: 'api.render.com',
  path:     `/v1/services/${SERVICE_ID}/env-vars?limit=100`,
  method:   'GET',
  headers:  { 'Authorization': `Bearer ${RENDER_API_KEY}` },
};

https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const envVars = JSON.parse(data).map((e) => e.envVar);
    const merged  = { ...localVars };
    for (const e of envVars) merged[e.key] = e.value;

    const localOnly = Object.keys(localVars).filter(k => !envVars.some(e => e.key === k));
    const lines = Object.keys(merged).sort().map(k => `${k}=${merged[k]}`);

    fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
    console.log(`✅  Backed up ${envVars.length} Render env vars to .env.production` +
      (localOnly.length ? ` (+${localOnly.length} local-only preserved: ${localOnly.join(', ')})` : ''));
    console.log('🔒  This file is in .gitignore — never commit it.');
  });
}).on('error', (err) => { console.error('❌', err.message); process.exit(1); });
