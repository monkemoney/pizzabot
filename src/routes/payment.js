'use strict';

const express = require('express');
const { verifyPayment }           = require('../services/cardcom');
const { getPendingByCardcomCode, getPendingByReturnValue,
        deletePendingPayment, saveOrder } = require('../services/supabase');
const { sendMessage }             = require('../services/greenapi');
const { formatPhone }             = require('../services/greenapi');

const router = express.Router();

// ─── Cardcom IndicatorUrl webhook ─────────────────────────────────────────────
// Cardcom POSTs here when a payment completes (success or failure).
// Must respond 200 quickly.
router.post('/payment', express.urlencoded({ extended: false }), async (req, res) => {
  res.sendStatus(200); // ack immediately

  const { LowProfileCode, ReturnValue, Operation } = req.body;
  console.log('[payment] Webhook received:', { LowProfileCode, ReturnValue, Operation });

  if (!LowProfileCode && !ReturnValue) {
    console.warn('[payment] Missing LowProfileCode and ReturnValue');
    return;
  }

  // Find the pending order
  let pending = null;
  if (LowProfileCode) pending = await getPendingByCardcomCode(LowProfileCode);
  if (!pending && ReturnValue) pending = await getPendingByReturnValue(ReturnValue);

  if (!pending) {
    console.warn('[payment] No pending payment found for', { LowProfileCode, ReturnValue });
    return;
  }

  // Verify with Cardcom
  let verification;
  try {
    verification = await verifyPayment(LowProfileCode || pending.cardcom_code);
  } catch (err) {
    console.error('[payment] Verify error:', err.message);
    await notifyPaymentFailed(pending);
    return;
  }

  if (!verification.success) {
    console.warn('[payment] Payment failed:', verification);
    await notifyPaymentFailed(pending);
    await deletePendingPayment(pending.id);
    return;
  }

  // Payment succeeded — save the order
  const orderData = pending.order_data;
  try {
    const { id, orderNumber } = await saveOrder({
      phone:           pending.phone,
      customer_name:   orderData.customer_name   || null,
      customer_phone:  orderData.customer_phone  || null,
      items:           orderData.items           || [],
      delivery_method: orderData.delivery_method,
      address:         orderData.address         || null,
      notes:           orderData.notes           || null,
      payment_method:  'credit',
      payment_status:  'paid',
      cardcom_code:    LowProfileCode || pending.cardcom_code,
      total_price:     orderData.total,
      status:          'new',
    });

    await deletePendingPayment(pending.id);

    // Notify customer
    const msg = `✅ התשלום התקבל! הזמנה מספר *${orderNumber}* בדרך 🍕\nנעדכן אותך על כל שינוי בסטטוס.`;
    await sendMessage(pending.phone, msg).catch((err) =>
      console.error('[payment] Customer notify error:', err.message)
    );

    console.log(`[payment] Order #${orderNumber} created for ${pending.phone}`);
  } catch (err) {
    console.error('[payment] saveOrder error:', err.message);
  }
});

// ─── Success / Failed redirect pages ─────────────────────────────────────────

router.get('/success', (_req, res) => {
  res.send(`<!doctype html><html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>תשלום הצליח</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px;background:#f0fdf4}
h1{color:#16a34a;font-size:2rem}p{color:#374151;font-size:1.1rem}</style></head>
<body><h1>✅ התשלום בוצע בהצלחה!</h1>
<p>ההזמנה שלך התקבלה.<br>תקבל אישור ב-WhatsApp עוד רגע.</p>
<p style="margin-top:40px;color:#6b7280;font-size:.9rem">ניתן לסגור חלון זה.</p>
</body></html>`);
});

router.get('/failed', (_req, res) => {
  res.send(`<!doctype html><html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>תשלום נכשל</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px;background:#fef2f2}
h1{color:#dc2626;font-size:2rem}p{color:#374151;font-size:1.1rem}</style></head>
<body><h1>❌ התשלום לא הצליח</h1>
<p>אנא חזור ל-WhatsApp ונסה שוב,<br>או צור קשר איתנו ישירות.</p>
<p style="margin-top:40px;color:#6b7280;font-size:.9rem">ניתן לסגור חלון זה.</p>
</body></html>`);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function notifyPaymentFailed(pending) {
  const msg = '❌ התשלום לא הצליח. אנא נסה שוב דרך WhatsApp.';
  await sendMessage(pending.phone, msg).catch(() => {});
}

module.exports = router;
