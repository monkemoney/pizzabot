'use strict';

const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const bcrypt     = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { signDashboard, requireAuth, requireAdmin, requireVendor, requireKitchenOrAdmin, DEFAULT_TENANT_ID } = require('../middleware/auth');
const sse = require('../services/sse');
const { cancelDeal } = require('../services/cardcom');
const { getOrders, getOrderById, updateOrderStatus, updateOrder, updateSession,
        getInboxSessions, setBotActive, markInboxRead } = require('../services/supabase');
const { notifyStatusChange }              = require('../services/status-notifier');
const orderState                          = require('../services/order-state');
const settings                            = require('../services/settings');
const { invalidateCache }                 = require('../services/menu-service');
const { sendMessage }                     = require('../services/greenapi');

const router       = express.Router();
const supabase     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const pushNotifier = require('../services/push-notifier');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות התחברות, נסה שוב בעוד 15 דקות' },
});

const onboardingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות, נסה שוב מאוחר יותר' },
});

// Shorthand: tenant_id from JWT
const tid = (req) => req.user?.tenant_id;

// Guard: verify a fetched row belongs to the requesting tenant
function assertTenant(row, req) {
  if (!row) return false;
  if (row.tenant_id && row.tenant_id !== tid(req)) return false;
  return true;
}

// multer — memory storage, 5 MB limit, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('סוג קובץ לא נתמך'), ok);
  },
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  // 1. Vendor / default-tenant accounts (env vars)
  const builtIn = {
    admin:   { password: process.env.DASHBOARD_ADMIN_PASSWORD,   role: 'admin'   },
    manager: { password: process.env.DASHBOARD_MANAGER_PASSWORD, role: 'manager' },
    vendor:  { password: process.env.DASHBOARD_VENDOR_PASSWORD,  role: 'vendor'  },
  };

  const builtInUser = builtIn[username];
  if (builtInUser && builtInUser.password === password) {
    const token = signDashboard(username, builtInUser.role, DEFAULT_TENANT_ID);
    return res.json({ token, role: builtInUser.role, username });
  }

  // 2. Per-tenant users stored in tenant_users table
  const { data: tenantUser, error } = await supabase
    .from('tenant_users')
    .select('*')
    .eq('username', username)
    .single();

  if (!error && tenantUser && await bcrypt.compare(password, tenantUser.password)) {
    const token = signDashboard(username, tenantUser.role, tenantUser.tenant_id);
    return res.json({ token, role: tenantUser.role, username });
  }

  return res.status(401).json({ error: 'שם משתמש או סיסמא שגויים' });
});

// ─── Orders ───────────────────────────────────────────────────────────────────

router.get('/orders', requireAuth, async (req, res) => {
  try {
    // The delivered→done sweep runs on its own hourly schedule (index.js) —
    // it used to run here too, i.e. twice a minute per open dashboard.

    let query = supabase.from('orders').select('*')
      .eq('tenant_id', tid(req))
      .order('created_at', { ascending: false });

    const { status, date_from, date_to } = req.query;
    if (status && status !== 'all') query = query.eq('status', status);
    if (date_from) query = query.gte('created_at', new Date(date_from).toISOString());
    if (date_to) {
      const end = new Date(date_to);
      end.setDate(end.getDate() + 1);
      query = query.lt('created_at', end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json({ orders: data, count: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await getOrderById(req.params.id);
  if (!order || !assertTenant(order, req)) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

const STATUS_ORDER = orderState.STATUSES;

router.patch('/orders/:id/status', requireAuth, async (req, res) => {
  const { status, force = false } = req.body;
  if (!STATUS_ORDER.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Valid: ${STATUS_ORDER.join(', ')}` });
  }
  try {
    const existing = await getOrderById(req.params.id);
    if (!assertTenant(existing, req)) return res.status(404).json({ error: 'Not found' });
    // force=true — explicit staff override from the dashboard status select;
    // kitchen buttons and programmatic callers stay strict.
    const { order, changed } = await orderState.transition(req.params.id, status, {
      force: !!force,
      by: req.user.role || 'dashboard',
      notify: true,
    });
    if (!changed) return res.json({ success: true, order, unchanged: true });
    res.json({ success: true, order });
  } catch (err) {
    if (err.code === 'ORDER_NOT_FOUND')     return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION' || err.code === 'CONFLICT')
      return res.status(409).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message });
  }
});

// ─── Accept order (business approves — new/scheduled → preparing) ────────────

router.post('/orders/:id/accept', requireAuth, async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id);
    if (!existing || !assertTenant(existing, req)) return res.status(404).json({ error: 'הזמנה לא נמצאה' });

    const prep = parseInt(req.body?.prep_minutes, 10);
    const order = await orderState.accept(req.params.id, {
      prepMinutes: Number.isFinite(prep) && prep > 0 ? prep : await orderState.getDefaultPrepMinutes(tid(req)),
      by: req.user.role || 'dashboard',
    });
    res.json({ success: true, order });
  } catch (err) {
    if (err.code === 'ORDER_NOT_FOUND')     return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_TRANSITION' || err.code === 'CONFLICT')
      return res.status(409).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message });
  }
});

// Full order edit (items, address, notes, destination_type, courier_notes)
router.put('/orders/:id', requireAdmin, async (req, res) => {
  const existing = await getOrderById(req.params.id);
  if (!assertTenant(existing, req)) return res.status(404).json({ error: 'Not found' });

  const allowed = ['items','address','notes','destination_type','courier_notes',
                   'delivery_method','total_price'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('orders')
    .update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ─── Cancel + Refund (dispute) ───────────────────────────────────────────────

router.post('/orders/:id/cancel-refund', requireAdmin, async (req, res) => {
  const { reason = '', cancelled_by = 'business', send_to_customer = true, custom_message = '' } = req.body;

  const order = await getOrderById(req.params.id);
  if (!order || !assertTenant(order, req)) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'ההזמנה כבר בוטלה' });

  const isCreditPaid = order.payment_method === 'credit' && order.payment_status === 'paid';
  let refundStatus  = null;
  let refundMessage = '';

  // ── Try Cardcom refund if we have a deal number ──────────────────────────────
  if (isCreditPaid) {
    const { success, message } = await cancelDeal(order.cardcom_deal_number, order.tenant_id);
    if (success) {
      refundStatus  = 'refunded';
      refundMessage = message;
      console.log(`[refund] Cardcom refund OK for order #${order.order_number}`);
    } else {
      refundStatus  = 'manual';
      refundMessage = order.cardcom_deal_number
        ? `${message} — נדרש זיכוי ידני`
        : `אין מספר עסקה — נדרש זיכוי ידני דרך לוח Cardcom: ₪${order.total_price}`;
      console.warn(`[refund] Cardcom refund failed for order #${order.order_number}:`, message);
    }
  }

  // ── Cancel order via the state machine (SSE + status_history included) ──────
  try {
    await orderState.transition(order.id, 'cancelled', {
      force:  true,               // staff cancellation is allowed from any active status
      by:     req.user.role || 'dashboard',
      notify: false,              // custom WhatsApp message below
      extra:  { cancelled_by, cancel_reason: reason || null, refund_status: refundStatus },
    });
  } catch (err) {
    if (err.code === 'CONFLICT') return res.status(409).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }

  // ── Notify customer via WhatsApp ─────────────────────────────────────────────
  const refundLine = isCreditPaid
    ? (refundStatus === 'refunded'
        ? '\nהתשלום יזוכה לכרטיסך תוך 3-5 ימי עסקים.'
        : '\nנחזור אליך בנוגע להחזר התשלום.')
    : '';

  // Use custom_message if the business owner edited the preview, otherwise build default
  let customerMsg;
  if (custom_message) {
    customerMsg = custom_message;
  } else {
    const byLine     = cancelled_by === 'customer' ? 'בוטלה לפי בקשתך.' : 'בוטלה על ידי העסק.';
    const reasonLine = (reason && send_to_customer) ? `\nסיבה: ${reason}` : '';
    customerMsg =
      `❌ הזמנה מספר *${order.order_number}* ${byLine}` +
      reasonLine +
      refundLine +
      `\n\nמצטערים על אי הנוחות 🙏`;
  }

  await sendMessage(order.phone, customerMsg, tid(req)).catch((err) =>
    console.error('[refund] WhatsApp notify failed:', err.message)
  );

  console.log(`[refund] Order #${order.order_number} cancelled by business. refundStatus=${refundStatus}`);

  res.json({
    success:       true,
    refundStatus,
    refundMessage: refundMessage || (order.payment_method === 'cash' ? 'הזמנה בוטלה (מזומן — אין זיכוי)' : ''),
    orderNumber:   order.order_number,
  });
});

// ─── Confirm Bit/Cash Payment ─────────────────────────────────────────────────

router.post('/orders/:id/confirm-payment', requireAdmin, async (req, res) => {
  const order = await getOrderById(req.params.id);
  if (!order || !assertTenant(order, req)) return res.status(404).json({ error: 'הזמנה לא נמצאה' });

  try {
    // Single path (shared with the admin bot and the WhatsApp button): marks
    // paid, broadcasts SSE, notifies the customer, and in auto-acceptance
    // tenants releases the Bit order whose accept was deferred until payment.
    const { order: paidOrder, changed } = await orderState.confirmPayment(order.id, {
      by: req.user.role || 'dashboard',
    });
    if (!changed) return res.status(400).json({ error: 'ההזמנה כבר שולמה' });
    res.json({ success: true, order: paidOrder });
  } catch (err) {
    if (err.code === 'ORDER_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Item Dispute ─────────────────────────────────────────────────────────────

router.post('/orders/:id/item-dispute', requireAdmin, async (req, res) => {
  // disputes = [{ type:'item'|'topping', name, price, qty, item_name? }]
  const { disputes, item_name, item_price } = req.body;

  // Support both old single-item and new multi format
  const items = disputes && disputes.length ? disputes : (item_name ? [{ type: 'item', name: item_name, price: parseFloat(item_price) || 0, qty: 1 }] : []);
  if (!items.length) return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });

  const order = await getOrderById(req.params.id);
  if (!order || !assertTenant(order, req)) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
  if (['cancelled', 'done'].includes(order.status))
    return res.status(400).json({ error: 'לא ניתן לפתוח מחלוקת על הזמנה זו' });
  if (order.dispute_status === 'pending')
    return res.status(400).json({ error: 'כבר קיימת מחלוקת פתוחה להזמנה זו' });

  const isSingle = items.length === 1;
  const refund   = items.reduce((s, d) => s + (d.price || 0) * (d.qty || 1), 0);

  // Mark order
  const { data: disputedOrder, error: orderErr } = await supabase.from('orders').update({
    dispute_status: 'pending',
    dispute_item:   items.map(d => d.name).join(', '),
    updated_at:     new Date().toISOString(),
  }).eq('id', order.id).select('*').single();
  if (orderErr) return res.status(500).json({ error: orderErr.message });

  sse.broadcast(tid(req), 'order_updated', disputedOrder);

  // Store full context in session for bot to resolve
  await updateSession(order.phone, {
    pending_dispute: {
      order_id:     order.id,
      order_number: order.order_number,
      items,
      refund:       Math.round(refund * 100) / 100,
      created_at:   new Date().toISOString(),
    },
  }, tid(req));

  // Build WhatsApp message
  const greeting  = order.customer_name ? `שלום ${order.customer_name}! 🙏` : `שלום! 🙏`;
  const refundStr = refund > 0 ? ` (זיכוי של ₪${refund.toFixed(0)})` : '';
  const listStr   = items.map(d =>
    d.type === 'topping'
      ? `• תוספת *${d.name}* (ב${d.item_name})`
      : `• *${d.name}*${d.qty > 1 ? ` ×${d.qty}` : ''}`
  ).join('\n');

  const msg =
    `${greeting}\n\n` +
    `לצערנו, ${isSingle ? 'הפריט הבא' : 'הפריטים הבאים'} אזל${isSingle ? '' : 'ו'} במלאי:\n` +
    `${listStr}\n\n` +
    `(הזמנה מספר *${order.order_number}*)\n\n` +
    `מה תרצה לעשות?\n` +
    `*1* — לבטל את ההזמנה לגמרי\n` +
    `*2* — להמשיך ללא ${isSingle ? `*${items[0].name}*` : 'הפריטים החסרים'}${refundStr}\n` +
    `*3* — להחליף בפריט אחר (כתוב מה תרצה)\n\n` +
    `שלח את המספר המתאים 👆`;

  await sendMessage(order.phone, msg, tid(req)).catch(err =>
    console.error('[dispute] WhatsApp failed:', err.message)
  );

  console.log(`[dispute] Order #${order.order_number} — ${items.length} missing: ${items.map(d=>d.name).join(', ')}`);
  res.json({ success: true });
});

// ─── Stats (admin only) ───────────────────────────────────────────────────────

// Period boundaries, hour buckets and day keys are Israel-time — see
// services/il-time.js for why the server clock cannot be used here.
const { ilHourOf, ilDayKey, periodRange } = require('../services/il-time');


router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { period = 'today', date } = req.query;
    const { start, end } = periodRange(period, date);

    const { data: dayOrders } = await supabase
      .from('orders')
      // payment_method was missing here while the payment split filtered on it,
      // so that chart was permanently empty.
      .select('total_price, items, status, created_at, updated_at, delivery_method, payment_status, payment_method, refund_status, accepted_at')
      .eq('tenant_id', tid(req))
      .gte('created_at', start)
      .lt('created_at', end);

    const all       = dayOrders || [];
    const cancelled = all.filter((o) => o.status === 'cancelled');
    const completed = all.filter((o) => o.status !== 'cancelled');

    // Revenue is money actually received. It used to be every non-cancelled
    // order, which counted orders the business never approved, Bit orders that
    // were never paid, and refunded ones — all reported as income.
    const earned  = completed.filter((o) => o.payment_status === 'paid' && o.refund_status !== 'refunded');
    const revenue = earned.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
    const revenuePending = completed
      .filter((o) => o.payment_status !== 'paid')
      .reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
    const revenueRefunded = completed
      .filter((o) => o.refund_status === 'refunded')
      .reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);

    // Top products (with revenue)
    const productMap = {};
    for (const order of completed) {
      for (const item of order.items || []) {
        const name = item.name || item.name_he || 'Unknown';
        const qty  = item.quantity || item.qty || 1;
        if (!productMap[name]) productMap[name] = { count: 0, revenue: 0 };
        productMap[name].count   += qty;
        productMap[name].revenue += (parseFloat(item.price) || 0) * qty;
      }
    }
    const topProducts = Object.entries(productMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([name, d]) => ({ name, count: d.count, revenue: Math.round(d.revenue) }));

    // Delivery + payment splits describe the SAME set of orders the count and
    // revenue describe — over `all` they silently included cancelled orders, so
    // the donut totalled more than the order count next to it.
    const deliverySplit = {
      delivery: completed.filter(o => o.delivery_method === 'delivery').length,
      pickup:   completed.filter(o => o.delivery_method === 'pickup').length,
    };

    // Payment method split
    const paymentSplit = {
      cash:   completed.filter(o => o.payment_method === 'cash').length,
      credit: completed.filter(o => o.payment_method === 'credit').length,
      bit:    completed.filter(o => o.payment_method === 'bit').length,
    };

    // Status breakdown
    const statusBreakdown = {};
    for (const o of all) statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;

    // Hourly distribution — in Israel time, which is what the owner staffs to
    const hourlyOrders = Array(24).fill(0);
    for (const o of completed) hourlyOrders[ilHourOf(o.created_at)]++;

    // Average delivery time (created_at → delivered updated_at)
    const deliveredOrders = completed.filter((o) => o.status === 'delivered' || o.status === 'done');
    const avgDeliveryMin = deliveredOrders.length
      ? Math.round(
          deliveredOrders.reduce((sum, o) => {
            const mins = (new Date(o.updated_at) - new Date(o.created_at)) / 60000;
            return sum + mins;
          }, 0) / deliveredOrders.length
        )
      : null;

    // Payment breakdown
    const paid    = completed.filter((o) => o.payment_status === 'paid').length;
    const pending = completed.filter((o) => o.payment_status === 'pending').length;

    // Started conversations (sessions updated today)
    const { count: conversationsStarted } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid(req))
      .gte('updated_at', start)
      .lt('updated_at', end);

    const convNotConverted = Math.max(0, (conversationsStarted || 0) - completed.length);

    // Orders per day (for chart)
    const ordersByDay = {};
    for (const o of completed) {
      const day = ilDayKey(o.created_at);
      if (!ordersByDay[day]) ordersByDay[day] = { count: 0, revenue: 0 };
      ordersByDay[day].count++;
      ordersByDay[day].revenue += parseFloat(o.total_price) || 0;
    }

    res.json({
      period, start, end,
      order_count:           completed.length,
      cancelled_count:       cancelled.length,
      revenue:               Math.round(revenue * 100) / 100,
      revenue_pending:       Math.round(revenuePending * 100) / 100,
      revenue_refunded:      Math.round(revenueRefunded * 100) / 100,
      top_products:          topProducts,
      avg_delivery_minutes:  avgDeliveryMin,
      paid_count:            paid,
      pending_payment_count: pending,
      conversations_started: conversationsStarted || 0,
      not_converted:         convNotConverted,
      conversion_rate:       conversationsStarted
        ? Math.round((completed.length / conversationsStarted) * 100)
        : null,
      orders_by_day:         ordersByDay,
      delivery_split:        deliverySplit,
      payment_split:         paymentSplit,
      status_breakdown:      statusBreakdown,
      hourly_orders:         hourlyOrders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Categories ───────────────────────────────────────────────────────────────

router.get('/categories', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('categories').select('*').eq('tenant_id', tid(req)).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/categories', requireAdmin, async (req, res) => {
  const { name_he, name_en, emoji, has_toppings, sort_order } = req.body;
  const { data, error } = await supabase.from('categories')
    .insert({ name_he, name_en: name_en || name_he, emoji: emoji || '🍽️',
              has_toppings: !!has_toppings, sort_order: sort_order || 99, tenant_id: tid(req) })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache(tid(req));
  res.status(201).json(data);
});

router.patch('/categories/:id', requireAdmin, async (req, res) => {
  const updates = { ...req.body };
  delete updates.id; delete updates.created_at;
  const { data, error } = await supabase.from('categories')
    .update(updates).eq('id', req.params.id).eq('tenant_id', tid(req)).select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache(tid(req));
  res.json(data);
});

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  const { count } = await supabase.from('products').select('*', { count: 'exact', head: true })
    .eq('category_id', req.params.id).eq('tenant_id', tid(req));
  if (count > 0) return res.status(400).json({ error: `יש ${count} מוצרים בקטגוריה זו. העבר אותם קודם.` });
  const { error } = await supabase.from('categories').delete().eq('id', req.params.id).eq('tenant_id', tid(req));
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache(tid(req));
  res.json({ success: true });
});

// ─── Image upload → Supabase Storage ─────────────────────────────────────────

router.post('/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא התקבל קובץ' });

  const ext      = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  const { error } = await supabase.storage
    .from('menu-images')
    .upload(filename, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert:      false,
    });

  if (error) return res.status(500).json({ error: error.message });

  const { data: { publicUrl } } = supabase.storage
    .from('menu-images')
    .getPublicUrl(filename);

  res.json({ url: publicUrl });
});

// ─── Products ─────────────────────────────────────────────────────────────────

// GET /products — returns products grouped by category with nested additions
router.get('/products', requireAuth, async (req, res) => {
  const { data: categories, error: cErr } = await supabase
    .from('categories').select('*').eq('tenant_id', tid(req)).order('sort_order');
  if (cErr) return res.status(500).json({ error: cErr.message });

  const { data: products, error: pErr } = await supabase
    .from('products').select('*').eq('tenant_id', tid(req)).order('sort_order');
  if (pErr) return res.status(500).json({ error: pErr.message });

  // product_additions are filtered via product_id FK (products already scoped to tenant)
  const tenantProductIds = (products || []).map(p => p.id);
  const { data: additions, error: aErr } = tenantProductIds.length
    ? await supabase.from('product_additions').select('*').in('product_id', tenantProductIds).order('sort_order')
    : { data: [], error: null };
  if (aErr) return res.status(500).json({ error: aErr.message });

  const addMap = {};
  for (const a of additions) {
    if (!addMap[a.product_id]) addMap[a.product_id] = [];
    addMap[a.product_id].push(a);
  }

  const catMap = {};
  for (const cat of categories) {
    catMap[cat.id] = { ...cat, products: [] };
  }
  const uncategorized = [];
  for (const p of products) {
    const withAdditions = { ...p, additions: addMap[p.id] || [] };
    if (p.category_id && catMap[p.category_id]) {
      catMap[p.category_id].products.push(withAdditions);
    } else {
      uncategorized.push(withAdditions);
    }
  }

  const result = categories.map((c) => catMap[c.id]);
  if (uncategorized.length) result.push({ id: null, name_he: 'ללא קטגוריה', emoji: '❓', products: uncategorized });
  res.json(result);
});

router.post('/products', requireAdmin, async (req, res) => {
  const { name_he, name_en, price, category_id, sort_order, image_url, description } = req.body;
  const { data, error } = await supabase.from('products')
    .insert({ name_he, name_en: name_en || name_he, price, category_id, sort_order: sort_order || 0, image_url, description: description || null, tenant_id: tid(req) })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Toppings are global — a new dish inherits every existing topping,
  // unless it lives in the topping-addon pseudo-category.
  let newAdditions = [];
  const { data: cat } = category_id
    ? await supabase.from('categories').select('is_topping_addon').eq('id', category_id).single()
    : { data: null };
  if (!cat?.is_topping_addon) {
    const dishIds = await _dishProductIds(req);
    const { data: tops } = dishIds.length
      ? await supabase.from('product_additions')
          .select('name_he,name_en,price,is_available').in('product_id', dishIds)
      : { data: [] };
    const seen = new Map();
    for (const t of tops || []) if (!seen.has(t.name_he)) seen.set(t.name_he, t);
    const rows = [...seen.values()].map(t => ({
      product_id: data.id, name_he: t.name_he, name_en: t.name_en || t.name_he,
      price: t.price, is_available: t.is_available, sort_order: 0,
    }));
    if (rows.length) {
      const { data: inserted } = await supabase.from('product_additions').insert(rows).select();
      newAdditions = inserted || [];
    }
  }

  invalidateCache(tid(req));
  res.status(201).json({ ...data, additions: newAdditions });
});

router.patch('/products/:id', requireAdmin, async (req, res) => {
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  delete updates.id; delete updates.created_at; delete updates.additions;
  const { data, error } = await supabase.from('products')
    .update(updates).eq('id', req.params.id).eq('tenant_id', tid(req)).select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache(tid(req));
  res.json(data);
});

router.delete('/products/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('products').delete().eq('id', req.params.id).eq('tenant_id', tid(req));
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache(tid(req));
  res.json({ success: true });
});

// ─── Product Additions ────────────────────────────────────────────────────────

router.post('/products/:id/additions', requireAdmin, async (req, res) => {
  const { name_he, name_en, price, image_url, sort_order } = req.body;
  const { data, error } = await supabase.from('product_additions')
    .insert({ product_id: req.params.id, name_he, name_en, price, image_url, sort_order: sort_order || 0 })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
  res.status(201).json(data);
});

router.patch('/products/:id/additions/:addId', requireAdmin, async (req, res) => {
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  delete updates.id; delete updates.product_id; delete updates.created_at;
  const { data, error } = await supabase.from('product_additions')
    .update(updates)
    .eq('id', req.params.addId)
    .eq('product_id', req.params.id)
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
  res.json(data);
});

router.delete('/products/:id/additions/:addId', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('product_additions')
    .delete()
    .eq('id', req.params.addId)
    .eq('product_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
  res.json({ success: true });
});

// ─── Additions by name (global toppings) ─────────────────────────────────────
// A topping is a tenant-wide concept: "olives" exist or don't — never
// per-product. The rows are still stored per product (bot compatibility),
// but the dashboard manages them in bulk by name.

async function _tenantProductIds(req) {
  const { data } = await supabase.from('products').select('id').eq('tenant_id', tid(req));
  return (data || []).map(p => p.id);
}

async function _addonCategoryIds(req) {
  const { data } = await supabase.from('categories')
    .select('id').eq('tenant_id', tid(req)).eq('is_topping_addon', true);
  return (data || []).map(c => c.id);
}

// PATCH { name_he, is_available? , price? } — applies to every row with that name
router.patch('/additions/by-name', requireAdmin, async (req, res) => {
  const { name_he, is_available, price } = req.body;
  if (!name_he) return res.status(400).json({ error: 'name_he נדרש' });
  const updates = { updated_at: new Date().toISOString() };
  if (is_available !== undefined) updates.is_available = is_available;
  if (price !== undefined) updates.price = price;

  const ids = await _tenantProductIds(req);
  if (!ids.length) return res.json({ updated: 0 });
  const { data, error } = await supabase.from('product_additions')
    .update(updates).eq('name_he', name_he).in('product_id', ids).select('id');
  if (error) return res.status(400).json({ error: error.message });

  // keep the addon-category topping-products (legacy poll source) in sync
  const addonCats = await _addonCategoryIds(req);
  if (addonCats.length) {
    await supabase.from('products').update(updates)
      .eq('name_he', name_he).eq('tenant_id', tid(req)).in('category_id', addonCats);
  }

  invalidateCache(tid(req));
  res.json({ updated: (data || []).length });
});

// Dish products = everything except the topping-addon pseudo-category
async function _dishProductIds(req) {
  const { data: cats } = await supabase.from('categories')
    .select('id,is_topping_addon').eq('tenant_id', tid(req));
  const addonCatIds = new Set((cats || []).filter(c => c.is_topping_addon).map(c => c.id));
  const { data: prods } = await supabase.from('products')
    .select('id,category_id').eq('tenant_id', tid(req));
  return (prods || []).filter(p => !addonCatIds.has(p.category_id)).map(p => p.id);
}

// POST { name_he, price } — a topping is global: added to EVERY dish
router.post('/additions/by-name', requireAdmin, async (req, res) => {
  const { name_he, price } = req.body;
  if (!name_he || price === undefined) {
    return res.status(400).json({ error: 'name_he, price נדרשים' });
  }
  const ids = await _dishProductIds(req);
  if (!ids.length) return res.status(400).json({ error: 'אין מנות' });

  // skip products that already have this topping
  const { data: existing } = await supabase.from('product_additions')
    .select('product_id').eq('name_he', name_he).in('product_id', ids);
  const has = new Set((existing || []).map(e => e.product_id));
  const rows = ids.filter(id => !has.has(id)).map(id => ({
    product_id: id, name_he, name_en: name_he, price, sort_order: 0,
  }));
  if (rows.length) {
    const { error } = await supabase.from('product_additions').insert(rows);
    if (error) return res.status(400).json({ error: error.message });
  }

  // mirror as a topping-product in the addon category (legacy poll source)
  const addonCats = await _addonCategoryIds(req);
  if (addonCats.length) {
    const { data: exists } = await supabase.from('products')
      .select('id').eq('tenant_id', tid(req)).eq('name_he', name_he).in('category_id', addonCats).limit(1);
    if (!exists?.length) {
      await supabase.from('products').insert({
        name_he, name_en: name_he, price, category_id: addonCats[0], tenant_id: tid(req), sort_order: 0,
      });
    }
  }

  invalidateCache(tid(req));
  res.status(201).json({ added: rows.length });
});

// DELETE ?name_he= — removes the topping everywhere
router.delete('/additions/by-name', requireAdmin, async (req, res) => {
  const name_he = req.query.name_he;
  if (!name_he) return res.status(400).json({ error: 'name_he נדרש' });
  const ids = await _tenantProductIds(req);
  if (ids.length) {
    const { error } = await supabase.from('product_additions')
      .delete().eq('name_he', name_he).in('product_id', ids);
    if (error) return res.status(400).json({ error: error.message });
  }
  const addonCats = await _addonCategoryIds(req);
  if (addonCats.length) {
    await supabase.from('products').delete()
      .eq('name_he', name_he).eq('tenant_id', tid(req)).in('category_id', addonCats);
  }
  invalidateCache(tid(req));
  res.json({ success: true });
});

// ─── Customers ────────────────────────────────────────────────────────────────

router.get('/customers', requireAdmin, async (req, res) => {
  const { returning } = req.query;
  let query = supabase.from('customers').select('*').eq('tenant_id', tid(req)).order('last_order_at', { ascending: false });
  if (returning === '1') query = query.gte('order_count', 2);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/customers/:phone — GDPR right-to-erasure
// Deletes session (conversation history + profile) and anonymises orders for this phone.
router.delete('/customers/:phone', requireAdmin, async (req, res) => {
  const phone = req.params.phone.replace(/\D/g, '');
  const tenantId = tid(req);

  // 1. Delete session row entirely
  await supabase.from('sessions').delete()
    .eq('tenant_id', tenantId).eq('phone', phone);

  // 2. Anonymise orders — keep for legal/financial records but strip PII
  await supabase.from('orders')
    .update({ phone: 'deleted', customer_name: '[deleted]', address: '[deleted]', notes: null })
    .eq('tenant_id', tenantId).eq('phone', phone);

  console.log(`[gdpr] erasure complete for ${phone} (tenant ${tenantId})`);
  res.json({ success: true });
});

// Commercial messaging, so two things are non-negotiable: recipients who asked
// to be left alone are suppressed, and every message carries a way out. The
// failures are reported per recipient too — a bare count gave the operator no
// way to tell a rejected send from a wrong number, and nothing to retry with.
const OPT_OUT_FOOTER = '\n\n_להסרה מרשימת הדיוור השב *הסר*_';

router.post('/customers/broadcast', requireAdmin, async (req, res) => {
  const { phones, message } = req.body;
  if (!Array.isArray(phones) || !message) {
    return res.status(400).json({ error: 'phones (array) and message required' });
  }
  if (phones.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 recipients per broadcast' });
  }

  const { getOptedOutPhones } = require('../services/supabase');
  const normalised = phones.map((p) => String(p).replace(/\D/g, '')).filter(Boolean);
  const optedOut = await getOptedOutPhones(normalised, tid(req));
  const recipients = normalised.filter((p) => !optedOut.has(p));

  const body = message.includes('הסר') ? message : message + OPT_OUT_FOOTER;

  const results = { sent: 0, failed: 0, skipped: optedOut.size, failures: [] };
  for (const phone of recipients) {
    try {
      await sendMessage(phone, body, tid(req));
      results.sent++;
      await new Promise((r) => setTimeout(r, 300)); // gentle rate limiting
    } catch (err) {
      results.failed++;
      results.failures.push({ phone, error: (err.message || 'send failed').slice(0, 120) });
    }
  }

  console.log(`[broadcast] tenant ${tid(req)}: sent=${results.sent} failed=${results.failed} skipped(opted-out)=${results.skipped}`);
  res.json(results);
});

// ─── Kitchen Window ───────────────────────────────────────────────────────────

// GET /api/kitchen/orders — active kitchen statuses. 'new' (awaiting approval)
// is included for the standalone KDS incoming column; the dashboard kitchen tab
// filters it out client-side (approval lives in the orders tab there).
router.get('/kitchen/orders', requireKitchenOrAdmin, async (req, res) => {
  const tid = req.user.tenant_id;
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tid)
    .in('status', ['new', 'preparing', 'ready'])
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// SSE endpoint — real-time push to kitchen / dashboard
router.get('/sse', requireKitchenOrAdmin, (req, res) => {
  const tid     = req.user.tenant_id;
  const cleanup = sse.subscribe(tid, res);
  req.on('close', cleanup);
});

// ─── Public menu (no auth) ────────────────────────────────────────────────────

router.get('/public-menu', async (req, res) => {
  try {
    let publicTid = DEFAULT_TENANT_ID;
    if (req.query.biz) {
      const { resolveTenantBySlug } = require('../services/slug');
      publicTid = (await resolveTenantBySlug(req.query.biz)) || DEFAULT_TENANT_ID;
    } else if (req.query.tenant) {
      publicTid = req.query.tenant; // legacy links
    }
    const [allSettings, categoriesRes, productsRes] = await Promise.all([
      settings.loadAll(publicTid),
      supabase.from('categories').select('*').eq('tenant_id', publicTid).order('sort_order'),
      supabase.from('products').select('*').eq('tenant_id', publicTid).eq('is_available', true).order('sort_order'),
    ]);
    const productIds = (productsRes.data || []).map(p => p.id);
    const additionsRes = productIds.length
      ? await supabase.from('product_additions').select('*').in('product_id', productIds).eq('is_available', true).order('sort_order')
      : { data: [] };

    const categories = categoriesRes.data || [];
    const products   = productsRes.data   || [];
    const additions  = additionsRes.data  || [];

    const addMap = {};
    for (const a of additions) {
      if (!addMap[a.product_id]) addMap[a.product_id] = [];
      addMap[a.product_id].push(a);
    }

    const catMap = {};
    for (const cat of categories) {
      catMap[cat.id] = { ...cat, products: [] };
    }
    for (const p of products) {
      if (p.category_id && catMap[p.category_id]) {
        catMap[p.category_id].products.push({ ...p, additions: addMap[p.id] || [] });
      }
    }

    // Filter out topping-addon categories and empty categories
    const menu = categories
      .filter((c) => !c.is_topping_addon && catMap[c.id]?.products?.length)
      .map((c) => catMap[c.id]);

    res.json({
      menu,
      business_name:    allSettings.business_name    || 'פיצה דליבריס',
      whatsapp_number:  allSettings.bot_whatsapp      || process.env.GREEN_API_WHATSAPP_NUMBER || '13237748500',
      business_address: allSettings.business_address || '',
      pickup_address:   allSettings.pickup_address   || '',
      delivery_price:   allSettings.delivery_price   ?? 30,
      delivery_enabled: allSettings.delivery_enabled !== false,
      pickup_enabled:   allSettings.pickup_enabled   !== false,
      is_open:          allSettings.is_open           !== false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Push subscriptions ───────────────────────────────────────────────────────

// Return VAPID public key so the frontend can subscribe
router.get('/push-vapid-key', requireAuth, (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

// Save a new push subscription — recorded against the user who created it, so
// it can be revoked when they leave (order notifications carry the customer's
// name and order total).
router.post('/push-subscribe', requireAuth, async (req, res) => {
  try {
    await pushNotifier.saveSubscription(
      req.body, req.headers['user-agent'] || '', tid(req), req.user?.username || null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Who currently receives this tenant's order notifications
router.get('/push-subscriptions', requireAdmin, async (req, res) => {
  res.json(await pushNotifier.listSubscriptions(tid(req)));
});

router.delete('/push-subscriptions/:id', requireAdmin, async (req, res) => {
  try {
    const removed = await pushNotifier.revokeSubscription(req.params.id, tid(req));
    if (!removed) return res.status(404).json({ error: 'לא נמצא' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a push subscription (browser opted out)
router.post('/push-unsubscribe', requireAuth, async (req, res) => {
  try {
    await pushNotifier.removeSubscription(req.body.endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Settings ────────────────────────────────────────────────────────────────

router.get('/settings', requireAdmin, async (req, res) => {
  const all = await settings.loadAll(tid(req));
  res.json(all);
});

router.patch('/settings', requireAdmin, async (req, res) => {
  const updates = req.body;
  try {
    for (const [key, value] of Object.entries(updates)) {
      await settings.set(key, value, tid(req));
    }
    if ('business_name' in updates || 'business_name_en' in updates) {
      const { assignSlug } = require('../services/slug');
      const all = await settings.loadAll(tid(req));
      await assignSlug(tid(req), {
        businessNameEn: all.business_name_en,
        businessNameHe: all.business_name,
      });
      settings._clearCache(tid(req));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin Users ─────────────────────────────────────────────────────────────

// admin_users table is created via supabase/schema.sql (run once in Supabase SQL editor)

router.get('/admin-users', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('admin_users').select('*').eq('tenant_id', tid(req)).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/admin-users', requireAdmin, async (req, res) => {
  const { phone, name, role = 'admin' } = req.body;
  if (!phone || !name) return res.status(400).json({ error: 'phone ו-name הם שדות חובה' });

  const normalised = phone.replace(/\D/g, '');
  if (normalised.length < 9) return res.status(400).json({ error: 'מספר טלפון לא תקין' });

  const { data, error } = await supabase
    .from('admin_users')
    .insert({ phone: normalised, name: name.trim(), role, tenant_id: tid(req) })
    .select().single();
  if (error) {
    const msg = error.code === '23505' ? 'מספר טלפון זה כבר קיים' : error.message;
    return res.status(400).json({ error: msg });
  }
  res.status(201).json(data);
});

router.delete('/admin-users/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('admin_users').delete().eq('id', req.params.id).eq('tenant_id', tid(req));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── Vendor routes (platform owner) ──────────────────────────────────────────

// GET /vendor/clients — all client businesses, with current-month API usage
router.get('/vendor/clients', requireVendor, async (_req, res) => {
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [{ data: clients, error }, { data: usage }] = await Promise.all([
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    supabase.from('api_usage')
      .select('tenant_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens')
      .gte('created_at', monthStart.toISOString()),
  ]);
  if (error) return res.status(500).json({ error: error.message });

  const P = { input: 15/1e6, output: 75/1e6, cache_read: 1.5/1e6, cache_write: 18.75/1e6 };
  const byTenant = {};
  for (const r of usage || []) {
    if (!r.tenant_id) continue;
    if (!byTenant[r.tenant_id]) byTenant[r.tenant_id] = { calls: 0, cost: 0 };
    byTenant[r.tenant_id].calls++;
    byTenant[r.tenant_id].cost +=
      (r.input_tokens||0)*P.input + (r.output_tokens||0)*P.output +
      (r.cache_read_tokens||0)*P.cache_read + (r.cache_write_tokens||0)*P.cache_write;
  }

  res.json((clients || []).map(c => ({
    ...c,
    month_calls: byTenant[c.tenant_id]?.calls || 0,
    month_cost:  byTenant[c.tenant_id]?.cost  || 0,
  })));
});

// POST /vendor/clients — add a client
router.post('/vendor/clients', requireVendor, async (req, res) => {
  const { name, contact_phone, plan = 'basic', notes = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabase
    .from('clients')
    .insert({ name: name.trim(), contact_phone: (contact_phone||'').replace(/\D/g,''), plan, notes, status: 'active' })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /vendor/clients/:id — update status / plan / notes / tenant_id
router.patch('/vendor/clients/:id', requireVendor, async (req, res) => {
  const allowed = ['status','plan','notes','contact_phone','name','tenant_id'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('clients').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /vendor/clients/:id
router.delete('/vendor/clients/:id', requireVendor, async (req, res) => {
  const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET /vendor/stats — cross-client platform stats
router.get('/vendor/stats', requireVendor, async (_req, res) => {
  const [ordersRes, clientsRes, sessionsRes] = await Promise.all([
    supabase.from('orders').select('id, status, total_price, created_at', { count: 'exact' }),
    supabase.from('clients').select('id, status', { count: 'exact' }),
    supabase.from('sessions').select('phone', { count: 'exact' }),
  ]);
  const orders   = ordersRes.data   || [];
  const clients  = clientsRes.data  || [];
  const revenue  = orders.filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);
  res.json({
    total_orders:   orders.length,
    total_revenue:  Math.round(revenue),
    active_clients: clients.filter(c => c.status === 'active').length,
    total_clients:  clients.length,
    total_sessions: sessionsRes.count || 0,
  });
});

// GET /vendor/alerts-test — send test WhatsApp alert to vendor
router.post('/vendor/alerts-test', requireVendor, async (_req, res) => {
  const { alerts } = require('../services/vendor-alerts');
  await alerts.serverRestart();
  res.json({ sent: true });
});

// GET /api/vendor/usage — Claude API usage + cost per tenant per month (last 6 months)
router.get('/vendor/usage', requireVendor, async (_req, res) => {
  const since = new Date();
  since.setMonth(since.getMonth() - 6);

  const { data, error } = await supabase
    .from('api_usage')
    .select('tenant_id, created_at, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Pricing per token (claude-opus-4-7)
  const P = { input: 15 / 1e6, output: 75 / 1e6, cache_read: 1.5 / 1e6, cache_write: 18.75 / 1e6 };

  const byKey = {};
  for (const row of data) {
    const month = row.created_at.slice(0, 7); // YYYY-MM
    const key   = `${row.tenant_id}::${month}`;
    if (!byKey[key]) byKey[key] = { tenant_id: row.tenant_id, month, calls: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 };
    byKey[key].calls++;
    byKey[key].input       += row.input_tokens       || 0;
    byKey[key].output      += row.output_tokens      || 0;
    byKey[key].cache_read  += row.cache_read_tokens  || 0;
    byKey[key].cache_write += row.cache_write_tokens || 0;
  }

  const rows = Object.values(byKey)
    .map(r => ({
      tenant_id:  r.tenant_id,
      month:      r.month,
      calls:      r.calls,
      input:      r.input,
      output:     r.output,
      cache_read: r.cache_read,
      cost_usd:   r.input * P.input + r.output * P.output + r.cache_read * P.cache_read + r.cache_write * P.cache_write,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  res.json(rows);
});

// ─── Onboarding ────────────────────────────────────────────────────────────────

// GET /onboarding/:token — public, client fetches their session
router.get('/onboarding/:token', async (req, res) => {
  const { data } = await supabase
    .from('onboarding_sessions')
    .select('id,status,business_name,bot_whatsapp,business_address,business_hours,delivery_zones,payment_cash,payment_credit,payment_bit,payment_paybox,delivery_enabled,pickup_enabled,pickup_address,admin_phones,menu_notes,expires_at,approved_username,clients(tenant_id)')
    .eq('token', req.params.token)
    .single();
  if (!data) return res.status(404).json({ error: 'לינק לא נמצא' });

  // Approved → "your business is live" payload: real links, no secrets
  // (the password was delivered via WhatsApp at approval time).
  if (data.status === 'approved') {
    const PUBLIC_URL = process.env.PUBLIC_URL || 'https://www.jasell.com';
    const tenantId = data.clients?.tenant_id;
    let slug = null;
    if (tenantId) {
      const { data: slugRow } = await supabase.from('settings')
        .select('value').eq('tenant_id', tenantId).eq('key', 'public_slug').single();
      slug = slugRow?.value || null;
    }
    return res.json({
      status: 'approved',
      business_name: data.business_name,
      username: data.approved_username || null,
      dashboard_url: PUBLIC_URL,
      menu_url: `${PUBLIC_URL}/menu.html?biz=${encodeURIComponent(slug || tenantId || '')}`,
    });
  }

  if (new Date(data.expires_at) < new Date()) return res.status(410).json({ error: 'הלינק פג תוקף' });
  delete data.clients;
  delete data.approved_username;
  res.json(data);
});

// PATCH /onboarding/:token — public, client submits their info
router.patch('/onboarding/:token', onboardingLimiter, async (req, res) => {
  const { data: session } = await supabase
    .from('onboarding_sessions')
    .select('id,status,checklist,expires_at')
    .eq('token', req.params.token)
    .single();
  if (!session)                                return res.status(404).json({ error: 'לינק לא נמצא' });
  if (session.status === 'approved')           return res.status(409).json({ error: 'האונבורדינג הסתיים' });
  if (new Date(session.expires_at) < new Date()) return res.status(410).json({ error: 'הלינק פג תוקף' });

  const {
    business_name, bot_whatsapp, business_hours, delivery_zones,
    payment_cash, payment_credit, payment_bit, payment_paybox,
    pickup_address, business_address, delivery_enabled, pickup_enabled,
    admin_phones, menu_notes, draft,
  } = req.body;

  const updates = {
    business_name,
    bot_whatsapp:     bot_whatsapp ? bot_whatsapp.replace(/\D/g, '') : null,
    business_address: business_address || null,
    business_hours,
    updated_at:       new Date().toISOString(),
    updated_by:       'client',
    delivery_zones:   delivery_zones || [],
    payment_cash:     payment_cash     !== undefined ? payment_cash     : true,
    payment_credit:   payment_credit   !== undefined ? payment_credit   : false,
    payment_bit:      payment_bit      !== undefined ? payment_bit      : false,
    payment_paybox:   payment_paybox   !== undefined ? payment_paybox   : false,
    delivery_enabled: delivery_enabled !== undefined ? delivery_enabled : true,
    pickup_enabled:   pickup_enabled   !== undefined ? pickup_enabled   : true,
    pickup_address,
    admin_phones:     admin_phones || [],
    menu_notes:       menu_notes || null,
  };

  // Draft autosave (wizard step transitions): persist fields only — the
  // session stays pending_client and the vendor is not alerted yet.
  if (!draft) {
    updates.status = 'pending_vendor';
    updates.checklist = (session.checklist || []).map(i =>
      i.key === 'client_info' ? { ...i, done: true } : i
    );
  }

  await supabase.from('onboarding_sessions').update(updates).eq('id', session.id);

  if (!draft) {
    // Notify vendor via WhatsApp (fire-and-forget)
    const { alerts } = require('../services/vendor-alerts');
    alerts.onboardingComplete(
      business_name || '—',
      bot_whatsapp  || '—',
      session.id
    ).catch(() => {});
  }

  res.json({ success: true });
});

// POST /onboarding/:token/whatsapp-signup — Meta Embedded Signup callback (public).
// The popup's sessionInfoListener gives the client page waba_id + phone_number_id,
// and FB.login returns a short-lived code; we exchange it server-side for a
// business token, subscribe our app to the WABA, and store the creds on the
// session so approve() seeds them into tenant settings.
// Requires META_APP_ID + META_APP_SECRET (available once Meta approves us as
// Tech Provider) — returns 501 until they're configured.
router.post('/onboarding/:token/whatsapp-signup', onboardingLimiter, async (req, res) => {
  const APP_ID     = process.env.META_APP_ID;
  const APP_SECRET = process.env.META_APP_SECRET;
  if (!APP_ID || !APP_SECRET) {
    return res.status(501).json({ error: 'חיבור WhatsApp אוטומטי עדיין לא זמין — צוות Jasell יחבר עבורך' });
  }

  const { code, waba_id, phone_number_id } = req.body;
  if (!code || !waba_id || !phone_number_id) {
    return res.status(400).json({ error: 'code, waba_id, phone_number_id נדרשים' });
  }

  const { data: session } = await supabase
    .from('onboarding_sessions')
    .select('id,status')
    .eq('token', req.params.token)
    .single();
  if (!session) return res.status(404).json({ error: 'לינק לא נמצא' });
  if (session.status === 'approved') return res.status(409).json({ error: 'האונבורדינג הסתיים' });

  try {
    const axios = require('axios');
    const API_VERSION = process.env.META_WA_API_VERSION || 'v21.0';
    const { data: tokenData } = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/oauth/access_token`,
      { params: { client_id: APP_ID, client_secret: APP_SECRET, code } }
    );
    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error('no access_token in exchange response');

    const { subscribeWaba } = require('../services/meta-whatsapp');
    await subscribeWaba(waba_id, accessToken);

    await supabase.from('onboarding_sessions').update({
      meta_phone_number_id: phone_number_id,
      meta_access_token:    accessToken,
      meta_waba_id:         waba_id,
      updated_at:           new Date().toISOString(),
      updated_by:           'client',
    }).eq('id', session.id);

    res.json({ success: true });
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error('[onboarding] whatsapp-signup error:', detail);
    res.status(502).json({ error: 'חיבור ה-WhatsApp נכשל — נסה שוב או פנה ל-Jasell' });
  }
});

// POST /vendor/onboarding — create client + session, return shareable link
router.post('/vendor/onboarding', requireVendor, async (req, res) => {
  const { name, contact_phone, plan, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'שם חסר' });

  const { data: client, error: cErr } = await supabase
    .from('clients')
    .insert({ name, contact_phone: contact_phone?.replace(/\D/g, ''), plan: plan || 'trial', notes, status: 'trial' })
    .select().single();
  if (cErr) return res.status(500).json({ error: cErr.message });

  const { data: session, error: sErr } = await supabase
    .from('onboarding_sessions')
    .insert({ client_id: client.id, business_name: name })
    .select().single();
  if (sErr) return res.status(500).json({ error: sErr.message });

  res.json({ client, session, link: `${process.env.PUBLIC_URL}/onboarding/${session.token}` });
});

// GET /vendor/onboarding — onboarding sessions
// Approved ones are included (last 60 days): filtering them out meant that a
// provisioning failure, or a lost password, left no surface to act from — the
// session simply vanished from the portal.
router.get('/vendor/onboarding', requireVendor, async (req, res) => {
  let query = supabase
    .from('onboarding_sessions')
    .select('*, clients(name, contact_phone, plan, status, tenant_id)')
    .order('created_at', { ascending: false });

  if (req.query.include_approved === 'false') query = query.neq('status', 'approved');

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// PATCH /vendor/onboarding/:id — vendor fills technical credentials
router.patch('/vendor/onboarding/:id', requireVendor, async (req, res) => {
  const fields = ['cardcom_terminal','cardcom_username','green_api_instance','green_api_token',
                  'meta_phone_number_id','meta_access_token','meta_waba_id'];
  const updates = { updated_at: new Date().toISOString(), updated_by: 'vendor' };
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];

  // Auto-tick checklist items the saved credentials prove
  const { data: cur } = await supabase.from('onboarding_sessions')
    .select('checklist,meta_phone_number_id,meta_access_token,green_api_instance,green_api_token,cardcom_terminal,cardcom_username')
    .eq('id', req.params.id).single();
  if (cur) {
    const merged = { ...cur, ...updates };
    const waDone = !!((merged.meta_phone_number_id && merged.meta_access_token) ||
                      (merged.green_api_instance && merged.green_api_token));
    const ccDone = !!(merged.cardcom_terminal && merged.cardcom_username);
    updates.checklist = (cur.checklist || []).map(i =>
      (i.key === 'whatsapp' || i.key === 'green_api') ? { ...i, done: waDone } :
      i.key === 'cardcom' ? { ...i, done: ccDone } : i
    );
  }

  const { error } = await supabase.from('onboarding_sessions').update(updates).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// PATCH /vendor/onboarding/:id/checklist — toggle one checklist item
router.patch('/vendor/onboarding/:id/checklist', requireVendor, async (req, res) => {
  const { key, done } = req.body;
  const { data: session } = await supabase
    .from('onboarding_sessions').select('checklist').eq('id', req.params.id).single();
  if (!session) return res.status(404).json({ error: 'לא נמצא' });

  const checklist = (session.checklist || []).map(i => i.key === key ? { ...i, done } : i);
  await supabase.from('onboarding_sessions').update({ checklist, updated_at: new Date().toISOString(), updated_by: 'vendor' }).eq('id', req.params.id);
  res.json({ success: true });
});

// POST /vendor/onboarding/:id/approve — full provisioning + mark client active
//
// This is a seven-step, multi-system, side-effectful transaction. It used to
// run with no state guard, no concurrency guard, no error checking and no way
// to retry: a double-click duplicated the tenant's whole menu and minted a
// second working login, and any failed step left a half-provisioned business
// that still reported success. It is now:
//
//   guarded    — only a submitted, unexpired session can be approved, and the
//                claim is optimistic so two clicks cannot both proceed
//   resumable  — each step records itself in onboarding_sessions.provisioning,
//                so a retry after a failure skips what already succeeded
//   loud       — a failed step aborts with the step name; nothing is reported
//                as approved until every step has actually run
router.post('/vendor/onboarding/:id/approve', requireVendor, async (req, res) => {
  const sessionId = req.params.id;

  const { data: ob } = await supabase
    .from('onboarding_sessions')
    .select('*, clients(id, tenant_id, name, contact_phone)')
    .eq('id', sessionId).single();
  if (!ob) return res.status(404).json({ error: 'לא נמצא' });

  const tenantId  = ob.clients?.tenant_id;
  const clientId  = ob.clients?.id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id חסר בלקוח' });

  // ── Guards ────────────────────────────────────────────────────────────────
  if (ob.status === 'approved') {
    return res.status(409).json({ error: 'הלקוח כבר אושר. לשליחת פרטי כניסה מחדש השתמשו ב"איפוס סיסמא".' });
  }
  if (ob.status === 'pending_client') {
    return res.status(409).json({ error: 'הלקוח עדיין לא שלח את הפרטים — אין מה לאשר' });
  }
  if (ob.expires_at && new Date(ob.expires_at) < new Date()) {
    return res.status(410).json({ error: 'תוקף הטופס פג — צרו קישור אונבורדינג חדש' });
  }

  // Optimistic claim: only one caller can move the session into provisioning.
  const { data: claimed } = await supabase
    .from('onboarding_sessions')
    .update({ status: 'provisioning', updated_at: new Date().toISOString(), updated_by: 'vendor' })
    .eq('id', sessionId)
    .in('status', ['pending_vendor', 'provisioning'])
    .select('id');
  if (!claimed?.length) {
    return res.status(409).json({ error: 'האישור כבר רץ כרגע (או שהסטטוס השתנה) — רענן ונסה שוב' });
  }

  const done = (ob.provisioning && typeof ob.provisioning === 'object') ? { ...ob.provisioning } : {};
  const markStep = async (step, value = true) => {
    done[step] = value;
    await supabase.from('onboarding_sessions')
      .update({ provisioning: done, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  };
  const fail = async (step, message) => {
    console.error(`[provision] ${step} failed for tenant ${tenantId}:`, message);
    await supabase.from('onboarding_sessions')
      .update({ status: 'pending_vendor', provisioning: { ...done, failed_step: step, failed_reason: String(message).slice(0, 300) },
                updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    require('../services/vendor-alerts').alerts
      .provisioningFailed(ob.business_name || ob.clients?.name || '', step, message).catch(() => {});
    return res.status(500).json({ error: `שלב "${step}" נכשל: ${message}`, step, resumable: true });
  };

  const PUBLIC_URL = process.env.PUBLIC_URL || 'https://www.jasell.com';

  // ── 1. Seed settings for this tenant ──────────────────────────────────────
  const settingsToSeed = [
    ['business_name',      ob.business_name   || ob.clients?.name || ''],
    ['bot_whatsapp',       ob.bot_whatsapp     ? ob.bot_whatsapp.replace(/\D/g, '') : ''],
    ['is_open',            true],
    ['delivery_enabled',   ob.delivery_enabled !== false],
    ['pickup_enabled',     ob.pickup_enabled   !== false],
    ['payment_cash',       ob.payment_cash     !== false],
    ['payment_credit',     ob.payment_credit   === true],
    ['payment_bit',        ob.payment_bit      === true],
    ['bit_phone',          ob.bit_phone        || ''],
    ['payment_paybox',     ob.payment_paybox   === true],
    ['pickup_address',     ob.pickup_address   || ''],
    ['business_address',   ob.business_address || ''],
    ['delivery_zones',     ob.delivery_zones   || []],
    ['business_hours',     ob.business_hours   || null],
    ['bot_url',            PUBLIC_URL],
    ['green_api_instance', ob.green_api_instance || ''],
    ['green_api_token',    ob.green_api_token    || ''],
    ['meta_phone_number_id', ob.meta_phone_number_id || ''],
    ['meta_access_token',    ob.meta_access_token    || ''],
    ['meta_waba_id',         ob.meta_waba_id         || ''],
    ['cardcom_terminal',   ob.cardcom_terminal   || ''],
    ['cardcom_username',   ob.cardcom_username   || ''],
  ];

  if (!done.settings) {
    for (const [key, value] of settingsToSeed) {
      if (value !== null && value !== undefined && value !== '') {
        const { error } = await supabase.from('settings').upsert(
          { tenant_id: tenantId, key, value, updated_at: new Date().toISOString() },
          { onConflict: 'tenant_id,key' }
        );
        if (error) return fail('settings', `${key}: ${error.message}`);
      }
    }
    await markStep('settings');
  }

  if (!done.slug) {
    try {
      const { assignSlug } = require('../services/slug');
      await assignSlug(tenantId, {
        businessNameEn: ob.business_name_en,
        businessNameHe: ob.business_name || ob.clients?.name,
      });
    } catch (err) {
      // A missing slug silently serves the demo tenant's menu on the client's
      // public link — not something to shrug off.
      return fail('slug', err.message);
    }
    await markStep('slug');
  }

  // ── 2. Copy menu from default tenant ──────────────────────────────────────
  // Guarded by an existence check as well as the step flag: inserting twice
  // gave the client a menu where every item appeared two or three times.
  if (!done.menu) {
    const { count: existingCats } = await supabase
      .from('categories').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);

    if (existingCats > 0) {
      console.warn(`[provision] tenant ${tenantId} already has ${existingCats} categories — skipping menu copy`);
    } else {
      const { data: srcCats, error: catErr } = await supabase
        .from('categories').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('sort_order');
      if (catErr) return fail('menu', catErr.message);
      const { data: srcProds, error: prodErr } = await supabase
        .from('products').select('*, product_additions(*)').eq('tenant_id', DEFAULT_TENANT_ID).order('sort_order');
      if (prodErr) return fail('menu', prodErr.message);

      const catIdMap = {}; // old id → new id
      for (const cat of (srcCats || [])) {
        const { id: _id, ...rest } = cat;
        const { data: newCat, error } = await supabase.from('categories')
          .insert({ ...rest, tenant_id: tenantId }).select('id').single();
        if (error) return fail('menu', `category "${cat.name_he}": ${error.message}`);
        catIdMap[_id] = newCat.id;
      }

      for (const prod of (srcProds || [])) {
        const { id: _pid, category_id, product_additions: additions, ...pRest } = prod;
        const newCatId = catIdMap[category_id] || null;
        const { data: newProd, error } = await supabase.from('products')
          .insert({ ...pRest, tenant_id: tenantId, category_id: newCatId }).select('id').single();
        if (error) return fail('menu', `product "${prod.name_he}": ${error.message}`);
        if (additions?.length) {
          const addRows = additions.map(({ id: _aid, product_id: _pid2, ...aRest }) =>
            ({ ...aRest, product_id: newProd.id })
          );
          const { error: addErr } = await supabase.from('product_additions').insert(addRows);
          if (addErr) return fail('menu', `additions for "${prod.name_he}": ${addErr.message}`);
        }
      }
    }
    await markStep('menu');
  }

  // ── 3. Create admin_users from admin_phones ────────────────────────────────
  // Without at least one admin the business gets no order-approval WhatsApp
  // and the escalation loop has nobody to escalate to.
  const adminPhones = Array.isArray(ob.admin_phones) ? ob.admin_phones : [];
  if (!done.admins) {
    const usable = adminPhones.filter((e) => String(e.phone || e).replace(/\D/g, ''));
    if (!usable.length) return fail('admins', 'לא הוגדר אף מספר מנהל — הלקוח לא יקבל התראות על הזמנות');
    for (const entry of usable) {
      const phone = String(entry.phone || entry).replace(/\D/g, '');
      const { error } = await supabase.from('admin_users').upsert(
        { tenant_id: tenantId, phone, name: entry.name || phone, role: 'admin' },
        { onConflict: 'tenant_id,phone' }
      );
      if (error) return fail('admins', `${phone}: ${error.message}`);
    }
    await markStep('admins');
  }

  // ── 4. Dashboard credentials ──────────────────────────────────────────────
  // Reuse the tenant's existing login on a retry — the old code minted a fresh
  // random username every run, so a second attempt left two working accounts
  // and told the client about only one of them.
  const crypto = require('crypto');
  let username = done.username || ob.approved_username || null;
  let password = null;

  if (!username) {
    const { data: existingUser } = await supabase
      .from('tenant_users').select('username').eq('tenant_id', tenantId).limit(1).maybeSingle();
    username = existingUser?.username || 'client-' + crypto.randomBytes(3).toString('hex');
  }
  if (!done.credentials) {
    password = crypto.randomBytes(5).toString('base64url').slice(0, 8);
    const passwordHash = await bcrypt.hash(password, 10);
    const { error } = await supabase.from('tenant_users').upsert(
      { tenant_id: tenantId, username, password: passwordHash, role: 'admin' },
      { onConflict: 'username' }
    );
    if (error) return fail('credentials', error.message);
    await markStep('username', username);
    await markStep('credentials');
  }

  // ── 5. Wire the WhatsApp channel ───────────────────────────────────────────
  // A failed subscribe means Meta delivers nothing: the bot is dead while every
  // screen says the business is live. That is a hard failure, not a log line.
  const webhookUrl = `${PUBLIC_URL}/webhook/${tenantId}`;
  if (!done.channel) {
    if (ob.meta_waba_id && ob.meta_access_token) {
      const { subscribeWaba } = require('../services/meta-whatsapp');
      try {
        await subscribeWaba(ob.meta_waba_id, ob.meta_access_token);
      } catch (err) {
        return fail('channel', err.response ? JSON.stringify(err.response.data) : err.message);
      }
    }
    // Green API (legacy/fallback): point the instance at the per-tenant webhook.
    if (ob.green_api_instance && ob.green_api_token) {
      const { setWebhook } = require('../services/greenapi');
      try {
        await setWebhook(ob.green_api_instance, ob.green_api_token, webhookUrl);
      } catch (err) {
        return fail('channel', err.message);
      }
    }
    await markStep('channel');
  }

  // ── 6. Send WhatsApp credentials to first admin phone ─────────────────────
  // Best-effort by nature (business-initiated free text is rejected by Meta
  // outside the 24h window), so the outcome is REPORTED rather than swallowed:
  // the vendor has to know whether to pass the password on by hand.
  let credentialsDelivered = false;
  const firstAdminPhone = adminPhones[0]?.phone || adminPhones[0];
  if (password && firstAdminPhone) {
    const credMsg =
      `🎉 *הבוט שלך מוכן!*\n\n` +
      `כניסה לדשבורד: ${PUBLIC_URL}\n` +
      `שם משתמש: *${username}*\n` +
      `סיסמא: *${password}*\n\n` +
      `שמרו את ההודעה — הסיסמא לא מוצגת שוב.`;
    const { sendMessage: sm } = require('../services/greenapi');
    try {
      await sm(String(firstAdminPhone).replace(/\D/g, ''), credMsg, tenantId);
      credentialsDelivered = true;
    } catch (err) {
      console.warn('[provision] credentials WhatsApp failed:', err.message);
    }
  }

  // ── 7. Mark session approved + client active ───────────────────────────────
  const { error: sessErr } = await supabase.from('onboarding_sessions').update({
    status:            'approved',
    approved_username: username,
    webhook_url:       webhookUrl,
    provisioning:      { ...done, completed_at: new Date().toISOString() },
    updated_at:        new Date().toISOString(),
    updated_by:        'vendor',
  }).eq('id', sessionId);
  if (sessErr) return fail('finalize', sessErr.message);

  const { error: clientErr } = await supabase.from('clients').update({ status: 'active' }).eq('id', clientId);
  if (clientErr) return fail('finalize', clientErr.message);

  res.json({ success: true, username, password, credentialsDelivered, webhookUrl, tenantId });
});

// POST /vendor/onboarding/:id/reset-credentials — issue a new dashboard password
// The plaintext password exists only in the approve response, so closing that
// modal used to lose it forever with no way to recover: nothing stores it and
// there is no password-change screen. This mints a new one instead.
router.post('/vendor/onboarding/:id/reset-credentials', requireVendor, async (req, res) => {
  const { data: ob } = await supabase
    .from('onboarding_sessions')
    .select('id, approved_username, admin_phones, business_name, clients(tenant_id, name)')
    .eq('id', req.params.id).single();
  if (!ob) return res.status(404).json({ error: 'לא נמצא' });

  const tenantId = ob.clients?.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id חסר בלקוח' });

  const { data: user } = await supabase
    .from('tenant_users').select('username').eq('tenant_id', tenantId).limit(1).maybeSingle();
  const username = user?.username || ob.approved_username;
  if (!username) return res.status(400).json({ error: 'לא קיים משתמש לעסק הזה — יש להריץ אישור מחדש' });

  const crypto   = require('crypto');
  const password = crypto.randomBytes(5).toString('base64url').slice(0, 8);
  const { error } = await supabase.from('tenant_users')
    .update({ password: await bcrypt.hash(password, 10) })
    .eq('tenant_id', tenantId).eq('username', username);
  if (error) return res.status(500).json({ error: error.message });

  let delivered = false;
  const phones = Array.isArray(ob.admin_phones) ? ob.admin_phones : [];
  const target = phones[0]?.phone || phones[0];
  if (req.body?.send !== false && target) {
    const PUBLIC_URL = process.env.PUBLIC_URL || 'https://www.jasell.com';
    try {
      const { sendMessage: sm } = require('../services/greenapi');
      await sm(String(target).replace(/\D/g, ''),
        `🔑 *פרטי כניסה מעודכנים*\n\nכניסה: ${PUBLIC_URL}\nשם משתמש: *${username}*\nסיסמא: *${password}*`,
        tenantId);
      delivered = true;
    } catch (err) {
      console.warn('[provision] credentials resend failed:', err.message);
    }
  }

  console.log(`[provision] credentials reset for tenant ${tenantId} (delivered=${delivered})`);
  res.json({ success: true, username, password, delivered });
});

// PATCH /vendor/settings — update vendor_phone and alert preferences
// ─── Inbox / Human handoff ────────────────────────────────────────────────────

router.get('/inbox', requireAdmin, async (req, res) => {
  try {
    const sessions = await getInboxSessions(tid(req));
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Taking over and handing back are both visible to the customer: without a word
// from us the bot simply goes mute mid-conversation and, later, starts
// answering again — with no explanation for either.
router.post('/inbox/:phone/handoff', requireAdmin, async (req, res) => {
  try {
    await setBotActive(req.params.phone, false, tid(req));
    sse.broadcast(tid(req), 'inbox_update', { phone: req.params.phone, is_bot_active: false });
    if (req.body?.notify_customer !== false) {
      await sendMessage(req.params.phone, 'רגע, נציג/ה מהעסק מצטרף/ת לשיחה ויענה לך כאן 👋', tid(req)).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/inbox/:phone/return', requireAdmin, async (req, res) => {
  try {
    await setBotActive(req.params.phone, true, tid(req));
    sse.broadcast(tid(req), 'inbox_update', { phone: req.params.phone, is_bot_active: true });
    if (req.body?.notify_customer !== false) {
      await sendMessage(req.params.phone, 'תודה על הסבלנות! אפשר להמשיך להזמין כאן כרגיל 🍕', tid(req)).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/inbox/:phone/reply', requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    await sendMessage(req.params.phone, message, tid(req));
    // Append agent reply to conversation history so context is preserved
    const { getSession } = require('../services/supabase');
    const session = await getSession(req.params.phone, tid(req));
    const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
    history.push({ role: 'assistant', content: `[נציג]: ${message}` });
    // An agent reply is agent activity: restart the handoff clock so the
    // watchdog doesn't hand a live conversation back to the bot mid-sentence,
    // and re-arm the waiting-customer alert for the next silence.
    await updateSession(req.params.phone, {
      conversation_history: history.slice(-40),
      handoff_at: new Date().toISOString(),
      handoff_alerted_at: null,
      unread_count: 0,
    }, tid(req));
    // Two agents on two browsers were invisible to each other — neither
    // /reply nor its optimistic local append broadcast anything.
    sse.broadcast(tid(req), 'inbox_message', {
      phone: req.params.phone, from: 'agent', message, at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/inbox/:phone/read', requireAdmin, async (req, res) => {
  try {
    await markInboxRead(req.params.phone, tid(req));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/vendor/settings', requireVendor, async (req, res) => {
  const { vendor_phone, vendor_name, alert_on_error, alert_on_payment_fail, alert_on_restart } = req.body;
  const sb = supabase;
  const updates = [];
  if (vendor_phone    !== undefined) updates.push(['vendor_phone',    vendor_phone.replace(/\D/g,'')]);
  if (vendor_name     !== undefined) updates.push(['vendor_name',     vendor_name]);
  if (alert_on_error  !== undefined) updates.push(['vendor_alert_error',   alert_on_error]);
  if (alert_on_payment_fail !== undefined) updates.push(['vendor_alert_payment', alert_on_payment_fail]);
  if (alert_on_restart !== undefined) updates.push(['vendor_alert_restart', alert_on_restart]);
  for (const [key, value] of updates) await settings.set(key, value);
  const { invalidateVendorPhone } = require('../services/vendor-alerts');
  invalidateVendorPhone();
  res.json({ success: true });
});

module.exports = router;
