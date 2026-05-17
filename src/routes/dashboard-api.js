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
    const { status = 'all', date } = req.query;
    let orders = await getOrders(status === 'all' ? null : status);

    if (date) {
      const d = new Date(date);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
      orders = orders.filter((o) => o.created_at >= start && o.created_at < end);
    }

    res.json({ orders, count: orders.length });
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
    // Notify customer via WhatsApp
    await notifyStatusChange(order.phone, status, 'he', order.order_number);
    res.json({ success: true, order });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// ─── Stats (admin only) ───────────────────────────────────────────────────────

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { date = new Date().toISOString().slice(0, 10) } = req.query;
    const d     = new Date(date);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

    const { data: dayOrders } = await supabase
      .from('orders')
      .select('total_price, items, status, created_at, delivery_method')
      .gte('created_at', start)
      .lt('created_at', end)
      .neq('status', 'cancelled');

    const completed = (dayOrders || []).filter((o) => o.status !== 'cancelled');
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

    // Started conversations (sessions updated today)
    const { count: conversationsStarted } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .gte('updated_at', start)
      .lt('updated_at', end);

    const convNotConverted = (conversationsStarted || 0) - completed.length;

    res.json({
      date,
      order_count:         completed.length,
      revenue:             Math.round(revenue * 100) / 100,
      top_products:        topProducts,
      conversations_started: conversationsStarted || 0,
      not_converted:       Math.max(0, convNotConverted),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Products ─────────────────────────────────────────────────────────────────

// GET /products — returns each product with its additions array nested
router.get('/products', requireAuth, async (req, res) => {
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*')
    .order('sort_order');
  if (pErr) return res.status(500).json({ error: pErr.message });

  const { data: additions, error: aErr } = await supabase
    .from('product_additions')
    .select('*')
    .order('sort_order');
  if (aErr) return res.status(500).json({ error: aErr.message });

  // Nest additions into each product
  const addMap = {};
  for (const a of additions) {
    if (!addMap[a.product_id]) addMap[a.product_id] = [];
    addMap[a.product_id].push(a);
  }
  const result = products.map((p) => ({ ...p, additions: addMap[p.id] || [] }));
  res.json(result);
});

router.post('/products', requireAdmin, async (req, res) => {
  const { name_he, name_en, price, category, sort_order, image_url } = req.body;
  const { data, error } = await supabase.from('products')
    .insert({ name_he, name_en, price, category: category || 'main', sort_order: sort_order || 0, image_url })
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
