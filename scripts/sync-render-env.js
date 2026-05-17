#!/usr/bin/env node
/**
 * sync-render-env.js
 *
 * Reads .env.production and pushes ALL vars to Render in one shot.
 * Run this after recreating a Render service to restore env vars instantly.
 *
 * Usage:
 *   RENDER_API_KEY=rnd_xxx SERVICE_ID=srv_xxx node scripts/sync-render-env.js
 *
 * Or with defaults already in this file (update if service changes):
 *   node scripts/sync-render-env.js
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const RENDER_API_KEY = process.env.RENDER_API_KEY || 'rnd_aymW3XEYR53CgqhIR5PgqDvP7Q97';
const SERVICE_ID     = process.env.SERVICE_ID     || 'srv-d831jc8js32c73ef8mng';
const ENV_FILE       = path.join(__dirname, '..', '.env.production');

// ── Read .env.production ──────────────────────────────────────────────────────
if (!fs.existsSync(ENV_FILE)) {
  console.error('❌  .env.production not found. Run scripts/backup-render-env.js first.');
  process.exit(1);
}

const envVars = fs.readFileSync(ENV_FILE, 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const idx = l.indexOf('=');
    return { key: l.slice(0, idx).trim(), value: l.slice(idx + 1).trim() };
  })
  .filter((e) => e.key);

console.log(`📦  Syncing ${envVars.length} env vars to Render service ${SERVICE_ID}…`);

// ── PUT to Render API ─────────────────────────────────────────────────────────
const body = JSON.stringify(envVars);
const options = {
  hostname: 'api.render.com',
  path:     `/v1/services/${SERVICE_ID}/env-vars`,
  method:   'PUT',
  headers:  {
    'Authorization': `Bearer ${RENDER_API_KEY}`,
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      const result = JSON.parse(data);
      console.log(`✅  ${result.length} env vars synced successfully.`);
      console.log('⚡  Trigger a redeploy in the Render dashboard to apply changes.');
    } else {
      console.error(`❌  Render API returned ${res.statusCode}:`, data);
      process.exit(1);
    }
  });
});

req.on('error', (err) => { console.error('❌  Request error:', err.message); process.exit(1); });
req.write(body);
req.end();
