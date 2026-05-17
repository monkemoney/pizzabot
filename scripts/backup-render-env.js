#!/usr/bin/env node
/**
 * backup-render-env.js
 *
 * Pulls all env vars from Render and saves them to .env.production.
 * Run this BEFORE making any infrastructure changes (deleting a service, etc).
 *
 * Usage:
 *   node scripts/backup-render-env.js
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const RENDER_API_KEY = process.env.RENDER_API_KEY || 'rnd_aymW3XEYR53CgqhIR5PgqDvP7Q97';
const SERVICE_ID     = process.env.SERVICE_ID     || 'srv-d831jc8js32c73ef8mng';
const ENV_FILE       = path.join(__dirname, '..', '.env.production');

const options = {
  hostname: 'api.render.com',
  path:     `/v1/services/${SERVICE_ID}/env-vars`,
  method:   'GET',
  headers:  { 'Authorization': `Bearer ${RENDER_API_KEY}` },
};

https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const envVars = JSON.parse(data).map((e) => e.envVar);
    const lines   = envVars
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((e) => `${e.key}=${e.value}`);

    fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
    console.log(`✅  Backed up ${lines.length} env vars to .env.production`);
    console.log('🔒  This file is in .gitignore — never commit it.');
  });
}).on('error', (err) => { console.error('❌', err.message); process.exit(1); });
