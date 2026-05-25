'use strict';

/**
 * Real-time alerts to the vendor via WhatsApp + browser push.
 * Called from error handlers, payment failures, and bot errors.
 */

const { sendMessage } = require('./greenapi');
const { createClient } = require('@supabase/supabase-js');
const settings = require('./settings');

let _vendorPhone = null;
let _alertCooldowns = {};   // key → last alert timestamp (throttle)
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min between same alert type

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

async function getVendorPhone() {
  if (_vendorPhone) return _vendorPhone;
  try {
    const sb = getSupabase();
    const { data } = await sb.from('settings')
      .select('value').eq('key', 'vendor_phone').single();
    _vendorPhone = data?.value ? String(data.value).replace(/"/g, '') : null;
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
// Map alert type → settings key (undefined = always send)
const ALERT_SETTING = {
  server_error:   'vendor_alert_error',
  bot_error:      'vendor_alert_error',
  payment_failed: 'vendor_alert_payment',
  restart:        'vendor_alert_restart',
};

async function alert(type, emoji, title, detail = '') {
  // Check if this alert type is enabled in settings
  const settingKey = ALERT_SETTING[type];
  if (settingKey) {
    const enabled = await settings.get(settingKey).catch(() => true);
    if (enabled === false || enabled === 'false') return;
  }

  // Throttle: skip if same type was sent within COOLDOWN_MS
  const last = _alertCooldowns[type] || 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  _alertCooldowns[type] = Date.now();

  const phone = await getVendorPhone();
  if (!phone) return;

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
  botError:      (phone, err)  => alert('bot_error',   '🤖', 'שגיאת בוט', `לקוח: ${phone}\n${err?.message || err}`),
  newOrder:      (num, total)  => alert('new_order',   '🍕', `הזמנה #${num} התקבלה`, `סכום: ₪${total}`),
  serverRestart: ()       => alert('restart',      '🔄', 'שרת אותחל', 'pizzabot-jasell.onrender.com'),
  lowBalance:    (bal)    => alert('low_balance',  '⚠️', 'יתרת Green API נמוכה', `${bal} הודעות נותרו`),
  onboardingComplete: (name, wa, sessionId) =>
    alert(`onboarding_${sessionId}`, '🟢', 'לקוח השלים אונבורדינג', `עסק: ${name}\nWhatsApp בוט: ${wa}`),
};

module.exports = { alert, alerts, invalidateVendorPhone };
