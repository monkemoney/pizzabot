'use strict';

// CLI: read every WhatsApp export zip, parse + segment into ordering sessions,
// anonymize, and write training/ingest/data/sessions.jsonl.
//
//   node training/ingest/parse-exports.js
//
// Override the exports dir with WA_EXPORTS_DIR=... if it moved.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseChat, splitSessions } = require('./segment');

const EXPORTS_DIR = process.env.WA_EXPORTS_DIR ||
  path.join(os.homedir(), 'Downloads', 'יצוא שיחות בוט פיצה');
const DATA_DIR = path.join(__dirname, 'data');
const OUT = path.join(DATA_DIR, 'sessions.jsonl');

function extractChatText(zipPath) {
  try {
    return execFileSync('unzip', ['-p', zipPath, '_chat.txt'], {
      encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    console.error(`  ! failed to read ${path.basename(zipPath)}: ${err.message}`);
    return '';
  }
}

function main() {
  if (!fs.existsSync(EXPORTS_DIR)) {
    console.error(`❌ exports dir not found: ${EXPORTS_DIR}\n   set WA_EXPORTS_DIR to the folder holding the WhatsApp .zip exports.`);
    process.exit(1);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const zips = fs.readdirSync(EXPORTS_DIR).filter((f) => f.toLowerCase().endsWith('.zip'));
  console.log(`📂 ${zips.length} exports in ${EXPORTS_DIR}\n`);

  const allSessions = [];
  for (const zip of zips) {
    const raw = extractChatText(path.join(EXPORTS_DIR, zip));
    if (!raw) continue;
    const messages = parseChat(raw);
    // Anonymize source: strip phone numbers from the filename.
    const source = zip.replace(/\+?\d[\d\s-]{6,}/g, '#').replace(/\.zip$/i, '');
    const sessions = splitSessions(messages, { source });
    const useful = sessions.filter((s) => s.useful);
    console.log(`  ${useful.length.toString().padStart(3)} useful / ${sessions.length.toString().padStart(3)} sessions  (${messages.length} msgs)  ${source}`);
    allSessions.push(...sessions);
  }

  const useful = allSessions.filter((s) => s.useful);
  fs.writeFileSync(OUT, useful.map((s) => JSON.stringify(s)).join('\n') + '\n');

  console.log(`\n✅ ${useful.length} useful ordering sessions (of ${allSessions.length} total) → ${path.relative(process.cwd(), OUT)}`);
  console.log(`   avg turns/useful session: ${(useful.reduce((a, s) => a + s.stats.turns, 0) / (useful.length || 1)).toFixed(1)}`);
  if (useful.length) {
    console.log(`\n— sample session —`);
    const sample = useful.sort((a, b) => b.stats.turns - a.stats.turns)[0];
    for (const t of sample.turns.slice(0, 10)) {
      console.log(`  ${t.role === 'bot' ? 'בוט ' : 'לקוח'}: ${t.text.replace(/\n/g, ' ').slice(0, 90)}`);
    }
  }
}

main();
