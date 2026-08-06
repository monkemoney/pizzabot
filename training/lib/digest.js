'use strict';

// Weekly WhatsApp digest to the vendor — the push half of the decision loop.
// v1 is TEXT-ONLY by design: interactive buttons ship only together with the
// vendor-reply routing branch (plan block 4c) — a button tap before that lands
// in the customer bot. Send outcome is recorded by the caller into bot_runs.meta.
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

  try {
    const { sendMessage } = require('../../src/services/greenapi');
    await sendMessage(phone, lines.join('\n'), DEFAULT_TENANT_ID);
    return 'sent';
  } catch (e) {
    return `failed:${e.message.slice(0, 120)}`;
  }
}

module.exports = { sendWeeklyDigest };
