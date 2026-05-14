'use strict';

// Legacy admin route — kept for backwards compatibility.
// New dashboard uses /api/* via dashboard-api.js

const express = require('express');
const { getOrders } = require('../services/supabase');

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
    const rawOrders = await getOrders(status === 'all' ? null : status);
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
