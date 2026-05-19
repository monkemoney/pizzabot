'use strict';

// ─── Auth ─────────────────────────────────────────────────────────────────────

const token    = localStorage.getItem('token');
const role     = localStorage.getItem('role');
const username = localStorage.getItem('username');

if (!token) { window.location.href = '/'; }

document.getElementById('userDisplayName').textContent = username || '';
document.getElementById('userRole').textContent = role === 'admin' ? 'מנהל' : 'מנג׳ר';

// Show admin-only elements
if (role === 'admin') {
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.style.display = el.tagName === 'BUTTON' ? 'flex' : 'block';
  });
}

function logout() {
  localStorage.clear();
  window.location.href = '/';
}

// ─── SVG icon helpers ─────────────────────────────────────────────────────────

const S = (d, w=14) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0">${d}</svg>`;

const SVG = {
  search:    S('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  clipboard: S('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>'),
  truck:     S('<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
  home:      S('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
  wallet:    S('<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>'),
  card:      S('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
  check:     S('<polyline points="20 6 9 17 4 12"/>', 13),
  clock:     S('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  printer:   S('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
  pin:       S('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 13),
  award:     S('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>'),
  edit:      S('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  camera:    S('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>', 24),
  phone:     S('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>', 13),
  notes:     S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', 13),
  xCircle:       S('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
  alertTriangle: S('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאת שרת');
  return data;
}

// ─── Tab navigation ───────────────────────────────────────────────────────────

const TABS = ['orders', 'products', 'customers', 'stats', 'settings'];

function showTab(name) {
  TABS.forEach((t) => {
    const page = document.getElementById('page-' + t);
    const tab  = document.getElementById('tab-'  + t);
    if (page) page.style.display = 'none';
    if (tab)  tab.classList.remove('active');
  });
  const page = document.getElementById('page-' + name);
  const tab  = document.getElementById('tab-'  + name);
  if (page) page.style.display = 'block';
  if (tab)  tab.classList.add('active');

  closeMobileMenu();

  if (name === 'orders')    loadOrders();
  if (name === 'products')  loadProducts();
  if (name === 'customers') loadCustomers();
  if (name === 'settings')  loadSettings();
  if (name === 'stats')     setPeriod(currentPeriod);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('open');
  el.style.display = 'none';
}
function openModal(id) {
  const el = document.getElementById(id);
  el.style.display = 'flex';
  el.classList.add('open');
}
// Close modal when clicking backdrop
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS = {
  new:              'חדשה',
  preparing:        'בהכנה',
  out_for_delivery: 'יצא למשלוח',
  delivered:        'נמסרה',
  done:             'הסתיימה',
  cancelled:        'בוטלה',
};

function statusBadge(status) {
  const cls = {
    new: 'badge-new', preparing: 'badge-preparing',
    out_for_delivery: 'badge-delivery', delivered: 'badge-delivered',
    done: 'badge-done', cancelled: 'badge-cancelled',
  }[status] || 'badge-done';
  return `<span class="badge ${cls}">${STATUS_LABELS[status] || status}</span>`;
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────

let currentOrders = [];
let currentPeriod = 'today';

async function loadOrders() {
  const container = document.getElementById('ordersTable');
  container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted)">טוען...</div>';
  try {
    const data = await api('GET', '/orders');
    currentOrders = data.orders || [];
    renderStatusSummaryCards(currentOrders);
    updateNotifBadge();
    filterOrders();
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;color:red">${err.message}</div>`;
  }
}

function renderStatusSummaryCards(orders) {
  const el = document.getElementById('orderStatusCards');
  if (!el) return;
  const counts = {
    total:    orders.length,
    new:      orders.filter(o => o.status === 'new').length,
    preparing:orders.filter(o => o.status === 'preparing').length,
    out:      orders.filter(o => o.status === 'out_for_delivery').length,
    delivered:orders.filter(o => o.status === 'delivered').length,
    pending:  orders.filter(o => o.payment_status === 'pending').length,
  };
  const card = (label, val, color='var(--primary)') => {
    const empty = val === 0;
    return `<div class="stat-card" style="padding:16px 18px;cursor:pointer;opacity:${empty?.45:1}">
      <div style="font-size:1.6rem;font-weight:800;color:${empty?'var(--text-muted)':color}">${val}</div>
      <div class="stat-label">${label}</div>
    </div>`;
  };
  el.innerHTML =
    card('סה"כ הזמנות',      counts.total,     'var(--text)')     +
    card('חדשות',             counts.new,        'var(--primary)')  +
    card('בהכנה',             counts.preparing,  '#c07000')         +
    card('בדרך ללקוח',       counts.out,        '#005faa')         +
    card('נמסרו',             counts.delivered,  '#008043')         +
    card('ממתינות לתשלום',   counts.pending,    'var(--accent)');
}

function filterOrders() {
  const q       = (document.getElementById('orderSearch')?.value || '').trim().toLowerCase();
  const status  = document.getElementById('statusFilter')?.value  || 'all';
  const type    = document.getElementById('typeFilter')?.value    || 'all';
  const payment = document.getElementById('paymentFilter')?.value || 'all';
  const from    = document.getElementById('dateFromFilter')?.value;
  const to      = document.getElementById('dateToFilter')?.value;

  let list = currentOrders;
  if (status  !== 'all') list = list.filter(o => o.status === status);
  if (type    !== 'all') list = list.filter(o => o.delivery_method === type);
  if (payment !== 'all') list = list.filter(o => o.payment_method === payment);
  if (from) list = list.filter(o => o.created_at >= new Date(from).toISOString());
  if (to)   list = list.filter(o => o.created_at <= new Date(to + 'T23:59:59').toISOString());
  if (q) list = list.filter(o =>
    (o.customer_name    || '').toLowerCase().includes(q) ||
    (o.customer_phone   || o.phone || '').includes(q)    ||
    (o.address          || '').toLowerCase().includes(q)
  );
  renderOrdersTable(list);
}

function clearOrderFilters() {
  ['orderSearch','dateFromFilter','dateToFilter'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['statusFilter','typeFilter','paymentFilter'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = 'all';
  });
  filterOrders();
}

function exportOrdersCSV() {
  // Get the currently filtered orders from the rendered table rows
  const q       = (document.getElementById('orderSearch')?.value   || '').trim().toLowerCase();
  const status  = document.getElementById('statusFilter')?.value   || 'all';
  const type    = document.getElementById('typeFilter')?.value     || 'all';
  const payment = document.getElementById('paymentFilter')?.value  || 'all';
  const from    = document.getElementById('dateFromFilter')?.value;
  const to      = document.getElementById('dateToFilter')?.value;

  let list = currentOrders;
  if (status  !== 'all') list = list.filter(o => o.status === status);
  if (type    !== 'all') list = list.filter(o => o.delivery_method === type);
  if (payment !== 'all') list = list.filter(o => o.payment_method === payment);
  if (from) list = list.filter(o => o.created_at >= new Date(from).toISOString());
  if (to)   list = list.filter(o => o.created_at <= new Date(to + 'T23:59:59').toISOString());
  if (q) list = list.filter(o =>
    (o.customer_name  || '').toLowerCase().includes(q) ||
    (o.customer_phone || o.phone || '').includes(q)    ||
    (o.address        || '').toLowerCase().includes(q)
  );

  if (!list.length) { showToast('אין הזמנות לייצוא'); return; }

  const statusHe = {
    new:'חדשה', preparing:'בהכנה', out_for_delivery:'יצא למשלוח',
    delivered:'נמסרה', done:'הסתיימה', cancelled:'בוטלה',
  };

  const headers = [
    'מספר הזמנה','תאריך','שעה','שם לקוח','טלפון',
    'סוג אספקה','כתובת','אמצעי תשלום','סטטוס תשלום',
    'סטטוס הזמנה','פריטים','תוספות','סה"כ','הערות',
  ];

  const esc = (v) => {
    const s = String(v == null ? '' : v).replace(/"/g, '""');
    return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
  };

  const rows = list.map(o => {
    const d       = new Date(o.created_at);
    const date    = d.toLocaleDateString('he-IL');
    const time    = d.toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' });
    const items   = (o.items||[]).map(it => {
      const qty = it.quantity || it.qty || 1;
      return `${it.name||it.name_he||''}${qty>1?` ×${qty}`:''}`;
    }).join(' | ');
    const toppings = (o.items||[]).flatMap(it =>
      (it.toppings||[]).map(t => t.name||t.name_he||'')
    ).filter(Boolean).join(', ');

    return [
      o.order_number || '',
      date, time,
      o.customer_name  || '',
      o.customer_phone || o.phone || '',
      o.delivery_method === 'delivery' ? 'משלוח' : 'איסוף',
      o.address || '',
      o.payment_method === 'cash' ? 'מזומן' : 'אשראי',
      o.payment_status === 'paid'  ? 'שולם'  : 'ממתין',
      statusHe[o.status] || o.status || '',
      items,
      toppings,
      (parseFloat(o.total_price)||0).toFixed(2),
      o.notes || '',
    ].map(esc).join(',');
  });

  // UTF-8 BOM so Excel opens Hebrew correctly
  const csv  = '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `הזמנות_${new Date().toISOString().slice(0,10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`יוצאו ${list.length} הזמנות`);
}

function renderOrderCard(o) {
  const statusOpts = Object.entries(STATUS_LABELS).map(([val, label]) =>
    `<option value="${val}" ${val === o.status ? 'selected' : ''}>${label}</option>`).join('');
  return `
  <div class="order-card-mobile" style="background:var(--white);border-radius:16px;padding:14px 16px;box-shadow:0 2px 12px rgba(94,23,235,.06)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:800;color:var(--primary)">#${o.order_number||'—'}</span>
        <span style="font-size:.7rem;color:var(--text-muted)">${formatDate(o.created_at)}</span>
      </div>
      <span style="font-weight:800;font-size:1rem">₪${(parseFloat(o.total_price)||0).toFixed(0)}</span>
    </div>
    <div style="font-weight:700;font-size:.92rem;margin-bottom:4px">${o.customer_name||'—'}</div>
    ${o.address ? `<div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px;display:flex;align-items:center;gap:4px">${SVG.pin} ${o.address}</div>` : '<div style="margin-bottom:8px"></div>'}
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
      <span class="badge ${o.delivery_method==='delivery'?'badge-delivery':'badge-done'}" style="display:inline-flex;align-items:center;gap:4px">${o.delivery_method==='delivery'?`${SVG.truck} משלוח`:`${SVG.home} איסוף`}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:.72rem;background:var(--bg);padding:3px 10px;border-radius:999px;color:var(--text-muted)">${o.payment_method==='cash'?`${SVG.wallet} מזומן`:`${SVG.card} אשראי`}</span>
      <span class="badge ${o.payment_status==='paid'?'badge-paid':'badge-pending-pay'}" style="display:inline-flex;align-items:center;gap:4px">${o.payment_status==='paid'?`${SVG.check} שולם`:`${SVG.clock} ממתין`}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <select onchange="updateOrderStatus('${o.id}',this.value,${o.order_number})"
        style="flex:1;padding:8px 10px;border-radius:10px;border:2px solid var(--border);font-family:inherit;font-size:.8rem;cursor:pointer">
        ${statusOpts}
      </select>
      <button onclick="openOrderEdit('${o.id}')" title="עריכה"
        style="background:var(--primary-soft);border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:var(--primary);display:flex;align-items:center">${SVG.edit}</button>
      <button onclick="printOrder('${o.id}')" title="הדפסת קבלה"
        style="background:#f0fdf4;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:#16a34a;display:flex;align-items:center">${SVG.printer}</button>
      ${!['cancelled','done'].includes(o.status) ? `
      ${o.dispute_status === 'pending'
        ? `<span title="מחלוקת פתוחה" style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:8px 12px;color:#d97706;display:flex;align-items:center;cursor:default">${SVG.alertTriangle}</span>`
        : `<button onclick="openDisputeModal('${o.id}')" title="פריט חסר" style="background:#fffbeb;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:#d97706;display:flex;align-items:center">${SVG.alertTriangle}</button>`}
      <button onclick="openCancelRefundModal('${o.id}')" title="ביטול" style="background:#fff0f6;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:#e0004d;display:flex;align-items:center">${SVG.xCircle}</button>` : ''}
    </div>
  </div>`;
}

function renderOrdersTable(orders) {
  const container = document.getElementById('ordersTable');
  if (!orders.length) {
    const hasFilters = document.getElementById('orderSearch')?.value ||
      document.getElementById('statusFilter')?.value !== 'all' ||
      document.getElementById('typeFilter')?.value !== 'all' ||
      document.getElementById('paymentFilter')?.value !== 'all' ||
      document.getElementById('dateFromFilter')?.value ||
      document.getElementById('dateToFilter')?.value;
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">${hasFilters ? SVG.search : SVG.clipboard}</div>
      <div class="empty-state-title">${hasFilters ? 'אין הזמנות תואמות' : 'אין הזמנות עדיין'}</div>
      <div class="empty-state-sub">${hasFilters
        ? `<button onclick="clearOrderFilters()" style="background:none;border:none;cursor:pointer;color:var(--primary);font-weight:700;font-size:.84rem;padding:0;text-decoration:underline;font-family:inherit">נקה פילטרים</button>`
        : 'הזמנות יופיעו כאן ברגע שלקוח יזמין'}</div>
    </div>`;
    return;
  }

  if (window.innerWidth <= 768) {
    container.innerHTML = `<div style="padding:12px;display:flex;flex-direction:column;gap:10px">
      ${orders.map(renderOrderCard).join('')}
    </div>`;
    return;
  }

  container.innerHTML = `
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>#</th><th>תאריך</th><th>לקוח</th><th>סוג</th>
          <th>תשלום</th><th>שולם</th><th>סכום</th><th>סטטוס</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${orders.map((o) => `
        <tr>
          <td style="font-weight:800;color:var(--primary)">${o.order_number||'—'}</td>
          <td style="color:var(--text-muted);font-size:.78rem">${formatDate(o.created_at)}</td>
          <td>
            <div style="font-weight:700">${o.customer_name||'—'}</div>
            <div style="font-size:.72rem;color:var(--text-muted)">${(o.address||'').slice(0,26)}</div>
          </td>
          <td><span class="badge ${o.delivery_method==='delivery'?'badge-delivery':'badge-done'}" style="display:inline-flex;align-items:center;gap:4px">
            ${o.delivery_method==='delivery'?`${SVG.truck} משלוח`:`${SVG.home} איסוף`}</span></td>
          <td style="font-size:.82rem;color:var(--text-muted)"><span style="display:inline-flex;align-items:center;gap:4px">${o.payment_method==='cash'?`${SVG.wallet} מזומן`:`${SVG.card} אשראי`}</span></td>
          <td><span class="badge ${o.payment_status==='paid'?'badge-paid':'badge-pending-pay'}" style="display:inline-flex;align-items:center;gap:4px">
            ${o.payment_status==='paid'?`${SVG.check} שולם`:`${SVG.clock} ממתין`}</span></td>
          <td style="font-weight:800">₪${(parseFloat(o.total_price)||0).toFixed(0)}</td>
          <td>
            <select onchange="updateOrderStatus('${o.id}',this.value,${o.order_number})"
              style="padding:5px 8px;border-radius:8px;border:2px solid var(--border);font-family:inherit;font-size:.78rem;cursor:pointer">
              ${Object.entries(STATUS_LABELS).map(([val,label])=>
                `<option value="${val}" ${val===o.status?'selected':''}>${label}</option>`
              ).join('')}
            </select>
          </td>
          <td style="display:flex;gap:6px;align-items:center">
            <button onclick="openOrderEdit('${o.id}')" title="עריכה"
              style="background:var(--primary-soft);border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:var(--primary)">${SVG.edit}</button>
            <button onclick="printOrder('${o.id}')" title="הדפסת קבלה"
              style="background:#f0fdf4;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:#16a34a">${SVG.printer}</button>
            ${!['cancelled','done'].includes(o.status) ? `
            ${o.dispute_status === 'pending'
              ? `<span title="מחלוקת פתוחה — ממתין לתגובת לקוח" style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:8px;padding:6px 10px;color:#d97706;display:inline-flex;align-items:center;cursor:default">${SVG.alertTriangle}</span>`
              : `<button onclick="openDisputeModal('${o.id}')" title="פריט חסר" style="background:#fffbeb;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:#d97706">${SVG.alertTriangle}</button>`}
            <button onclick="openCancelRefundModal('${o.id}')" title="ביטול והחזר"
              style="background:#fff0f6;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:#e0004d">${SVG.xCircle}</button>` : ''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

async function updateOrderStatus(orderId, status, orderNumber) {
  try {
    await api('PATCH', `/orders/${orderId}/status`, { status });
    const o = currentOrders.find(x => x.id === orderId);
    if (o) o.status = status;
    renderStatusSummaryCards(currentOrders);
    filterOrders();
  } catch (err) {
    alert('שגיאה: ' + err.message);
    loadOrders();
  }
}

// ─── STATS ────────────────────────────────────────────────────────────────────

// Destroy and re-create a Chart.js instance
const _charts = {};
function mkChart(id, config) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  _charts[id] = new Chart(canvas, config);
}

// Shared Chart.js defaults
const C_FONT = "'Poppins', sans-serif";
const C_GRID = 'rgba(0,0,0,.06)';
const C_VIOLET = '#5e17eb';
const C_PINK   = '#ff66c4';
const C_GREEN  = '#22c55e';
const C_BLUE   = '#3b82f6';
const C_AMBER  = '#f59e0b';
const C_RED    = '#ef4444';
const C_PURPLE = '#a855f7';

function chartDefaults(theme) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    textColor:  isDark ? '#ede8ff' : '#1a1028',
    mutedColor: isDark ? '#7a6f8a' : '#9ca3af',
    gridColor:  isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)',
  };
}

function makeLegend(containerId, labels, colors) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = labels.map((l, i) => `
    <div style="display:flex;align-items:center;gap:7px">
      <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0"></span>
      <span style="color:var(--text)">${l}</span>
    </div>`).join('');
}

function setPeriod(period, date) {
  currentPeriod = period === 'custom' ? 'today' : period;
  document.querySelectorAll('.period-btn').forEach(b => {
    const isActive = b.dataset.period === currentPeriod;
    b.className = 'period-btn btn btn-sm ' + (isActive ? 'btn-primary' : 'btn-ghost');
  });
  loadStats(currentPeriod, date);
}

async function loadStats(period = 'today', date) {
  const cardsEl = document.getElementById('statsCards');
  if (!cardsEl) return;

  cardsEl.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;padding:8px">טוען...</div>';

  try {
    const params = date ? `period=${period}&date=${date}` : `period=${period}`;
    const s = await api('GET', `/stats?${params}`);
    const { textColor, mutedColor, gridColor } = chartDefaults();
    const periodLabel = {today:'היום',week:'השבוע',month:'החודש',year:'השנה',all:'הכל'}[period] || period;

    // ── KPI cards ──
    const kpi = (label, value, color) => `
      <div class="stat-card" style="padding:20px 22px">
        <div style="font-size:1.8rem;font-weight:800;color:${color};line-height:1">${value}</div>
        <div class="stat-label" style="margin-top:6px">${label}</div>
      </div>`;
    cardsEl.innerHTML =
      kpi(`הזמנות — ${periodLabel}`,  s.order_count,                                           C_VIOLET) +
      kpi('הכנסות',                   `₪${(s.revenue||0).toFixed(0)}`,                         C_GREEN)  +
      kpi('ממוצע להזמנה',             s.order_count ? `₪${((s.revenue||0)/s.order_count).toFixed(0)}` : '—', C_BLUE) +
      kpi('זמן מסירה ממוצע',          s.avg_delivery_minutes != null ? s.avg_delivery_minutes+'′' : '—', C_PURPLE) +
      kpi('ביטולים',                  s.cancelled_count || 0,                                   C_RED)    +
      kpi('יחס המרה',                 s.conversion_rate != null ? s.conversion_rate+'%' : '—', C_PINK);

    // ── 1. Orders per day — line chart ──
    const byDay = s.orders_by_day || {};
    const days  = Object.keys(byDay).sort();
    mkChart('chartOrdersLine', {
      type: 'bar',
      data: {
        labels:   days.map(d => d.slice(5)),
        datasets: [{
          label: 'הזמנות',
          data:  days.map(d => byDay[d].count),
          backgroundColor: 'rgba(94,23,235,.75)',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: {
          label: ctx => ` ${ctx.parsed.y} הזמנות`
        }}},
        scales: {
          x: { ticks: { color: mutedColor, font: { family: C_FONT, size: 11 } }, grid: { display: false } },
          y: { ticks: { color: mutedColor, font: { family: C_FONT, size: 11 }, stepSize: 1 }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });

    // ── 2. Revenue per day — line chart ──
    mkChart('chartRevenue', {
      type: 'line',
      data: {
        labels:   days.map(d => d.slice(5)),
        datasets: [{
          label: 'הכנסות ₪',
          data:  days.map(d => byDay[d].revenue || 0),
          borderColor: C_GREEN,
          backgroundColor: 'rgba(34,197,94,.12)',
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: C_GREEN,
          pointRadius: days.length > 14 ? 2 : 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: {
          label: ctx => ` ₪${ctx.parsed.y.toFixed(0)}`
        }}},
        scales: {
          x: { ticks: { color: mutedColor, font: { family: C_FONT, size: 11 } }, grid: { display: false } },
          y: { ticks: { color: mutedColor, font: { family: C_FONT, size: 11 }, callback: v => '₪'+v }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });

    // ── 3. Hourly heatmap — bar ──
    const hourly = s.hourly_orders || Array(24).fill(0);
    mkChart('chartHourly', {
      type: 'bar',
      data: {
        labels: hourly.map((_, i) => i + ':00'),
        datasets: [{
          label: 'הזמנות',
          data: hourly,
          backgroundColor: hourly.map(v => {
            const mx = Math.max(...hourly, 1);
            const op = 0.2 + 0.8 * (v / mx);
            return `rgba(255,102,196,${op.toFixed(2)})`;
          }),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: {
          label: ctx => ` ${ctx.parsed.y} הזמנות`
        }}},
        scales: {
          x: { ticks: { color: mutedColor, font: { family: C_FONT, size: 9 }, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: mutedColor, font: { family: C_FONT, size: 10 }, stepSize: 1 }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });

    // ── 4. Delivery pie ──
    const ds = s.delivery_split || {};
    const delivLabels  = ['משלוח', 'איסוף'];
    const delivColors  = [C_VIOLET, C_BLUE];
    const delivData    = [ds.delivery || 0, ds.pickup || 0];
    mkChart('chartDelivery', {
      type: 'doughnut',
      data: { labels: delivLabels, datasets: [{ data: delivData, backgroundColor: delivColors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` }}},
      },
    });
    makeLegend('chartDeliveryLegend', delivLabels.map((l, i) => `${l}: ${delivData[i]}`), delivColors);

    // ── 5. Payment pie ──
    const ps = s.payment_split || {};
    const payLabels = ['מזומן', 'אשראי'];
    const payColors = [C_AMBER, C_GREEN];
    const payData   = [ps.cash || 0, ps.credit || 0];
    mkChart('chartPayment', {
      type: 'doughnut',
      data: { labels: payLabels, datasets: [{ data: payData, backgroundColor: payColors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` }}},
      },
    });
    makeLegend('chartPaymentLegend', payLabels.map((l, i) => `${l}: ${payData[i]}`), payColors);

    // ── 6. Status donut ──
    const sb = s.status_breakdown || {};
    const statusMeta = [
      ['new','חדשה', C_VIOLET], ['preparing','בהכנה', C_AMBER],
      ['out_for_delivery','בדרך', C_BLUE], ['delivered','נמסרה', C_GREEN],
      ['done','הסתיימה','#9ca3af'], ['cancelled','בוטלה', C_RED],
    ].filter(([k]) => sb[k]);
    const stLabels = statusMeta.map(([,l]) => l);
    const stColors = statusMeta.map(([,,c]) => c);
    const stData   = statusMeta.map(([k]) => sb[k] || 0);
    mkChart('chartStatus', {
      type: 'doughnut',
      data: { labels: stLabels, datasets: [{ data: stData, backgroundColor: stColors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` }}},
      },
    });
    makeLegend('chartStatusLegend', stLabels.map((l, i) => `${l}: ${stData[i]}`), stColors);

    // ── 7. Top products bar ──
    const tops = s.top_products || [];
    mkChart('chartTopProducts', {
      type: 'bar',
      data: {
        labels: tops.map(p => p.name),
        datasets: [
          { label: 'כמות', data: tops.map(p => p.count), backgroundColor: 'rgba(94,23,235,.8)', borderRadius: 6, yAxisID: 'y' },
          { label: 'הכנסה ₪', data: tops.map(p => p.revenue || 0), backgroundColor: 'rgba(34,197,94,.7)', borderRadius: 6, yAxisID: 'y2' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { labels: { color: textColor, font: { family: C_FONT, size: 11 } }, position: 'top' },
          tooltip: { rtl: true },
        },
        scales: {
          y:  { ticks: { color: textColor,  font: { family: C_FONT, size: 11 } }, grid: { display: false } },
          y2: { display: false },
          x:  { ticks: { color: mutedColor, font: { family: C_FONT, size: 11 } }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });

  } catch (err) {
    if (cardsEl) cardsEl.innerHTML = `<div style="color:red;font-size:.85rem">שגיאה: ${err.message}</div>`;
  }
}

// ─── CANCEL + REFUND (DISPUTE) ───────────────────────────────────────────────

// ─── Item Dispute Modal ───────────────────────────────────────────────────────

let _disputeOrderId = null;

function openDisputeModal(orderId) {
  const o = currentOrders.find(x => x.id === orderId);
  if (!o) return;
  _disputeOrderId = orderId;

  document.getElementById('disputeOrderNum').textContent = `#${o.order_number} — ${o.customer_name || '—'}`;

  const items  = Array.isArray(o.items) ? o.items : [];
  const select = document.getElementById('disputeItemSelect');
  select.innerHTML = items.length
    ? items.map((it, i) => {
        const name  = it.name || it.name_he || 'פריט';
        const qty   = it.quantity || it.qty || 1;
        const price = parseFloat(it.price) || 0;
        return `<option value="${i}">${name}${qty > 1 ? ` ×${qty}` : ''} — ₪${(price * qty).toFixed(0)}</option>`;
      }).join('')
    : '<option value="">אין פריטים</option>';

  updateDisputePreview();
  openModal('disputeModal');
}

function updateDisputePreview() {
  const o = currentOrders.find(x => x.id === _disputeOrderId);
  if (!o) return;
  const items  = Array.isArray(o.items) ? o.items : [];
  const idx    = parseInt(document.getElementById('disputeItemSelect').value);
  const item   = items[idx];
  const el     = document.getElementById('disputePreview');
  if (!item) { el.textContent = ''; return; }

  const name     = item.name || item.name_he || 'פריט';
  const price    = parseFloat(item.price) || 0;
  const qty      = item.quantity || item.qty || 1;
  const priceStr = price > 0 ? ` (החזר של ₪${(price * qty).toFixed(0)})` : '';
  const greeting = o.customer_name ? `שלום ${o.customer_name}! 🙏` : `שלום! 🙏`;

  el.textContent =
    `${greeting}\n\nלצערנו, הפריט "${name}" אזל במלאי ואינו זמין להזמנה מספר ${o.order_number}.\n\nבחר אחת מהאפשרויות הבאות:\n1 — לבטל את ההזמנה לגמרי\n2 — להמשיך ללא "${name}"${priceStr}\n3 — להמשיך עם ההזמנה כפי שהיא\n\nשלח את המספר המתאים 👆`;
}

async function confirmDispute() {
  const o = currentOrders.find(x => x.id === _disputeOrderId);
  if (!o) return;
  const items = Array.isArray(o.items) ? o.items : [];
  const idx   = parseInt(document.getElementById('disputeItemSelect').value);
  const item  = items[idx];
  if (!item) return;

  const name  = item.name || item.name_he || 'פריט';
  const price = parseFloat(item.price) || 0;
  const btn   = document.getElementById('disputeConfirmBtn');

  btn.disabled    = true;
  btn.textContent = 'שולח...';

  try {
    await api('POST', `/orders/${_disputeOrderId}/item-dispute`, { item_name: name, item_price: price });
    closeModal('disputeModal');
    const ord = currentOrders.find(x => x.id === _disputeOrderId);
    if (ord) { ord.dispute_status = 'pending'; ord.dispute_item = name; }
    renderOrdersTable(currentOrders);
    showToast(`הודעה נשלחה ללקוח בנוגע ל"${name}"`);
  } catch (err) {
    showToast(err.message || 'שגיאה בשליחת המחלוקת', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'שלח ללקוח';
  }
}

// ─── Cancel + Refund Modal ────────────────────────────────────────────────────

let _cancelOrderId = null;

function openCancelRefundModal(orderId) {
  const o = currentOrders.find(x => x.id === orderId);
  if (!o) return;
  _cancelOrderId = orderId;

  const isCreditPaid = o.payment_method === 'credit' && o.payment_status === 'paid';

  document.getElementById('cancelRefundTitle').textContent   = `ביטול הזמנה #${o.order_number}`;
  document.getElementById('cancelRefundAmount').textContent  = `₪${parseFloat(o.total_price||0).toFixed(2)}`;
  document.getElementById('cancelRefundPayment').textContent = isCreditPaid ? 'אשראי — יינתן זיכוי' : o.payment_method === 'cash' ? 'מזומן' : 'לא שולם';
  document.getElementById('cancelRefundPayment').style.color = isCreditPaid ? '#16a34a' : '#c07000';
  document.getElementById('cancelRefundReason').value        = '';
  document.getElementById('cancelSendToCustomer').checked    = true;

  // Reset radio to "business"
  document.querySelectorAll('input[name="cancelledBy"]').forEach(r => { r.checked = r.value === 'business'; });

  updateCancelUI();
  openModal('cancelRefundModal');
}

function updateCancelUI() {
  const byCustomer  = document.querySelector('input[name="cancelledBy"]:checked')?.value === 'customer';
  const reason      = document.getElementById('cancelRefundReason')?.value.trim() || '';
  const sendToCustomer = document.getElementById('cancelSendToCustomer')?.checked;

  // Highlight active radio label
  document.getElementById('cancelByBusinessLabel').style.borderColor = !byCustomer ? '#e0004d' : 'var(--border)';
  document.getElementById('cancelByCustomerLabel').style.borderColor  =  byCustomer ? '#e0004d' : 'var(--border)';

  // Update preview
  const orderId = _cancelOrderId;
  const o = orderId ? currentOrders.find(x => x.id === orderId) : null;
  const orderNum = o?.order_number || '—';
  const isCreditPaid = o?.payment_method === 'credit' && o?.payment_status === 'paid';

  const refundLine = isCreditPaid ? '\nהתשלום יזוכה לכרטיסך תוך 3-5 ימי עסקים.' : '';
  const reasonLine = reason && sendToCustomer ? `\nסיבה: ${reason}` : '';
  const byLine     = byCustomer ? 'בוטלה לפי בקשתך.' : 'בוטלה על ידי העסק.';

  document.getElementById('cancelPreview').textContent =
    `❌ הזמנה מספר *${orderNum}* ${byLine}${reasonLine}${refundLine}\n\nמצטערים על אי הנוחות 🙏`;

  // Hint text
  const hint = document.getElementById('cancelSendHint');
  if (hint) hint.textContent = sendToCustomer
    ? 'ההערה תצורף להודעת הביטול ב-WhatsApp'
    : 'ההערה תישמר פנימית בלבד — לא תישלח ללקוח';
}

async function confirmCancelRefund() {
  if (!_cancelOrderId) return;
  const reason         = document.getElementById('cancelRefundReason').value.trim();
  const cancelledBy    = document.querySelector('input[name="cancelledBy"]:checked')?.value || 'business';
  const sendToCustomer = document.getElementById('cancelSendToCustomer').checked;
  const btn            = document.getElementById('cancelRefundBtn');

  btn.textContent = 'מבטל...';
  btn.disabled    = true;

  try {
    const res = await api('POST', `/orders/${_cancelOrderId}/cancel-refund`, {
      reason,
      cancelled_by:     cancelledBy,
      send_to_customer: sendToCustomer,
    });
    closeModal('cancelRefundModal');
    loadOrders();

    const icon = res.refundStatus === 'refunded' ? '✅' : res.refundStatus === 'manual' ? '⚠️' : '✅';
    showToast(`${icon} הזמנה בוטלה${res.refundMessage ? ' — ' + res.refundMessage : ''}`);

    if (res.refundStatus === 'manual') {
      setTimeout(() => alert(`⚠️ נדרש זיכוי ידני\n\n${res.refundMessage}\n\nבצע זיכוי דרך:\nhttps://secure.cardcom.solutions`), 300);
    }
  } catch (err) {
    alert('שגיאה: ' + err.message);
  } finally {
    btn.textContent = 'אשר ביטול';
    btn.disabled    = false;
  }
}

// Update preview live as user types
document.addEventListener('DOMContentLoaded', () => {
  ['cancelRefundReason','cancelSendToCustomer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateCancelUI);
  });
});

// ─── ORDER EDIT ───────────────────────────────────────────────────────────────

let _editOrder = null;
let _editItems = [];

function printOrder(orderId) {
  const o = currentOrders.find(x => x.id === orderId);
  if (!o) return;

  const items    = o.items || [];
  const subtotal = items.reduce((s, it) => s + (parseFloat(it.price)||0) * (it.quantity||it.qty||1), 0);
  const delivery = o.delivery_method === 'delivery' ? (parseFloat(o.delivery_fee)||30) : 0;
  const total    = parseFloat(o.total_price) || (subtotal + delivery);
  const vat      = total * 18 / 118;
  const net      = total - vat;

  const itemRows = items.map(it => {
    const qty      = it.quantity || it.qty || 1;
    const lineTotal= (parseFloat(it.price)||0) * qty;
    const tops     = (it.toppings||[]).map(t => t.name || t.name_he || '').filter(Boolean).join(', ');
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px dashed #e5e7eb">
          <strong>${it.name || it.name_he || 'פריט'}</strong>
          ${tops ? `<br><span style="font-size:.78rem;color:#6b7280">+ ${tops}</span>` : ''}
        </td>
        <td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;text-align:center;color:#6b7280">${qty}</td>
        <td style="padding:8px 0;border-bottom:1px dashed #e5e7eb;text-align:left;font-weight:600">₪${lineTotal.toFixed(2)}</td>
      </tr>`;
  }).join('');

  const addressLine = o.address
    ? `<div style="margin-top:4px;color:#6b7280;font-size:.82rem;display:flex;align-items:center;gap:4px">${SVG.pin} ${o.address}</div>` : '';

  const now = new Date().toLocaleString('he-IL');
  const orderDate = o.created_at ? new Date(o.created_at).toLocaleString('he-IL') : now;

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>קבלה #${o.order_number}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body {
      font-family:'Heebo',sans-serif;
      background:#fff;
      color:#111827;
      padding:0;
      width:80mm;
      margin:0 auto;
    }
    .receipt { padding:16px 12px 24px; }
    .logo-area { text-align:center; padding-bottom:12px; border-bottom:2px dashed #e5e7eb; margin-bottom:14px; }
    .biz-name  { font-size:1.4rem; font-weight:800; color:#5e17eb; }
    .biz-sub   { font-size:.72rem; color:#6b7280; margin-top:2px; }
    .order-num { font-size:1.8rem; font-weight:800; color:#5e17eb; text-align:center; margin:10px 0 4px; }
    .meta      { font-size:.78rem; color:#6b7280; text-align:center; margin-bottom:14px; }
    .section-title { font-size:.7rem; font-weight:700; color:#5e17eb; text-transform:uppercase;
                     letter-spacing:.06em; margin:12px 0 6px; }
    .customer-box  { background:#f5f3ff; border-radius:8px; padding:10px 12px; margin-bottom:12px; }
    .customer-name { font-size:.95rem; font-weight:700; }
    .items-table   { width:100%; border-collapse:collapse; font-size:.85rem; }
    .items-table th { font-size:.68rem; font-weight:700; color:#6b7280; padding-bottom:6px;
                      border-bottom:2px solid #e5e7eb; text-align:right; }
    .items-table th:last-child { text-align:left; }
    .totals { margin-top:14px; border-top:2px dashed #e5e7eb; padding-top:12px; }
    .total-row { display:flex; justify-content:space-between; font-size:.82rem;
                 color:#6b7280; margin-bottom:4px; }
    .total-row.big { font-size:1.1rem; font-weight:800; color:#111827; margin-top:8px; padding-top:8px;
                     border-top:2px solid #111827; }
    .payment-row { display:flex; justify-content:space-between; font-size:.8rem;
                   margin-top:10px; color:#374151; }
    .footer { text-align:center; margin-top:18px; padding-top:12px;
              border-top:2px dashed #e5e7eb; font-size:.72rem; color:#9ca3af; }
    .footer strong { color:#5e17eb; }
    @media print {
      body { width:80mm; }
      @page { size:80mm auto; margin:0; }
      button { display:none !important; }
    }
  </style>
</head>
<body>
<div class="receipt">

  <div class="logo-area">
    <div class="biz-name">פיצה דליבריס</div>
    <div class="biz-sub">jasell.com</div>
  </div>

  <div class="order-num">#${o.order_number}</div>
  <div class="meta">${orderDate}</div>

  <div class="section-title">פרטי לקוח</div>
  <div class="customer-box">
    <div class="customer-name">${o.customer_name || '—'}</div>
    ${o.customer_phone ? `<div style="font-size:.8rem;color:#6b7280;margin-top:2px">טל׳: ${o.customer_phone}</div>` : ''}
    <div style="margin-top:4px;font-size:.8rem">
      ${o.delivery_method === 'delivery' ? 'משלוח' : 'איסוף עצמי'}
    </div>
    ${addressLine}
    ${o.courier_notes ? `<div style="margin-top:4px;font-size:.75rem;color:#6b7280">הערות: ${o.courier_notes}</div>` : ''}
  </div>

  <div class="section-title">פריטים</div>
  <table class="items-table">
    <thead><tr>
      <th>מנה</th>
      <th style="text-align:center;width:30px">כמות</th>
      <th style="text-align:left;width:60px">מחיר</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    ${delivery ? `<div class="total-row"><span>משלוח</span><span>₪${delivery.toFixed(2)}</span></div>` : ''}
    <div class="total-row"><span>לפני מע"מ</span><span>₪${net.toFixed(2)}</span></div>
    <div class="total-row"><span>מע"מ 18%</span><span>₪${vat.toFixed(2)}</span></div>
    <div class="total-row big"><span>סה"כ לתשלום</span><span>₪${total.toFixed(2)}</span></div>
  </div>

  <div class="payment-row">
    <span>${o.payment_method === 'cash' ? 'מזומן' : 'אשראי'}</span>
    <span>${o.payment_status === 'paid' ? 'שולם' : 'ממתין לתשלום'}</span>
  </div>

  <div class="footer">
    תודה שבחרת <strong>פיצה דליבריס</strong>!<br>
    הדפסה: ${now}
  </div>
</div>
<button onclick="window.close()" style="display:block;margin:16px auto 0;padding:10px 28px;background:#5e17eb;color:#fff;border:none;border-radius:50px;font-family:inherit;font-size:.85rem;font-weight:700;cursor:pointer">סגור</button>
<script>
  window.onload = () => { window.print(); };
  window.onafterprint = () => { window.close(); };
<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=400,height=650');
  w.document.write(html);
  w.document.close();
}

async function openOrderEdit(orderId) {
  const order = currentOrders.find(o => o.id === orderId);
  if (!order) return;
  _editOrder = order;
  _editItems = JSON.parse(JSON.stringify(order.items || []));

  document.getElementById('orderEditTitle').textContent = `עריכת הזמנה #${order.order_number}`;

  // Parse address
  const addr = order.address || '';
  document.getElementById('editCity').value       = order.address_city   || '';
  document.getElementById('editStreet').value     = order.address_street || '';
  document.getElementById('editStreetNum').value  = order.address_num    || '';
  document.getElementById('editDestType').value   = order.destination_type || '';
  document.getElementById('editCourierNotes').value = order.courier_notes || '';

  renderEditItems();
  updateEditSummary(order);
  openModal('orderEditModal');
}

function renderEditItems() {
  const el = document.getElementById('editItemsList');
  if (!el) return;
  if (!_editItems.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;padding:8px 0">אין פריטים</div>';
    return;
  }
  el.innerHTML = _editItems.map((item, i) => {
    const qty = item.quantity || 1;
    const toppings = (item.toppings || []).map(t => t.name || t.name_he || '').filter(Boolean).join(', ');
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#faf8ff;border-radius:12px;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.88rem">${item.name||item.name_he||'פריט'}</div>
          ${toppings ? `<div style="font-size:.75rem;color:var(--text-muted)">+ ${toppings}</div>` : ''}
        </div>
        <div style="font-weight:700;color:var(--primary);min-width:50px;text-align:center">₪${((item.price||0)*qty).toFixed(0)}</div>
        <div style="display:flex;align-items:center;gap:4px">
          <button onclick="changeQty(${i},-1)" style="width:26px;height:26px;border-radius:50%;border:2px solid var(--border);background:#fff;cursor:pointer;font-weight:700;font-size:1rem;display:flex;align-items:center;justify-content:center">−</button>
          <span style="font-weight:800;min-width:20px;text-align:center">${qty}</span>
          <button onclick="changeQty(${i},+1)" style="width:26px;height:26px;border-radius:50%;border:2px solid var(--primary);background:var(--primary-soft);color:var(--primary);cursor:pointer;font-weight:700;font-size:1rem;display:flex;align-items:center;justify-content:center">+</button>
        </div>
        <button onclick="removeEditItem(${i})" style="background:none;border:none;cursor:pointer;color:#e0004d;padding:0 4px;display:flex;align-items:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>`;
  }).join('');
  updateEditSummary(_editOrder);
}

function changeQty(i, delta) {
  _editItems[i].quantity = Math.max(1, (_editItems[i].quantity || 1) + delta);
  renderEditItems();
}

function removeEditItem(i) {
  _editItems.splice(i, 1);
  renderEditItems();
}

function updateEditSummary(order) {
  const deliveryFee = order?.delivery_method === 'delivery' ? (parseFloat(order?.delivery_fee) || 30) : 0;
  const subtotal = _editItems.reduce((s, item) => s + (parseFloat(item.price)||0) * (item.quantity||1), 0);
  const total = subtotal + deliveryFee;
  const vat   = total * 18 / 118;

  document.getElementById('editSubtotal').textContent    = `₪${subtotal.toFixed(2)}`;
  document.getElementById('editDeliveryFee').textContent  = `₪${deliveryFee.toFixed(0)}`;
  document.getElementById('editTotal').textContent        = `₪${total.toFixed(2)}`;
  document.getElementById('editVat').textContent          = `₪${vat.toFixed(2)}`;
}

function openAddProductToOrder() {
  // Simple prompt for now — future: product picker modal
  const name = prompt('שם המוצר:');
  if (!name) return;
  const price = parseFloat(prompt('מחיר:') || '0');
  _editItems.push({ name, price, quantity: 1, toppings: [] });
  renderEditItems();
}

async function saveOrderEdit() {
  if (!_editOrder) return;
  const city   = document.getElementById('editCity').value.trim();
  const street = document.getElementById('editStreet').value.trim();
  const num    = document.getElementById('editStreetNum').value.trim();
  const addr   = [street, num, city].filter(Boolean).join(', ');

  const deliveryFee = _editOrder.delivery_method === 'delivery' ? 30 : 0;
  const subtotal    = _editItems.reduce((s,i) => s+(parseFloat(i.price)||0)*(i.quantity||1), 0);

  try {
    await api('PUT', `/orders/${_editOrder.id}`, {
      items:            _editItems,
      address:          addr || _editOrder.address,
      destination_type: document.getElementById('editDestType').value,
      courier_notes:    document.getElementById('editCourierNotes').value.trim(),
      total_price:      (subtotal + deliveryFee).toFixed(2),
    });
    closeModal('orderEditModal');
    await loadOrders();
    showToast('הזמנה עודכנה');
  } catch (err) { alert(err.message); }
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

let allCategories = [];          // flat category list
let categoriesWithProducts = []; // grouped response from API
const expandedCategories = new Set();
const expandedProducts   = new Set();

async function loadProducts() {
  const container = document.getElementById('productsTable');
  container.innerHTML = '<div class="p-8 text-center text-gray-400">טוען...</div>';
  try {
    [categoriesWithProducts, allCategories] = await Promise.all([
      api('GET', '/products'),   // returns grouped by category
      api('GET', '/categories'),
    ]);
    renderProductsTable();
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-center text-red-500">${err.message}</div>`;
  }
}

function imgThumb(url) {
  if (!url) return `<div style="width:52px;height:52px;border-radius:10px;border:1.5px dashed var(--border);background:var(--bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-muted)">${SVG.camera}</div>`;
  return `<img src="${url}" style="width:52px;height:52px;object-fit:cover;border-radius:10px;border:1.5px solid var(--border);flex-shrink:0;display:block" onerror="this.style.display='none'">`;
}

function toggleSwitch(isOn, onClickFn) {
  return `<button onclick="${onClickFn}" class="toggle ${isOn?'on':'off'}">
    <span class="toggle-dot"></span>
  </button>`;
}

function renderProductsTable() {
  const container = document.getElementById('productsTable');
  if (!categoriesWithProducts.length) {
    container.innerHTML = '<div class="p-12 text-center text-gray-400">אין קטגוריות — לחץ "+ קטגוריה"</div>';
    return;
  }

  const categoryBlocks = categoriesWithProducts.map((cat) => {
    const isCatExpanded = expandedCategories.has(cat.id);
    const products = cat.products || [];

    const catHeader = `
      <div class="cat-header" onclick="toggleCategoryExpand('${cat.id}')">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:.9rem;color:var(--text-muted);transition:transform .2s;display:inline-block;transform:rotate(${isCatExpanded?'0deg':'-90deg'})"">▾</span>
          <span style="font-size:1.5rem;line-height:1">${cat.emoji || '🍽️'}</span>
          <div>
            <span style="font-weight:700;font-size:.95rem;color:var(--text)">${cat.name_he}</span>
            <span style="font-size:.75rem;color:var(--text-muted);margin-right:8px">${products.length} פריטים</span>
            ${cat.has_toppings ? `<span style="font-size:.72rem;background:var(--primary-soft);color:var(--primary);padding:2px 10px;border-radius:50px;font-weight:600">תוספות</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px" onclick="event.stopPropagation()">
          <button onclick="openProductModal(null,'${cat.id}')" class="btn btn-primary btn-sm">+ מוצר</button>
          <button onclick="openCategoryModal(${encodeProduct(cat)})" class="btn btn-ghost btn-sm">עריכה</button>
          <button onclick="deleteCategory('${cat.id}','${cat.name_he}')" class="btn-danger">מחיקה</button>
        </div>
      </div>`;

    if (!isCatExpanded) return `<div style="margin-bottom:12px;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(94,23,235,.07)">${catHeader}</div>`;

    const productRows = products.length
      ? products.map((p) => renderProductRow(p, cat)).join('')
      : `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:.88rem">אין מוצרים — לחץ "+ מוצר"</div>`;

    return `<div style="margin-bottom:16px;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(94,23,235,.07);background:#fff">${catHeader}${productRows}</div>`;
  }).join('');

  container.innerHTML = `<div>${categoryBlocks}</div>`;
}

function renderProductRow(p, cat) {
  const isExpanded   = expandedProducts.has(p.id);
  const pData        = encodeProduct(p);
  const addCount     = (p.additions || []).length;

  const additionsSection = isExpanded ? `
    <div style="margin:0 20px 16px;border-radius:14px;border:1.5px solid var(--primary-soft);overflow:hidden;background:#faf8ff">
      <div style="display:grid;grid-template-columns:1fr 80px 60px 44px 110px;padding:10px 18px;background:var(--primary-soft);font-size:.72rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.04em;gap:16px">
        <span>תוספת</span><span>מחיר</span><span>תמונה</span><span>זמין</span><span></span>
      </div>
      ${(p.additions||[]).map((a) => `
        <div style="display:grid;grid-template-columns:1fr 80px 60px 44px 110px;padding:12px 18px;border-top:1px solid var(--primary-soft);align-items:center;gap:16px;font-size:.85rem">
          <span style="font-weight:600">${a.name_he}</span>
          <span style="font-weight:700;color:var(--primary)">+₪${parseFloat(a.price).toFixed(2)}</span>
          <span>${imgThumb(a.image_url)}</span>
          <span>${toggleSwitch(a.is_available, `toggleAddition('${p.id}','${a.id}',${!a.is_available})`)}</span>
          <div style="display:flex;gap:6px">
            <button onclick="openAdditionModal('${p.id}',${encodeAddition(a)})" class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:.75rem">עריכה</button>
            <button onclick="deleteAddition('${p.id}','${a.id}','${a.name_he}')" class="btn-danger" style="font-size:.75rem;padding:4px 8px">מחק</button>
          </div>
        </div>`).join('')}
      ${!addCount ? `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.82rem">אין תוספות — לחץ להוספה</div>` : ''}
      <div style="padding:12px 18px;border-top:1px solid var(--primary-soft)">
        <button onclick="openAdditionModal('${p.id}',null)" class="btn btn-outline btn-sm">+ הוסף תוספת</button>
      </div>
    </div>` : '';

  const expandBtn = `<button onclick="toggleExpand('${p.id}')"
    title="${isExpanded ? 'סגור תוספות' : 'ערוך תוספות'}"
    style="background:${addCount ? 'var(--primary)' : 'var(--primary-soft)'};border:none;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:.78rem;color:${addCount ? '#fff' : 'var(--primary)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700">
    ${isExpanded ? '▾' : (addCount ? addCount : '+')}</button>`;

  return `
    <div class="product-row">
      ${expandBtn}
      ${imgThumb(p.image_url)}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.92rem">${p.name_he}</div>
        ${p.name_en ? `<div style="font-size:.75rem;color:var(--text-muted)" dir="ltr">${p.name_en}</div>` : ''}
        ${p.description ? `<div style="font-size:.73rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;margin-top:2px">${p.description}</div>` : ''}
      </div>
      <div style="font-weight:800;font-size:.95rem;color:var(--primary);min-width:70px">₪${parseFloat(p.price).toFixed(2)}</div>
      <div style="font-size:.75rem;color:var(--text-muted);min-width:60px;text-align:center">
        ${addCount ? `<span style="background:var(--primary-soft);color:var(--primary);padding:2px 10px;border-radius:50px;font-weight:700">${addCount} תוספות</span>` : ''}
      </div>
      ${toggleSwitch(p.is_available, `toggleProduct('${p.id}',${!p.is_available})`)}
      <div style="display:flex;gap:8px;margin-right:4px">
        <button onclick="openProductModal(${pData},'${p.category_id||''}')" class="btn btn-ghost btn-sm">עריכה</button>
        <button onclick="deleteProduct('${p.id}','${p.name_he}')" class="btn-danger">מחק</button>
      </div>
    </div>
    ${additionsSection}`;
}

function encodeProduct(p) {
  return `'${btoa(unescape(encodeURIComponent(JSON.stringify(p))))}'`;
}
function encodeAddition(a) {
  return `'${btoa(unescape(encodeURIComponent(JSON.stringify(a))))}'`;
}
function decodeData(b64) {
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

function findProduct(productId) {
  for (const cat of categoriesWithProducts) {
    const p = (cat.products || []).find((x) => x.id === productId);
    if (p) return p;
  }
  return null;
}

function toggleExpand(id) {
  if (expandedProducts.has(id)) expandedProducts.delete(id);
  else expandedProducts.add(id);
  renderProductsTable();
}

function toggleCategoryExpand(id) {
  if (expandedCategories.has(id)) expandedCategories.delete(id);
  else expandedCategories.add(id);
  renderProductsTable();
}

async function toggleProduct(id, available) {
  try {
    await api('PATCH', `/products/${id}`, { is_available: available });
    const p = findProduct(id);
    if (p) p.is_available = available;
    renderProductsTable();
  } catch (err) { alert(err.message); }
}

async function toggleAddition(productId, addId, available) {
  try {
    await api('PATCH', `/products/${productId}/additions/${addId}`, { is_available: available });
    const p = findProduct(productId);
    if (p) { const a = (p.additions||[]).find((x) => x.id === addId); if (a) a.is_available = available; }
    renderProductsTable();
  } catch (err) { alert(err.message); }
}

// ── Category modal ──

function openCategoryModal(b64OrNull) {
  const c = b64OrNull ? decodeData(b64OrNull) : null;
  document.getElementById('categoryModalTitle').textContent = c?.id ? 'עריכת קטגוריה' : 'קטגוריה חדשה';
  document.getElementById('categoryId').value           = c?.id           || '';
  document.getElementById('categoryEmoji').value        = c?.emoji        || '';
  document.getElementById('categoryNameHe').value       = c?.name_he      || '';
  document.getElementById('categoryNameEn').value       = c?.name_en      || '';
  document.getElementById('categoryHasToppings').checked= !!c?.has_toppings;
  document.getElementById('categoryModal').classList.remove('hidden');
}

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const body = {
    name_he:      document.getElementById('categoryNameHe').value.trim(),
    name_en:      document.getElementById('categoryNameEn').value.trim(),
    emoji:        document.getElementById('categoryEmoji').value.trim() || '🍽️',
    has_toppings: document.getElementById('categoryHasToppings').checked,
  };
  try {
    if (id) await api('PATCH', `/categories/${id}`, body);
    else    await api('POST',  '/categories', body);
    closeModal('categoryModal');
    loadProducts();
  } catch (err) { alert(err.message); }
});

async function deleteCategory(id, name) {
  if (!confirm(`למחוק את "${name}"?`)) return;
  try {
    await api('DELETE', `/categories/${id}`);
    loadProducts();
  } catch (err) { alert(err.message); }
}

// ── Product modal ──
let _productCategoryId = null;

function openProductModal(b64OrNull, categoryId) {
  const p = b64OrNull ? decodeData(b64OrNull) : null;
  _productCategoryId = categoryId || p?.category_id || null;
  document.getElementById('productModalTitle').textContent = p?.id ? 'עריכת מוצר' : 'מוצר חדש';
  document.getElementById('productId').value          = p?.id          || '';
  document.getElementById('productNameHe').value      = p?.name_he     || '';
  document.getElementById('productNameEn').value      = p?.name_en     || '';
  document.getElementById('productPrice').value       = p?.price       || '';
  document.getElementById('productImageUrl').value    = p?.image_url   || '';
  document.getElementById('productDescription').value = p?.description || '';
  document.getElementById('productImgFile').value     = '';
  previewProductImg(p?.image_url || '');
  openModal('productModal');
}

function previewProductImg(url) {
  const box = document.getElementById('productImgPreview');
  if (!box) return;
  if (url && url.startsWith('http')) {
    box.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=SVG.camera">`;
  } else {
    box.innerHTML = SVG.camera;
  }
}

async function uploadProductImage(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const btn  = document.getElementById('productUploadBtn');
  btn.textContent = 'מעלה...';
  btn.disabled = true;
  try {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה');
    document.getElementById('productImageUrl').value = data.url;
    previewProductImg(data.url);
    showToast('תמונה הועלתה');
  } catch (err) {
    alert('שגיאה בהעלאה: ' + err.message);
  } finally {
    btn.textContent = 'העלאת קובץ';
    btn.disabled = false;
  }
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const body = {
    name_he:     document.getElementById('productNameHe').value.trim(),
    name_en:     document.getElementById('productNameEn').value.trim(),
    price:       parseFloat(document.getElementById('productPrice').value),
    image_url:   document.getElementById('productImageUrl').value.trim()    || null,
    description: document.getElementById('productDescription').value.trim() || null,
    category_id: _productCategoryId || null,
  };
  try {
    if (id) await api('PATCH', `/products/${id}`, body);
    else    await api('POST',  '/products', body);
    closeModal('productModal');
    loadProducts();
  } catch (err) { alert(err.message); }
});

async function deleteProduct(id, name) {
  if (!confirm(`למחוק את "${name}"?`)) return;
  try {
    await api('DELETE', `/products/${id}`);
    expandedProducts.delete(id);
    loadProducts();
  } catch (err) { alert(err.message); }
}

// ── Addition modal ──

let _additionProductId = null;

function openAdditionModal(productId, b64OrNull) {
  _additionProductId = productId;
  const a = b64OrNull ? decodeData(b64OrNull) : null;
  document.getElementById('additionModalTitle').textContent = a?.id ? 'עריכת תוספת' : 'תוספת חדשה';
  document.getElementById('additionId').value       = a?.id        || '';
  document.getElementById('additionNameHe').value   = a?.name_he   || '';
  document.getElementById('additionNameEn').value   = a?.name_en   || '';
  document.getElementById('additionPrice').value    = a?.price      || '';
  document.getElementById('additionImageUrl').value = a?.image_url  || '';
  document.getElementById('additionImgFile').value  = '';
  previewAdditionImg(a?.image_url || '');
  openModal('additionModal');
}

function previewAdditionImg(url) {
  const box = document.getElementById('additionImgPreview');
  if (!box) return;
  if (url && url.startsWith('http')) {
    box.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=SVG.camera">`;
  } else {
    box.innerHTML = SVG.camera;
  }
}

async function uploadAdditionImage(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const btn  = document.getElementById('additionUploadBtn');
  btn.textContent = 'מעלה...';
  btn.disabled = true;
  try {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'שגיאה');
    document.getElementById('additionImageUrl').value = data.url;
    previewAdditionImg(data.url);
    showToast('תמונה הועלתה');
  } catch (err) {
    alert('שגיאה בהעלאה: ' + err.message);
  } finally {
    btn.textContent = 'העלאת קובץ';
    btn.disabled = false;
  }
}

document.getElementById('additionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id  = document.getElementById('additionId').value;
  const pid = _additionProductId;
  const body = {
    name_he:   document.getElementById('additionNameHe').value.trim(),
    name_en:   document.getElementById('additionNameEn').value.trim(),
    price:     parseFloat(document.getElementById('additionPrice').value),
    image_url: document.getElementById('additionImageUrl').value.trim() || null,
  };
  try {
    if (id) await api('PATCH', `/products/${pid}/additions/${id}`, body);
    else    await api('POST',  `/products/${pid}/additions`, body);
    expandedProducts.add(pid);
    closeModal('additionModal');
    loadProducts();
  } catch (err) { alert(err.message); }
});

async function deleteAddition(productId, addId, name) {
  if (!confirm(`למחוק את "${name}"?`)) return;
  try {
    await api('DELETE', `/products/${productId}/additions/${addId}`);
    loadProducts();
  } catch (err) { alert(err.message); }
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

let allCustomers = [];
let selectedPhones = new Set();

async function loadCustomers() {
  const container = document.getElementById('customersTable');
  container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted)">טוען...</div>';
  selectedPhones.clear();
  try {
    // Always load all customers — filtering is client-side
    allCustomers = await api('GET', '/customers');
    renderCustomerStats(allCustomers);
    filterCustomers();
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;color:red">${err.message}</div>`;
  }
}

function renderCustomerStats(customers) {
  const statsEl = document.getElementById('customerStats');
  if (!statsEl) return;

  const total      = customers.length;
  const returning  = customers.filter((c) => parseInt(c.order_count) >= 2).length;
  const retPct     = total ? Math.round((returning / total) * 100) : 0;
  const totalOrders = customers.reduce((s, c) => s + parseInt(c.order_count || 0), 0);
  const totalRev   = customers.reduce((s, c) => s + parseFloat(c.total_spent || 0), 0);

  statsEl.innerHTML = `
    <div class="stat-card violet">
      <div class="stat-value">${total}</div>
      <div class="stat-label">סה"כ לקוחות</div>
    </div>
    <div class="stat-card accent">
      <div class="stat-value" style="color:var(--accent)">${returning}</div>
      <div class="stat-label">לקוחות חוזרים <span style="font-size:.75rem;background:var(--accent-soft);color:var(--accent);padding:1px 8px;border-radius:50px">${retPct}%</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:var(--primary)">${totalOrders}</div>
      <div class="stat-label">סה"כ הזמנות</div>
    </div>
    <div class="stat-card green">
      <div class="stat-value">₪${Math.round(totalRev).toLocaleString()}</div>
      <div class="stat-label">סה"כ הכנסות</div>
    </div>`;
}

function filterCustomers() {
  const q          = (document.getElementById('customerSearch')?.value || '').trim().toLowerCase();
  const returningOnly = document.getElementById('returningOnly')?.checked;

  let filtered = allCustomers;
  if (returningOnly) filtered = filtered.filter((c) => parseInt(c.order_count) >= 2);
  if (q) filtered = filtered.filter((c) =>
    (c.name         || '').toLowerCase().includes(q) ||
    (c.customer_phone || c.phone || '').includes(q)  ||
    (c.last_address || '').toLowerCase().includes(q)
  );
  renderCustomersTable(filtered);
}

function renderCustomersTable(customers) {
  const container = document.getElementById('customersTable');
  if (!customers.length) {
    container.innerHTML = '<div class="empty-state">אין לקוחות תואמים לחיפוש</div>';
    return;
  }
  container.innerHTML = `
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="selectAll" onchange="toggleSelectAll(this)"></th>
          <th>שם לקוח</th>
          <th>טלפון</th>
          <th>הזמנות</th>
          <th>סה"כ רכישות</th>
        </tr>
      </thead>
      <tbody>
        ${customers.map((c) => {
          const isReturning = parseInt(c.order_count) >= 2;
          return `<tr>
            <td><input type="checkbox" value="${c.phone}" onchange="toggleCustomer('${c.phone}',this.checked)" class="customer-checkbox"></td>
            <td>
              <div style="font-weight:700">${c.name||'—'}</div>
              ${isReturning ? '<span style="font-size:.68rem;background:var(--accent-soft);color:var(--accent);padding:1px 8px;border-radius:50px;font-weight:700">חוזר</span>' : ''}
            </td>
            <td style="color:var(--text-muted);font-size:.82rem" dir="ltr">${c.customer_phone||c.phone||'—'}</td>
            <td style="text-align:center;font-weight:800;color:var(--primary)">${c.order_count}</td>
            <td style="font-weight:800;color:var(--text)">₪${parseFloat(c.total_spent||0).toFixed(0)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
}

function toggleSelectAll(cb) {
  document.querySelectorAll('.customer-checkbox').forEach((el) => {
    el.checked = cb.checked;
    toggleCustomer(el.value, cb.checked);
  });
}
function toggleCustomer(phone, selected) {
  if (selected) selectedPhones.add(phone);
  else selectedPhones.delete(phone);
}

function openBroadcastModal() {
  if (selectedPhones.size === 0) { alert('יש לבחור לקוחות לפני השליחה'); return; }
  document.getElementById('broadcastRecipients').textContent = `נמענים נבחרו: ${selectedPhones.size}`;
  document.getElementById('broadcastMessage').value = '';
  openModal('broadcastModal');
}

async function sendBroadcast() {
  const message = document.getElementById('broadcastMessage').value.trim();
  if (!message) { alert('יש לכתוב הודעה'); return; }
  try {
    const result = await api('POST', '/customers/broadcast', {
      phones:  [...selectedPhones],
      message,
    });
    alert(`נשלח: ${result.sent} | נכשל: ${result.failed}`);
    closeModal('broadcastModal');
  } catch (err) { alert(err.message); }
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

// ─── SETTINGS ────────────────────────────────────────────────────────────────

let _currentSettings = {};
let _deliveryZones   = [];

async function loadSettings() {
  const container = document.getElementById('settingsForm');
  container.innerHTML = '<div style="color:var(--text-muted);padding:20px">טוען...</div>';
  try {
    _currentSettings = await api('GET', '/settings');
    _deliveryZones   = Array.isArray(_currentSettings.delivery_zones) ? _currentSettings.delivery_zones : [];
    renderSettingsForm(_currentSettings);
  } catch (err) {
    container.innerHTML = `<div style="color:red">${err.message}</div>`;
  }
}

const DAY_LABELS = { sun:'ראשון', mon:'שני', tue:'שלישי', wed:'רביעי', thu:'חמישי', fri:'שישי', sat:'שבת' };
const DAY_ORDER  = ['sun','mon','tue','wed','thu','fri','sat'];

// ── Helpers ──

function sField(id, label, value, type='text', placeholder='') {
  return `<div style="margin-bottom:14px">
    <label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${label}</label>
    <input type="${type}" id="${id}" value="${value||''}" placeholder="${placeholder}" style="width:100%">
  </div>`;
}

function sToggle(key, label, checked, cls='') {
  return `<div class="setting-row ${cls}">
    <span style="font-weight:600;font-size:.9rem">${label}</span>
    <label class="toggle-switch">
      <input type="checkbox" class="setting-toggle" data-key="${key}" ${checked?'checked':''}>
      <span class="toggle-track"></span>
    </label>
  </div>`;
}

function saveBtn(fn, label='שמור') {
  return `<div style="display:flex;justify-content:flex-end;margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
    <button onclick="${fn}()" class="btn btn-primary">${label}</button>
  </div>`;
}

function sCard(title, content) {
  return `<div class="card" style="padding:24px 26px;margin-bottom:18px">
    <div style="font-size:1rem;font-weight:800;color:var(--text);margin-bottom:18px">${title}</div>
    ${content}
  </div>`;
}

async function saveSection(updates, successMsg) {
  try {
    await api('PATCH', '/settings', updates);
    showToast(successMsg || 'נשמר');
  } catch (err) { alert(err.message); }
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;padding:10px 24px;border-radius:50px;font-weight:700;font-size:.88rem;z-index:9999;box-shadow:0 4px 20px rgba(94,23,235,.3)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── Render ──

function renderSettingsForm(s) {
  const hours = s.business_hours || {};

  const hoursRows = DAY_ORDER.map((day) => {
    const h = hours[day] || { open: '10:00', close: '23:00', is_open: true };
    const open = h.is_open !== false;
    return `<div class="hours-row" style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--primary-soft);border-radius:14px;margin-bottom:8px">
      <label class="toggle-switch">
        <input type="checkbox" class="hours-active" data-day="${day}" ${open?'checked':''}>
        <span class="toggle-track"></span>
      </label>
      <span style="font-weight:700;font-size:.85rem;color:var(--text);min-width:62px">יום ${DAY_LABELS[day]}</span>
      <input type="time" value="${h.open}"  data-day="${day}" data-field="open"  class="hours-input" style="width:110px" ${!open?'disabled':''}>
      <span style="color:var(--text-muted);font-size:.82rem">—</span>
      <input type="time" value="${h.close}" data-day="${day}" data-field="close" class="hours-input" style="width:110px" ${!open?'disabled':''}>
    </div>`;
  }).join('');

  const ico = (path, vb='0 0 24 24') =>
    `<svg width="16" height="16" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-left:6px">${path}</svg>`;

  const ICONS = {
    biz:     ico('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>'),
    pay:     ico('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
    delivery:ico('<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 7v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
    edit:    ico('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
    clock:   ico('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    pin:     ico('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  };

  document.getElementById('settingsForm').innerHTML = `

    ${sCard(`${ICONS.biz} פרטי העסק`, `
      ${sField('biz_name',    'שם העסק',           s.business_name    || '', 'text', 'פיצה דליבריס')}
      ${sField('biz_address', 'כתובת העסק',         s.business_address || '', 'text', 'רוטשילד 19, תל אביב')}
      ${sField('biz_bot_url', 'כתובת שרת הבוט',     s.bot_url          || '', 'url',  'https://...')}
      ${sField('biz_pickup',  'כתובת לאיסוף עצמי', s.pickup_address   || '', 'text', 'רוטשילד 19, תל אביב')}
      ${saveBtn('saveBizInfo')}
    `)}

    ${sCard(`${ICONS.pay} אמצעי תשלום`, `
      ${sToggle('payment_cash',   'מזומן',   s.payment_cash   !== false)}
      ${sToggle('payment_credit', 'אשראי',   s.payment_credit !== false)}
      ${sToggle('payment_bit',    'ביט',      !!s.payment_bit)}
      ${sToggle('payment_paybox', 'פייבוקס',  !!s.payment_paybox)}
      ${sToggle('payment_other',  'אחר',      !!s.payment_other)}
      ${saveBtn('savePayments')}
    `)}

    ${sCard(`${ICONS.delivery} סוגי הזמנה`, `
      ${sToggle('delivery_enabled', 'משלוח מאופשר',      s.delivery_enabled !== false)}
      ${sToggle('pickup_enabled',   'איסוף עצמי מאופשר', s.pickup_enabled   !== false)}
      ${sToggle('is_open',          'בוט פתוח לקבלת הזמנות', s.is_open !== false)}
      ${saveBtn('saveOrderTypes')}
    `)}

    ${sCard(`${ICONS.edit} הגדרות שינוי הזמנות`, `
      ${sToggle('allow_order_edits', 'אפשר ללקוח לשנות/לבטל הזמנה', s.allow_order_edits !== false)}
      <div style="margin-top:14px;padding:14px;background:#faf8ff;border-radius:12px">
        <div style="font-weight:700;font-size:.85rem;margin-bottom:12px;color:var(--text)">תנאי לשינוי</div>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;font-size:.88rem">
          <input type="radio" name="editMode" value="time" ${!s.edit_from_confirmation?'checked':''}
            onchange="document.getElementById('editTimeLimitRow').style.display='flex'">
          בתוך
          <input type="number" id="editTimeLimit" value="${s.edit_time_limit ?? 15}" min="1" max="60"
            style="width:64px;padding:5px 10px;border-radius:8px;border:2px solid var(--border);font-family:inherit;font-weight:700">
          דקות מביצוע ההזמנה
        </label>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.88rem">
          <input type="radio" name="editMode" value="confirm" ${s.edit_from_confirmation?'checked':''}
            onchange="document.getElementById('editTimeLimitRow').style.display='none'">
          מרגע אישור ההזמנה (ללא מגבלת זמן)
        </label>
      </div>
      ${saveBtn('saveEditSettings')}
    `)}

    ${sCard(`${ICONS.clock} שעות פעילות`, `
      <div>${hoursRows}</div>
      ${saveBtn('saveHours')}
    `)}

    ${sCard(`${ICONS.pin} אזורי משלוח`, `
      <div id="zonesTable"></div>
      <div style="margin-top:12px">
        <button onclick="addZoneRow()" class="btn btn-outline btn-sm">+ הוסף אזור</button>
      </div>
      ${saveBtn('saveZones')}
    `)}
  `;

  renderZonesTable();

  // Sync hours-active toggle → enable/disable time inputs
  document.querySelectorAll('.hours-active').forEach((cb) => {
    cb.addEventListener('change', () => {
      const day = cb.dataset.day;
      document.querySelectorAll(`.hours-input[data-day="${day}"]`)
        .forEach((inp) => { inp.disabled = !cb.checked; inp.style.opacity = cb.checked ? '1' : '.4'; });
    });
    // Set initial opacity
    const day = cb.dataset.day;
    document.querySelectorAll(`.hours-input[data-day="${day}"]`)
      .forEach(inp => inp.style.opacity = cb.checked ? '1' : '.4');
  });
}

// ── Section save functions ──

async function saveBizInfo() {
  await saveSection({
    business_name:    document.getElementById('biz_name').value.trim(),
    business_address: document.getElementById('biz_address').value.trim(),
    bot_url:          document.getElementById('biz_bot_url').value.trim(),
    pickup_address:   document.getElementById('biz_pickup').value.trim(),
  });
}

async function savePayments() {
  const updates = {};
  document.querySelectorAll('.setting-toggle[data-key^="payment_"]').forEach((el) => {
    updates[el.dataset.key] = el.checked;
  });
  await saveSection(updates);
}

async function saveOrderTypes() {
  const updates = {};
  ['delivery_enabled','pickup_enabled','is_open'].forEach((key) => {
    const el = document.querySelector(`.setting-toggle[data-key="${key}"]`);
    if (el) updates[key] = el.checked;
  });
  await saveSection(updates);
}

async function saveEditSettings() {
  const allow  = document.querySelector('.setting-toggle[data-key="allow_order_edits"]')?.checked ?? true;
  const mode   = document.querySelector('input[name="editMode"]:checked')?.value;
  const limit  = parseInt(document.getElementById('editTimeLimit')?.value) || 15;
  await saveSection({
    allow_order_edits:    allow,
    edit_from_confirmation: mode === 'confirm',
    edit_time_limit:      limit,
  });
}

async function saveHours() {
  const businessHours = {};
  DAY_ORDER.forEach((day) => {
    const active = document.querySelector(`.hours-active[data-day="${day}"]`)?.checked ?? true;
    const open   = document.querySelector(`.hours-input[data-day="${day}"][data-field="open"]`)?.value || '10:00';
    const close  = document.querySelector(`.hours-input[data-day="${day}"][data-field="close"]`)?.value || '23:00';
    businessHours[day] = { open, close, is_open: active };
  });
  await saveSection({ business_hours: businessHours });
}

// ── Delivery Zones ──

function renderZonesTable() {
  const t = document.getElementById('zonesTable');
  if (!t) return;
  if (!_deliveryZones.length) {
    t.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;padding:8px 0">אין אזורי משלוח — הוסף אזור ראשון</div>';
    return;
  }
  t.innerHTML = `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.83rem">
      <thead>
        <tr style="background:var(--primary-soft);text-align:right">
          <th style="padding:9px 12px;font-weight:700;color:var(--primary)">עיר</th>
          <th style="padding:9px 12px;font-weight:700;color:var(--primary)">אזור</th>
          <th style="padding:9px 12px;font-weight:700;color:var(--primary)">דמי משלוח (₪)</th>
          <th style="padding:9px 12px;font-weight:700;color:var(--primary)">מינימום (₪)</th>
          <th style="padding:9px 12px;font-weight:700;color:var(--primary)">זמן משוער (דק׳)</th>
          <th style="padding:9px 12px"></th>
        </tr>
      </thead>
      <tbody>
        ${_deliveryZones.map((z, i) => `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px 10px"><input type="text" value="${z.city||''}" data-zi="${i}" data-zf="city"
            style="width:100%;min-width:80px" class="zone-inp"></td>
          <td style="padding:8px 10px"><input type="text" value="${z.area||''}" data-zi="${i}" data-zf="area"
            style="width:100%;min-width:80px" class="zone-inp"></td>
          <td style="padding:8px 10px"><input type="number" value="${z.fee||0}" data-zi="${i}" data-zf="fee"
            style="width:80px" class="zone-inp" min="0"></td>
          <td style="padding:8px 10px"><input type="number" value="${z.min_order||0}" data-zi="${i}" data-zf="min_order"
            style="width:80px" class="zone-inp" min="0"></td>
          <td style="padding:8px 10px"><input type="number" value="${z.eta_minutes||45}" data-zi="${i}" data-zf="eta_minutes"
            style="width:80px" class="zone-inp" min="1"></td>
          <td style="padding:8px 10px">
            <button onclick="removeZone(${i})" class="btn-danger" style="font-size:.75rem;padding:4px 10px">הסר</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;

  document.querySelectorAll('.zone-inp').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.zi);
      const f = inp.dataset.zf;
      if (!_deliveryZones[i]) return;
      _deliveryZones[i][f] = ['fee','min_order','eta_minutes'].includes(f)
        ? parseFloat(inp.value) || 0
        : inp.value;
    });
  });
}

function addZoneRow() {
  _deliveryZones.push({ city: '', area: '', fee: 30, min_order: 0, eta_minutes: 45 });
  renderZonesTable();
}

function removeZone(i) {
  _deliveryZones.splice(i, 1);
  renderZonesTable();
}

async function saveZones() {
  // Sync delivery_cities from zones so the bot always has the current city list
  const cities = [...new Set(_deliveryZones.map(z => (z.city || '').trim()).filter(Boolean))];
  await saveSection({ delivery_zones: _deliveryZones, delivery_cities: cities });
}

// ─── Mobile burger menu ───────────────────────────────────────────────────────

function toggleMobileMenu() {
  document.body.classList.toggle('sidebar-open');
}

function closeMobileMenu() {
  document.body.classList.remove('sidebar-open');
}

// ─── Dark / Light Mode ────────────────────────────────────────────────────────

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  ['iconSun', 'iconSunMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = theme === 'dark' ? 'none' : 'block';
  });
  ['iconMoon', 'iconMoonMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = theme === 'dark' ? 'block' : 'none';
  });
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

// ─── Notifications ────────────────────────────────────────────────────────────

function updateNotifBadge() {
  const newOrders = currentOrders.filter(o => o.status === 'new').length;
  ['notifBadge', 'notifBadgeMobile'].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (newOrders > 0) {
      badge.style.display = 'flex';
      badge.textContent   = newOrders > 9 ? '9+' : newOrders;
    } else {
      badge.style.display = 'none';
    }
  });
}

function toggleNotifPanel() {
  const newOrders = currentOrders.filter(o => o.status === 'new');
  if (!newOrders.length) { showToast('אין הזמנות חדשות'); return; }
  // Switch to orders tab filtered to 'new'
  showTab('orders');
  const sf = document.getElementById('statusFilter');
  if (sf) { sf.value = 'new'; filterOrders(); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

initTheme();
// Init: show orders tab
showTab('orders');
// Auto-refresh orders every 30s
setInterval(() => {
  if (!document.getElementById('page-orders').classList.contains('hidden')) loadOrders();
}, 30_000);

// Re-render on resize (mobile↔desktop layout switch)
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => { if (currentOrders.length) filterOrders(); }, 200);
});

// ─── Push notifications ───────────────────────────────────────────────────────

let _pushSubscription = null;

async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    ['pushBtn', 'pushBtnMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');

    // Listen for messages from SW (e.g. tab focus on click)
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'NEW_ORDER') loadOrders();
    });

    // Check current subscription
    _pushSubscription = await reg.pushManager.getSubscription();
    updatePushBtn(_pushSubscription);
  } catch (err) {
    console.warn('[push] SW registration failed:', err);
  }
}

function updatePushBtn(sub) {
  [['pushBtn', 'pushSlash'], ['pushBtnMobile', 'pushSlashMobile']].forEach(([btnId, slashId]) => {
    const btn   = document.getElementById(btnId);
    const slash = document.getElementById(slashId);
    if (!btn) return;
    if (sub) {
      btn.title = 'התראות push פעילות — לחץ לכיבוי';
      btn.style.color = '#4ade80';
      if (slash) slash.style.display = 'none';
    } else {
      btn.title = 'הפעל התראות push';
      btn.style.color = '';
      if (slash) slash.style.display = '';
    }
  });
}

async function togglePushSubscription() {
  if (!('serviceWorker' in navigator)) {
    alert('הדפדפן שלך לא תומך בהתראות push');
    return;
  }

  const reg = await navigator.serviceWorker.ready;

  if (_pushSubscription) {
    // Unsubscribe
    await _pushSubscription.unsubscribe();
    await api('POST', '/push-unsubscribe', { endpoint: _pushSubscription.endpoint }).catch(() => {});
    _pushSubscription = null;
    updatePushBtn(null);
    showToast('התראות push כובו');
    return;
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast('נדרשת הרשאה להתראות בדפדפן');
    return;
  }

  // Get VAPID key
  let vapidPublicKey;
  try {
    const { publicKey } = await api('GET', '/push-vapid-key');
    vapidPublicKey = publicKey;
  } catch { showToast('שגיאה בהגדרת push'); return; }

  // Subscribe
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  await api('POST', '/push-subscribe', sub.toJSON());
  _pushSubscription = sub;
  updatePushBtn(sub);
  showToast('התראות push הופעלו!');
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

initPush();
