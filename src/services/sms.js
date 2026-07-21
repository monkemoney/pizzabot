'use strict';

/**
 * DIDWW outbound SMS (HTTP OUT trunk) — the non-WhatsApp channel for
 * missed-call recovery: no Meta template/approval dependency, reaches
 * callers without WhatsApp. JSON:API over Basic auth.
 *
 * Platform-level credentials (Jasell's DIDWW account, env vars):
 *   DIDWW_SMS_USER / DIDWW_SMS_PASSWORD  — the HTTP OUT trunk credentials
 *   DIDWW_SMS_API_URL                    — override for tests/staging only
 *
 * DIDWW also enforces IP whitelisting on this endpoint — Render's outbound
 * IPs must be whitelisted in the trunk config or requests 403.
 */

require('dotenv').config();
const axios = require('axios');

const SMS_API_URL = process.env.DIDWW_SMS_API_URL || 'https://sms-out.didww.com/outbound_messages';

async function sendSms(to, text, source, tenantId = null) {
  const user = process.env.DIDWW_SMS_USER;
  const password = process.env.DIDWW_SMS_PASSWORD;
  if (!user || !password) {
    throw new Error('[sms] DIDWW_SMS_USER / DIDWW_SMS_PASSWORD not configured');
  }
  if (!source) {
    throw new Error(`[sms] no sender number (source) for tenant ${tenantId}`);
  }

  try {
    const r = await axios.post(
      SMS_API_URL,
      { data: { type: 'outbound_messages', attributes: { destination: to, source, content: text } } },
      { auth: { username: user, password }, headers: { 'Content-Type': 'application/vnd.api+json' } }
    );
    console.log(`[sms] sent to ${to} from ${source} (tenant ${tenantId})`);
    return r.data;
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data).slice(0, 400) : err.message;
    console.error(`[sms] send to ${to} failed (tenant ${tenantId}):`, detail);
    throw err;
  }
}

module.exports = { sendSms };
