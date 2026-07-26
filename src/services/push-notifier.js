'use strict';

const webpush  = require('web-push');
const { createClient } = require('@supabase/supabase-js');

let configured = false;

function configure() {
  if (configured) return;
  const pub   = process.env.VAPID_PUBLIC_KEY;
  const priv  = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'mailto:admin@jasell.com';
  if (!pub || !priv) {
    console.warn('[push] VAPID keys not set — push notifications disabled');
    return;
  }
  webpush.setVapidDetails(email, pub, priv);
  configured = true;
}

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

/**
 * Save or update a push subscription.
 * `username` is what makes a subscription revocable: without an owner, a device
 * that once logged in keeps receiving every order — customer name and total —
 * with no way to stop it short of hand-written SQL.
 */
async function saveSubscription(subscription, userAgent = '', tenantId = DEFAULT_TENANT_ID, username = null) {
  const { endpoint, keys: { p256dh, auth } } = subscription;
  const db = supabase();
  const { error } = await db.from('push_subscriptions').upsert(
    { endpoint, p256dh, auth, user_agent: userAgent, tenant_id: tenantId, username },
    { onConflict: 'endpoint' }
  );
  if (error) throw new Error(error.message);
}

/** Remove a push subscription (browser unsubscribed or expired) */
async function removeSubscription(endpoint) {
  await supabase().from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/** Subscriptions for a tenant — the revocation list shown in settings. */
async function listSubscriptions(tenantId = DEFAULT_TENANT_ID) {
  const { data, error } = await supabase()
    .from('push_subscriptions')
    .select('id, username, user_agent, created_at, last_ok_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) { console.error('[push] listSubscriptions:', error.message); return []; }
  return data || [];
}

/** Revoke one subscription by id, scoped to the caller's tenant. */
async function revokeSubscription(id, tenantId = DEFAULT_TENANT_ID) {
  const { data, error } = await supabase()
    .from('push_subscriptions')
    .delete().eq('id', id).eq('tenant_id', tenantId)
    .select('id');
  if (error) throw new Error(error.message);
  return (data || []).length > 0;
}

/** Send a push to subscribed dashboard browsers for this tenant */
async function notifyNewOrder(order) {
  configure();
  if (!configured) return;

  const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
  const db = supabase();
  const { data: subs, error } = await db.from('push_subscriptions').select('*').eq('tenant_id', tenantId);
  // The error used to be discarded, so push could be entirely dead with no signal.
  if (error) { console.error('[push] subscription lookup failed:', error.message); return; }
  if (!subs || !subs.length) return;

  const payload = JSON.stringify({
    title:   `🍕 הזמנה #${order.order_number || 'חדשה'}`,
    body:    `${order.customer_name || 'לקוח'} — ${order.total_price ? order.total_price + '₪' : ''}`,
    orderId: order.id || '',
  });

  const dead = [];
  let delivered = 0;
  await Promise.allSettled(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 60 }
      );
      delivered++;
      db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() })
        .eq('endpoint', sub.endpoint).then(() => {}, () => {});
    } catch (err) {
      // 404/410 = the browser dropped it. 403 VapidPkHashMismatch = signed with
      // a retired VAPID key (the 2026-07 rotation left a table full of these);
      // both are permanently dead and were previously counted as successes.
      if ([404, 410, 403].includes(err.statusCode)) dead.push(sub.endpoint);
      else console.error('[push] send error:', err.message);
    }
  }));

  for (const ep of dead) await removeSubscription(ep);
  console.log(`[push] delivered ${delivered}/${subs.length} for order ${order.order_number}` +
              (dead.length ? ` (${dead.length} dead subscription(s) removed)` : ''));
  if (!delivered && subs.length) {
    console.warn(`[push] tenant ${tenantId} has ${subs.length} subscription(s) and none could be delivered`);
  }
}

module.exports = {
  saveSubscription, removeSubscription, listSubscriptions, revokeSubscription, notifyNewOrder,
};
