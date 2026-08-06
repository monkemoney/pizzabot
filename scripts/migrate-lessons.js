'use strict';

// One-off: move training/knowledge/lessons.md into bot_lessons as global,
// active rows. Idempotent: refuses to run once any lesson row exists.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.production'), override: true });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: existing } = await db.from('bot_lessons').select('id').limit(1);
  if (existing && existing.length) {
    console.log('bot_lessons already populated — refusing (idempotence guard)');
    process.exit(0);
  }

  const md = fs.readFileSync(path.join(__dirname, '..', 'training', 'knowledge', 'lessons.md'), 'utf8');

  // Bullets grouped under dated "## ..." headings — keep the heading as the note
  // so each lesson keeps the provenance of the run that produced it.
  let heading = null;
  const rows = [];
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { heading = h[1].trim(); continue; }
    const b = line.match(/^-\s+(.+)$/);
    if (b) rows.push({ text: b[1].trim(), note: heading, tenant_id: null, active: true, applied_at: new Date().toISOString() });
  }

  if (!rows.length) { console.log('no lessons found in the file'); process.exit(0); }

  const { error } = await db.from('bot_lessons').insert(rows);
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  console.log(`migrated ${rows.length} lessons`);
  rows.slice(0, 3).forEach((r) => console.log(`  - ${r.text.slice(0, 70)}...`));
})();
