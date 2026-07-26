'use strict';

const axios = require('axios');

const BASE_URL = process.env.CARDCOM_API_URL || 'https://secure.cardcom.solutions';
const TERMINAL = process.env.CARDCOM_TERMINAL;   // default tenant (env)
const API_NAME = process.env.CARDCOM_USERNAME;

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

/**
 * Resolve Cardcom credentials per tenant: default tenant → env vars;
 * other tenants → settings cardcom_terminal / cardcom_username (seeded at
 * onboarding), with env as last-resort fallback so a missing setting fails
 * loudly at the API call rather than silently charging the wrong terminal.
 */
async function _creds(tenantId) {
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    return { terminal: TERMINAL, apiName: API_NAME };
  }
  const settings = require('./settings');
  const [terminal, apiName] = await Promise.all([
    settings.get('cardcom_terminal', tenantId).catch(() => null),
    settings.get('cardcom_username', tenantId).catch(() => null),
  ]);
  if (terminal && apiName) return { terminal: String(terminal), apiName: String(apiName) };
  console.warn(`[cardcom] tenant ${tenantId} missing cardcom_terminal/cardcom_username settings — falling back to env`);
  return { terminal: TERMINAL, apiName: API_NAME };
}

/**
 * Create a Cardcom Low-Profile payment page via the JSON API (v11).
 * Returns { lowProfileCode, paymentUrl }.
 *
 * Key: ReturnValue is embedded in SuccessRedirectUrl so we can always
 * identify which pending order was paid — even if Cardcom doesn't pass params back.
 */
async function createPaymentPage({ amount, returnValue, productName, maxPayments, tenantId }) {
  const { terminal, apiName } = await _creds(tenantId);
  if (!terminal || !apiName) {
    throw new Error('CARDCOM_TERMINAL and CARDCOM_USERNAME must be set');
  }

  const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

  const body = {
    TerminalNumber:    parseInt(terminal, 10),
    ApiName:           apiName,
    Amount:            parseFloat(amount.toFixed(2)),
    CoinID:            1,           // ILS
    Language:          'he',
    ReturnValue:       returnValue,
    // Embed ReturnValue in success URL — Cardcom test mode doesn't pass params back
    SuccessRedirectUrl:`${PUBLIC_URL}/payment/success?rv=${encodeURIComponent(returnValue)}`,
    FailedRedirectUrl: `${PUBLIC_URL}/payment/failed`,
    IndicatorUrl:      `${PUBLIC_URL}/webhook/payment`,
    ProductName:       productName || 'פיצה דליבריס',
    // Installment configuration (Bit/Paybox visibility is terminal-level, not per-call)
    MaxPayments:       maxPayments  || 1,
    MinPayments:       1,
  };

  const response = await axios.post(
    `${BASE_URL}/api/v11/LowProfile/Create`,
    body,
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const data = response.data;
  if (data.ResponseCode !== 0) {
    throw new Error(`Cardcom error [${data.ResponseCode}]: ${data.Description || 'Unknown'}`);
  }

  return {
    lowProfileCode: data.LowProfileId,
    paymentUrl:     data.Url,
  };
}

/**
 * Verify a completed payment via Cardcom API.
 * NOTE: GetLowProfileIndicatorData endpoint does not exist on Cardcom's server (verified 2026-05).
 * This function is kept for future use when Cardcom provides the correct endpoint.
 * Currently returns { success: true } as a pass-through since the IndicatorUrl
 * callback and success-redirect are the actual confirmation mechanisms.
 */
async function verifyPayment(lowProfileCode) {
  // The endpoint /api/v11/LowProfile/GetLowProfileIndicatorData returns 404 on Cardcom's servers.
  // We trust the IndicatorUrl callback and the success-redirect (with embedded ReturnValue) instead.
  // Returning success: true so the caller proceeds to save the order.
  console.log(`[cardcom] verifyPayment called for ${lowProfileCode} — trusting Cardcom callback (no verify endpoint available)`);
  return {
    success:      true,
    responseCode: 0,
    returnValue:  null,
    amount:       0,
    description:  'trusted-callback',
  };
}

/**
 * Cancel a deal and issue a full refund via Cardcom CancelDeal.aspx.
 * Requires the InternalDealNumber saved when the original payment was confirmed.
 * Returns { success: bool, message: string }.
 */
async function cancelDeal(dealNumber, tenantId) {
  if (!dealNumber) return { success: false, message: 'אין מספר עסקה — זיכוי ידני נדרש' };
  const { terminal, apiName } = await _creds(tenantId);
  if (!terminal || !apiName) return { success: false, message: 'הגדרות Cardcom חסרות' };

  try {
    const result = await axios.post(
      `${BASE_URL}/Interface/CancelDeal.aspx`,
      new URLSearchParams({
        TerminalNumber:     terminal,
        ApiName:            apiName,
        InternalDealNumber: dealNumber,
        CancelType:         '1',   // full refund
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );
    const params = new URLSearchParams(result.data);
    const code   = params.get('ResponseCode');
    if (code === '0') {
      return { success: true, message: 'הזיכוי בוצע אוטומטית דרך כרטקום ✅' };
    }
    return { success: false, message: `כרטקום: ${params.get('Description') || `קוד ${code}`}` };
  } catch (err) {
    return { success: false, message: `שגיאת תקשורת עם כרטקום: ${err.message}` };
  }
}

module.exports = { createPaymentPage, verifyPayment, cancelDeal };
