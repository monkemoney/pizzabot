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
      'src/services/greenapi.js': 2,
      // confirmation replies only: the decision is already committed to the DB,
      // and a failed courtesy message must not roll it back or throw
      'src/bot/brain-handler.js': 3,
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
      'src/services/slug.js': 1,
      'src/services/settings.js': 8,
      'src/services/push-notifier.js': 1,
      // audited 2026-07-28: epoch math (attribution window) + ISO stamping only
      'src/services/recovery-attribution.js': 4,
    },
  },
];

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
  console.log(`✅ failure-class audit clean (${CHECKS.length} classes checked${warnings.length ? `, ${warnings.length} stale-baseline warnings` : ''})`);
}

module.exports = { runAudit };
