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

/** Save or update a push subscription */
async function saveSubscription(subscription, userAgent = '', tenantId = DEFAULT_TENANT_ID) {
  const { endpoint, keys: { p256dh, auth } } = subscription;
  const db = supabase();
  const { error } = await db.from('push_subscriptions').upsert(
    { endpoint, p256dh, auth, user_agent: userAgent, tenant_id: tenantId },
    { onConflict: 'endpoint' }
  );
  if (error) throw new Error(error.message);
}

/** Remove a push subscription (browser unsubscribed or expired) */
async function removeSubscription(endpoint) {
  await supabase().from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/** Send a push to subscribed dashboard browsers for this tenant */
async function notifyNewOrder(order) {
  configure();
  if (!configured) return;

  const tenantId = order.tenant_id || DEFAULT_TENANT_ID;
  const { data: subs } = await supabase().from('push_subscriptions').select('*').eq('tenant_id', tenantId);
  if (!subs || !subs.length) return;

  const payload = JSON.stringify({
    title:   `🍕 הזמנה #${order.order_number || 'חדשה'}`,
    body:    `${order.customer_name || 'לקוח'} — ${order.total_price ? order.total_price + '₪' : ''}`,
    orderId: order.id || '',
  });

  const dead = [];
  await Promise.allSettled(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 60 }
      );
    } catch (err) {
      // 404 / 410 = subscription expired → clean up
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      else console.error('[push] send error:', err.message);
    }
  }));

  for (const ep of dead) await removeSubscription(ep);
  console.log(`[push] notified ${subs.length - dead.length}/${subs.length} subscribers for order ${order.order_number}`);
}

module.exports = { saveSubscription, removeSubscription, notifyNewOrder };
