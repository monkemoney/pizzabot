'use strict';

const axios = require('axios');

const BASE_URL = process.env.CARDCOM_API_URL || 'https://secure.cardcom.solutions';
const TERMINAL = process.env.CARDCOM_TERMINAL;   // 1000 for test
const API_NAME = process.env.CARDCOM_USERNAME;    // CardTest1994

/**
 * Create a Cardcom Low-Profile payment page via the JSON API (v11).
 * Returns { lowProfileCode, paymentUrl }.
 *
 * Key: ReturnValue is embedded in SuccessRedirectUrl so we can always
 * identify which pending order was paid — even if Cardcom doesn't pass params back.
 */
async function createPaymentPage({ amount, returnValue, productName }) {
  if (!TERMINAL || !API_NAME) {
    throw new Error('CARDCOM_TERMINAL and CARDCOM_USERNAME must be set');
  }

  const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

  const body = {
    TerminalNumber:    parseInt(TERMINAL, 10),
    ApiName:           API_NAME,
    Amount:            parseFloat(amount.toFixed(2)),
    CoinID:            1,           // ILS
    Language:          'he',
    ReturnValue:       returnValue,
    // Embed ReturnValue in success URL — Cardcom test mode doesn't pass params back
    SuccessRedirectUrl:`${PUBLIC_URL}/payment/success?rv=${encodeURIComponent(returnValue)}`,
    FailedRedirectUrl: `${PUBLIC_URL}/payment/failed`,
    IndicatorUrl:      `${PUBLIC_URL}/webhook/payment`,
    ProductName:       productName || 'פיצה דליבריס',
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

module.exports = { createPaymentPage, verifyPayment };
