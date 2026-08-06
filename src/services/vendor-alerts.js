'use strict';

/**
 * Real-time alerts to the vendor via WhatsApp + browser push.
 * Called from error handlers, payment failures, and bot errors.
 */

const { sendMessage } = require('./greenapi');
const { createClient } = require('@supabase/supabase-js');
const settings = require('./settings');

let _vendorPhone = null;
let _vendorPhoneTime = 0;
const VENDOR_PHONE_TTL = 60_000;
let _alertCooldowns = {};   // key → last alert timestamp (throttle)
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min between same alert type

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

async function getVendorPhone() {
  // TTL like every other cache in the repo (class 11): forever-cached meant a
  // direct-DB edit of vendor_phone kept alerts going to the OLD phone until
  // the next deploy. invalidateVendorPhone() still gives instant refresh on
  // the dashboard path; the TTL covers everything that bypasses it.
  if (_vendorPhone && Date.now() - _vendorPhoneTime < VENDOR_PHONE_TTL) return _vendorPhone;
  try {
    const sb = getSupabase();
    const { data } = await sb.from('settings')
      .select('value').eq('key', 'vendor_phone').eq('tenant_id', DEFAULT_TENANT_ID).single();
    _vendorPhone = data?.value ? String(data.value).replace(/"/g, '') : null;
    _vendorPhoneTime = Date.now();
    return _vendorPhone;
  } catch { return null; }
}

/** Invalidate cached phone when settings change */
function invalidateVendorPhone() { _vendorPhone = null; }

/**
 * Send an alert to the vendor.
 * @param {string} type   alert category (throttle key)
 * @param {string} emoji  leading emoji
 * @param {string} title  short title
 * @param {string} detail optional detail text
 */
// Map alert type → settings key (undefined = always send). Types may carry a
// unique suffix (e.g. payment_stale_<phone>) so that each incident gets its own
// throttle slot instead of the second one being swallowed by the cooldown —
// matched here by prefix.
const ALERT_SETTING = {
  server_error:    'vendor_alert_error',
  bot_error:       'vendor_alert_error',
  payment_failed:  'vendor_alert_payment',
  payment_stale:   'vendor_alert_payment',
  payment_mismatch:'vendor_alert_payment',
  payment_orphan:  'vendor_alert_payment',
  restart:         'vendor_alert_restart',
};

function settingKeyFor(type) {
  if (ALERT_SETTING[type]) return ALERT_SETTING[type];
  const prefix = Object.keys(ALERT_SETTING).find((k) => type.startsWith(`${k}_`));
  return prefix ? ALERT_SETTING[prefix] : undefined;
}

async function alert(type, emoji, title, detail = '') {
  // Check if this alert category is enabled in settings
  const settingKey = settingKeyFor(type);
  if (settingKey) {
    const enabled = await settings.get(settingKey, DEFAULT_TENANT_ID).catch(() => true);
    if (enabled === false || enabled === 'false') return;
  }

  // Throttle: skip if same type was sent within COOLDOWN_MS.
  // Expired entries are dropped first — per-incident keys (payment_stale_<phone>)
  // otherwise accumulate forever (class 13: append-only with no pruning owner).
  for (const k of Object.keys(_alertCooldowns)) {
    if (Date.now() - _alertCooldowns[k] >= COOLDOWN_MS) delete _alertCooldowns[k];
  }
  const last = _alertCooldowns[type] || 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  _alertCooldowns[type] = Date.now();

  const phone = await getVendorPhone();
  if (!phone) {
    // The whole alerting system silently reporting to nobody is worse than the
    // incidents it exists to surface — make the dead-letter loud in the logs.
    console.error(`[vendor-alerts] vendor_phone not configured — alert DROPPED: ${type} "${title}"`);
    return;
  }

  const msg = [
    `${emoji} *[Jasell Alert] ${title}*`,
    detail ? detail : null,
    `_${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}_`,
  ].filter(Boolean).join('\n');

  await sendMessage(phone, msg).catch(err =>
    console.error('[vendor-alert] send failed:', err.message)
  );
  console.log(`[vendor-alert] ${type}: ${title}`);
}

// ── Convenience helpers ───────────────────────────────────────────────────────

const alerts = {
  serverError:   (err)     => alert('server_error',   '🔴', 'שגיאת שרת', err?.message || String(err)),
  paymentFailed: (phone, code) => alert('payment_failed', '💳', 'תשלום נכשל', `לקוח: ${phone} | קוד: ${code}`),
  paymentMismatch: (phone, charged, expected) => alert(`payment_mismatch_${phone}`, '🚨', 'אי-התאמה בסכום החיוב',
    `לקוח: ${phone}\nכרטקום חייב: ₪${charged} | ההזמנה: ₪${expected}\nההזמנה נרשמה כ"ממתינה לאימות" — בדקו בפורטל כרטקום לפני שמאשרים.`),
  orphanPayment: (ids, amount) => alert(`payment_orphan_${ids}`, '🚨', 'התקבל אישור תשלום ללא הזמנה תואמת',
    `${ids}${amount ? ` | סכום: ₪${amount}` : ''}\nייתכן שהלקוח שילם אחרי שפג תוקף הלינק. בדקו בפורטל כרטקום — ייתכן שנגבה כסף ללא הזמנה.`),
  stalePayment:  (phone, total) => alert(`payment_stale_${phone}`, '💳', 'תשלום ממתין ללא אישור',
    `לקוח: ${phone}${total ? ` | סכום: ₪${total}` : ''}\nלינק תשלום נוצר אך לא התקבל אישור מכרטקום. אם התשלום מופיע בפורטל כרטקום — ההזמנה לא נקלטה אוטומטית וצריך ליצור אותה ידנית.`),
  botError:      (phone, err)  => alert('bot_error',   '🤖', 'שגיאת בוט', `לקוח: ${phone}\n${err?.message || err}`),
  deliveryFailed: (phone, err) => alert(`delivery_${phone}`, '📵', 'הודעה ללקוח לא נשלחה',
    `לקוח: ${phone}\n${String(err).slice(0, 200)}\nהשיחה מבחינת הלקוח נראית כאילו הבוט השתתק.`),
  newOrder:      (num, total)  => alert('new_order',   '🍕', `הזמנה #${num} התקבלה`, `סכום: ₪${total}`),
  serverRestart: ()       => alert('restart',      '🔄', 'שרת אותחל', 'pizzabot-jasell.onrender.com'),
  // Credit/quota exhaustion — for Anthropic (bot stops answering) or Green API.
  lowBalance:    (detail) => alert('low_balance',  '⚠️', 'יתרה אזלה', String(detail)),
  costThreshold: (detail) => alert('cost_threshold', '💸', 'חריגה מתקציב יומי', String(detail)),
  provisioningFailed: (name, step, reason) => alert(`provisioning_${name}_${step}`, '🔴', 'הקמת לקוח נכשלה',
    `עסק: ${name || '—'}\nשלב: ${step}\n${String(reason).slice(0, 200)}\n\nהאישור ניתן להרצה מחדש — השלבים שהצליחו לא ירוצו שוב.`),
  onboardingComplete: (name, wa, sessionId) =>
    alert(`onboarding_${sessionId}`, '🟢', 'לקוח השלים אונבורדינג', `עסק: ${name}\nWhatsApp בוט: ${wa}`),
};

module.exports = { alert, alerts, invalidateVendorPhone };
