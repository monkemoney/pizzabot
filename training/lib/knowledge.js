'use strict';

// The persistent "seniority" store. This is where accumulated understanding lives
// between runs — the thing that actually makes the bot smarter over time.
//
//   lessons.md   — human-readable, reviewable rules distilled from failures.
//                  This is what gets injected back into the real system prompt.
//   examples.jsonl — few-shot (situation -> correct handling) pairs harvested from fixes.
//   dataset.jsonl  — high-quality full conversations, candidates for future fine-tuning.

const fs = require('fs');
const path = require('path');
const { paths } = require('../config');

function ensureDir() {
  if (!fs.existsSync(paths.knowledge)) fs.mkdirSync(paths.knowledge, { recursive: true });
}

function readLessons() {
  try { return fs.readFileSync(paths.lessons, 'utf8'); }
  catch (_) { return ''; }
}

/** Append a batch of approved lessons under a dated heading. */
function appendLessons(lessonLines, stamp) {
  ensureDir();
  if (!lessonLines || !lessonLines.length) return;
  const header = `\n## לקחים מריצה ${stamp}\n`;
  const body = lessonLines.map((l) => `- ${l}`).join('\n') + '\n';
  const seed = fs.existsSync(paths.lessons)
    ? ''
    : `# לקחים מצטברים — הוותק של הבוט\n\nכל שורה כאן היא כלל שנלמד מכשל אמיתי בסימולציה. הקובץ הזה מוזרק לפרומפט של הבוט האמיתי כאשר BOT_LESSONS_ENABLED=true.\n`;
  fs.appendFileSync(paths.lessons, seed + header + body);
}

function appendJSONL(file, records) {
  ensureDir();
  if (!records || !records.length) return;
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(file, lines);
}

function appendExamples(examples) { appendJSONL(paths.examples, examples); }
function appendDataset(records)   { appendJSONL(paths.dataset, records); }

function countJSONL(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).length;
  } catch (_) { return 0; }
}

function saveReport(name, content) {
  if (!fs.existsSync(paths.reports)) fs.mkdirSync(paths.reports, { recursive: true });
  const file = path.join(paths.reports, name);
  fs.writeFileSync(file, content);
  return file;
}

// Machine-readable summary next to a report — the bootcamp orchestrator reads these.
function saveSummary(name, obj) {
  if (!fs.existsSync(paths.reports)) fs.mkdirSync(paths.reports, { recursive: true });
  const file = path.join(paths.reports, name.replace(/\.json$/, '') + '.json');
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  return file;
}

// Newest summary JSON whose filename starts with prefix.
function latestSummary(prefix) {
  try {
    const files = fs.readdirSync(paths.reports)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .sort();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(paths.reports, files[files.length - 1]), 'utf8'));
  } catch (_) { return null; }
}

module.exports = {
  readLessons, appendLessons, appendExamples, appendDataset,
  countJSONL, saveReport, saveSummary, latestSummary, paths,
};
