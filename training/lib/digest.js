'use strict';

// Weekly WhatsApp digest to the vendor — the push half of the decision loop.
// Carries approve/reject buttons for the top pending insight; replies are routed
// by src/bot/brain-handler.js (the vendor's phone is not in admin_users, so
// without that branch a tap would land in the customer bot).
// Send outcome is recorded by the caller into bot_runs.meta.
//
// Reads vendor_phone directly from settings (default tenant) — NOT via
// vendor-alerts.alert(), whose cooldown/prefix semantics don't fit a digest.

const { createClient } = require('@supabase/supabase-js');
const sink = require('./db-sink');

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

async function vendorPhone() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data } = await db.from('settings').select('value')
    .eq('tenant_id', DEFAULT_TENANT_ID).eq('key', 'vendor_phone').maybeSingle();
  const v = data && data.value;
  return v ? String(v).replace(/"/g, '') : null;
}

function fmtDelta(cur, prev, key) {
  const a = cur?.[key], b = prev?.[key];
  if (typeof a !== 'number') return null;
  if (typeof b !== 'number') return `${a}`;
  const d = a - b;
  return `${a} (${d >= 0 ? '+' : ''}${d})`;
}

/**
 * Build + send the digest. Returns 'sent' | 'skipped:<reason>' | 'failed:<msg>'.
 * @param {object} args {runId, verdict, scores}
 */
async function sendWeeklyDigest({ runId, verdict, scores = {} }) {
  const phone = await vendorPhone().catch(() => null);
  if (!phone) return 'skipped:no-vendor-phone';

  const prev = await sink.lastCompletedRun(runId);
  const pending = await sink.openInsights(['proposed']);

  const lines = [`*[מוח הבוט] סיכום שבועי*`];
  lines.push(verdict === 'GO' ? '🎓 פסק דין: GO — הבוט כשיר' : `⛔ פסק דין: ${verdict || 'לא נקבע'}`);

  const parts = [];
  const synth = fmtDelta(scores, prev?.scores, 'synthetic');
  const replay = fmtDelta(scores, prev?.scores, 'replay');
  if (synth) parts.push(`סינתטי ${synth}`);
  if (replay) parts.push(`אמיתי ${replay}`);
  if (typeof scores.autonomy_pct === 'number') parts.push(`אוטונומיה ${scores.autonomy_pct}%`);
  if (parts.length) lines.push(parts.join(' | '));

  if (pending.length) {
    lines.push('');
    lines.push(`*ממתינות להחלטתך: ${pending.length} תובנות*`);
    pending.slice(0, 3).forEach((p, i) => {
      const title = p.title.length > 70 ? p.title.slice(0, 67) + '...' : p.title;
      lines.push(`${i + 1}. ${title}`);
    });
    if (pending.length > 3) lines.push(`ועוד ${pending.length - 3}...`);
    lines.push('');
    lines.push('החלטות: פורטל הספק ← מוח הבוט');
  } else {
    lines.push('אין החלטות ממתינות.');
  }

  const body = lines.join('\n');
  const top = pending[0];

  try {
    const greenapi = require('../../src/services/greenapi');
    // One decision per digest: Meta allows 3 buttons and titles ≤20 chars, and
    // a wall of buttons is worse than a link to the full queue.
    if (top && typeof greenapi.sendInteractiveButtons === 'function') {
      await greenapi.sendInteractiveButtons(
        phone, body,
        [{ id: `brain:approve:${top.id}`, title: 'אשר את #1' },
         { id: `brain:reject:${top.id}`,  title: 'דחה את #1' }],
        DEFAULT_TENANT_ID,
        `${body}\n\n(להחלטה מהירה על #1 השב: אשר / דחה)`,
      );
    } else {
      await greenapi.sendMessage(phone, body, DEFAULT_TENANT_ID);
    }
    return 'sent';
  } catch (e) {
    return `failed:${e.message.slice(0, 120)}`;
  }
}

module.exports = { sendWeeklyDigest };
