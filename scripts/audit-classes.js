'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// The failure-class list (CLAUDE.md → Failure Classes) as a FILE THAT RUNS.
//
// Each check counts instances of a known class per file and compares against
// a committed baseline. A count ABOVE baseline fails: you either fix the new
// instance or — if it is genuinely justified — raise the baseline in this
// file IN THE SAME COMMIT, with the justification in the commit message.
// A count below baseline prints a reminder to lower it (kept non-fatal so
// deleting code never blocks a commit).
//
// Wired into `npm test` via tests/audit-classes.test.js — it runs on every
// pre-push test run, not when someone remembers.
//
// Run directly:  node scripts/audit-classes.js
// ═══════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const CHECKS = [
  {
    name: 'class-4: swallowed catch',
    pattern: /catch \{\}|catch \(.*\) \{\}|\.catch\(\(\) => \{\}\)/g,
    roots: ['src', 'public'],
    exclude: [],
    advice: 'A silent catch reports success through failure. Either the failure genuinely does not matter (raise baseline + justify in the commit) or it must surface.',
    baseline: {
      'src/index.js': 12,
      'src/bot/ai-handler.js': 5,
      'src/bot/admin-handler.js': 2,
      'src/routes/payment.js': 8,
      'src/routes/dashboard-api.js': 4,
      'src/services/meta-whatsapp.js': 1,
      // the credit-exhaustion alert is best-effort; the API error itself is rethrown
      'src/services/claude.js': 1,
      'src/services/greenapi.js': 2,
      // confirmation replies only: the decision is already committed to the DB,
      // and a failed courtesy message must not roll it back or throw
      'src/bot/brain-handler.js': 3,
      // a rating is a courtesy ask on a finished order: a failed thank-you or a
      // session write must never surface to the customer or block the flow. The
      // rating itself IS checked — its update is awaited, not swallowed.
      'src/services/csat.js': 7,
      'public/sw.js': 1,
      'public/admin.js': 2,
      'public/app.js': 11,
    },
  },
  {
    name: 'class-10: hand-rolled EventSource',
    pattern: /new EventSource\(/g,
    roots: ['public'],
    exclude: [],
    advice: 'ONE supervised SSE connection per page. In app.js register via sseOn()/sseOnReconnect() — do not construct another EventSource. A new page gets ONE owner with onerror+backoff, heartbeat watchdog, and resync.',
    baseline: {
      'public/app.js': 1,
      'public/kitchen.js': 1,
    },
  },
  {
    name: 'class-11: module-level mutable state',
    pattern: /^(?:const|let) _[A-Za-z]+ *= *(?:new Map|new Set|\{\}|null|0|\[\])/gm,
    roots: ['src'],
    exclude: [],
    advice: 'State in a module variable resets on every deploy and breaks on scale-out. New store? Answer both questions in a comment (what happens on reset / on 2 instances), then raise the baseline.',
    baseline: {
      'src/index.js': 1,
      // prompts.js no longer caches lessons — the lessons service owns that now
      'src/bot/ai-handler.js': 4,
      'src/routes/call-events.js': 1,
      'src/services/sse.js': 1,
      'src/services/vendor-alerts.js': 3,
      'src/services/greenapi.js': 1,
      'src/services/menu-service.js': 1,
      'src/services/settings.js': 1,
      'src/services/supabase.js': 1,
      // lazy supabase client handle, not state (rebuilt on restart; per-instance is harmless)
      'src/services/recovery-attribution.js': 1,
      // lazy client + 3s topping-price cache; reset/scale-out answered in-file
      'src/services/pricing.js': 2,
      // lazy client handle only; insight dedup is enforced by a DB query, not memory
      'src/services/insights.js': 1,
      // lazy client handle only (no data; per-instance duplication harmless)
      'src/services/funnel-stats.js': 1,
      // lazy client + 60s lessons cache; reset/scale-out answered in-file
      'src/services/lessons.js': 2,
      // lazy client handle only; the pending ask lives in sessions.pending_csat
      // (DB), so a restart or a second instance loses nothing
      'src/services/csat.js': 1,
      // lazy client handle only; the rollup is an idempotent upsert, so a restart
      // or a second instance recomputes the same rows harmlessly
      'src/services/usage-rollup.js': 1,
      'src/bot/brain-handler.js': 1,
    },
  },
  {
    name: 'class-12: raw new Date( outside il-time',
    pattern: /new Date\(/g,
    roots: ['src'],
    exclude: ['src/services/il-time.js'],
    advice: 'Every audited instance is epoch math, explicit timeZone formatting, or ISO stamping. If the new use compares/buckets by LOCAL calendar time — use services/il-time.js. Otherwise raise the baseline.',
    baseline: {
      // Audited 2026-07-28: every instance is epoch math, explicit-timeZone
      // formatting, or toISOString stamping — none buckets by local calendar.
      'src/index.js': 10,
      'src/bot/prompts.js': 2,
      'src/bot/ai-handler.js': 7,
      'src/bot/admin-handler.js': 15,
      'src/routes/payment.js': 2,
      // 38 since the Bot Brain endpoints + lessons apply/deactivate (staleness epoch
      // math + ISO stamping; the cost-today window uses il-time periodRange)
      'src/routes/dashboard-api.js': 38,
      'src/services/vendor-alerts.js': 1,
      'src/services/supabase.js': 13,
      'src/services/order-state.js': 4,
      // rolling N-day window (epoch math) + accept-latency duration — no local
      // calendar bucketing, so il-time is not the right tool here
      'src/services/funnel-stats.js': 3,
      // decided_at + applied_at ISO stamping only
      'src/bot/brain-handler.js': 2,
      // asked_at ISO stamping + a 24h elapsed check (epoch math, not calendar)
      'src/services/csat.js': 3,
      // day WINDOWS come from il-time (periodRange/ilDayKey); these are epoch
      // math for the N-days-back loop and updated_at ISO stamping
      'src/services/usage-rollup.js': 4,
      'src/services/slug.js': 1,
      'src/services/settings.js': 8,
      'src/services/push-notifier.js': 1,
      // audited 2026-07-28: epoch math (attribution window) + ISO stamping only
      'src/services/recovery-attribution.js': 4,
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Custom checks — classes that a per-file COUNT cannot express.
// ═══════════════════════════════════════════════════════════════════════════

const HEB = /[\u0590-\u05FF]/;

/** Every Hebrew key defined in i18n.js's HE2EN map, plus conflicting duplicates. */
function he2enKeys() {
  const src = fs.readFileSync(path.join(ROOT, 'public/i18n.js'), 'utf8');
  const start = src.indexOf('const HE2EN = {');
  const end   = src.indexOf('\n};', start);
  if (start < 0 || end < 0) return { keys: new Set(), conflicts: [] };
  const body = src.slice(start, end);

  const keys = new Set();
  const seen = new Map();          // key → first translation seen
  const conflicts = [];
  const pair = /(?:^|,|\{|\n)\s*(?:\/\/[^\n]*\n\s*)*(['"])((?:[^\\]|\\.)*?)\1\s*:\s*(?:\n\s*)?(['"])((?:[^\\]|\\.)*?)\3/g;
  let m;
  while ((m = pair.exec(body))) {
    const k = m[2].replace(/\\(['"])/g, '$1');
    const v = m[4];
    if (seen.has(k) && seen.get(k) !== v) {
      conflicts.push(`'${k}' → '${seen.get(k)}' then '${v}'`);
    }
    seen.set(k, v);
    keys.add(k);
  }
  return { keys, conflicts };
}

/**
 * class-4, i18n edition: TR('...') with no dictionary entry returns its input
 * SILENTLY — no error, no log, no test. That is exactly how ten strings from
 * the VAT and open_override work shipped untranslated and nobody noticed until
 * someone clicked EN. A missing entry is now a build failure.
 */
function i18nCoverage() {
  const { keys, conflicts } = he2enKeys();
  const violations = [];

  for (const c of conflicts) {
    violations.push(`[i18n: conflicting duplicate key] ${c} — the first definition is silently dead. Use distinct source strings.`);
  }

  // Pages with their own dictionaries (public menu, onboarding wizard).
  violations.push(...pageDictCoverage());

  const scan = (rel, patterns) => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return;
    const src = fs.readFileSync(full, 'utf8');
    const missing = new Set();
    for (const re of patterns) {
      let m;
      const rx = new RegExp(re.source, re.flags);
      while ((m = rx.exec(src))) {
        const k = (m[1] || '').replace(/\\(['"])/g, '$1').trim();
        if (k && HEB.test(k) && !keys.has(k)) missing.add(k);
      }
    }
    for (const k of missing) {
      violations.push(`[i18n: untranslated] ${rel}: "${k}" — add it to HE2EN in public/i18n.js (a missing entry renders Hebrew in EN mode, silently).`);
    }
  };

  const jsCalls = [
    /\bTR\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g,
    /\bTR\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
    /\btr\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g,
  ];
  // data-tr translates the element's own text, so the text IS the key.
  const htmlMarked = [
    /<([a-zA-Z0-9]+)[^>]*\bdata-tr\b[^>]*>([^<]*)<\/\1>/g,
  ];

  for (const f of ['public/app.js', 'public/kitchen.js', 'public/admin.js']) scan(f, jsCalls);
  for (const f of ['public/dashboard.html', 'public/kitchen.html', 'public/index.html']) {
    scan(f, jsCalls);
    // second capture group holds the text for data-tr elements
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    for (const re of htmlMarked) {
      let m;
      const rx = new RegExp(re.source, re.flags);
      while ((m = rx.exec(src))) {
        const k = (m[2] || '').trim();
        if (k && HEB.test(k) && !keys.has(k)) {
          violations.push(`[i18n: untranslated] ${f}: data-tr "${k}" — add it to HE2EN in public/i18n.js.`);
        }
      }
    }
  }

  return violations;
}

/**
 * A currency symbol written into markup is a claim about the tenant's country.
 * The ₪ was hardcoded in 175 places while `currency` is a per-tenant setting;
 * money must go through money() (client) or formatMoney() (server).
 */
function hardcodedCurrency() {
  const ALLOW = new Set([
    'public/i18n.js',            // the dictionary names currencies
    'src/services/locale.js',    // where the symbols are defined
  ]);
  const BASELINE = {
    // Comments explaining the old defect, the ILS <option> label, and the
    // fallback inside money() itself.
    'public/app.js': 7,
    // Hebrew customer-facing WhatsApp strings, vendor alerts and the bot's own
    // menu rendering still quote ₪ directly. Those follow the TENANT's language
    // rather than the dashboard's, and are migrated with the bot's localisation
    // (plan item C5) — not by money(), which formats for the dashboard reader.
    'src/index.js': 3, 'src/bot/admin-handler.js': 8, 'src/bot/ai-handler.js': 5,
    'src/bot/menu.js': 22, 'src/bot/messages.js': 35, 'src/bot/prompts.js': 7,
    'src/routes/dashboard-api.js': 3, 'src/services/delivery-fee.js': 1,
    'src/services/greenapi.js': 2, 'src/services/menu-service.js': 2,
    'src/services/meta-whatsapp.js': 1, 'src/services/order-state.js': 4,
    'src/services/pricing.js': 2, 'src/services/push-notifier.js': 1,
    'src/services/recovery-attribution.js': 1, 'src/services/status-notifier.js': 2,
    'src/services/vendor-alerts.js': 5,
    // vendor portal — not yet localised at all (plan item A8)
    'public/admin.js': 7,
    'public/kitchen.js': 1,
  };
  const violations = [];
  for (const root of ['src', 'public']) {
    for (const file of jsFiles(path.join(ROOT, root))) {
      const rel = path.relative(ROOT, file);
      if (ALLOW.has(rel)) continue;
      const n = (fs.readFileSync(file, 'utf8').match(/₪/g) || []).length;
      const expected = BASELINE[rel] || 0;
      if (n > expected) {
        violations.push(`[currency: hardcoded ₪] ${rel}: ${n} (baseline ${expected}) — use money() in the client or formatMoney() on the server; currency is a per-tenant setting.`);
      }
    }
  }
  return violations;
}

/**
 * A page that carries its OWN dictionary (the public menu, the onboarding
 * wizard) — customer-facing strings whose language follows the tenant, not the
 * operator's localStorage. Same rule as the dashboard: a lookup with no entry
 * returns its input silently, which is how strings ship untranslated.
 */
function pageCoverage({ rel, mapName, fnName, attrs = [] }) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return [];
  const src = fs.readFileSync(full, 'utf8');

  const start = src.indexOf(`const ${mapName} = {`);
  const end   = src.indexOf('\n};', start);
  if (start < 0 || end < 0) return [`[i18n: untranslated] ${rel}: ${mapName} map not found`];
  const body = src.slice(start, end);

  const keys = new Set();
  const pair = /(?:^|,|\{|\n)\s*(?:\/\/[^\n]*\n\s*)*(['"])((?:[^\\]|\\.)*?)\1\s*:/g;
  let m;
  while ((m = pair.exec(body))) keys.add(m[2].replace(/\\(['"])/g, '$1'));

  const missing = new Set();
  const calls = [
    new RegExp(`\\b${fnName}\\(\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*\\)`, 'g'),
    new RegExp(`\\b${fnName}\\(\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*\\)`, 'g'),
    ...attrs.map((a) => new RegExp(`\\b${a}="([^"]*)"`, 'g')),
  ];
  for (const re of calls) {
    const rx = new RegExp(re.source, re.flags);
    while ((m = rx.exec(src))) {
      const k = (m[1] || '').replace(/\\(['"])/g, '$1').trim();
      if (k && HEB.test(k) && !keys.has(k)) missing.add(k);
    }
  }
  // data-m elements translate their own text
  const rxEl = /<([a-zA-Z0-9]+)[^>]*\bdata-m\b[^>]*>([^<]*)<\/\1>/g;
  while ((m = rxEl.exec(src))) {
    const k = (m[2] || '').trim();
    if (k && HEB.test(k) && !keys.has(k)) missing.add(k);
  }

  return [...missing].map((k) =>
    `[i18n: untranslated] ${rel}: "${k}" — add it to ${mapName} (a missing entry renders Hebrew to an English reader, silently).`);
}

const PAGE_DICTS = [
  { rel: 'public/menu.html',       mapName: 'MENU_HE2EN', fnName: 'M', attrs: ['data-m-aria'] },
  { rel: 'public/onboarding.html', mapName: 'OB_HE2EN',   fnName: 'O' },
];
function pageDictCoverage() {
  return PAGE_DICTS.flatMap(pageCoverage);
}

/**
 * A Hebrew tooltip, aria-label or placeholder with no dictionary entry.
 *
 * The i18n mechanism only ever covered textContent, so 19 title attributes and
 * 13 placeholders sat untranslated for a year — nobody forgot a marker, the
 * marker never existed for attributes. i18n.js now translates them from the
 * dictionary with no opt-in needed, which makes "has an entry" the whole
 * contract; this check enforces it.
 */
function attrCoverage() {
  const { keys } = he2enKeys();
  const violations = [];
  const FILES = ['public/dashboard.html', 'public/kitchen.html', 'public/index.html', 'public/app.js', 'public/kitchen.js'];

  for (const rel of FILES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    const missing = new Set();
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      // Match the whole tag so the key-based markers on it are visible: an
      // element carrying data-i18n-placeholder is translated by KEY, not by its
      // Hebrew, and is already covered.
      const rx = new RegExp(`<[^>]*\\b${attr}="([^"]*)"[^>]*>`, 'g');
      let m;
      while ((m = rx.exec(src))) {
        const v = (m[1] || '').trim();
        // A value built from a template expression is translated at render time.
        if (!v || v.includes('${') || !HEB.test(v)) continue;
        if (/data-(i18n|tr)-placeholder/.test(m[0])) continue;
        if (!keys.has(v)) missing.add(`${attr}="${v}"`);
      }
    }
    for (const v of missing) {
      violations.push(`[i18n: untranslated attribute] ${rel}: ${v} — add its Hebrew to HE2EN in public/i18n.js (attributes translate from the dictionary; no marker needed).`);
    }
  }
  return violations;
}

const CUSTOM_CHECKS = [i18nCoverage, attrCoverage, hardcodedCurrency];

function jsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) jsFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function runAudit() {
  const violations = [];
  const warnings   = [];

  for (const check of CHECKS) {
    const counts = {};
    for (const root of check.roots) {
      for (const file of jsFiles(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file);
        if (check.exclude.includes(rel)) continue;
        const n = (fs.readFileSync(file, 'utf8').match(check.pattern) || []).length;
        if (n > 0) counts[rel] = n;
      }
    }

    const files = new Set([...Object.keys(counts), ...Object.keys(check.baseline)]);
    for (const rel of files) {
      const actual   = counts[rel] || 0;
      const expected = check.baseline[rel] || 0;
      if (actual > expected) {
        violations.push(
          `[${check.name}] ${rel}: ${actual} instances (baseline ${expected}) — ${check.advice}`
        );
      } else if (actual < expected) {
        warnings.push(
          `[${check.name}] ${rel}: ${actual} instances, baseline says ${expected} — lower the baseline in scripts/audit-classes.js`
        );
      }
    }
  }

  for (const check of CUSTOM_CHECKS) violations.push(...check());

  return { violations, warnings };
}

if (require.main === module) {
  const { violations, warnings } = runAudit();
  for (const w of warnings) console.warn('⚠️  ' + w);
  if (violations.length) {
    console.error('\nFAILURE-CLASS AUDIT FAILED:\n');
    for (const v of violations) console.error('❌ ' + v);
    console.error('\nFix the new instance, or raise the baseline in scripts/audit-classes.js with justification in the same commit.');
    process.exit(1);
  }
  console.log(`✅ failure-class audit clean (${CHECKS.length + CUSTOM_CHECKS.length} classes checked${warnings.length ? `, ${warnings.length} stale-baseline warnings` : ''})`);
}

module.exports = { runAudit };
