'use strict';

const express  = require('express');
const { createClient } = require('@supabase/supabase-js');
const { sign, requireAuth, requireAdmin } = require('../middleware/auth');
const { getOrders, getOrderById, updateOrderStatus,
        autoCompleteDeliveredOrders }      = require('../services/supabase');
const { notifyStatusChange }              = require('../services/status-notifier');
const settings                            = require('../services/settings');
const { invalidateCache }                 = require('../services/menu-service');
const { sendMessage }                     = require('../services/greenapi');

const router   = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  const users = {
    admin:   { password: process.env.DASHBOARD_ADMIN_PASSWORD,   role: 'admin'   },
    manager: { password: process.env.DASHBOARD_MANAGER_PASSWORD, role: 'manager' },
  };

  const user = users[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'שם משתמש או סיסמא שגויים' });
  }

  const token = sign({
    username,
    role: user.role,
    exp:  Date.now() + 24 * 60 * 60 * 1000, // 24h
  });

  res.json({ token, role: user.role, username });
});

// ─── Orders ───────────────────────────────────────────────────────────────────

router.get('/orders', requireAuth, async (req, res) => {
  try {
    await autoCompleteDeliveredOrders();

    let query = supabase.from('orders').select('*').order('created_at', { ascending: false });

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
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

const STATUS_ORDER = ['new','preparing','out_for_delivery','delivered','done','cancelled'];

router.patch('/orders/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!STATUS_ORDER.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Valid: ${STATUS_ORDER.join(', ')}` });
  }
  try {
    const order = await updateOrderStatus(req.params.id, status);
    await notifyStatusChange(order.phone, status, 'he', order.order_number);
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full order edit (items, address, notes, destination_type, courier_notes)
router.put('/orders/:id', requireAdmin, async (req, res) => {
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

// ─── Stats (admin only) ───────────────────────────────────────────────────────

function periodRange(period, date) {
  const now = date ? new Date(date) : new Date();
  let start, end;
  switch (period) {
    case 'week': {
      const day = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      end   = new Date(start.getTime() + 7 * 86400000);
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      end   = new Date(now.getFullYear() + 1, 0, 1);
      break;
    case 'all':
      start = new Date(2020, 0, 1);
      end   = new Date(2100, 0, 1);
      break;
    default: // 'today' or specific date
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end   = new Date(start.getTime() + 86400000);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { period = 'today', date } = req.query;
    const { start, end } = periodRange(period, date);

    const { data: dayOrders } = await supabase
      .from('orders')
      .select('total_price, items, status, created_at, updated_at, delivery_method, payment_status')
      .gte('created_at', start)
      .lt('created_at', end);

    const all       = dayOrders || [];
    const cancelled = all.filter((o) => o.status === 'cancelled');
    const completed = all.filter((o) => o.status !== 'cancelled');
    const revenue   = completed.reduce((s, o) => s + (parseFloat(o.total_price) || 0), 0);

    // Top 3 products
    const productCounts = {};
    for (const order of completed) {
      for (const item of order.items || []) {
        const name = item.name || item.name_he || 'Unknown';
        productCounts[name] = (productCounts[name] || 0) + 1;
      }
    }
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

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
      .gte('updated_at', start)
      .lt('updated_at', end);

    const convNotConverted = Math.max(0, (conversationsStarted || 0) - completed.length);

    // Orders per day (for chart)
    const ordersByDay = {};
    for (const o of completed) {
      const day = o.created_at.slice(0, 10);
      if (!ordersByDay[day]) ordersByDay[day] = { count: 0, revenue: 0 };
      ordersByDay[day].count++;
      ordersByDay[day].revenue += parseFloat(o.total_price) || 0;
    }

    res.json({
      period, start, end,
      order_count:           completed.length,
      cancelled_count:       cancelled.length,
      revenue:               Math.round(revenue * 100) / 100,
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
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Categories ───────────────────────────────────────────────────────────────

router.get('/categories', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/categories', requireAdmin, async (req, res) => {
  const { name_he, name_en, emoji, has_toppings, sort_order } = req.body;
  const { data, error } = await supabase.from('categories')
    .insert({ name_he, name_en: name_en || name_he, emoji: emoji || '🍽️',
              has_toppings: !!has_toppings, sort_order: sort_order || 99 })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
  res.status(201).json(data);
});

router.patch('/categories/:id', requireAdmin, async (req, res) => {
  const updates = { ...req.body };
  delete updates.id; delete updates.created_at;
  const { data, error } = await supabase.from('categories')
    .update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
  res.json(data);
});

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  // Prevent deleting categories that still have products
  const { count } = await supabase.from('products').select('*', { count: 'exact', head: true })
    .eq('category_id', req.params.id);
  if (count > 0) return res.status(400).json({ error: `יש ${count} מוצרים בקטגוריה זו. העבר אותם קודם.` });
  const { error } = await supabase.from('categories').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
  res.json({ success: true });
});

// ─── Products ─────────────────────────────────────────────────────────────────

// GET /products — returns products grouped by category with nested additions
router.get('/products', requireAuth, async (req, res) => {
  const { data: categories, error: cErr } = await supabase
    .from('categories').select('*').order('sort_order');
  if (cErr) return res.status(500).json({ error: cErr.message });

  const { data: products, error: pErr } = await supabase
    .from('products').select('*').order('sort_order');
  if (pErr) return res.status(500).json({ error: pErr.message });

  const { data: additions, error: aErr } = await supabase
    .from('product_additions').select('*').order('sort_order');
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
    .insert({ name_he, name_en: name_en || name_he, price, category_id, sort_order: sort_order || 0, image_url, description: description || null })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
  res.status(201).json({ ...data, additions: [] });
});

router.patch('/products/:id', requireAdmin, async (req, res) => {
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  delete updates.id; delete updates.created_at; delete updates.additions;
  const { data, error } = await supabase.from('products')
    .update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
  res.json(data);
});

router.delete('/products/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('products').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  invalidateCache();
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

// ─── Customers ────────────────────────────────────────────────────────────────

router.get('/customers', requireAdmin, async (req, res) => {
  const { returning } = req.query;
  let query = supabase.from('customers').select('*').order('last_order_at', { ascending: false });
  if (returning === '1') query = query.gte('order_count', 2);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/customers/broadcast', requireAdmin, async (req, res) => {
  const { phones, message } = req.body;
  if (!Array.isArray(phones) || !message) {
    return res.status(400).json({ error: 'phones (array) and message required' });
  }
  if (phones.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 recipients per broadcast' });
  }

  const results = { sent: 0, failed: 0 };
  for (const phone of phones) {
    try {
      await sendMessage(phone, message);
      results.sent++;
      await new Promise((r) => setTimeout(r, 300)); // gentle rate limiting
    } catch {
      results.failed++;
    }
  }
  res.json(results);
});

// ─── Public menu (no auth) ────────────────────────────────────────────────────

router.get('/public-menu', async (req, res) => {
  try {
    const [allSettings, categoriesRes, productsRes, additionsRes] = await Promise.all([
      settings.loadAll(),
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('products').select('*').eq('is_available', true).order('sort_order'),
      supabase.from('product_additions').select('*').eq('is_available', true).order('sort_order'),
    ]);

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

// ─── Settings ────────────────────────────────────────────────────────────────

router.get('/settings', requireAdmin, async (req, res) => {
  const all = await settings.loadAll();
  res.json(all);
});

router.patch('/settings', requireAdmin, async (req, res) => {
  const updates = req.body;
  try {
    for (const [key, value] of Object.entries(updates)) {
      await settings.set(key, value);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
