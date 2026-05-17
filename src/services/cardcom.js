'use strict';

const axios = require('axios');

const BASE_URL = process.env.CARDCOM_API_URL || 'https://secure.cardcom.solutions';
const TERMINAL = process.env.CARDCOM_TERMINAL;   // 1000 for test
const API_NAME = process.env.CARDCOM_USERNAME;    // CardTest1994

/**
 * Create a Cardcom Low-Profile payment page via the JSON API (v11).
 * Returns { lowProfileCode, paymentUrl }.
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
    SuccessRedirectUrl:`${PUBLIC_URL}/payment/success`,
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
 * Verify a completed payment via the JSON API.
 * Returns { success, responseCode, returnValue, amount }.
 */
async function verifyPayment(lowProfileCode) {
  if (!TERMINAL || !API_NAME) {
    throw new Error('CARDCOM_TERMINAL and CARDCOM_USERNAME must be set');
  }

  const response = await axios.post(
    `${BASE_URL}/api/v11/LowProfile/GetLowProfileIndicatorData`,
    {
      TerminalNumber: parseInt(TERMINAL, 10),
      ApiName:        API_NAME,
      LowProfileId:   lowProfileCode,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const data = response.data;
  return {
    success:      data.ResponseCode === 0,
    responseCode: data.ResponseCode,
    returnValue:  data.ReturnValue,
    amount:       parseFloat(data.Amount || '0'),
    description:  data.Description || '',
  };
}

module.exports = { createPaymentPage, verifyPayment };
