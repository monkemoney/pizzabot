'use strict';

const express = require('express');
const { getPendingByCardcomCode, getPendingByReturnValue,
        getAllPendingPayments, getOrderByCardcomCode, updateOrder,
        deletePendingPayment, saveOrder } = require('../services/supabase');
const { sendMessage }             = require('../services/greenapi');
const { readCallbackOutcome }     = require('../services/cardcom');
const vendorAlerts                = require('../services/vendor-alerts');

const router = express.Router();

// ─── Confirming a Cardcom payment ─────────────────────────────────────────────
//
// Two callers with very different trust levels:
//
//   webhook (IndicatorUrl)  — server-to-server, carries the response code and
//                             the deal number. This is the ONLY thing that can
//                             mark an order paid.
//   success-redirect        — the customer's own browser hitting a URL they
//                             hold. It proves nothing about payment (anyone
//                             holding the link can open it without paying), so
//                             it records the order as awaiting verification.
//
// Order creation is idempotent on orders.cardcom_code (partial UNIQUE index):
// whichever path arrives first creates the row, and a later verified webhook
// upgrades it to paid instead of creating a second one.

// Customer-facing payment messages, in the same {he,en} shape status-notifier
// uses, resolved through order-state's single customerLang().
//
// This file had no language branch at all: every customer, American included,
// was told in Hebrew that their card was declined. status-notifier had carried
// both languages all along — the payment route simply never asked which one.
const PAY_MSG = {
  declined: {
    he: '❌ התשלום לא אושר על ידי חברת האשראי. אפשר לנסות שוב או לבחור אמצעי תשלום אחר.',
    en: '❌ Your card issuer did not approve the payment. You can try again or choose another payment method.',
  },
  paidManual: {
    he: (n) => `✅ התשלום התקבל! הזמנה מספר *${n}* נשלחה למסעדה לאישור 🍕\nנעדכן אותך ברגע שההזמנה תאושר ותיכנס להכנה.`,
    en: (n) => `✅ Payment received! Order *${n}* has been sent to the restaurant for approval 🍕\nWe'll let you know the moment it is approved and goes into preparation.`,
  },
  paidAuto: {
    he: (n) => `✅ התשלום התקבל! (הזמנה מספר *${n}*)`,
    en: (n) => `✅ Payment received! (Order *${n}*)`,
  },
  recorded: {
    he: (n) => `📝 הזמנה מספר *${n}* התקבלה!\nאנחנו מאמתים את התשלום מול חברת האשראי ונעדכן אותך מיד כשיאושר.`,
    en: (n) => `📝 Order *${n}* received!\nWe are verifying the payment with your card issuer and will update you as soon as it clears.`,
  },
};

function payText(key, lang, orderNumber) {
  const m = PAY_MSG[key][lang] || PAY_MSG[key].he;
  return typeof m === 'function' ? m(orderNumber) : m;
}

function orderPayloadFrom(pending, { verified, dealNumber }) {
  const orderData = pending.order_data || {};
  return {
    phone:                pending.phone,
    customer_name:        orderData.customer_name   || null,
    customer_phone:       orderData.customer_phone  || null,
    items:                orderData.items           || [],
    delivery_method:      orderData.delivery_method,
    address:              orderData.address         || null,
    delivery_fee:         orderData.delivery_fee ?? null,
    tax_rate:             orderData.tax_rate   ?? null,
    tax_amount:           orderData.tax_amount ?? null,
    tip_amount:           orderData.tip_amount ?? null,
    tip_pct:              orderData.tip_pct ?? null,
    notes:                orderData.notes           || null,
    payment_method:       'credit',
    payment_status:       verified ? 'paid' : 'pending',
    payment_verified_at:  verified ? new Date().toISOString() : null,
    cardcom_code:         pending.cardcom_code,
    cardcom_deal_number:  dealNumber || null,
    total_price:          orderData.total,
    status:               'new',
    tenant_id:            pending.tenant_id || orderData.tenant_id || process.env.TENANT_ID,
  };
}

/**
 * @param {object}  pending      pending_payments row
 * @param {string}  source       'webhook' | 'webhook-get' | 'success-redirect'
 * @param {object}  outcome      readCallbackOutcome() result; null for the redirect
 * @returns {Promise<boolean>}   true when an order exists at the end
 */
async function confirmPending(pending, source = 'webhook', outcome = null) {
  if (!pending) return false;

  const tenantId   = pending.tenant_id || pending.order_data?.tenant_id || null;
  const expected   = parseFloat(pending.order_data?.total);
  const dealNumber = outcome?.dealNumber || null;
  // Resolved once, here: the decline path needs it as much as the success path.
  const lang = await require('../services/order-state')
    .customerLang(pending.phone, tenantId).catch(() => 'he');

  // ── A callback that reports failure must never produce a paid order ────────
  if (outcome && outcome.hasCode && !outcome.success) {
    console.warn(`[payment:${source}] declined (code=${outcome.responseCode} ${outcome.description}) for ${pending.cardcom_code}`);
    await deletePendingPayment(pending.id).catch(() => {});
    await sendMessage(pending.phone, payText('declined', lang), tenantId).catch(() => {});
    return false;
  }

  // ── Charged amount must match what we asked for ───────────────────────────
  let verified = !!(outcome && outcome.success);
  if (verified && outcome.amount !== null && Number.isFinite(expected)
      && Math.abs(outcome.amount - expected) > 0.01) {
    console.error(`[payment:${source}] AMOUNT MISMATCH for ${pending.cardcom_code}: charged ${outcome.amount}, expected ${expected}`);
    vendorAlerts.alerts.paymentMismatch(pending.phone, outcome.amount, expected).catch(() => {});
    verified = false; // record it, but do not call it paid
  }

  // ── Already have an order for this payment? Upgrade, never duplicate ───────
  const existing = await getOrderByCardcomCode(pending.cardcom_code).catch(() => null);
  if (existing) {
    if (verified && existing.payment_status !== 'paid') {
      const { confirmPayment } = require('../services/order-state');
      await updateOrder(existing.id, {
        cardcom_deal_number: dealNumber || existing.cardcom_deal_number || null,
        payment_verified_at: new Date().toISOString(),
      }).catch(() => {});
      await confirmPayment(existing.id, { by: `cardcom-${source}` }).catch((err) =>
        console.error(`[payment:${source}] upgrade error:`, err.message));
      console.log(`[payment:${source}] order #${existing.order_number} verified as paid`);
    } else {
      console.log(`[payment:${source}] order #${existing.order_number} already recorded — ignoring duplicate callback`);
    }
    await deletePendingPayment(pending.id).catch(() => {});
    return true;
  }

  // ── Create the order ──────────────────────────────────────────────────────
  try {
    const { orderNumber, order: savedOrder } =
      await saveOrder(orderPayloadFrom(pending, { verified, dealNumber }));

    await deletePendingPayment(pending.id);

    const orderState = require('../services/order-state');
    let msg;
    if (verified) {
      // Acceptance flow: auto → afterCreate accepts and sends the approval/ETA
      // message itself; manual → tell the customer it awaits approval.
      const mode = await orderState.afterCreate(savedOrder, { notifyAdmins: true }).catch(() => 'manual');
      msg = payText(mode === 'manual' ? 'paidManual' : 'paidAuto', lang, orderNumber);
    } else {
      // Unverified: the order is recorded so nothing is lost, but it is not
      // paid until Cardcom confirms — the business sees it as awaiting payment.
      await orderState.notifyAdminsNewOrder(savedOrder).catch(() => {});
      msg = payText('recorded', lang, orderNumber);
    }

    await sendMessage(pending.phone, msg, tenantId).catch((err) =>
      console.error(`[payment:${source}] WhatsApp notify error:`, err.message)
    );

    console.log(`[payment:${source}] order #${orderNumber} created (${verified ? 'paid' : 'awaiting verification'}) for ${pending.phone}`);
    return true;
  } catch (err) {
    // The partial UNIQUE index on cardcom_code is the idempotency key: a
    // concurrent caller won the race, which is a success, not an error.
    if (/duplicate|unique/i.test(err.message || '')) {
      console.warn(`[payment:${source}] concurrent confirmation for ${pending.cardcom_code} — order already exists`);
      await deletePendingPayment(pending.id).catch(() => {});
      return true;
    }
    console.error(`[payment:${source}] saveOrder error:`, err.message);
    return false;
  }
}

// ─── Cardcom IndicatorUrl webhook (POST) ──────────────────────────────────────
// A callback with no matching pending is the pay-after-expiry case (money may
// have moved with nothing to attach it to) — never a silent console.warn.
async function reportOrphanCallback(source, ids, outcome) {
  const paid = !outcome || outcome.success;
  console.warn(`[payment:${source}] no pending found for`, ids, outcome ? `code=${outcome.responseCode}` : '');
  if (!paid) return;
  await vendorAlerts.alerts.orphanPayment(JSON.stringify(ids), outcome?.amount ?? null).catch(() => {});
}

async function findPending({ LowProfileCode, ReturnValue }) {
  let pending = null;
  if (LowProfileCode) pending = await getPendingByCardcomCode(LowProfileCode).catch(() => null);
  if (!pending && ReturnValue) pending = await getPendingByReturnValue(ReturnValue).catch(() => null);
  return pending;
}

router.post('/payment', express.urlencoded({ extended: false }), async (req, res) => {
  res.sendStatus(200); // ack immediately

  const body = req.body || {};
  const LowProfileCode = body.LowProfileCode || body.LowProfileId;
  const ReturnValue    = body.ReturnValue;
  const outcome        = readCallbackOutcome(body);

  console.log('[payment] webhook:', { LowProfileCode, ReturnValue, code: outcome.responseCode, amount: outcome.amount, deal: outcome.dealNumber });

  if (!LowProfileCode && !ReturnValue) {
    console.warn('[payment] missing LowProfileCode and ReturnValue — ignoring');
    return;
  }

  const pending = await findPending({ LowProfileCode, ReturnValue });
  if (!pending) return reportOrphanCallback('webhook', { LowProfileCode, ReturnValue }, outcome);

  await confirmPending(pending, 'webhook', outcome);
});

// ─── Cardcom IndicatorUrl webhook (GET) ───────────────────────────────────────
// Some Cardcom setups send a GET with query params instead of POST body
router.get('/payment', async (req, res) => {
  res.sendStatus(200);

  const LowProfileCode = req.query.LowProfileCode || req.query.LowProfileId;
  const ReturnValue    = req.query.ReturnValue;
  const outcome        = readCallbackOutcome(req.query);

  console.log('[payment] GET webhook:', { LowProfileCode, ReturnValue, code: outcome.responseCode });
  if (!LowProfileCode && !ReturnValue) return;

  const pending = await findPending({ LowProfileCode, ReturnValue });
  if (!pending) return reportOrphanCallback('webhook-get', { LowProfileCode, ReturnValue }, outcome);

  await confirmPending(pending, 'webhook-get', outcome);
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
<body><h1>✅ ההזמנה התקבלה!</h1>
<p>אנחנו מאמתים את התשלום מול חברת האשראי.<br>אישור סופי יגיע אליך ב-WhatsApp 🍕</p>
<p id="st" style="margin-top:24px;color:#6b7280;font-size:.9rem"><span class="spin"></span> מעבד הזמנה...</p>
<script>setTimeout(()=>{document.getElementById('st').textContent='✅ ניתן לסגור חלון זה.'},4000)</script>
</body></html>`);

  // rv = ReturnValue embedded by us in SuccessRedirectUrl at creation time
  // Also check Cardcom-appended params (ReturnValue, LowProfileCode) in case prod adds them
  const rv             = req.query.rv;
  const ReturnValue    = req.query.ReturnValue || req.query.returnValue || rv;
  const LowProfileCode = req.query.LowProfileCode || req.query.LowProfileId;

  console.log('[payment] success redirect — query:', JSON.stringify(req.query));

  // This is the customer's browser, not Cardcom: reaching this URL proves only
  // that they hold the link. It records the order so nothing is lost, marked
  // awaiting verification — only the IndicatorUrl webhook can mark it paid.
  const pending = await findPending({ LowProfileCode, ReturnValue });
  if (pending) {
    await confirmPending(pending, 'success-redirect', null);
  } else {
    console.log('[payment] success redirect — no pending (already confirmed by webhook, or expired)');
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

module.exports = router;
