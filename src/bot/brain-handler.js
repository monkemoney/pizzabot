'use strict';

/**
 * Bot Brain replies from the vendor's WhatsApp.
 *
 * The weekly digest can carry approve/reject buttons; without this handler a
 * tap would fall through to `getAdminUser` (the vendor's phone lives in
 * settings.vendor_phone, NOT admin_users) and land in the CUSTOMER bot — the
 * vendor would get a pizza greeting instead of a decision being recorded.
 *
 * Authorisation is the sender, never the button id: a button payload is data,
 * not a credential, and on the Green API path a customer could type one.
 */

const { createClient } = require('@supabase/supabase-js');
const settings = require('../services/settings');

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

// class-11 (module-level mutable state): lazy client handle only — no data,
// rebuilt after a deploy, per-instance duplication is harmless.
let _db = null;
function db() {
  if (!_db) _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _db;
}

function digits(p) {
  return String(p || '').replace(/[^0-9]/g, '');
}

/** Is this sender the platform vendor? (settings.vendor_phone, default tenant) */
async function isVendor(phone) {
  try {
    const v = await settings.get('vendor_phone', DEFAULT_TENANT_ID);
    const configured = digits(String(v || '').replace(/"/g, ''));
    return !!configured && digits(phone).endsWith(configured.slice(-9));
  } catch (_) { return false; }
}

const BUTTON_RE = /^brain:(approve|reject):([0-9a-fA-F-]{36})$/;

/**
 * Handle a Bot Brain button tap / text command from the vendor.
 * @returns {Promise<boolean>} true when handled (caller must stop routing)
 */
async function handleBrainReply(phone, interactiveId, textMessage, tenantId) {
  const m = String(interactiveId || '').match(BUTTON_RE);
  if (!m) return false;

  // The tap is only trusted from the vendor's own number.
  if (!(await isVendor(phone))) {
    console.warn(`[brain] ignoring brain: reply from non-vendor ${phone}`);
    return true; // consumed — never leak a control payload into the customer bot
  }

  const [, action, id] = m;
  const { sendMessage } = require('../services/greenapi');

  try {
    const { data: cur } = await db().from('bot_insights').select('*').eq('id', id).single();
    if (!cur) {
      await sendMessage(phone, 'התובנה לא נמצאה.', tenantId || DEFAULT_TENANT_ID).catch(() => {});
      return true;
    }
    if (!['proposed', 'monitoring'].includes(cur.status)) {
      await sendMessage(phone, `התובנה כבר ב-${cur.status}.`, tenantId || DEFAULT_TENANT_ID).catch(() => {});
      return true;
    }

    await db().from('bot_insights').update({
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: new Date().toISOString(),
      decided_via: 'whatsapp',
    }).eq('id', id);

    const verb = action === 'approve' ? 'אושרה' : 'נדחתה';
    await sendMessage(phone, `${verb}: ${cur.title}`, tenantId || DEFAULT_TENANT_ID).catch(() => {});
    console.log(`[brain] insight ${id.slice(0, 8)} ${action}d via whatsapp`);
  } catch (err) {
    console.error('[brain] reply error:', err.message);
  }
  return true;
}

module.exports = { handleBrainReply, isVendor };
