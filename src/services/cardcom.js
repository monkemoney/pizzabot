'use strict';

const axios = require('axios');

const BASE_URL  = process.env.CARDCOM_API_URL  || 'https://secure.cardcom.solutions';
const TERMINAL  = process.env.CARDCOM_TERMINAL;
const USERNAME  = process.env.CARDCOM_USERNAME;

/**
 * Create a Cardcom Low-Profile payment page.
 * Returns { lowProfileCode, paymentUrl }.
 */
async function createPaymentPage({ amount, returnValue, productName, phone }) {
  if (!TERMINAL || !USERNAME) {
    throw new Error('CARDCOM_TERMINAL and CARDCOM_USERNAME must be set in environment');
  }

  const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

  const params = new URLSearchParams({
    TerminalNumber:    TERMINAL,
    UserName:          USERNAME,
    SumToBill:         amount.toFixed(2),
    CoinID:            '1',            // 1 = ILS
    Language:          'he',
    APILevel:          '10',
    ReturnValue:       returnValue,
    IndicatorUrl:      `${PUBLIC_URL}/webhook/payment`,
    SuccessRedirectUrl:`${PUBLIC_URL}/payment/success`,
    FailedRedirectUrl: `${PUBLIC_URL}/payment/failed`,
    MaxPayments:       '1',
    ProductName:       productName,
  });

  const response = await axios.post(
    `${BASE_URL}/Interface/LowProfile.aspx`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );

  const result = Object.fromEntries(new URLSearchParams(response.data));

  if (result.ResponseCode !== '0') {
    throw new Error(`Cardcom error [${result.ResponseCode}]: ${result.Description || 'Unknown error'}`);
  }

  return {
    lowProfileCode: result.LowProfileCode,
    paymentUrl:     result.url,
  };
}

/**
 * Verify a payment after Cardcom posts to IndicatorUrl.
 * Returns { success, responseCode, returnValue, amount }.
 */
async function verifyPayment(lowProfileCode) {
  if (!TERMINAL || !USERNAME) {
    throw new Error('CARDCOM_TERMINAL and CARDCOM_USERNAME must be set in environment');
  }

  const response = await axios.get(
    `${BASE_URL}/Interface/BillGoldGetLowProfileIndicatorData.aspx`,
    {
      params: { LowProfileCode: lowProfileCode, TerminalNumber: TERMINAL, UserName: USERNAME },
      timeout: 15000,
    }
  );

  const result = Object.fromEntries(new URLSearchParams(response.data));

  return {
    success:      result.ResponseCode === '0',
    responseCode: result.ResponseCode,
    returnValue:  result.ReturnValue,
    amount:       parseFloat(result.Amount || '0'),
    description:  result.Description || '',
  };
}

module.exports = { createPaymentPage, verifyPayment };
