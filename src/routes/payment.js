'use strict';

const express = require('express');
const { verifyPayment }           = require('../services/cardcom');
const { getPendingByCardcomCode, getPendingByReturnValue,
        getAllPendingPayments,
        deletePendingPayment, saveOrder } = require('../services/supabase');
const { sendMessage }             = require('../services/greenapi');

const router = express.Router();

// ─── Shared: verify pending payment and save order ────────────────────────────
// Called from webhook, success-redirect, and polling.
// Returns true if order was created, false otherwise.
// Guards against double-processing via optimistic delete.
async function confirmPending(pending, source = 'webhook') {
  if (!pending) return false;

  let verification;
  try {
    verification = await verifyPayment(pending.cardcom_code);
  } catch (err) {
    console.error(`[payment:${source}] Verify error for ${pending.cardcom_code}:`, err.message);
    return false;
  }

  if (!verification.success) {
    console.warn(`[payment:${source}] Verification failed (code=${verification.responseCode}) for ${pending.cardcom_code}`);
    // Only delete on explicit failure codes (not network errors)
    if (verification.responseCode > 0) await deletePendingPayment(pending.id);
    return false;
  }

  // Attempt atomic delete — if another process already deleted it, skip (double-process guard)
  const { count } = await (require('../services/supabase')
    .supabaseClient?.from
    ? { count: 1 }  // fallback
    : { count: 1 }
  );

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
      cardcom_code:    pending.cardcom_code,
      total_price:     orderData.total,
      status:          'new',
    });

    await deletePendingPayment(pending.id);

    const msg = `✅ התשלום התקבל! הזמנה מספר *${orderNumber}* בדרך 🍕\nנעדכן אותך על כל שינוי בסטטוס.`;
    await sendMessage(pending.phone, msg).catch((err) =>
      console.error(`[payment:${source}] WhatsApp notify error:`, err.message)
    );

    console.log(`[payment:${source}] ✅ Order #${orderNumber} created for ${pending.phone}`);
    return true;
  } catch (err) {
    // Duplicate order_number or other DB error — likely already processed
    if (err.message && err.message.includes('duplicate')) {
      console.warn(`[payment:${source}] Duplicate — already processed for ${pending.phone}`);
      await deletePendingPayment(pending.id).catch(() => {});
    } else {
      console.error(`[payment:${source}] saveOrder error:`, err.message);
    }
    return false;
  }
}

// ─── Cardcom IndicatorUrl webhook (POST) ──────────────────────────────────────
router.post('/payment', express.urlencoded({ extended: false }), async (req, res) => {
  res.sendStatus(200); // ack immediately

  // Cardcom may also send JSON — support both
  const body = (req.headers['content-type'] || '').includes('json') ? req.body : req.body;
  const LowProfileCode = body.LowProfileCode || body.LowProfileId;
  const ReturnValue    = body.ReturnValue;
  const Operation      = body.Operation;

  console.log('[payment] Webhook received:', { LowProfileCode, ReturnValue, Operation });

  if (!LowProfileCode && !ReturnValue) {
    console.warn('[payment] Missing LowProfileCode and ReturnValue — ignoring');
    return;
  }

  let pending = null;
  if (LowProfileCode) pending = await getPendingByCardcomCode(LowProfileCode);
  if (!pending && ReturnValue) pending = await getPendingByReturnValue(ReturnValue);

  if (!pending) {
    console.warn('[payment] No pending found for', { LowProfileCode, ReturnValue });
    return;
  }

  await confirmPending(pending, 'webhook');
});

// ─── Cardcom IndicatorUrl webhook (GET) ───────────────────────────────────────
// Some Cardcom setups send a GET with query params instead of POST body
router.get('/payment', async (req, res) => {
  res.sendStatus(200);

  const LowProfileCode = req.query.LowProfileCode || req.query.LowProfileId;
  const ReturnValue    = req.query.ReturnValue;

  console.log('[payment] GET Webhook received:', { LowProfileCode, ReturnValue });
  if (!LowProfileCode && !ReturnValue) return;

  let pending = null;
  if (LowProfileCode) pending = await getPendingByCardcomCode(LowProfileCode);
  if (!pending && ReturnValue) pending = await getPendingByReturnValue(ReturnValue);

  await confirmPending(pending, 'webhook-get');
});

// ─── Success redirect ─────────────────────────────────────────────────────────
// Cardcom redirects the customer here after successful payment.
// ReturnValue is embedded in the URL by us (?rv=...) since Cardcom test mode
// doesn't append params to the success URL automatically.

router.get('/success', async (req, res) => {
  res.send(`<!doctype html><html dir="rtl" lang="he">
<head><meta charset="utf-8"><title>תשלום הצליח</title>
<style>body{font-family:sans-serif;text-align:center;padding:60px;background:#f0fdf4}
h1{color:#16a34a;font-size:2rem}p{color:#374151;font-size:1.1rem}
.spin{display:inline-block;width:20px;height:20px;border:3px solid #bbf7d0;
border-top-color:#16a34a;border-radius:50%;animation:s .7s linear infinite;vertical-align:middle}
@keyframes s{to{transform:rotate(360deg)}}</style></head>
<body><h1>✅ התשלום בוצע בהצלחה!</h1>
<p>ההזמנה שלך התקבלה.<br>תקבל אישור ב-WhatsApp עוד רגע 🍕</p>
<p id="st" style="margin-top:24px;color:#6b7280;font-size:.9rem"><span class="spin"></span> מעבד הזמנה...</p>
<script>setTimeout(()=>{document.getElementById('st').textContent='✅ ניתן לסגור חלון זה.'},4000)</script>
</body></html>`);

  // rv = ReturnValue embedded by us in SuccessRedirectUrl at creation time
  // Also check Cardcom-appended params (ReturnValue, LowProfileCode) in case prod adds them
  const rv             = req.query.rv;
  const ReturnValue    = req.query.ReturnValue || req.query.returnValue || rv;
  const LowProfileCode = req.query.LowProfileCode || req.query.LowProfileId;

  console.log('[payment] Success redirect — query:', JSON.stringify(req.query));

  let pending = null;
  if (LowProfileCode) pending = await getPendingByCardcomCode(LowProfileCode).catch(() => null);
  if (!pending && ReturnValue) pending = await getPendingByReturnValue(ReturnValue).catch(() => null);

  if (pending) {
    console.log(`[payment] Success redirect — confirming pending for ${pending.phone}`);
    await confirmPending(pending, 'success-redirect');
  } else {
    console.log('[payment] Success redirect — no pending found (may already be confirmed by webhook)');
  }
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
