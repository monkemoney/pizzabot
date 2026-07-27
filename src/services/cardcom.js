'use strict';

const axios = require('axios');

const BASE_URL = process.env.CARDCOM_API_URL || 'https://secure.cardcom.solutions';
const TERMINAL = process.env.CARDCOM_TERMINAL;   // default tenant (env)
const API_NAME = process.env.CARDCOM_USERNAME;

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

/**
 * Resolve Cardcom credentials per tenant: default tenant → env vars;
 * other tenants → settings cardcom_terminal / cardcom_username (seeded at
 * onboarding). A non-default tenant with missing creds THROWS — the old env
 * fallback meant that tenant's customers paid into the DEFAULT tenant's
 * terminal: the payment "worked" and the money landed in the wrong business.
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
  throw new Error(`tenant ${tenantId} has no Cardcom credentials configured (cardcom_terminal/cardcom_username settings)`);
}

/**
 * Verify a terminal/ApiName pair actually works by creating a minimal
 * LowProfile page (no charge happens — it's just a page). Used at onboarding
 * so a wrong ApiName surfaces at setup time, not at the first customer payment.
 * Returns { ok, error }.
 */
async function verifyCreds(terminal, apiName) {
  if (!terminal || !apiName) return { ok: false, error: 'missing terminal/apiName' };
  try {
    const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
    const { data } = await axios.post(
      `${BASE_URL}/api/v11/LowProfile/Create`,
      {
        TerminalNumber: parseInt(terminal, 10),
        ApiName:        String(apiName),
        Amount:         1,
        CoinID:         1,
        Language:       'he',
        ReturnValue:    'creds-verify',
        SuccessRedirectUrl: `${PUBLIC_URL}/payment/success`,
        FailedRedirectUrl:  `${PUBLIC_URL}/payment/failed`,
        IndicatorUrl:       `${PUBLIC_URL}/webhook/payment`,
        ProductName:    'בדיקת חיבור',
        MaxPayments: 1, MinPayments: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    if (data.ResponseCode === 0) return { ok: true };
    return { ok: false, error: `[${data.ResponseCode}] ${data.Description || 'Unknown'}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
 * Read the outcome out of a Cardcom IndicatorUrl callback.
 *
 * Cardcom fires the callback for FAILED deals too, so the response code is the
 * only thing separating "customer paid" from "card declined". Nothing here
 * trusts the caller's word about success — an absent/!=0 code is a failure.
 * (Their GetLowProfileIndicatorData verify endpoint 404s — verified 2026-05 —
 * so the callback is the strongest signal we have; the amount cross-check
 * against our own pending record is the second.)
 *
 * Field names vary between Cardcom's low-profile versions, hence the probing.
 */
function readCallbackOutcome(body = {}) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== '') return body[k];
    }
    return undefined;
  };

  const rawCode = pick('ResponseCode', 'DealResponse', 'OperationResponse', 'responseCode');
  const code    = rawCode === undefined ? undefined : parseInt(rawCode, 10);
  const rawAmt  = pick('Amount', 'SumToBill', 'DealSum', 'amount');
  const amount  = rawAmt === undefined ? null : parseFloat(rawAmt);

  return {
    // No code at all → treat as unverified rather than successful.
    success:      code === 0,
    hasCode:      code !== undefined && !Number.isNaN(code),
    responseCode: Number.isNaN(code) ? undefined : code,
    amount:       Number.isNaN(amount) ? null : amount,
    description:  pick('Description', 'ResponseDescription', 'description') || '',
    dealNumber:   pick('DealNumber', 'InternalDealNumber', 'CardcomDealNumber') || null,
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

module.exports = { createPaymentPage, readCallbackOutcome, cancelDeal, verifyCreds };
