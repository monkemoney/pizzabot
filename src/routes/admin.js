'use strict';

// Legacy admin route — kept for backwards compatibility.
// New dashboard uses /api/* via dashboard-api.js

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const router = express.Router();

function requireAdminSecret(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
router.use(requireAdminSecret);

function maskPhone(phone) {
  if (!phone || phone.length < 4) return '****';
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
}

router.get('/orders', async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    let q = supabase.from('orders').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false });
    if (status && status !== 'all') q = q.eq('status', status);
    const { data: rawOrders = [] } = await q;
    const orders = rawOrders.map((o) => ({
      id:              o.id,
      order_number:    o.order_number,
      created_at:      o.created_at,
      phone:           maskPhone(o.phone),
      customer_name:   o.customer_name   || null,
      address:         o.address         || null,
      items:           o.items,
      total_price:     o.total_price,
      delivery_method: o.delivery_method,
      payment_method:  o.payment_method,
      notes:           o.notes           || null,
      status:          o.status,
    }));
    res.json({ orders, count: orders.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

module.exports = router;
