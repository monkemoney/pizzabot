'use strict';

// ─── Auth ─────────────────────────────────────────────────────────────────────

const token    = localStorage.getItem('token');
const role     = localStorage.getItem('role');
const username = localStorage.getItem('username');

if (!token) { window.location.href = '/'; }
// Vendor belongs at /admin, not here
if (role === 'vendor') { window.location.href = '/admin'; }

document.getElementById('userDisplayName').textContent = username || '';
document.getElementById('userRole').textContent = (typeof tr === 'function' ? tr(role === 'admin' ? 'מנהל' : 'מנג׳ר') : (role === 'admin' ? 'מנהל' : 'מנג׳ר'));

if (role === 'admin') {
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.style.display = el.tagName === 'BUTTON' ? 'flex' : 'block';
  });
}

// Kitchen link — visible to admin and manager
if (role === 'admin' || role === 'manager') {
  const kitchenBtn = document.getElementById('tab-kitchen');
  if (kitchenBtn) kitchenBtn.style.display = 'flex';
  const mobileKitchenBtn = document.getElementById('mobile-tab-kitchen');
  if (mobileKitchenBtn) mobileKitchenBtn.style.display = 'flex';
}

function logout() {
  localStorage.clear();
  window.location.href = '/';
}

// ─── SVG icon helpers ─────────────────────────────────────────────────────────

const S = (d, w=14) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0">${d}</svg>`;

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
  pizza:     S('<path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/>', 20),
  cup:       S('<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>', 20),
  utensils:  S('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>', 20),
  salad:     S('<path d="M7 21h10"/><path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1"/><path d="m13 12 4-4"/>', 20),
  cheese:    S('<path d="M12 2a10 10 0 0 1 10 10H2A10 10 0 0 1 12 2Z"/><path d="M2 12v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4"/>', 20),
  edit:      S('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  camera:    S('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>', 24),
  phone:     S('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>', 13),
  notes:     S('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', 13),
  xCircle:       S('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
  alertTriangle: S('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  creditCard:    S('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
  checkCircle:   S('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
  refreshCw:     S('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', 13),
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

const TABS = ['orders', 'products', 'customers', 'stats', 'settings', 'inbox', 'kitchen'];

function showTab(name) {
  TABS.forEach((t) => {
    const page = document.getElementById('page-' + t);
    const tab  = document.getElementById('tab-'  + t);
    const mtab = document.getElementById('mobile-tab-' + t);
    if (page) page.style.display = 'none';
    if (tab)  tab.classList.remove('active');
    if (mtab) mtab.classList.remove('active');
  });
  const page = document.getElementById('page-' + name);
  const tab  = document.getElementById('tab-'  + name);
  const mtab = document.getElementById('mobile-tab-' + name);
  if (page) page.style.display = 'block';
  if (tab)  tab.classList.add('active');
  if (mtab) mtab.classList.add('active');

  closeMobileMenu();

  if (name === 'orders')    loadOrders();
  if (name === 'products')  loadProducts();
  if (name === 'customers') loadCustomers();
  if (name === 'settings')  { loadSettings(); loadAdminUsers(); }
  if (name === 'stats')     setPeriod(currentPeriod);
  if (name === 'kitchen')   { initKitchen(); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' })); }
  if (name === 'inbox')     loadInbox();
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

// i18n: tr() comes from i18n.js (Hebrew→English string map); TR guards against
// pages that load app.js without it. LOCALE follows the dashboard language.
const TR = (str) => (typeof tr === 'function' ? tr(str) : str);

// Topping display label — includes the portion when partial, e.g. "זיתים (חצי)".
// Toppings are free-text since 2026-07-28; portion ∈ {"חצי","רבע",...} or absent (whole pizza).
function topLabel(t) {
  const n = (t && (t.name || t.name_he)) || '';
  return n && t.portion ? `${n} (${t.portion})` : n;
}
const LOCALE = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en-GB' : 'he-IL';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(LOCALE) + ' ' + d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS = {
  new:              TR('חדשה'),
  scheduled:        TR('מתוזמן'),
  preparing:        TR('בהכנה'),
  ready:            TR('מוכן'),
  out_for_delivery: TR('יצא למשלוח'),
  delivered:        TR('נמסרה'),
  done:             TR('הסתיימה'),
  cancelled:        TR('בוטלה'),
};

function statusBadge(status, order) {
  const cls = {
    new: 'badge-new', scheduled: 'badge-scheduled',
    preparing: 'badge-preparing', ready: 'badge-done',
    out_for_delivery: 'badge-delivery', delivered: 'badge-delivered',
    done: 'badge-done', cancelled: 'badge-cancelled',
  }[status] || 'badge-done';
  const extra = status === 'scheduled' && order?.scheduled_for
    ? ' ' + new Date(order.scheduled_for).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  return `<span class="badge ${cls}">${STATUS_LABELS[status] || status}${extra}</span>`;
}

// ─── Money ────────────────────────────────────────────────────────────────────
// VAT and the delivery fee used to be literals — 18% and ₪30 — in four places,
// and `delivery_fee` was not even a column, so the ₪30 fallback was the only
// branch that ever ran. A tenant charging 25 printed 30 on every receipt.
let _bizConfig = { vat_rate: 18, delivery_price: null, delivery_zones: [] };

async function loadBusinessConfig() {
  try { _bizConfig = await api('GET', '/business-config'); } catch { /* keep defaults */ }
}

const vatRate    = () => (Number.isFinite(+_bizConfig.vat_rate) ? +_bizConfig.vat_rate : 18);
const vatLabel   = () => `${TR('מע"מ')} ${vatRate()}%`;
const vatOf      = (grossTotal) => grossTotal * vatRate() / (100 + vatRate());

/** The fee recorded on the order; falls back to the tenant's zone table. */
function deliveryFeeOf(o) {
  if (!o || o.delivery_method !== 'delivery') return 0;
  const recorded = parseFloat(o.delivery_fee);
  if (Number.isFinite(recorded)) return recorded;

  const addr = (o.address || '').toLowerCase();
  const zones = [..._bizConfig.delivery_zones]
    .filter(z => z && z.city)
    .sort((a, b) => String(b.city).length - String(a.city).length);
  for (const z of zones) {
    if (addr.includes(String(z.city).trim().toLowerCase())) {
      const f = parseFloat(z.fee ?? _bizConfig.delivery_price);
      if (Number.isFinite(f)) return f;
    }
  }
  const flat = parseFloat(_bizConfig.delivery_price);
  return Number.isFinite(flat) ? flat : null;   // null = unknown, show nothing
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────

let currentOrders   = [];
let currentPeriod   = 'today';
const expandedOrders = new Set();

async function loadOrders() {
  const container = document.getElementById('ordersTable');
  container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">${TR('טוען...')}</div>`;
  try {
    const data = await api('GET', '/orders');
    currentOrders = data.orders || [];
    if (currentOrders.some(_awaitingApproval)) await _loadAvailability();
    _orderUIRefresh();
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;color:red">${err.message}</div>`;
  }
}

// Dashboard chrome uses Lucide icons, not the DB emoji (which still feeds
// the WhatsApp bot and public menu). Icon picked by category name keywords.
function _catIcon(cat) {
  const n = (cat.name_he || '') + (cat.name_en || '');
  if (/תוספ|topping|גבינ/i.test(n)) return SVG.cheese;
  if (/פיצ|pizza/i.test(n)) return SVG.pizza;
  if (/שתי|משקה|drink|cola/i.test(n)) return SVG.cup;
  if (/סלט|salad|ירק/i.test(n)) return SVG.salad;
  return SVG.utensils;
}

// i18n helper — falls back to the Hebrew literal when i18n.js isn't loaded
const T = (key, he) => (typeof t === 'function' ? t(key) : he);

function renderStatusSummaryCards(orders) {
  const el = document.getElementById('orderStatusCards');
  if (!el) return;
  const counts = {
    total:    orders.length,
    new:      orders.filter(_awaitingApproval).length,
    preparing:orders.filter(o => o.status === 'preparing').length,
    out:      orders.filter(o => o.status === 'out_for_delivery').length,
    delivered:orders.filter(o => o.status === 'delivered').length,
    pending:  orders.filter(o => o.payment_status === 'pending').length,
  };
  const seg = (label, val, color='var(--primary)') => {
    const empty = val === 0;
    return `<div class="order-kpi-seg">
      <span style="font-size:1.25rem;font-weight:800;color:${empty?'var(--text-muted)':color}">${val}</span>
      <span style="font-size:.75rem;font-weight:600;color:var(--text-muted)">${label}</span>
    </div>`;
  };
  el.innerHTML = [
    seg(T('kpi_total','סה"כ'),              counts.total,     'var(--text)'),
    seg(T('kpi_new','חדשות'),               counts.new,        'var(--primary)'),
    seg(T('kpi_preparing','בהכנה'),         counts.preparing,  '#c07000'),
    seg(T('kpi_out','בדרך ללקוח'),          counts.out,        '#005faa'),
    seg(T('kpi_delivered','נמסרו'),         counts.delivered,  '#008043'),
    seg(T('kpi_pending_pay','ממתינות לתשלום'), counts.pending, 'var(--color-warning)'),
  ].join('<div class="order-kpi-div"></div>');
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

  if (!list.length) { showToast(TR('אין הזמנות לייצוא')); return; }

  const statusHe = {
    new:'חדשה', preparing:'בהכנה', ready:'מוכן', out_for_delivery:'יצא למשלוח',
    delivered:'נמסרה', done:'הסתיימה', cancelled:'בוטלה',
  };

  const headers = [
    TR('מספר הזמנה'),TR('תאריך'),TR('שעה'),TR('שם לקוח'),TR('טלפון'),
    TR('סוג אספקה'),TR('כתובת'),TR('אמצעי תשלום'),TR('סטטוס תשלום'),
    TR('סטטוס הזמנה'),TR('פריטים'),TR('תוספות'),TR('סה"כ'),TR('הערות'),
  ];

  const esc = (v) => {
    const s = String(v == null ? '' : v).replace(/"/g, '""');
    return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s}"` : s;
  };

  const rows = list.map(o => {
    const d       = new Date(o.created_at);
    const date    = d.toLocaleDateString(LOCALE);
    const time    = d.toLocaleTimeString(LOCALE, { hour:'2-digit', minute:'2-digit' });
    const items   = (o.items||[]).map(it => {
      const qty = it.quantity || it.qty || 1;
      return `${it.name||it.name_he||''}${qty>1?` ×${qty}`:''}`;
    }).join(' | ');
    const toppings = (o.items||[]).flatMap(it =>
      (it.toppings||[]).map(topLabel)
    ).filter(Boolean).join(', ');

    return [
      o.order_number || '',
      date, time,
      o.customer_name  || '',
      o.customer_phone || o.phone || '',
      o.delivery_method === 'delivery' ? TR('משלוח') : TR('איסוף'),
      o.address || '',
      o.payment_method === 'cash' ? TR('מזומן') : o.payment_method === 'bit' ? 'Bit' : TR('אשראי'),
      o.payment_status === 'paid'  ? TR('שולם')  : TR('ממתין'),
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
  showToast(`${TR('יוצאו')} ${list.length} ${TR('הזמנות')}`);
}

function renderOrderCard(o) {
  const statusOpts = Object.entries(STATUS_LABELS).map(([val, label]) =>
    `<option value="${val}" ${val === o.status ? 'selected' : ''}>${label}</option>`).join('');
  return `
  <div class="order-card-mobile" style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;box-shadow:var(--shadow-sm)">
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
      <span class="badge ${o.delivery_method==='delivery'?'badge-delivery':'badge-done'}" style="display:inline-flex;align-items:center;gap:4px">${o.delivery_method==='delivery'?`${SVG.truck} ${TR('משלוח')}`:`${SVG.home} ${TR('איסוף')}`}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:.72rem;background:var(--bg);padding:3px 10px;border-radius:999px;color:var(--text-muted)">${o.payment_method==='cash'?`${SVG.wallet} ${TR('מזומן')}`:o.payment_method==='bit'?`${SVG.phone} Bit`:`${SVG.card} ${TR('אשראי')}`}</span>
      <span class="badge ${o.payment_status==='paid'?'badge-paid':o.payment_method==='bit'?'badge-bit-pending':'badge-pending-pay'}" style="display:inline-flex;align-items:center;gap:4px">${o.payment_status==='paid'?`${SVG.check} ${TR('שולם')}`:o.payment_method==='bit'?`${SVG.phone} ${TR('ממתין לBit')}`:`${SVG.clock} ${TR('ממתין')}`}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <select onchange="updateOrderStatus('${o.id}',this.value,${o.order_number})"
        style="flex:1;padding:8px 10px;border-radius:10px;border:2px solid var(--border);font-family:inherit;font-size:.8rem;cursor:pointer">
        ${statusOpts}
      </select>
      <button onclick="openOrderEdit('${o.id}')" title="עריכה"
        style="background:var(--color-bg);border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:var(--text);display:flex;align-items:center">${SVG.edit}</button>
      <button onclick="printOrder('${o.id}')" title="הדפסת קבלה"
        style="background:#f0fdf4;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:#16a34a;display:flex;align-items:center">${SVG.printer}</button>
      ${!['cancelled','done'].includes(o.status) ? `
      ${o.dispute_status === 'pending'
        ? `<span title="מחלוקת פתוחה" style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:8px 12px;color:#d97706;display:flex;align-items:center;cursor:default">${SVG.alertTriangle}</span>`
        : `<button onclick="openDisputeModal('${o.id}')" title="פריט חסר" style="background:#fffbeb;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:#d97706;display:flex;align-items:center">${SVG.alertTriangle}</button>`}
      <button onclick="openCancelRefundModal('${o.id}')" title="ביטול" style="background:#fff0f6;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:#e0004d;display:flex;align-items:center">${SVG.xCircle}</button>` : ''}
    </div>
    ${o.refund_status==='manual'?`
    <a href="https://secure.cardcom.solutions" target="_blank"
      style="display:flex;align-items:center;justify-content:space-between;background:#fff0f6;border:1.5px solid #ffd0e6;border-radius:10px;padding:9px 13px;margin-top:10px;font-size:.78rem;font-weight:700;color:#e0004d;text-decoration:none">
      <span style="display:inline-flex;align-items:center;gap:5px">${SVG.creditCard} ${TR('נדרש זיכוי ידני בכרטקום')}</span><span>↗</span>
    </a>`:''}
  </div>`;
}

function toggleOrderExpand(id) {
  if (expandedOrders.has(id)) expandedOrders.delete(id);
  else expandedOrders.add(id);
  filterOrders(); // re-render with current filter state
}

function renderOrderRow(o) {
  const isExpanded  = expandedOrders.has(o.id);
  const isMobile    = window.innerWidth <= 768;
  const isCancelled = ['cancelled','done'].includes(o.status);

  // ── Items list ──
  const items = (o.items || []);
  const itemsHtml = items.map(it => {
    const qty     = it.quantity || it.qty || 1;
    const tops    = (it.toppings||[]).map(topLabel).filter(Boolean).join(', ');
    const lineTotal = ((parseFloat(it.price)||0)*qty).toFixed(0);
    return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--border)">
      <div>
        <span style="font-weight:600;font-size:.85rem">${it.name||it.name_he||TR('פריט')}</span>
        ${qty>1?`<span style="color:var(--text-muted);font-size:.78rem"> ×${qty}</span>`:''}
        ${tops?`<div style="font-size:.72rem;color:var(--text-muted)">+ ${tops}</div>`:''}
      </div>
      <span style="font-weight:700;color:var(--text);white-space:nowrap;margin-right:12px">₪${lineTotal}</span>
    </div>`;
  }).join('') || `<div style="color:var(--text-muted);font-size:.82rem">${TR('אין פריטים')}</div>`;

  // ── Financial summary ──
  const total    = parseFloat(o.total_price)||0;
  const delivery = deliveryFeeOf(o);
  const vat      = vatOf(total);

  // ── Status selector ──
  const statusOpts = Object.entries(STATUS_LABELS).map(([val,label])=>
    `<option value="${val}" ${val===o.status?'selected':''}>${label}</option>`).join('');

  // ── Action buttons ──
  const actions = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <button onclick="event.stopPropagation();openOrderEdit('${o.id}')"
        class="btn btn-ghost btn-sm" style="gap:5px">${SVG.edit} ${TR('ערוך פריטים')}</button>
      <button onclick="event.stopPropagation();printOrder('${o.id}')"
        class="btn btn-ghost btn-sm" style="gap:5px;color:#16a34a;border-color:#bbf7d0">${SVG.printer} ${TR('הדפסה')}</button>
      ${!isCancelled ? `
        ${o.dispute_status==='pending'
          ? `<span style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:50px;padding:5px 14px;font-size:.78rem;font-weight:700;color:#d97706">${SVG.alertTriangle} ${TR('מחלוקת פתוחה')}</span>`
          : `<button onclick="event.stopPropagation();openDisputeModal('${o.id}')"
              class="btn btn-sm" style="background:#fffbeb;border-color:#fcd34d;color:#d97706;gap:5px">${SVG.alertTriangle} ${TR('פריט חסר')}</button>`}
        <button onclick="event.stopPropagation();openCancelRefundModal('${o.id}')"
          class="btn btn-sm" style="background:#fff0f6;border-color:#ffd0e6;color:#e0004d;gap:5px">${SVG.xCircle} ${TR('ביטול')}</button>
      ` : `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
        <span class="badge badge-cancelled" style="font-size:.78rem">
          ${o.cancelled_by==='customer'?TR('בוטל ע"י לקוח'):TR('בוטל ע"י העסק')}
          ${o.cancel_reason?`— ${o.cancel_reason}`:''}
        </span>
        ${o.refund_status==='manual'?`<a href="https://secure.cardcom.solutions" target="_blank" onclick="event.stopPropagation()"
          style="background:#fff0f6;border:1.5px solid #ffd0e6;border-radius:50px;padding:4px 12px;font-size:.72rem;font-weight:700;color:#e0004d;text-decoration:none;white-space:nowrap">
          <span style="display:inline-flex;align-items:center;gap:4px">${SVG.creditCard} ${TR('זיכוי ידני נדרש')}</span> ↗</a>`:''}
      </div>`}
    </div>`;

  // ── Expanded panel ──
  const expandedHtml = `
    <div style="border-top:1px solid var(--border);background:var(--color-bg);padding:18px 20px;display:grid;grid-template-columns:1fr 1fr;gap:20px" onclick="event.stopPropagation()">

      <!-- Left: customer + delivery -->
      <div>
        <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${TR('פרטי לקוח')}</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:.84rem">
          <div style="display:flex;align-items:center;gap:7px">${SVG.phone} <strong>${o.customer_name||'—'}</strong></div>
          ${o.customer_phone||o.phone ? `<div style="color:var(--text-muted)">${o.customer_phone||o.phone}</div>` : ''}
          <div style="display:flex;align-items:center;gap:7px;margin-top:4px">
            ${o.delivery_method==='delivery' ? `${SVG.truck} <span>${TR('משלוח')} — ${o.address||TR('כתובת לא ידועה')}</span>` : `${SVG.home} <span>${TR('איסוף עצמי')}</span>`}
          </div>
          ${o.courier_notes ? `<div style="display:flex;align-items:baseline;gap:6px;color:var(--text-muted);font-size:.78rem;padding:6px 10px;background:var(--white);border:1px solid var(--border);border-radius:8px;margin-top:4px">${SVG.edit} ${o.courier_notes}</div>` : ''}
          ${o.notes ? `<div style="color:var(--text-muted);font-size:.78rem;margin-top:2px">${TR('הערות')}: ${o.notes}</div>` : ''}
        </div>

        <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 8px">${TR('סטטוס')}</div>
        <select onchange="updateOrderStatus('${o.id}',this.value,${o.order_number})"
          style="width:100%;padding:8px 12px;border-radius:10px;border:2px solid var(--border);font-family:inherit;font-size:.84rem;cursor:pointer">
          ${statusOpts}
        </select>
      </div>

      <!-- Right: items + totals + actions -->
      <div>
        <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${TR('פריטים')}</div>
        <div style="margin-bottom:10px">${itemsHtml}</div>
        <div style="font-size:.8rem;display:flex;flex-direction:column;gap:4px;padding:10px;background:var(--bg);border-radius:10px;margin-bottom:14px">
          ${delivery ? `<div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>${TR('משלוח')}</span><span>₪${delivery.toFixed(0)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>${vatLabel()}</span><span>₪${vat.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:800;font-size:.92rem;border-top:1.5px solid var(--border);padding-top:6px;margin-top:4px">
            <span>${TR('סה"כ')}</span><span>₪${total.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:var(--text-muted);font-size:.75rem">
            <span>${o.payment_method==='cash'?TR('מזומן'):o.payment_method==='bit'?'Bit':TR('אשראי')}</span>
            <span class="badge ${o.payment_status==='paid'?'badge-paid':o.payment_method==='bit'?'badge-bit-pending':'badge-pending-pay'}">${o.payment_status==='paid'?TR('שולם'):o.payment_method==='bit'?TR('ממתין לBit'):TR('ממתין')}</span>
          </div>
          ${o.payment_method==='bit' && o.payment_status!=='paid' && !isCancelled ? `
          <button onclick="event.stopPropagation();confirmBitPayment('${o.id}')"
            style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:8px 14px;margin-top:8px;font-size:.8rem;font-weight:700;color:#16a34a;cursor:pointer;font-family:inherit">
            ${SVG.check} ${TR('אשר קבלת תשלום Bit')}
          </button>` : ''}
          ${o.refund_status==='manual'?`
          <a href="https://secure.cardcom.solutions" target="_blank" onclick="event.stopPropagation()"
            style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff0f6;border:1.5px solid #ffd0e6;border-radius:10px;padding:9px 13px;margin-top:8px;font-size:.78rem;font-weight:700;color:#e0004d;text-decoration:none">
            <span style="display:inline-flex;align-items:center;gap:5px">${SVG.creditCard} ${TR('נדרש זיכוי ידני בכרטקום')}</span>
            <span style="font-size:.72rem;opacity:.8">${TR('פתח')} ↗</span>
          </a>`:''}
        </div>
        ${actions}
      </div>
    </div>`;

  // ── Summary row ──
  const chevron = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s;transform:rotate(${isExpanded?'180deg':'0deg'})"><polyline points="6 9 12 15 18 9"/></svg>`;

  // Cells are ordered by criticality on mobile: what the operator must see
  // without swiping — order #, status, paid?, delivery/pickup — then the rest.
  const cellNum      = `<div style="font-weight:800;color:var(--primary);font-size:.9rem">#${o.order_number||'—'}</div>`;
  const cellCustomer = `<div>
        <div style="font-weight:700;font-size:.88rem">${o.customer_name||'—'}</div>
        <div style="font-size:.72rem;color:var(--text-muted)">${formatDate(o.created_at)}</div>
      </div>`;
  const cellAddress  = `<div style="font-size:.8rem;color:var(--text-muted)">${(o.address||TR('איסוף עצמי')).slice(0,28)}</div>`;
  const cellMethod   = `<span class="badge ${o.delivery_method==='delivery'?'badge-delivery':'badge-done'}" style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">
        ${o.delivery_method==='delivery'?`${SVG.truck} ${TR('משלוח')}`:`${SVG.home} ${TR('איסוף')}`}
      </span>`;
  const cellPayment  = `<span class="badge ${o.payment_status==='paid'?'badge-paid':o.payment_method==='bit'?'badge-bit-pending':'badge-pending-pay'}" style="display:inline-flex;align-items:center;gap:3px">
        ${o.payment_status==='paid'?`${SVG.check} ${TR('שולם')}`:o.payment_method==='bit'?`${SVG.phone} Bit`:`${SVG.clock} ${TR('ממתין')}`}
      </span>`;
  const cellPrice    = `<div style="font-weight:800;font-size:.95rem">₪${(parseFloat(o.total_price)||0).toFixed(0)}</div>`;
  const cellStatus   = `<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
        ${statusBadge(o.status, o)}
        ${o.refund_status==='manual'?`<span style="background:#fff0f6;border:1.5px solid #ffd0e6;border-radius:999px;padding:2px 8px;font-size:.66rem;font-weight:700;color:#e0004d;white-space:nowrap;display:inline-flex;align-items:center;gap:3px">${SVG.creditCard} ${TR('זיכוי ידני')}</span>`:''}
      </div>`;
  const cellChevron  = `<div style="display:flex;align-items:center;justify-content:flex-end">${chevron}</div>`;

  const cells = isMobile
    ? [cellNum, cellStatus, cellPayment, cellMethod, cellPrice, cellCustomer, cellAddress, cellChevron]
    : [cellNum, cellCustomer, cellAddress, cellMethod, cellPayment, cellPrice, cellStatus, cellChevron];
  const gridCols = isMobile
    ? '44px auto auto auto auto 1fr 1fr 60px'
    : '44px 1fr 1fr auto auto auto auto 60px';

  const summaryRow = `
    <div class="order-summary-scroll" style="border-bottom:${isExpanded?'none':'1px solid var(--border)'}">
    <div class="order-grid-row" onclick="toggleOrderExpand('${o.id}')"
      style="display:grid;grid-template-columns:${gridCols};align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background .15s;${isExpanded?'background:var(--color-sidebar-active);':''}"
      onmouseover="if(!${isExpanded})this.style.background='var(--bg)'" onmouseout="if(!${isExpanded})this.style.background=''">
      ${cells.join('\n      ')}
    </div>
    </div>`;

  return `<div style="border-radius:${isExpanded?'var(--radius-lg)':'0'};overflow:hidden;margin-bottom:${isExpanded?'8px':'0'};${isExpanded?'box-shadow:var(--shadow-md);border:1px solid var(--border);':''}transition:all .2s">
    ${summaryRow}
    ${isExpanded ? expandedHtml : ''}
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
      <div class="empty-state-title">${hasFilters ? TR('אין הזמנות תואמות') : TR('אין הזמנות עדיין')}</div>
      <div class="empty-state-sub">${hasFilters
        ? `<button onclick="clearOrderFilters()" style="background:none;border:none;cursor:pointer;color:var(--primary);font-weight:700;font-size:.84rem;padding:0;text-decoration:underline;font-family:inherit">${TR('נקה פילטרים')}</button>`
        : TR('הזמנות יופיעו כאן ברגע שלקוח יזמין')}</div>
    </div>`;
    return;
  }

  container.innerHTML = `<div style="border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--border);background:var(--white)">
    ${orders.map(renderOrderRow).join('')}
  </div>`;
}

async function updateOrderStatus(orderId, status, orderNumber) {
  try {
    // force: the status <select> is an explicit staff override control
    const data = await api('PATCH', `/orders/${orderId}/status`, { status, force: true });
    const i = currentOrders.findIndex(x => x.id === orderId);
    if (i >= 0 && data?.order) currentOrders[i] = data.order;
    _orderUIRefresh();
  } catch (err) {
    alert(TR('שגיאה') + ': ' + err.message);
    loadOrders();
  }
}

// ─── INCOMING ORDERS — awaiting business approval ────────────────────────────
// New orders surface as full cards above the list: items visible without
// expanding, aging timer, one-tap accept with prep-time quick picks.

let _prepChoice  = {};    // orderId → chosen prep minutes
let _defaultPrep = 30;    // overridden from settings (admins) at boot

const PREP_CHOICES = [15, 30, 45, 60];

// Product/topping availability by lowercase name — flags items that went out
// of stock between the bot conversation and the acceptance moment.
let _availability   = null;
let _availabilityAt = 0;

async function _loadAvailability() {
  if (_availability && Date.now() - _availabilityAt < 30_000) return;
  try {
    const data = await api('GET', '/products');
    const map = {};
    (data.products || []).forEach(p => {
      const n = (p.name_he || p.name_en || '').trim().toLowerCase();
      if (n) map[n] = p.is_available !== false;
    });
    (data.additions || []).forEach(a => {
      const n = (a.name || '').trim().toLowerCase();
      if (n && a.is_available === false) map[n] = false;
    });
    _availability = map;
    _availabilityAt = Date.now();
  } catch { _availability = _availability || {}; }
}

// Awaiting the business's approval: immediate orders sitting in 'new', and
// pre-orders that were booked but never approved.
function _awaitingApproval(o) {
  return o.status === 'new' || (o.status === 'scheduled' && !o.accepted_at);
}

function _incomingAge(o) {
  const min = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000));
  const color = min >= 6 ? '#dc2626' : min >= 3 ? '#d97706' : '#16a34a';
  const bg    = min >= 6 ? '#fef2f2' : min >= 3 ? '#fffbeb' : '#f0fdf4';
  return { min, color, bg };
}

function _schedLabel(o) {
  if (!o.scheduled_for) return '';
  return new Date(o.scheduled_for).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function _unavailableTag(name) {
  if (!_availability) return '';
  const avail = _availability[(name || '').trim().toLowerCase()];
  return avail === false
    ? ` <span style="background:#fef2f2;border:1px solid #fecaca;color:#dc2626;border-radius:999px;padding:1px 8px;font-size:.66rem;font-weight:800;white-space:nowrap">${TR('אזל במלאי')}</span>`
    : '';
}

function _incomingCard(o) {
  const age = _incomingAge(o);
  const chosen = _prepChoice[o.id] || _defaultPrep;
  const isScheduled = o.status === 'scheduled';
  const schedTime   = _schedLabel(o);

  const items = (o.items || []).map(it => {
    const qty  = it.quantity || it.qty || 1;
    const tops = (it.toppings || []).map(topLabel).filter(Boolean);
    return `<div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:.9rem">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-weight:800;color:var(--text);min-width:30px">×${qty}</span>
        <span style="font-weight:700">${it.name || it.name_he || TR('פריט')}</span>${_unavailableTag(it.name || it.name_he)}
      </div>
      ${tops.length ? `<div style="font-size:.76rem;color:var(--text-muted);margin-inline-start:38px">+ ${tops.map(t => t + _unavailableTag(t)).join(', ')}</div>` : ''}
    </div>`;
  }).join('') || `<div style="color:var(--text-muted);font-size:.82rem">${TR('אין פריטים')}</div>`;

  const notes = o.notes
    ? `<div style="margin-top:8px;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:.8rem;font-weight:600;color:#92400e">${SVG.notes} ${o.notes}</div>` : '';

  const payBadge = `<span class="badge ${o.payment_status==='paid'?'badge-paid':o.payment_method==='bit'?'badge-bit-pending':'badge-pending-pay'}" style="display:inline-flex;align-items:center;gap:3px">
      ${o.payment_status==='paid'?`${SVG.check} ${TR('שולם')}`:o.payment_method==='bit'?`${SVG.phone} ${TR('ממתין לBit')}`:`${SVG.clock} ${TR('ממתין לתשלום')}`}
    </span>`;
  const methodBadge = `<span class="badge ${o.delivery_method==='delivery'?'badge-delivery':'badge-done'}" style="display:inline-flex;align-items:center;gap:4px">
      ${o.delivery_method==='delivery'?`${SVG.truck} ${TR('משלוח')}`:`${SVG.home} ${TR('איסוף')}`}
    </span>`;

  const chips = PREP_CHOICES.map(m =>
    `<button onclick="setPrepChoice('${o.id}',${m})"
      style="border-radius:999px;padding:5px 13px;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;transition:all .12s;
        border:1.5px solid ${m===chosen?'var(--primary)':'var(--border)'};
        background:${m===chosen?'var(--primary)':'var(--white)'};
        color:${m===chosen?'#fff':'var(--text-muted)'}">${m} ${TR("דק'")}</button>`).join('');

  return `<div class="card incoming-card" id="incoming-${o.id}"
    style="border-inline-start:4px solid var(--primary);padding:16px 18px;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
      <div style="display:flex;align-items:baseline;gap:10px;min-width:0">
        <span style="font-weight:900;font-size:1.35rem;color:var(--primary);line-height:1">#${o.order_number}</span>
        <span style="font-weight:700;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.customer_name || TR('לקוח')}</span>
      </div>
      ${isScheduled
        ? `<span style="font-size:.8rem;font-weight:800;color:#005faa;background:#eff6ff;border-radius:8px;padding:4px 10px;white-space:nowrap;display:inline-flex;align-items:center;gap:4px">${SVG.clock} ${schedTime}</span>`
        : `<span style="font-size:.8rem;font-weight:800;color:${age.color};background:${age.bg};border-radius:8px;padding:4px 10px;white-space:nowrap">${age.min} ${TR("דק'")}</span>`}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      ${methodBadge}${payBadge}
      ${isScheduled ? `<span class="badge badge-scheduled" style="display:inline-flex;align-items:center;gap:4px">${TR('מתוזמנת')} ${schedTime}</span>` : ''}
      ${o.address ? `<span style="font-size:.74rem;color:var(--text-muted);display:inline-flex;align-items:center;gap:3px">${SVG.pin} ${o.address.slice(0,34)}</span>` : ''}
    </div>
    <div style="flex:1;margin-bottom:6px">${items}</div>
    ${notes}
    <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 8px">
      <span style="font-size:.76rem;font-weight:700;color:var(--text-muted)">${TR('זמן הכנה')}</span>
      <span style="font-weight:800;font-size:1rem">₪${(parseFloat(o.total_price)||0).toFixed(0)}</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${chips}</div>
    ${isScheduled ? `<div style="font-size:.74rem;color:var(--text-muted);margin-bottom:8px">${TR('אישור מתחייב להכנה בשעה זו; ההזמנה תיכנס למטבח אוטומטית לפני המועד')}</div>` : ''}
    <button onclick="acceptOrder('${o.id}')" class="btn btn-primary"
      style="width:100%;padding:12px;font-size:1rem;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px">
      ${SVG.checkCircle} ${isScheduled ? TR('אשר הזמנה מתוזמנת') : TR('אשר הזמנה')}
    </button>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button onclick="openDisputeModal('${o.id}')" class="btn btn-sm"
        style="flex:1;background:#fffbeb;border:1px solid #fcd34d;color:#d97706;gap:5px;justify-content:center">${SVG.alertTriangle} ${TR('פריט חסר')}</button>
      <button onclick="openCancelRefundModal('${o.id}')" class="btn btn-sm"
        style="flex:1;background:#fff0f6;border:1px solid #ffd0e6;color:#e0004d;gap:5px;justify-content:center">${SVG.xCircle} ${TR('דחה')}</button>
    </div>
  </div>`;
}

function renderIncomingOrders() {
  const zone = document.getElementById('incomingOrders');
  if (!zone) return;
  const incoming = currentOrders
    .filter(_awaitingApproval)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (!incoming.length) { zone.style.display = 'none'; zone.innerHTML = ''; return; }

  zone.style.display = 'block';
  zone.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span style="width:10px;height:10px;border-radius:50%;background:var(--primary);animation:incomingPulse 1.4s ease-in-out infinite"></span>
      <span style="font-size:1.05rem;font-weight:800">${TR('ממתינות לאישור')}</span>
      <span style="background:var(--primary);color:#fff;border-radius:999px;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:.76rem;font-weight:800;padding:0 7px">${incoming.length}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;margin-bottom:20px">
      ${incoming.map(_incomingCard).join('')}
    </div>`;
}

function setPrepChoice(orderId, minutes) {
  _prepChoice[orderId] = minutes;
  renderIncomingOrders();
}

async function acceptOrder(orderId) {
  const card = document.getElementById(`incoming-${orderId}`);
  if (card) card.style.opacity = '.5';
  try {
    const data = await api('POST', `/orders/${orderId}/accept`, {
      prep_minutes: _prepChoice[orderId] || _defaultPrep,
    });
    const i = currentOrders.findIndex(x => x.id === orderId);
    if (i >= 0 && data?.order) currentOrders[i] = data.order;
    delete _prepChoice[orderId];
    _orderUIRefresh();
    showToast(`${TR('הזמנה')} #${data?.order?.order_number || ''} ${TR('אושרה — נשלחה למטבח')}`);
  } catch (err) {
    if (card) card.style.opacity = '1';
    showToast(TR('שגיאה') + ': ' + err.message);
    loadOrders();
  }
}

// One refresh point for every order-data change (poll, SSE, action)
function _orderUIRefresh() {
  renderStatusSummaryCards(currentOrders);
  updateNotifBadge();
  renderIncomingOrders();
  filterOrders();
  _titleFlashSync();
}

// ─── Live updates: ONE supervised SSE connection (failure class 10) ──────────
// Consumers (orders, kitchen tab, inbox) register listeners with sseOn() and
// gap-recovery with sseOnReconnect() — nobody constructs their own
// EventSource, so a new consumer cannot "forget" supervision. Death is
// detected three ways: onerror + backoff retry (EventSource stops retrying by
// itself on fatal HTTP errors — e.g. the 5xx window of every deploy), a
// heartbeat watchdog on the server's 25s ping (a handle in a variable is not
// a live connection), and resync callbacks on every reconnect (reattaching
// the stream loses whatever happened during the gap).

let _sse = null;
let _sseRetryTimer = null;
let _sseEverOpened = false;
let _sseLastSignal = 0;
const _sseHandlers  = new Map(); // event name -> Set<handler>
const _sseResyncFns = new Set(); // run after reconnect — reload what SSE may have missed
const _sseStatusFns = new Set(); // connection up/down listeners (kitchen dot)
const SSE_DEAD_MS = 90_000;      // 3 missed 25s server pings + margin

function sseOn(event, fn) {
  if (!_sseHandlers.has(event)) _sseHandlers.set(event, new Set());
  _sseHandlers.get(event).add(fn);
  if (_sse) _sse.addEventListener(event, fn);
}
function sseOnReconnect(fn) { _sseResyncFns.add(fn); }
function sseOnStatus(fn)    { _sseStatusFns.add(fn); }

function sseConnect() {
  clearTimeout(_sseRetryTimer);
  if (_sse) { try { _sse.close(); } catch {} }
  const es = new EventSource(`/api/sse?token=${encodeURIComponent(token || '')}`);
  _sse = es;
  _sseLastSignal = Date.now();
  for (const [event, fns] of _sseHandlers) for (const fn of fns) es.addEventListener(event, fn);
  es.addEventListener('ping', () => { _sseLastSignal = Date.now(); });
  es.onopen = () => {
    _sseLastSignal = Date.now();
    _sseStatusFns.forEach(fn => { try { fn(true); } catch {} });
    if (_sseEverOpened) _sseResyncFns.forEach(fn => { try { fn(); } catch {} });
    _sseEverOpened = true;
  };
  es.onerror = () => {
    _sseStatusFns.forEach(fn => { try { fn(false); } catch {} });
    try { es.close(); } catch {}
    clearTimeout(_sseRetryTimer);
    _sseRetryTimer = setTimeout(sseConnect, 5_000 + Math.random() * 5_000);
  };
}

setInterval(() => {
  if (_sse && Date.now() - _sseLastSignal > SSE_DEAD_MS) {
    console.warn('[sse] heartbeat lost — forcing reconnect');
    _sseStatusFns.forEach(fn => { try { fn(false); } catch {} });
    sseConnect();
  }
}, 30_000);

function _ordersConnectSSE() {
  sseOn('new_order', (e) => {
    const o = JSON.parse(e.data);
    if (!currentOrders.find(x => x.id === o.id)) currentOrders.unshift(o);
    _loadAvailability().then(_orderUIRefresh);
    _orderUIRefresh();
    if (_awaitingApproval(o)) {
      _chime();
      showToast(`🔔 ${TR('הזמנה חדשה')} #${o.order_number}`);
    }
  });

  sseOn('order_updated', (e) => {
    const o = JSON.parse(e.data);
    const i = currentOrders.findIndex(x => x.id === o.id);
    if (i >= 0) currentOrders[i] = o; else currentOrders.unshift(o);
    _orderUIRefresh();
  });

  sseOnReconnect(() => loadOrders());
  sseConnect();
}

// Soft two-tone chime via WebAudio — no asset file needed. Browsers require a
// user gesture before audio; the first click on the page unlocks it.
let _audioCtx = null;
document.addEventListener('click', () => {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
  } catch {}
}, { capture: true });

function _chime() {
  try {
    if (!_audioCtx || _audioCtx.state !== 'running') return;
    const ding = (freq, at) => {
      const osc  = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.28, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain).connect(_audioCtx.destination);
      osc.start(at); osc.stop(at + 0.55);
    };
    const t = _audioCtx.currentTime;
    ding(880, t); ding(1174.7, t + 0.18);          // ding-dong
    ding(880, t + 0.9); ding(1174.7, t + 1.08);    // repeat
  } catch {}
}

let _titleTimer = null;
const _origTitle = document.title;
function _titleFlashSync() {
  const n = currentOrders.filter(_awaitingApproval).length;
  if (n > 0 && !_titleTimer) {
    let flip = false;
    _titleTimer = setInterval(() => {
      flip = !flip;
      const count = currentOrders.filter(_awaitingApproval).length;
      document.title = flip && count > 0 ? `🔔 (${count}) ${TR('הזמנות ממתינות')}` : _origTitle;
    }, 1500);
  } else if (n === 0 && _titleTimer) {
    clearInterval(_titleTimer); _titleTimer = null;
    document.title = _origTitle;
  }
}

// ─── Push opt-in nudge ───────────────────────────────────────────────────────
// Without push, a closed tab means zero notifications — surface that clearly
// instead of hiding it behind the small bell icon.

function renderPushNudge() {
  const el = document.getElementById('pushNudge');
  if (!el) return;
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const dismissed = localStorage.getItem('pushNudgeDismissed');
  if (!supported || dismissed || Notification.permission === 'granted') {
    el.style.display = 'none'; el.innerHTML = ''; return;
  }
  el.style.display = 'block';
  el.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:14px;padding:14px 18px;margin-bottom:16px;border-inline-start:4px solid var(--color-warning);flex-wrap:wrap">
      <div style="width:38px;height:38px;border-radius:10px;background:#fffbeb;display:flex;align-items:center;justify-content:center;color:#d97706;flex-shrink:0">
        ${S('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', 18)}
      </div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:.9rem">${TR('הפעל התראות כדי לא לפספס הזמנות')}</div>
        <div style="font-size:.78rem;color:var(--text-muted)">${TR('בלי התראות push לא תקבל עדכון על הזמנות חדשות כשהדשבורד סגור')}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="togglePushSubscription().then(()=>renderPushNudge())" class="btn btn-primary btn-sm">${TR('הפעל התראות')}</button>
        <button onclick="localStorage.setItem('pushNudgeDismissed','1');renderPushNudge()" class="btn btn-ghost btn-sm">${TR('לא עכשיו')}</button>
      </div>
    </div>`;
}

// ─── STATS ────────────────────────────────────────────────────────────────────

// Destroy and re-create a Chart.js instance
const _charts = {};
function mkChart(id, config) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  const canvas = document.getElementById(id);
  if (!canvas) return;

  // Empty state instead of bare axes when there is nothing to plot
  const hasData = (config.data?.datasets || []).some(ds =>
    (ds.data || []).some(v => (typeof v === 'object' ? (v?.y ?? v?.x) : v)));
  let empty = canvas.parentElement.querySelector('.chart-empty');
  if (!hasData) {
    canvas.style.display = 'none';
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'chart-empty';
      empty.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:140px;color:var(--text-muted);font-size:.82rem;font-weight:600';
      empty.innerHTML = `${S('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16h8"/><path d="M7 11h12"/><path d="M7 6h3"/>', 26)}<span>${TR('אין עדיין נתונים לתקופה זו')}</span>`;
      canvas.parentElement.appendChild(empty);
    }
    empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';
  canvas.style.display = '';
  _charts[id] = new Chart(canvas, config);
}

// Shared Chart.js defaults
const C_FONT = "'Poppins', 'Heebo', sans-serif";
const C_GRID = '#f3f4f6';
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

  cardsEl.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;padding:8px">${TR('טוען...')}</div>`;

  try {
    const params = date ? `period=${period}&date=${date}` : `period=${period}`;
    const s = await api('GET', `/stats?${params}`);
    const { textColor, mutedColor, gridColor } = chartDefaults();
    const periodLabel = TR({today:'היום',week:'השבוע',month:'החודש',year:'השנה',all:'הכל'}[period] || period);

    // ── KPI cards ──
    // v0 language: values stay neutral-dark; color is semantic only (cancellations)
    const kpi = (label, value, valueColor = 'var(--text)') => `
      <div class="stat-card" style="padding:18px 20px">
        <div style="font-size:1.6rem;font-weight:700;color:${valueColor};line-height:1.1">${value}</div>
        <div class="stat-label" style="margin-top:6px">${label}</div>
      </div>`;
    cardsEl.innerHTML =
      kpi(`${TR('הזמנות')} — ${periodLabel}`,  s.order_count) +
      // Revenue is money received; anything still owed is its own figure rather
      // than being folded in and overstating the day.
      kpi(TR('הכנסות (שולם)'),            `₪${(s.revenue||0).toFixed(0)}`) +
      kpi(TR('ממתין לתשלום'),             `₪${(s.revenue_pending||0).toFixed(0)}`,
          (s.revenue_pending||0) > 0 ? '#c07000' : 'var(--text)') +
      kpi(TR('ממוצע להזמנה'),             s.order_count ? `₪${((s.revenue||0)/s.order_count).toFixed(0)}` : '—') +
      kpi(TR('זמן מסירה ממוצע'),          s.avg_delivery_minutes != null ? s.avg_delivery_minutes+'′' : '—') +
      kpi(TR('ביטולים'),                  s.cancelled_count || 0, (s.cancelled_count||0) > 0 ? C_RED : 'var(--text)');

    // ── 1. Orders per day — line chart ──
    const byDay = s.orders_by_day || {};
    const days  = Object.keys(byDay).sort();
    mkChart('chartOrdersLine', {
      type: 'bar',
      data: {
        labels:   days.map(d => d.slice(5)),
        datasets: [{
          label: TR('הזמנות'),
          data:  days.map(d => byDay[d].count),
          backgroundColor: 'rgba(94,23,235,.55)',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { rtl: true, callbacks: {
          label: ctx => ` ${ctx.parsed.y} ${TR('הזמנות')}`
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
          label: TR('הכנסות') + ' ₪',
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
          label: TR('הזמנות'),
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
          label: ctx => ` ${ctx.parsed.y} ${TR('הזמנות')}`
        }}},
        scales: {
          x: { ticks: { color: mutedColor, font: { family: C_FONT, size: 9 }, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: mutedColor, font: { family: C_FONT, size: 10 }, stepSize: 1 }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });

    // ── 4. Delivery pie ──
    const ds = s.delivery_split || {};
    const delivLabels  = [TR('משלוח'), TR('איסוף')];
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
    const payLabels = [TR('מזומן'), TR('אשראי'), TR('ביט')];
    const payColors = [C_AMBER, C_GREEN, '#0ea5e9'];
    const payData   = [ps.cash || 0, ps.credit || 0, ps.bit || 0];
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
      ['new',TR('חדשה'), C_VIOLET], ['preparing',TR('בהכנה'), C_AMBER],
      ['out_for_delivery',TR('בדרך'), C_BLUE], ['delivered',TR('נמסרה'), C_GREEN],
      ['done',TR('הסתיימה'),'#9ca3af'], ['cancelled',TR('בוטלה'), C_RED],
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
          { label: TR('כמות'), data: tops.map(p => p.count), backgroundColor: 'rgba(94,23,235,.8)', borderRadius: 6, yAxisID: 'y' },
          { label: TR('הכנסה') + ' ₪', data: tops.map(p => p.revenue || 0), backgroundColor: 'rgba(34,197,94,.7)', borderRadius: 6, yAxisID: 'y2' },
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
    if (cardsEl) cardsEl.innerHTML = `<div style="color:red;font-size:.85rem">${TR('שגיאה')}: ${err.message}</div>`;
  }
}

// ─── CANCEL + REFUND (DISPUTE) ───────────────────────────────────────────────

// ─── Item Dispute Modal ───────────────────────────────────────────────────────

let _disputeOrderId = null;

function openDisputeModal(orderId) {
  const o = currentOrders.find(x => x.id === orderId);
  if (!o) return;
  _disputeOrderId = orderId;

  document.getElementById('disputeOrderNum').textContent = `#${o.order_number}`;

  const items = Array.isArray(o.items) ? o.items : [];
  const list  = document.getElementById('disputeItemList');

  list.innerHTML = items.map((it, i) => {
    const name     = it.name || it.name_he || TR('פריט');
    const qty      = it.quantity || it.qty || 1;
    const price    = parseFloat(it.price) || 0;
    const toppings = (it.toppings || []).filter(t => (t.name || t.name_he));

    const toppingRows = toppings.map((t, ti) => {
      const tName  = topLabel(t) || TR('תוספת');
      const tPrice = parseFloat(t.price) || 0;
      return `
        <label style="display:flex;align-items:center;gap:8px;padding:5px 10px 5px 28px;cursor:pointer;font-size:.8rem;color:var(--text-muted)">
          <input type="checkbox" data-item="${i}" data-topping="${ti}"
            onchange="updateDisputePreview()"
            style="accent-color:#f59e0b;width:14px;height:14px;flex-shrink:0">
          <span>↳ ${tName}${tPrice ? ` (+₪${tPrice.toFixed(0)})` : ''}</span>
        </label>`;
    }).join('');

    return `
      <div style="background:var(--bg);border-radius:12px;overflow:hidden">
        <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;font-weight:600;font-size:.85rem">
          <input type="checkbox" data-item="${i}" data-topping=""
            onchange="updateDisputePreview()"
            style="accent-color:#f59e0b;width:16px;height:16px;flex-shrink:0">
          <span>${name}${qty > 1 ? ` ×${qty}` : ''}</span>
          ${price ? `<span style="margin-right:auto;color:var(--text-muted);font-weight:400;font-size:.78rem">₪${(price*qty).toFixed(0)}</span>` : ''}
        </label>
        ${toppingRows}
      </div>`;
  }).join('') || `<div style="color:var(--text-muted);font-size:.84rem;padding:8px">${TR('אין פריטים בהזמנה')}</div>`;

  updateDisputePreview();
  openModal('disputeModal');
}

function getCheckedDisputes() {
  const checked = document.querySelectorAll('#disputeItemList input[type=checkbox]:checked');
  const o       = currentOrders.find(x => x.id === _disputeOrderId);
  if (!o) return [];
  const items   = Array.isArray(o.items) ? o.items : [];
  const result  = [];

  checked.forEach(cb => {
    const itemIdx    = parseInt(cb.dataset.item);
    const toppingIdx = cb.dataset.topping !== '' ? parseInt(cb.dataset.topping) : null;
    const item       = items[itemIdx];
    if (!item) return;

    if (toppingIdx === null) {
      // Full item missing
      result.push({
        type:  'item',
        name:  item.name || item.name_he || 'פריט',
        price: parseFloat(item.price) || 0,
        qty:   item.quantity || item.qty || 1,
      });
    } else {
      // Topping missing
      const top = (item.toppings || [])[toppingIdx];
      if (!top) return;
      result.push({
        type:      'topping',
        name:      top.name || top.name_he || 'תוספת',
        price:     parseFloat(top.price) || 0,
        qty:       1,
        item_name: item.name || item.name_he || 'פריט',
      });
    }
  });
  return result;
}

function updateDisputePreview() {
  const o       = currentOrders.find(x => x.id === _disputeOrderId);
  const el      = document.getElementById('disputePreview');
  const disputes = getCheckedDisputes();

  if (!o || !disputes.length) {
    el.textContent = TR('יש לסמן לפחות פריט אחד כדי לראות תצוגה מקדימה.');
    return;
  }

  const greeting  = o.customer_name ? `שלום ${o.customer_name}! 🙏` : `שלום! 🙏`;
  const isSingle  = disputes.length === 1;
  const refund    = disputes.reduce((s, d) => s + d.price * (d.qty || 1), 0);
  const refundStr = refund > 0 ? ` (זיכוי של ₪${refund.toFixed(0)})` : '';

  const listStr = disputes.map(d =>
    d.type === 'item'
      ? `• *${d.name}*${d.qty > 1 ? ` ×${d.qty}` : ''}`
      : `• תוספת *${d.name}* (ב${d.item_name})`
  ).join('\n');

  el.textContent =
    `${greeting}\n\n` +
    `לצערנו, ${isSingle ? 'הפריט הבא' : 'הפריטים הבאים'} אזל${isSingle ? '' : 'ו'} במלאי:\n` +
    `${listStr}\n\n` +
    `(הזמנה מספר *${o.order_number}*)\n\n` +
    `מה תרצה לעשות?\n` +
    `*1* — לבטל את ההזמנה לגמרי\n` +
    `*2* — להמשיך ללא ${isSingle ? disputes[0].name : 'הפריטים החסרים'}${refundStr}\n` +
    `*3* — להחליף בפריט אחר (כתוב מה תרצה)\n\n` +
    `שלח את המספר המתאים 👆`;
}

async function confirmDispute() {
  const disputes = getCheckedDisputes();
  if (!disputes.length) { alert(TR('יש לסמן לפחות פריט אחד')); return; }

  const btn = document.getElementById('disputeConfirmBtn');
  btn.disabled = true; btn.textContent = TR('שולח...');

  try {
    await api('POST', `/orders/${_disputeOrderId}/item-dispute`, { disputes });
    closeModal('disputeModal');
    const ord = currentOrders.find(x => x.id === _disputeOrderId);
    if (ord) { ord.dispute_status = 'pending'; ord.dispute_items = disputes; }
    filterOrders();
    showToast(`${TR('הודעה נשלחה ללקוח')} — ${disputes.length}`);
  } catch (err) {
    alert(err.message || TR('שגיאה בשליחת המחלוקת'));
  } finally {
    btn.disabled = false; btn.textContent = TR('שלח ללקוח');
  }
}

// ─── Cancel + Refund Modal ────────────────────────────────────────────────────

let _cancelOrderId   = null;
let _previewEdited   = false;  // true once user manually edits the preview textarea

function buildCancelMessage() {
  const byCustomer     = document.querySelector('input[name="cancelledBy"]:checked')?.value === 'customer';
  const reason         = document.getElementById('cancelRefundReason')?.value.trim() || '';
  const sendToCustomer = document.getElementById('cancelSendToCustomer')?.checked;
  const o              = _cancelOrderId ? currentOrders.find(x => x.id === _cancelOrderId) : null;
  const orderNum       = o?.order_number || '—';
  const isCreditPaid   = o?.payment_method === 'credit' && o?.payment_status === 'paid';

  const byLine     = byCustomer ? 'בוטלה לפי בקשתך.' : 'בוטלה על ידי העסק.';
  const reasonLine = reason && sendToCustomer ? `\nסיבה: ${reason}` : '';
  const refundLine = isCreditPaid ? '\nהתשלום יזוכה לכרטיסך תוך 3-5 ימי עסקים.' : '';

  return `❌ הזמנה מספר *${orderNum}* ${byLine}${reasonLine}${refundLine}\n\nמצטערים על אי הנוחות 🙏`;
}

async function confirmBitPayment(orderId) {
  const o = currentOrders.find(x => x.id === orderId);
  if (!o) return;
  if (!confirm(`${TR('לאשר קבלת תשלום Bit עבור הזמנה')} #${o.order_number} (₪${parseFloat(o.total_price||0).toFixed(0)})?`)) return;
  try {
    await api('POST', `/orders/${orderId}/confirm-payment`);
    showToast(TR('תשלום אושר!'));
    loadOrders();
  } catch (err) {
    showToast(err.message || TR('שגיאה באישור תשלום'));
  }
}

function openCancelRefundModal(orderId) {
  const o = currentOrders.find(x => x.id === orderId);
  if (!o) return;
  _cancelOrderId = orderId;
  _previewEdited = false;

  const isCreditPaid = o.payment_method === 'credit' && o.payment_status === 'paid';

  document.getElementById('cancelRefundTitle').textContent   = `${TR('ביטול הזמנה')} #${o.order_number}`;
  document.getElementById('cancelRefundAmount').textContent  = `₪${parseFloat(o.total_price||0).toFixed(2)}`;
  document.getElementById('cancelRefundPayment').textContent = isCreditPaid ? TR('אשראי — יינתן זיכוי') : o.payment_method === 'cash' ? TR('מזומן') : o.payment_method === 'bit' ? `Bit${o.payment_status==='paid'?' — '+TR('שולם'):' — '+TR('ממתין')}` : TR('לא שולם');
  document.getElementById('cancelRefundPayment').style.color = isCreditPaid ? '#16a34a' : '#c07000';
  document.getElementById('cancelRefundReason').value        = '';
  document.getElementById('cancelSendToCustomer').checked    = true;

  document.querySelectorAll('input[name="cancelledBy"]').forEach(r => { r.checked = r.value === 'business'; });

  updateCancelUI();
  openModal('cancelRefundModal');
}

function updateCancelUI() {
  const byCustomer     = document.querySelector('input[name="cancelledBy"]:checked')?.value === 'customer';
  const sendToCustomer = document.getElementById('cancelSendToCustomer')?.checked;

  document.getElementById('cancelByBusinessLabel').style.borderColor = !byCustomer ? '#e0004d' : 'var(--border)';
  document.getElementById('cancelByCustomerLabel').style.borderColor  =  byCustomer ? '#e0004d' : 'var(--border)';

  // Only auto-update preview if user hasn't manually edited it
  if (!_previewEdited) {
    document.getElementById('cancelPreview').value = buildCancelMessage();
  }

  const hint = document.getElementById('cancelSendHint');
  if (hint) hint.textContent = sendToCustomer
    ? TR('ההערה תצורף להודעת הביטול ב-WhatsApp')
    : TR('ההערה תישמר פנימית בלבד — לא תישלח ללקוח');
}

function onPreviewEdit() {
  _previewEdited = true;
}

function resetCancelPreview() {
  _previewEdited = false;
  document.getElementById('cancelPreview').value = buildCancelMessage();
}

async function confirmCancelRefund() {
  if (!_cancelOrderId) return;
  const reason         = document.getElementById('cancelRefundReason').value.trim();
  const cancelledBy    = document.querySelector('input[name="cancelledBy"]:checked')?.value || 'business';
  const sendToCustomer = document.getElementById('cancelSendToCustomer').checked;
  // Use the (possibly edited) preview as the actual customer message
  const customMessage  = document.getElementById('cancelPreview').value.trim();
  const btn            = document.getElementById('cancelRefundBtn');

  btn.textContent = TR('מבטל...');
  btn.disabled    = true;

  try {
    const res = await api('POST', `/orders/${_cancelOrderId}/cancel-refund`, {
      reason,
      cancelled_by:      cancelledBy,
      send_to_customer:  sendToCustomer,
      custom_message:    customMessage,
    });
    closeModal('cancelRefundModal');
    loadOrders();

    showToast(`${TR('הזמנה בוטלה')}${res.refundMessage ? ' — ' + res.refundMessage : ''}`);

    if (res.refundStatus === 'manual') {
      setTimeout(() => alert(`נדרש זיכוי ידני\n\n${res.refundMessage}\n\nבצע זיכוי דרך:\nhttps://secure.cardcom.solutions`), 300);
    }
  } catch (err) {
    alert(TR('שגיאה') + ': ' + err.message);
  } finally {
    btn.textContent = TR('אשר ביטול');
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
  const delivery = deliveryFeeOf(o);
  const total    = parseFloat(o.total_price) || (subtotal + delivery);
  const vat      = vatOf(total);
  const net      = total - vat;

  const itemRows = items.map(it => {
    const qty      = it.quantity || it.qty || 1;
    const lineTotal= (parseFloat(it.price)||0) * qty;
    const tops     = (it.toppings||[]).map(topLabel).filter(Boolean).join(', ');
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
    <div class="total-row"><span>${vatLabel()}</span><span>₪${vat.toFixed(2)}</span></div>
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

  document.getElementById('orderEditTitle').textContent = `${TR('עריכת הזמנה')} #${order.order_number}`;

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
    el.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;padding:8px 0">${TR('אין פריטים')}</div>`;
    return;
  }
  el.innerHTML = _editItems.map((item, i) => {
    const qty = item.quantity || 1;
    const toppings = (item.toppings || []).map(topLabel).filter(Boolean).join(', ');
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--color-bg);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.88rem">${item.name||item.name_he||TR('פריט')}</div>
          ${toppings ? `<div style="font-size:.75rem;color:var(--text-muted)">+ ${toppings}</div>` : ''}
        </div>
        <div style="font-weight:700;color:var(--text);min-width:50px;text-align:center">₪${((item.price||0)*qty).toFixed(0)}</div>
        <div style="display:flex;align-items:center;gap:4px">
          <button onclick="changeQty(${i},-1)" style="width:26px;height:26px;border-radius:50%;border:2px solid var(--border);background:#fff;cursor:pointer;font-weight:700;font-size:1rem;display:flex;align-items:center;justify-content:center">−</button>
          <span style="font-weight:800;min-width:20px;text-align:center">${qty}</span>
          <button onclick="changeQty(${i},+1)" style="width:26px;height:26px;border-radius:50%;border:2px solid var(--border);background:#fff;cursor:pointer;font-weight:700;font-size:1rem;display:flex;align-items:center;justify-content:center">+</button>
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
  const deliveryFee = deliveryFeeOf(order) || 0;
  const subtotal = _editItems.reduce((s, item) => s + (parseFloat(item.price)||0) * (item.quantity||1), 0);
  const total = subtotal + deliveryFee;
  const vat   = vatOf(total);

  document.getElementById('editSubtotal').textContent    = `₪${subtotal.toFixed(2)}`;
  document.getElementById('editDeliveryFee').textContent  = `₪${deliveryFee.toFixed(0)}`;
  document.getElementById('editTotal').textContent        = `₪${total.toFixed(2)}`;
  document.getElementById('editVat').textContent          = `₪${vat.toFixed(2)}`;
}

function openAddProductToOrder() {
  // Simple prompt for now — future: product picker modal
  const name = prompt(TR('שם המוצר:'));
  if (!name) return;
  const price = parseFloat(prompt(TR('מחיר:')) || '0');
  _editItems.push({ name, price, quantity: 1, toppings: [] });
  renderEditItems();
}

async function saveOrderEdit() {
  if (!_editOrder) return;
  const city   = document.getElementById('editCity').value.trim();
  const street = document.getElementById('editStreet').value.trim();
  const num    = document.getElementById('editStreetNum').value.trim();
  const addr   = [street, num, city].filter(Boolean).join(', ');

  // The fee the order was actually placed with — recomputing it from a literal
  // rewrote the charged total every time anyone opened the edit modal.
  const deliveryFee = deliveryFeeOf({ ..._editOrder, address: addr || _editOrder.address }) || 0;
  const subtotal    = _editItems.reduce((s,i) => s+(parseFloat(i.price)||0)*(i.quantity||1), 0);

  try {
    await api('PUT', `/orders/${_editOrder.id}`, {
      items:            _editItems,
      address:          addr || _editOrder.address,
      destination_type: document.getElementById('editDestType').value,
      courier_notes:    document.getElementById('editCourierNotes').value.trim(),
      delivery_fee:     deliveryFee,
      total_price:      (subtotal + deliveryFee).toFixed(2),
    });
    closeModal('orderEditModal');
    await loadOrders();
    showToast(TR('הזמנה עודכנה'));
  } catch (err) { alert(err.message); }
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

let allCategories = [];          // flat category list
let categoriesWithProducts = []; // grouped response from API
const expandedCategories = new Set();
const expandedProducts   = new Set();

async function loadProducts() {
  const container = document.getElementById('productsTable');
  container.innerHTML = `<div class="p-8 text-center text-gray-400">${TR('טוען...')}</div>`;
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
    container.innerHTML = `<div class="p-12 text-center text-gray-400">${TR('אין קטגוריות — לחץ "+ קטגוריה"')}</div>`;
    return;
  }

  const categoryBlocks = categoriesWithProducts.map((cat) => {
    const isCatExpanded = expandedCategories.has(cat.id);
    const products = cat.products || [];

    // The addon category IS the toppings — its content is the global toppings manager
    if (cat.is_topping_addon) {
      return `<div style="margin-bottom:12px;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-sm);background:var(--white)">
        <div class="cat-header" style="cursor:default">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="width:36px;height:36px;border-radius:var(--radius-sm);background:var(--color-bg);color:var(--text-muted);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${_catIcon(cat)}</span>
            <div>
              <span style="font-weight:700;font-size:.95rem;color:var(--text)">${cat.name_he}</span>
              <span style="font-size:.75rem;color:var(--text-muted);margin-inline-start:8px">${_aggToppings().length} ${TR('תוספות')}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px" onclick="event.stopPropagation()">
            <button onclick="openCategoryModal(${encodeProduct(cat)})" class="btn btn-ghost btn-sm">${TR('עריכה')}</button>
          </div>
        </div>
        <div style="border-top:1px solid var(--border)">${renderGlobalToppings()}</div>
      </div>`;
    }

    const catHeader = `
      <div class="cat-header" onclick="toggleCategoryExpand('${cat.id}')">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:.9rem;color:var(--text-muted);transition:transform .2s;display:inline-block;transform:rotate(${isCatExpanded?'0deg':'-90deg'})"">▾</span>
          <span style="width:36px;height:36px;border-radius:var(--radius-sm);background:var(--color-bg);color:var(--text-muted);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${_catIcon(cat)}</span>
          <div>
            <span style="font-weight:700;font-size:.95rem;color:var(--text)">${cat.name_he}</span>
            <span style="font-size:.75rem;color:var(--text-muted);margin-right:8px">${products.length} ${TR('פריטים')}</span>
            ${cat.has_toppings ? `<span style="font-size:.72rem;background:#f0f0f0;color:#666;padding:2px 10px;border-radius:50px;font-weight:600">${TR('תוספות')}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px" onclick="event.stopPropagation()">
          <button onclick="openProductModal(null,'${cat.id}')" class="btn btn-primary btn-sm">${TR('+ מוצר')}</button>
          <button onclick="openCategoryModal(${encodeProduct(cat)})" class="btn btn-ghost btn-sm">${TR('עריכה')}</button>
          <button onclick="deleteCategory('${cat.id}','${cat.name_he}')" class="btn-danger">${TR('מחיקה')}</button>
        </div>
      </div>`;

    if (!isCatExpanded) return `<div style="margin-bottom:10px;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-sm);background:var(--white)">${catHeader}</div>`;

    const productRows = products.length
      ? products.map((p) => renderProductRow(p, cat)).join('')
      : `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:.88rem">${TR('אין מוצרים — לחץ "+ מוצר"')}</div>`;

    return `<div style="margin-bottom:12px;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-sm);background:var(--white)">${catHeader}${productRows}</div>`;
  }).join('');

  container.innerHTML = `<div>${categoryBlocks}</div>`;
}

function renderProductRow(p, cat) {
  const pData = encodeProduct(p);
  return `
    <div class="product-row">
      ${imgThumb(p.image_url)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:700;font-size:.92rem">${p.name_he}</span>
          ${!p.is_available ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:.68rem;background:#fff1f2;color:#be123c;padding:1px 8px;border-radius:var(--radius-sm);font-weight:600;border:1px solid #fecdd3"><span style="width:6px;height:6px;border-radius:50%;background:#e11d48"></span>${TR('אזל')}</span>` : ''}
        </div>
        ${p.name_en ? `<div style="font-size:.75rem;color:var(--text-muted)" dir="ltr">${p.name_en}</div>` : ''}
        ${p.description ? `<div style="font-size:.73rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;margin-top:2px">${p.description}</div>` : ''}
      </div>
      <div style="font-weight:800;font-size:.95rem;color:var(--text);min-width:60px">₪${parseFloat(p.price).toFixed(0)}</div>
      ${toggleSwitch(p.is_available, `toggleProduct('${p.id}',${!p.is_available})`)}
      <div style="display:flex;gap:6px;margin-inline-start:4px">
        <button onclick="openProductModal(${pData},'${p.category_id||''}')" class="btn btn-ghost btn-sm">${TR('עריכה')}</button>
        <button onclick="deleteProduct('${p.id}','${p.name_he}')" class="btn-danger">${TR('מחק')}</button>
      </div>
    </div>`;
}

// ── Category-level toppings (a topping applies to everything — never per dish) ──
const expandedToppingEditors = new Set();

function _aggToppings() {
  // unique by name across ALL dishes; unavailable wins for display
  const map = new Map();
  for (const cat of categoriesWithProducts) {
    for (const p of (cat.products || [])) {
      for (const a of (p.additions || [])) {
        const cur = map.get(a.name_he);
        if (!cur) map.set(a.name_he, { name_he: a.name_he, price: a.price, is_available: !!a.is_available, count: 1 });
        else { cur.count++; cur.is_available = cur.is_available && !!a.is_available; }
      }
    }
  }
  return [...map.values()];
}

function renderGlobalToppings() {
  const tops = _aggToppings();
  const editorOpen = expandedToppingEditors.has('global');
  if (!tops.length) return '';

  const chips = tops.map((a) => `
    <button onclick="toggleToppingByName('${a.name_he.replace(/'/g, "\\'")}',${!a.is_available})"
      title="${a.is_available ? TR('זמין — לחץ לסימון כאזל') : TR('אזל — לחץ להחזרה')}"
      style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:var(--radius-sm);border:1px solid ${a.is_available ? '#bbf7d0' : '#fecdd3'};background:${a.is_available ? '#f0fdf4' : '#fff1f2'};cursor:pointer;font-family:inherit;font-size:.76rem;font-weight:600;color:${a.is_available ? '#15803d' : '#be123c'};transition:all .15s">
      <span style="width:6px;height:6px;border-radius:50%;background:${a.is_available ? '#22c55e' : '#e11d48'};flex-shrink:0"></span>
      ${a.name_he}
      <span style="font-weight:400;opacity:.75">+₪${parseFloat(a.price).toFixed(0)}</span>
    </button>`).join('');

  const editor = editorOpen ? `
    <div style="margin-top:10px;border-radius:var(--radius-md);border:1px solid var(--border);overflow:hidden;background:var(--white)">
      <div style="display:grid;grid-template-columns:1fr 110px 90px;padding:8px 14px;background:var(--color-bg);border-bottom:1px solid var(--border);font-size:.68rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;gap:12px">
        <span>${TR('תוספת')}</span><span>${TR('מחיר (₪)')}</span><span></span>
      </div>
      ${tops.map((a) => `
        <div style="display:grid;grid-template-columns:1fr 110px 90px;padding:9px 14px;border-top:1px solid var(--border);align-items:center;gap:12px;font-size:.83rem">
          <span style="font-weight:600">${a.name_he}</span>
          <input type="number" value="${parseFloat(a.price).toFixed(0)}" min="0" dir="ltr"
            onchange="updateToppingPrice('${a.name_he.replace(/'/g, "\\'")}',this.value)"
            style="padding:5px 10px;font-size:.8rem;width:100%">
          <button onclick="deleteToppingByName('${a.name_he.replace(/'/g, "\\'")}')" class="btn-danger" style="font-size:.72rem;padding:3px 7px">מחק</button>
        </div>`).join('')}
      <div style="display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--border);align-items:center">
        <input id="newTopName-global" type="text" placeholder="${TR('שם תוספת')}" style="flex:1;padding:6px 10px;font-size:.8rem">
        <input id="newTopPrice-global" type="number" placeholder="${TR('מחיר')}" min="0" dir="ltr" style="width:90px;padding:6px 10px;font-size:.8rem">
        <button onclick="addToppingGlobal()" class="btn btn-outline btn-sm">${TR('+ הוסף')}</button>
      </div>
    </div>` : '';

  return `
    <div style="padding:14px 20px">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-inline-end:4px">${TR('זמינות לכל המנות — לחיצה משביתה/מחזירה למלאי')}</span>
        ${chips}
        <button onclick="toggleToppingEditor('global')"
          style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:var(--radius-sm);border:1px dashed var(--color-border-strong);background:none;cursor:pointer;font-family:inherit;font-size:.76rem;color:var(--text-muted)">
          ${editorOpen ? '▴ ' + TR('סגור') : `${SVG.edit} ${TR('ניהול')}`}
        </button>
      </div>
      ${editor}
    </div>`;
}

function toggleToppingEditor(catId) {
  if (expandedToppingEditors.has(catId)) expandedToppingEditors.delete(catId);
  else expandedToppingEditors.add(catId);
  renderProductsTable();
}

async function toggleToppingByName(name, isAvailable) {
  try {
    await api('PATCH', '/additions/by-name', { name_he: name, is_available: isAvailable });
    for (const cat of categoriesWithProducts)
      for (const p of (cat.products || []))
        for (const a of (p.additions || []))
          if (a.name_he === name) a.is_available = isAvailable;
    renderProductsTable();
    showToast(`${name} — ${isAvailable ? TR('חזרה למלאי') : TR('סומנה כאזלה')}`);
  } catch (err) { alert(err.message); }
}

async function updateToppingPrice(name, price) {
  try {
    await api('PATCH', '/additions/by-name', { name_he: name, price: parseFloat(price) || 0 });
    for (const cat of categoriesWithProducts)
      for (const p of (cat.products || []))
        for (const a of (p.additions || []))
          if (a.name_he === name) a.price = parseFloat(price) || 0;
    renderProductsTable();
    showToast(TR('המחיר עודכן בכל המוצרים'));
  } catch (err) { alert(err.message); }
}

async function deleteToppingByName(name) {
  if (!confirm(`${TR('למחוק את התוספת')} "${name}"?`)) return;
  try {
    await api('DELETE', `/additions/by-name?name_he=${encodeURIComponent(name)}`);
    await loadProducts();
    showToast(`${name} ${TR('הוסרה')}`);
  } catch (err) { alert(err.message); }
}

async function addToppingGlobal() {
  const name  = document.getElementById('newTopName-global')?.value.trim();
  const price = document.getElementById('newTopPrice-global')?.value;
  if (!name || price === '') { alert(TR('שם ומחיר נדרשים')); return; }
  try {
    await api('POST', '/additions/by-name', { name_he: name, price: parseFloat(price) || 0 });
    await loadProducts();
    expandedToppingEditors.add('global');
    renderProductsTable();
    showToast(`${name} ${TR('נוספה לכל המנות')}`);
  } catch (err) { alert(err.message); }
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
  document.getElementById('categoryModalTitle').textContent = c?.id ? TR('עריכת קטגוריה') : TR('קטגוריה חדשה');
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
  if (!confirm(`${TR('למחוק את')} "${name}"?`)) return;
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
  document.getElementById('productModalTitle').textContent = p?.id ? TR('עריכת מוצר') : TR('מוצר חדש');
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
  btn.textContent = TR('מעלה...');
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
    showToast(TR('תמונה הועלתה'));
  } catch (err) {
    alert(TR('שגיאה בהעלאה') + ': ' + err.message);
  } finally {
    btn.textContent = TR('העלאת קובץ');
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
  if (!confirm(`${TR('למחוק את')} "${name}"?`)) return;
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
  document.getElementById('additionModalTitle').textContent = a?.id ? TR('עריכת תוספת') : TR('תוספת חדשה');
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
  btn.textContent = TR('מעלה...');
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
    showToast(TR('תמונה הועלתה'));
  } catch (err) {
    alert(TR('שגיאה בהעלאה') + ': ' + err.message);
  } finally {
    btn.textContent = TR('העלאת קובץ');
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
  if (!confirm(`${TR('למחוק את')} "${name}"?`)) return;
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
  container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">${TR('טוען...')}</div>`;
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
    <div class="stat-card">
      <div class="stat-value">${total}</div>
      <div class="stat-label">${TR('סה"כ לקוחות')}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${returning}</div>
      <div class="stat-label">${TR('לקוחות חוזרים')} <span style="font-size:.75rem;background:var(--color-info-bg);color:var(--color-info);padding:1px 8px;border-radius:50px">${retPct}%</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${totalOrders}</div>
      <div class="stat-label">${TR('סה"כ הזמנות')}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-value">₪${Math.round(totalRev).toLocaleString()}</div>
      <div class="stat-label">${TR('סה"כ הכנסות')}</div>
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
    container.innerHTML = `<div class="empty-state">${TR('אין לקוחות תואמים לחיפוש')}</div>`;
    return;
  }
  container.innerHTML = `
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="selectAll" onchange="toggleSelectAll(this)"></th>
          <th>${TR('שם לקוח')}</th>
          <th>${TR('טלפון')}</th>
          <th>${TR('הזמנות')}</th>
          <th>${TR('סה"כ רכישות')}</th>
        </tr>
      </thead>
      <tbody>
        ${customers.map((c) => {
          const isReturning = parseInt(c.order_count) >= 2;
          return `<tr>
            <td><input type="checkbox" value="${c.phone}" onchange="toggleCustomer('${c.phone}',this.checked)" class="customer-checkbox"></td>
            <td>
              <div style="font-weight:700">${c.name||'—'}</div>
              ${isReturning ? `<span style="font-size:.68rem;background:var(--color-info-bg);color:var(--color-info);padding:1px 8px;border-radius:50px;font-weight:700">${TR('חוזר')}</span>` : ''}
            </td>
            <td style="color:var(--text-muted);font-size:.82rem" dir="ltr">${c.customer_phone||c.phone||'—'}</td>
            <td style="text-align:center;font-weight:800;color:var(--text)">${c.order_count}</td>
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
  if (selectedPhones.size === 0) { alert(TR('יש לבחור לקוחות לפני השליחה')); return; }
  document.getElementById('broadcastRecipients').textContent = `${TR('נמענים נבחרו')}: ${selectedPhones.size}`;
  document.getElementById('broadcastMessage').value = '';
  openModal('broadcastModal');
}

let _broadcastInFlight = false;

async function sendBroadcast() {
  const message = document.getElementById('broadcastMessage').value.trim();
  if (!message) { alert(TR('יש לכתוב הודעה')); return; }
  // 50 recipients take ~20s; a second click used to resend the whole batch.
  if (_broadcastInFlight) return;
  _broadcastInFlight = true;

  const btn = document.querySelector('#broadcastModal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = TR('שולח...'); }

  try {
    const result = await api('POST', '/customers/broadcast', {
      phones:  [...selectedPhones],
      message,
    });
    const lines = [`${TR('נשלח')}: ${result.sent}`, `${TR('נכשל')}: ${result.failed}`];
    if (result.skipped) lines.push(`${TR('דילגנו (ביקשו הסרה)')}: ${result.skipped}`);
    if (result.failures?.length) {
      lines.push('', TR('נכשלו:'));
      result.failures.slice(0, 10).forEach(f => lines.push(`${f.phone} — ${f.error}`));
    }
    alert(lines.join('\n'));
    closeModal('broadcastModal');
  } catch (err) {
    alert(err.message);
  } finally {
    _broadcastInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = TR('שלח'); }
  }
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

// ─── SETTINGS ────────────────────────────────────────────────────────────────

let _currentSettings = {};
let _deliveryZones   = [];

async function loadSettings() {
  const container = document.getElementById('settingsForm');
  container.innerHTML = `<div style="color:var(--text-muted);padding:20px">${TR('טוען...')}</div>`;
  try {
    _currentSettings = await api('GET', '/settings');
    _deliveryZones   = Array.isArray(_currentSettings.delivery_zones) ? _currentSettings.delivery_zones : [];
    _couriers        = Array.isArray(_currentSettings.couriers)        ? _currentSettings.couriers        : [];
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
    <label style="display:block;font-size:.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${TR(label)}</label>
    <input type="${type}" id="${id}" value="${value||''}" placeholder="${placeholder}" style="width:100%">
  </div>`;
}

function sToggle(key, label, checked, cls='', desc='') {
  return `<div class="setting-row ${cls}">
    <div style="min-width:0">
      <div style="font-weight:600;font-size:.9rem;color:var(--text)">${TR(label)}</div>
      ${desc ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:2px">${TR(desc)}</div>` : ''}
    </div>
    <label class="toggle-switch">
      <input type="checkbox" class="setting-toggle" data-key="${key}" ${checked?'checked':''}>
      <span class="toggle-track"></span>
    </label>
  </div>`;
}

function saveBtn(fn, label='שמור') {
  label = TR(label);
  return `<div style="display:flex;justify-content:flex-end;margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
    <button onclick="${fn}()" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:7px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      ${label}</button>
  </div>`;
}

let _sCardSeq = 0;
function sCard(icon, title, sub, content) {
  return `<div class="card" id="scard-${_sCardSeq++}" style="margin-bottom:18px;scroll-margin-top:72px">
    <div style="display:flex;align-items:center;gap:12px;padding:18px 24px;border-bottom:1px solid var(--border)">
      <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--color-bg);display:flex;align-items:center;justify-content:center;color:var(--text-muted);flex-shrink:0">${icon}</div>
      <div style="min-width:0">
        <div style="font-size:.95rem;font-weight:700;color:var(--text)">${TR(title)}</div>
        ${sub ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:2px">${TR(sub)}</div>` : ''}
      </div>
    </div>
    <div style="padding:20px 24px">${content}</div>
  </div>`;
}

// Sticky segmented anchor nav for the long settings scroll — labels in card order.
// Active chip follows the scroll position (wired in wireSettingsNavSpy).
function settingsNav(labels) {
  const chip = (i, label) =>
    `<button id="schip-${i}" class="settings-chip" onclick="settingsNavGo(${i})">${TR(label)}</button>`;
  return `<div style="position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0 12px">
    <div class="settings-nav">${labels.map((l, i) => chip(i, l)).join('')}</div>
  </div>`;
}

function settingsNavGo(i) {
  _settingsSpyLock = Date.now() + 700; // let smooth-scroll finish before the spy takes over
  setActiveSettingsChip(i);
  document.getElementById(`scard-${i}`)?.scrollIntoView({ behavior: 'smooth' });
}

let _settingsSpyLock = 0;
let _settingsActiveChip = -1;
function setActiveSettingsChip(i) {
  if (i === _settingsActiveChip) return; // avoid layout work on every scroll event
  _settingsActiveChip = i;
  document.querySelectorAll('.settings-chip').forEach((c, ci) => c.classList.toggle('active', ci === i));
  document.getElementById(`schip-${i}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

let _settingsSpyHandler = null;
function wireSettingsNavSpy(count) {
  if (_settingsSpyHandler) window.removeEventListener('scroll', _settingsSpyHandler);
  _settingsActiveChip = -1; // chips were just re-rendered
  const onScroll = () => {
    const first = document.getElementById('scard-0');
    if (!first || !first.offsetParent) return; // settings tab not visible
    if (Date.now() < _settingsSpyLock) return;
    let active = 0;
    for (let i = 0; i < count; i++) {
      const el = document.getElementById(`scard-${i}`);
      if (el && el.getBoundingClientRect().top <= 120) active = i;
    }
    setActiveSettingsChip(active);
  };
  _settingsSpyHandler = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

async function saveSection(updates, successMsg) {
  try {
    await api('PATCH', '/settings', updates);
    showToast(successMsg || TR('נשמר'));
  } catch (err) { alert(err.message); }
}

async function cancelOverride() {
  try {
    await api('PATCH', '/settings', { open_override: false }); // settings.value is NOT NULL — false = no override
    showToast(TR('החריגה בוטלה — חוזרים ללוח השעות הרגיל'));
    loadSettings();
  } catch (err) { alert(err.message); }
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 24px;border-radius:50px;font-weight:700;font-size:.88rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.25)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── Render ──

function buildHoursRows(hoursObj, activeClass, inputClass) {
  return DAY_ORDER.map((day) => {
    const h = hoursObj[day] || { open: '10:00', close: '23:00', is_open: true };
    const open = h.is_open !== false;
    return `<div class="hours-row" style="display:flex;align-items:center;gap:14px;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px">
      <label class="toggle-switch">
        <input type="checkbox" class="${activeClass}" data-day="${day}" ${open?'checked':''}>
        <span class="toggle-track"></span>
      </label>
      <span style="font-weight:600;font-size:.85rem;color:var(--text);min-width:62px">${TR(`יום ${DAY_LABELS[day]}`)}</span>
      <input type="time" dir="ltr" value="${h.open}"  data-day="${day}" data-field="open"  class="${inputClass}" style="width:110px" ${!open?'disabled':''}>
      <span style="color:var(--text-muted);font-size:.82rem">—</span>
      <input type="time" dir="ltr" value="${h.close}" data-day="${day}" data-field="close" class="${inputClass}" style="width:110px" ${!open?'disabled':''}>
    </div>`;
  }).join('');
}

function renderSettingsForm(s) {
  const hoursRows         = buildHoursRows(s.business_hours  || {}, 'hours-active',          'hours-input');
  const deliveryHoursRows = buildHoursRows(s.delivery_hours  || {}, 'delivery-hours-active', 'delivery-hours-input');

  const ico = (path, vb='0 0 24 24') =>
    `<svg width="17" height="17" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

  const ICONS = {
    biz:   ico('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>'),
    pay:   ico('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
    bag:   ico('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
    edit:  ico('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
    clock: ico('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    pin:   ico('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
    truck: ico('<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 7v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
    phone: ico('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  };

  const NAV_LABELS = ['פרטי העסק','מע"מ','תשלום','סוגי הזמנה','אישור הזמנות','תוספות','מתוזמנות','שינויי הזמנות','שיחה עם נציג','שעות פעילות','שעות משלוח','אזורי משלוח','שליחים','שיחות שלא נענו'];

  // Effective state banner — what customers experience RIGHT NOW (flag ∧ hours
  // ∧ override), not the raw is_open toggle below, which alone can mislead.
  const eff = s._effective || {};
  const ovUntil = eff.override ? new Date(eff.override.until).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';
  const effBanner = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;padding:14px 18px;border:1px solid ${eff.open ? '#bbf7d0' : '#fecaca'};background:${eff.open ? '#f0fdf4' : '#fef2f2'};border-radius:var(--radius-lg)">
      <span style="width:10px;height:10px;border-radius:50%;background:${eff.open ? '#16a34a' : '#dc2626'};flex-shrink:0"></span>
      <span style="font-weight:700;font-size:.9rem;color:var(--text)">
        ${eff.open ? TR('העסק פתוח כרגע ללקוחות') : TR('העסק סגור כרגע ללקוחות')}
      </span>
      <span style="font-size:.8rem;color:var(--text-muted)">
        ${eff.open === false && s.is_open !== false && !eff.override ? TR('(מחוץ לשעות הפעילות)') : ''}
        ${TR('משלוח')}: ${eff.delivery ? TR('פתוח') : TR('סגור')}
      </span>
      ${eff.override ? `
        <span style="font-size:.78rem;font-weight:600;padding:3px 10px;border-radius:50px;background:#fef3c7;color:#92400e">
          ${eff.override.state ? TR('פתיחה חריגה עד') : TR('סגירה חריגה עד')} ${ovUntil}
        </span>
        <button onclick="cancelOverride()" class="btn btn-outline" style="font-size:.78rem;padding:4px 12px">${TR('בטל חריגה')}</button>
      ` : ''}
    </div>`;

  _sCardSeq = 0;
  document.getElementById('settingsForm').innerHTML = `
    ${settingsNav(NAV_LABELS)}
    ${effBanner}

    ${sCard(ICONS.biz, 'פרטי העסק', 'פרטים המוצגים ללקוחות בבוט ובתפריט הציבורי', `
      ${sField('biz_name',    'שם העסק',           s.business_name    || '', 'text', 'פיצה דליבריס')}
      ${sField('biz_name_en', 'שם לועזי (לקישור התפריט הציבורי)', s.business_name_en || '', 'text', 'pizza-deliveries')}
      ${sField('biz_address', 'כתובת העסק',         s.business_address || '', 'text', 'רוטשילד 19, תל אביב')}
      ${sField('biz_bot_url', 'כתובת שרת הבוט',     s.bot_url          || '', 'url',  'https://...')}
      ${sField('biz_pickup',  'כתובת לאיסוף עצמי', s.pickup_address   || '', 'text', 'רוטשילד 19, תל אביב')}
      ${sField('biz_whatsapp','מספר וואטסאפ להזמנות (בתפריט הציבורי)', s.bot_whatsapp || '', 'tel', '972500000000')}
      ${saveBtn('saveBizInfo')}
    `)}

    ${sCard(ICONS.pay, 'מע"מ וחיוב', 'שיעור המע"מ המוצג בקבלות ובסיכומי הזמנה', `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="font-size:.84rem;font-weight:600;min-width:150px">${TR('שיעור מע"מ')}</label>
        <input type="number" id="vatRate" value="${s.vat_rate ?? 18}" min="0" max="100" step="0.5"
          style="width:90px;font-weight:700;text-align:center">
        <span style="font-size:.84rem;color:var(--text-muted)">%</span>
      </div>
      ${saveBtn('saveVatRate')}
    `)}

    ${sCard(ICONS.pay, 'אמצעי תשלום', 'אילו אמצעי תשלום הבוט מציע ללקוחות', `
      ${sToggle('payment_cash',   'מזומן',   s.payment_cash   !== false, '', 'תשלום במזומן בעת המסירה')}
      ${sToggle('payment_credit', 'אשראי',   s.payment_credit !== false, '', 'תשלום מאובטח בכרטיס אשראי')}
      ${sToggle('payment_bit',    'ביט',      !!s.payment_bit,            '', 'העברה למספר הביט של העסק')}
      <div id="bitPhoneRow" style="margin:10px 0 4px 0;padding:14px 16px 4px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--color-bg);${s.payment_bit?'':'display:none'}">
        ${sField('bit_phone', 'מספר טלפון לBit', s.bit_phone || '', 'tel', '050-0000000')}
      </div>
      ${sToggle('payment_paybox', 'פייבוקס',  !!s.payment_paybox, '', 'העברה בפייבוקס')}
      ${sToggle('payment_other',  'אחר',      !!s.payment_other,  '', 'תיאום אמצעי תשלום אחר מול העסק')}
      ${saveBtn('savePayments')}
    `)}

    ${sCard(ICONS.bag, 'סוגי הזמנה', 'אילו אפשרויות קבלה פתוחות ללקוחות', `
      ${sToggle('delivery_enabled', 'משלוח מאופשר',      s.delivery_enabled !== false, '', 'הבוט יציע משלוח עד הבית לפי אזורי המשלוח')}
      ${sToggle('pickup_enabled',   'איסוף עצמי מאופשר', s.pickup_enabled   !== false, '', 'הבוט יציע איסוף מכתובת העסק')}
      ${sToggle('is_open',          'בוט פתוח לקבלת הזמנות', s.is_open !== false,      '', 'כיבוי עוצר מיידית קבלת הזמנות חדשות')}
      ${saveBtn('saveOrderTypes')}
    `)}

    ${sCard(ICONS.bag, 'אישור הזמנות', 'איך הזמנה חדשה מאושרת ועוברת להכנה במטבח', `
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        <label style="display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1.5px solid ${(s.order_acceptance||'manual')!=='auto'?'var(--primary)':'var(--border)'};border-radius:var(--radius-md);cursor:pointer;background:${(s.order_acceptance||'manual')!=='auto'?'var(--color-sidebar-active)':'var(--white)'}">
          <input type="radio" name="acceptMode" value="manual" ${(s.order_acceptance||'manual')!=='auto'?'checked':''} style="margin-top:3px;accent-color:var(--primary)">
          <span>
            <span style="font-weight:700;font-size:.9rem;display:block">${TR('אישור ידני (מומלץ)')}</span>
            <span style="font-size:.78rem;color:var(--text-muted)">${TR('כל הזמנה חדשה ממתינה לאישור שלך. הלקוח מקבל "ההזמנה נשלחה לאישור המסעדה", ורק אחרי שתאשר — הודעת אישור עם זמן הכנה וההזמנה עוברת למטבח.')}</span>
          </span>
        </label>
        <label style="display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1.5px solid ${(s.order_acceptance||'manual')==='auto'?'var(--primary)':'var(--border)'};border-radius:var(--radius-md);cursor:pointer;background:${(s.order_acceptance||'manual')==='auto'?'var(--color-sidebar-active)':'var(--white)'}">
          <input type="radio" name="acceptMode" value="auto" ${(s.order_acceptance||'manual')==='auto'?'checked':''} style="margin-top:3px;accent-color:var(--primary)">
          <span>
            <span style="font-weight:700;font-size:.9rem;display:block">${TR('אישור אוטומטי')}</span>
            <span style="font-size:.78rem;color:#b45309">${TR('⚠️ שים לב: כל הזמנה תאושר ללקוח מיד וללא בדיקה שלך, ותעבור ישר למטבח. ודא שהתפריט והמלאי מעודכנים תמיד — הזמנה שאושרה מחייבת אותך כלפי הלקוח.')}</span>
          </span>
        </label>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <label style="font-size:.84rem;font-weight:600;min-width:190px">${TR('זמן הכנה — ברירת מחדל')}</label>
        <input type="number" id="defaultPrepMinutes" value="${s.default_prep_minutes ?? 30}" min="5" max="120" style="width:90px;font-weight:700;text-align:center">
        <span style="font-size:.84rem;color:var(--text-muted)">${TR('דקות')}</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="font-size:.84rem;font-weight:600;min-width:190px">${TR('תזכורת אם הזמנה לא אושרה תוך')}</label>
        <input type="number" id="acceptReminderMinutes" value="${s.accept_reminder_minutes ?? 3}" min="1" max="30" style="width:90px;font-weight:700;text-align:center">
        <span style="font-size:.84rem;color:var(--text-muted)">${TR('דקות (push + וואטסאפ למנהלים)')}</span>
      </div>
      ${saveBtn('saveAcceptance')}
    `)}

    ${sCard(ICONS.bag, 'תוספות', 'תמחור תוספות חלקיות — לקוחות מבקשים חופשי (חצי זיתים, רבע פטריות)', `
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px">${TR('ברירת המחדל: תוספת חלקית עולה כמו תוספת מלאה. אפשר לתמחר חצי/רבע כאחוז ממחיר התוספת.')}</div>
      ${sField('topping_half_pct',    'מחיר חצי תוספת (% ממחיר מלא)', s.topping_half_pct    ?? 100, 'number', '100')}
      ${sField('topping_quarter_pct', 'מחיר רבע תוספת (% ממחיר מלא)', s.topping_quarter_pct ?? 100, 'number', '100')}
      ${saveBtn('saveToppingPricing')}
    `)}

    ${sCard(ICONS.clock, 'הזמנות מתוזמנות', 'כמה דקות לפני השעה המבוקשת להעביר את ההזמנה להכנה', `
      <div style="display:flex;align-items:center;gap:12px">
        <input type="number" id="prepLeadTime" value="${s.prep_lead_time ?? 45}" min="15" max="120"
          style="width:90px;font-weight:700;text-align:center">
        <span style="font-size:.88rem;color:var(--text)">${TR('דקות לפני')}</span>
      </div>
      ${saveBtn('savePrepLeadTime')}
    `)}

    ${sCard(ICONS.edit, 'שינויי הזמנות', 'מה לקוח יכול לשנות אחרי שההזמנה נשלחה', `
      ${sToggle('allow_order_edits', 'אפשר ללקוח לשנות/לבטל הזמנה', s.allow_order_edits !== false, '',
        'זמין כל עוד ההזמנה לא עברה למצב "בהכנה" — מרגע שההכנה מתחילה ההזמנה ננעלת')}
      ${saveBtn('saveEditSettings')}
    `)}

    ${sCard(ICONS.phone, 'שיחה עם נציג', 'מה קורה כשמעבירים שיחה מהבוט לנציג אנושי', `
      <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px">
        ${TR('כשמעבירים שיחה לנציג הבוט מפסיק לענות ללקוח. אם אף אחד לא ממשיך את השיחה, הלקוח נשאר תקוע — לכן היא חוזרת לבוט אוטומטית.')}
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <label style="font-size:.84rem;font-weight:600;min-width:210px">${TR('התראה למנהלים אם לקוח ממתין')}</label>
        <input type="number" id="handoffAlertMinutes" value="${s.handoff_alert_minutes ?? 5}" min="1" max="60" style="width:90px;font-weight:700;text-align:center">
        <span style="font-size:.84rem;color:var(--text-muted)">${TR('דקות')}</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="font-size:.84rem;font-weight:600;min-width:210px">${TR('החזרה אוטומטית לבוט אחרי')}</label>
        <input type="number" id="handoffTimeoutMinutes" value="${s.handoff_timeout_minutes ?? 30}" min="5" max="240" style="width:90px;font-weight:700;text-align:center">
        <span style="font-size:.84rem;color:var(--text-muted)">${TR('דקות ללא מענה נציג')}</span>
      </div>
      ${saveBtn('saveHandoffSettings')}
    `)}

    ${sCard(ICONS.clock, 'שעות פעילות', 'מתי הבוט מקבל הזמנות; מחוץ לשעות אלה לקוחות יקבלו הודעת סגור', `
      <div>${hoursRows}</div>
      ${saveBtn('saveHours')}
    `)}

    ${sCard(ICONS.truck, 'שעות משלוח', 'באילו שעות מוצע משלוח; בימים שאינם פעילים יוצע איסוף בלבד', `
      <div>${deliveryHoursRows}</div>
      ${saveBtn('saveDeliveryHours')}
    `)}

    ${sCard(ICONS.pin, 'אזורי משלוח', 'ערים ואזורים שהעסק משלח אליהם, כולל דמי משלוח ומינימום הזמנה', `
      <div id="zonesTable"></div>
      <div style="margin-top:12px">
        <button onclick="addZoneRow()" class="btn btn-outline btn-sm">${TR('+ הוסף אזור')}</button>
      </div>
      ${saveBtn('saveZones')}
    `)}

    ${sCard(ICONS.truck, 'שליחים', 'שליחת פרטי הזמנה לשליחים בוואטסאפ', `
      ${sToggle('courier_notify_enabled', 'שלח פרטי הזמנה לשליח אוטומטית', !!s.courier_notify_enabled, 'courier_notify_enabled',
        'הודעת וואטסאפ עם פרטי ההזמנה והכתובת תישלח לכל השליחים')}
      <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="font-size:.84rem;font-weight:600;color:var(--text);min-width:120px">${TR('שלח בסטטוס:')}</label>
        <select id="courier_notify_on_status" style="flex:1;min-width:160px;cursor:pointer">
          <option value="preparing"        ${(s.courier_notify_on_status||'out_for_delivery')==='preparing'        ?'selected':''}>${TR('בהכנה')}</option>
          <option value="out_for_delivery" ${(s.courier_notify_on_status||'out_for_delivery')==='out_for_delivery' ?'selected':''}>${TR('יצא למשלוח')}</option>
          <option value="new"              ${(s.courier_notify_on_status||'out_for_delivery')==='new'              ?'selected':''}>${TR('חדשה')}</option>
        </select>
      </div>

      <div style="margin-top:18px">
        <div style="font-size:.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${TR('שליחים')}</div>
        <div id="couriersTable"></div>
        <button onclick="addCourierRow()" class="btn btn-outline btn-sm" style="margin-top:10px">${TR('+ הוסף שליח')}</button>
      </div>
      ${saveBtn('saveCouriers')}
    `)}

    ${sCard(ICONS.phone, 'שיחות שלא נענו', 'לקוח שהתקשר ולא נענה מקבל אוטומטית הזמנה להזמין בוואטסאפ', `
      ${sToggle('missed_call_enabled', 'שלח וואטסאפ אוטומטי למי שהתקשר ולא נענה', s.missed_call_enabled === true)}
      ${sToggle('missed_call_when_closed', 'שלח גם כשהעסק סגור', s.missed_call_when_closed === true)}
      <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="font-size:.84rem;font-weight:600;color:var(--text);min-width:120px">${TR('ערוץ ההודעה:')}</label>
        <select id="missedCallChannel" style="flex:1;min-width:160px;cursor:pointer">
          <option value="whatsapp" ${(s.missed_call_channel||'whatsapp')==='whatsapp'?'selected':''}>${TR('וואטסאפ (תבנית מאושרת)')}</option>
          <option value="sms"      ${s.missed_call_channel==='sms'?'selected':''}>${TR('SMS עם קישור לוואטסאפ')}</option>
        </select>
      </div>
      <div style="margin-top:14px;display:flex;align-items:center;gap:12px">
        <span style="font-size:.88rem;color:var(--text)">${TR('מינימום')}</span>
        <input type="number" id="missedCallThrottle" dir="ltr" value="${s.missed_call_throttle_hours ?? 3}" min="1" max="48"
          style="width:90px;font-weight:700;text-align:center">
        <span style="font-size:.88rem;color:var(--text)">${TR('שעות בין הודעות לאותו מתקשר')}</span>
      </div>
      <div style="margin-top:14px;font-size:.84rem;color:var(--text-muted)">
        ${TR("חיבור מספר הטלפון לשירות נעשה על ידי ג'אסל.")}
      </div>
      ${saveBtn('saveMissedCalls')}
    `)}
  `;

  wireSettingsNavSpy(NAV_LABELS.length);

  renderZonesTable();
  renderCouriersTable();

  // Bit toggle → show/hide phone input
  const bitToggle = document.querySelector('.setting-toggle[data-key="payment_bit"]');
  if (bitToggle) {
    bitToggle.addEventListener('change', () => {
      const row = document.getElementById('bitPhoneRow');
      if (row) row.style.display = bitToggle.checked ? '' : 'none';
    });
  }

  // Sync hours toggles → enable/disable time inputs (business hours + delivery hours)
  function wireHoursToggle(activeClass, inputClass) {
    document.querySelectorAll(`.${activeClass}`).forEach((cb) => {
      const day = cb.dataset.day;
      const syncInputs = () => {
        document.querySelectorAll(`.${inputClass}[data-day="${day}"]`)
          .forEach((inp) => { inp.disabled = !cb.checked; inp.style.opacity = cb.checked ? '1' : '.4'; });
      };
      cb.addEventListener('change', syncInputs);
      syncInputs();
    });
  }
  wireHoursToggle('hours-active',          'hours-input');
  wireHoursToggle('delivery-hours-active', 'delivery-hours-input');
}

// ── Section save functions ──

async function saveBizInfo() {
  await saveSection({
    business_name:    document.getElementById('biz_name').value.trim(),
    business_name_en: document.getElementById('biz_name_en').value.trim(),
    business_address: document.getElementById('biz_address').value.trim(),
    bot_url:          document.getElementById('biz_bot_url').value.trim(),
    pickup_address:   document.getElementById('biz_pickup').value.trim(),
    bot_whatsapp:     document.getElementById('biz_whatsapp').value.trim().replace(/\D/g, ''),
  });
}

async function savePayments() {
  const updates = {};
  document.querySelectorAll('.setting-toggle[data-key^="payment_"]').forEach((el) => {
    updates[el.dataset.key] = el.checked;
  });
  const bitPhone = document.getElementById('bit_phone')?.value?.trim();
  if (bitPhone !== undefined) updates.bit_phone = bitPhone;
  await saveSection(updates);
}

async function saveAcceptance() {
  const mode = document.querySelector('input[name="acceptMode"]:checked')?.value || 'manual';
  const prep = parseInt(document.getElementById('defaultPrepMinutes')?.value) || 30;
  const remind = parseInt(document.getElementById('acceptReminderMinutes')?.value) || 3;
  await saveSection({
    order_acceptance:        mode === 'auto' ? 'auto' : 'manual',
    default_prep_minutes:    Math.max(5, Math.min(120, prep)),
    accept_reminder_minutes: Math.max(1, Math.min(30, remind)),
  });
  _defaultPrep = Math.max(5, Math.min(120, prep));
  renderSettingsForm(_currentSettings = { ..._currentSettings, order_acceptance: mode, default_prep_minutes: prep, accept_reminder_minutes: remind });
}

async function saveVatRate() {
  const v = parseFloat(document.getElementById('vatRate')?.value);
  await saveSection({ vat_rate: Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 18 });
  await loadBusinessConfig();
}

async function saveHandoffSettings() {
  const alertMin   = parseInt(document.getElementById('handoffAlertMinutes')?.value) || 5;
  const timeoutMin = parseInt(document.getElementById('handoffTimeoutMinutes')?.value) || 30;
  await saveSection({
    handoff_alert_minutes:   Math.max(1, Math.min(60, alertMin)),
    handoff_timeout_minutes: Math.max(5, Math.min(240, timeoutMin)),
  });
}

async function savePrepLeadTime() {
  const val = parseInt(document.getElementById('prepLeadTime')?.value) || 45;
  await saveSection({ prep_lead_time: Math.max(15, Math.min(120, val)) });
}

async function saveOrderTypes() {
  const updates = {};
  ['delivery_enabled','pickup_enabled','is_open'].forEach((key) => {
    const el = document.querySelector(`.setting-toggle[data-key="${key}"]`);
    if (el) updates[key] = el.checked;
  });
  await saveSection(updates);
}

async function saveToppingPricing() {
  const half    = parseInt(document.getElementById('topping_half_pct')?.value, 10);
  const quarter = parseInt(document.getElementById('topping_quarter_pct')?.value, 10);
  const clamp = (v) => Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 100;
  await saveSection({ topping_half_pct: clamp(half), topping_quarter_pct: clamp(quarter) });
}

async function saveEditSettings() {
  const allow = document.querySelector('.setting-toggle[data-key="allow_order_edits"]')?.checked ?? true;
  await saveSection({ allow_order_edits: allow });
}

async function saveMissedCalls() {
  const enabled    = !!document.querySelector('.setting-toggle[data-key="missed_call_enabled"]')?.checked;
  const whenClosed = !!document.querySelector('.setting-toggle[data-key="missed_call_when_closed"]')?.checked;
  const hours      = parseInt(document.getElementById('missedCallThrottle')?.value) || 3;
  const channel    = document.getElementById('missedCallChannel')?.value === 'sms' ? 'sms' : 'whatsapp';
  await saveSection({
    missed_call_enabled:        enabled,
    missed_call_when_closed:    whenClosed,
    missed_call_throttle_hours: Math.max(1, Math.min(48, hours)),
    missed_call_channel:        channel,
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

async function saveDeliveryHours() {
  const deliveryHours = {};
  DAY_ORDER.forEach((day) => {
    const active = document.querySelector(`.delivery-hours-active[data-day="${day}"]`)?.checked ?? true;
    const open   = document.querySelector(`.delivery-hours-input[data-day="${day}"][data-field="open"]`)?.value || '10:00';
    const close  = document.querySelector(`.delivery-hours-input[data-day="${day}"][data-field="close"]`)?.value || '23:00';
    deliveryHours[day] = { open, close, is_open: active };
  });
  await saveSection({ delivery_hours: deliveryHours });
}

// ── Delivery Zones ──

function renderZonesTable() {
  const t = document.getElementById('zonesTable');
  if (!t) return;
  if (!_deliveryZones.length) {
    t.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;padding:8px 0">${TR('אין אזורי משלוח — הוסף אזור ראשון')}</div>`;
    return;
  }
  t.innerHTML = `
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-md)">
    <table>
      <thead>
        <tr>
          <th>${TR('עיר')}</th>
          <th>${TR('אזור')}</th>
          <th>${TR('דמי משלוח (₪)')}</th>
          <th>${TR('מינימום (₪)')}</th>
          <th>${TR('זמן משוער (דק׳)')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${_deliveryZones.map((z, i) => `
        <tr>
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
            <button onclick="removeZone(${i})" class="btn-danger" style="font-size:.75rem;padding:4px 10px">${TR('הסר')}</button>
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
  const cities = [...new Set(_deliveryZones.map(z => (z.city || '').trim()).filter(Boolean))];
  await saveSection({ delivery_zones: _deliveryZones, delivery_cities: cities });
}

// ─── Couriers settings ────────────────────────────────────────────────────────

let _couriers = [];

function renderCouriersTable() {
  const t = document.getElementById('couriersTable');
  if (!t) return;
  if (!_couriers.length) {
    t.innerHTML = `<div style="color:var(--text-muted);font-size:.84rem;padding:6px 0">${TR('אין שליחים — הוסף שליח ראשון')}</div>`;
    return;
  }
  t.innerHTML = _couriers.map((c, i) => `
    <div style="display:grid;grid-template-columns:1fr 1fr 36px;gap:10px;align-items:center;margin-bottom:8px">
      <input type="text"
        value="${c.name || ''}"
        placeholder="${TR('שם השליח')}"
        oninput="_couriers[${i}].name=this.value"
        style="font-size:.84rem;min-width:0">
      <input type="tel" dir="ltr"
        value="${c.phone || ''}"
        placeholder="972501234567"
        oninput="_couriers[${i}].phone=this.value.replace(/\\D/g,'')"
        style="font-size:.84rem;letter-spacing:.04em;min-width:0">
      <button onclick="removeCourier(${i})" class="btn-danger" title="${TR('הסר שליח')}"
        style="width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function addCourierRow() {
  _couriers.push({ name: '', phone: '' });
  renderCouriersTable();
}

function removeCourier(i) {
  _couriers.splice(i, 1);
  renderCouriersTable();
}

async function saveCouriers() {
  // Collect current values from DOM inputs before saving
  const nameInputs  = document.querySelectorAll('#couriersTable input[type=text]');
  const phoneInputs = document.querySelectorAll('#couriersTable input[type=tel]');
  _couriers = [...nameInputs].map((inp, i) => ({
    name:  inp.value.trim(),
    phone: (phoneInputs[i]?.value || '').replace(/\D/g, ''),
  })).filter(c => c.phone);

  const notifyStatus = document.getElementById('courier_notify_on_status')?.value || 'out_for_delivery';
  const notifyEnabled = !!document.querySelector('.setting-toggle[data-key="courier_notify_enabled"]')?.checked;

  await saveSection({
    couriers:                 _couriers,
    courier_notify_on_status: notifyStatus,
    courier_notify_enabled:   notifyEnabled,
  });
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
  const newOrders = currentOrders.filter(_awaitingApproval).length;
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
  const newOrders = currentOrders.filter(_awaitingApproval);
  if (!newOrders.length) { showToast(TR('אין הזמנות חדשות')); return; }
  // Jump to the incoming-orders zone — it holds both 'new' and unaccepted
  // pre-orders, which a single status filter can't show together.
  showTab('orders');
  requestAnimationFrame(() =>
    document.getElementById('incomingOrders')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ─── Kitchen Window ───────────────────────────────────────────────────────────

let _kitchenOrders = {};
let _kitchenInited = false;

// Elapsed time since the order entered preparing (falls back to created_at).
// Color escalates so the kitchen sees aging orders from across the room.
function _kitchenElapsed(o) {
  const hist = Array.isArray(o.status_history) ? o.status_history : [];
  const prep = hist.filter(h => h.status === 'preparing').pop();
  const since = prep?.at || o.created_at;
  const min = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  const color = min >= 20 ? '#dc2626' : min >= 10 ? '#d97706' : '#16a34a';
  const bg    = min >= 20 ? '#fef2f2' : min >= 10 ? '#fffbeb' : '#f0fdf4';
  return { min, color, bg };
}

function _kitchenCard(o) {
  const items = (o.items || []).map(it => {
    const qty  = it.quantity || it.qty || 1;
    const tops = (it.toppings || []).map(topLabel).filter(Boolean).join(', ');
    return `<div style="font-size:1.5rem;font-weight:700;padding:10px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:baseline;gap:12px">
      <span style="font-size:1.7rem;font-weight:800;color:#111;min-width:44px">×${qty}</span>
      <span>${it.name || it.name_he}${tops ? `<div style="font-size:1.05rem;font-weight:500;color:#666;margin-top:2px">+ ${tops}</div>` : ''}</span>
    </div>`;
  }).join('');

  const notes = o.notes
    ? `<div style="margin-top:12px;padding:12px 16px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;font-size:1.15rem;font-weight:600;color:#92400e">${o.notes}</div>` : '';

  const t = _kitchenElapsed(o);
  const statusColor = o.status === 'ready' ? '#22c55e' : t.color;

  const btn = o.status === 'preparing'
    ? `<button onclick="kitchenSetStatus('${o.id}','ready')" style="width:100%;padding:20px;border:none;border-radius:12px;background:#16a34a;color:#fff;font-size:1.4rem;font-weight:800;cursor:pointer;font-family:inherit">${TR('מוכן')}</button>`
    : '';

  const methodPill = o.delivery_method === 'pickup'
    ? `<span style="font-size:.95rem;font-weight:700;color:#374151;background:#f3f4f6;border-radius:8px;padding:4px 12px;white-space:nowrap">${SVG.home} ${TR('איסוף')}</span>`
    : `<span style="font-size:.95rem;font-weight:700;color:#005faa;background:#eff6ff;border-radius:8px;padding:4px 12px;white-space:nowrap">${SVG.truck} ${TR('משלוח')}</span>`;

  return `<div id="kitchen-card-${o.id}" style="background:#fff;border-radius:14px;border-right:6px solid ${statusColor};box-shadow:0 2px 10px rgba(0,0,0,.09);padding:20px 24px;margin-bottom:18px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;border-bottom:2px solid #f3f3f3;padding-bottom:14px">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="font-size:2.2rem;font-weight:900;color:#111;line-height:1">#${o.order_number}</span>
        ${o.customer_name ? `<span style="font-size:1.15rem;color:#666;font-weight:600">${o.customer_name}</span>` : ''}
        ${methodPill}
      </div>
      <span style="font-size:1.15rem;font-weight:800;color:${t.color};background:${t.bg};border-radius:8px;padding:6px 14px;white-space:nowrap">${t.min > 99 ? '+99' : t.min} ${TR("דק'")}</span>
    </div>
    <div style="margin-bottom:${btn ? '18px' : '0'}">${items}</div>
    ${notes}
    ${btn ? `<div>${btn}</div>` : ''}
  </div>`;
}

function renderKitchen() {
  const list = Object.values(_kitchenOrders).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const el = document.getElementById('kitchen-feed');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px 16px;color:var(--text-muted);font-size:1rem">${TR('אין הזמנות פעילות')}</div>`;
    return;
  }
  el.innerHTML = list.map(_kitchenCard).join('');
  document.getElementById('kitchen-count').textContent = list.length + ' ' + TR('הזמנות');
}

async function kitchenSetStatus(id, status) {
  const btn = document.querySelector(`#kitchen-card-${id} button`);
  if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  try {
    const data = await api('PATCH', `/orders/${id}/status`, { status });
    if (data?.order) { _kitchenOrders[id] = data.order; renderKitchen(); }
  } catch (e) {
    showToast(e.message || TR('שגיאה'));
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

async function loadKitchenOrders() {
  try {
    const data = await api('GET', '/kitchen/orders');
    if (!Array.isArray(data)) return;
    _kitchenOrders = {};
    // The dashboard feed shows kitchen work only — approval happens in the orders tab
    for (const o of data) if (['preparing','ready'].includes(o.status)) _kitchenOrders[o.id] = o;
    renderKitchen();
  } catch (e) {
    console.error('[kitchen] loadKitchenOrders:', e.message);
  }
}

function _kitchenConnectSSE() {
  sseOn('new_order', (e) => {
    const o = JSON.parse(e.data);
    if (['preparing','ready'].includes(o.status)) { _kitchenOrders[o.id] = o; renderKitchen(); showToast(`${TR('הזמנה')} #${o.order_number} ${TR('עברה להכנה')}`); }
  });
  sseOn('order_updated', (e) => {
    const o = JSON.parse(e.data);
    if (['preparing','ready'].includes(o.status)) _kitchenOrders[o.id] = o;
    else delete _kitchenOrders[o.id];
    renderKitchen();
  });
  sseOnStatus((up) => {
    const dot = document.getElementById('kitchen-dot');
    const lbl = document.getElementById('kitchen-conn');
    if (dot) dot.style.background = up ? '#22c55e' : '#ef4444';
    if (lbl) lbl.textContent = up ? TR('מחובר') : TR('מתחבר מחדש…');
  });
  sseOnReconnect(() => loadKitchenOrders());
}

function initKitchen() {
  loadKitchenOrders();
  if (_kitchenInited) return;
  _kitchenInited = true;
  _kitchenConnectSSE();
  setInterval(renderKitchen, 60 * 1000); // refresh elapsed-time badges
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

let _inboxSessions = [];
let _inboxPhone = null;
let _inboxWired = false;

async function loadInbox() {
  try {
    _inboxSessions = await api('GET', '/inbox');
    renderInboxList();
    _updateInboxBadge();
    if (!_inboxWired) { _inboxWired = true; _inboxConnectSSE(); }
  } catch (err) {
    console.error('[inbox] load error:', err);
  }
}

function _updateInboxBadge() {
  const total = _inboxSessions.reduce((s, c) => s + (c.unread_count || 0), 0);
  const label = document.getElementById('inbox-nav-label');
  if (label) label.textContent = total > 0 ? `${TR('הודעות')} (${total})` : TR('הודעות');
}

function _fmtPhone(phone) {
  if (!phone) return '';
  if (phone.startsWith('972')) return '0' + phone.slice(3);
  return phone;
}

function renderInboxList() {
  const el = document.getElementById('inbox-list');
  if (!el) return;
  if (!_inboxSessions.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--color-text-secondary);font-size:13px">${T('inbox_empty','אין שיחות ממתינות')}</div>`;
    return;
  }
  el.innerHTML = _inboxSessions.map(s => {
    const profile = s.customer_profile || {};
    const name = profile.name || _fmtPhone(s.phone);
    const active = s.phone === _inboxPhone;
    const unread = s.unread_count > 0;
    const initial = (profile.name || '#').trim().charAt(0);
    const ts = s.last_message_at || s.updated_at;
    const timeStr = ts ? new Date(ts).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem', hour12: false }) : '';
    const agentDot = s.is_bot_active ? '' : `<span title="${TR('בטיפול נציג')}" style="width:8px;height:8px;border-radius:50%;background:var(--color-warning);display:inline-block;flex-shrink:0"></span>`;
    return `<div onclick="inboxSelectSession('${s.phone}')" style="display:flex;gap:10px;align-items:center;padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--color-border);background:${active ? 'var(--color-brand-soft)' : 'transparent'};transition:background .15s">
      <span style="width:38px;height:38px;border-radius:50%;background:${s.is_bot_active ? 'var(--color-brand-soft)' : '#fff4e0'};color:${s.is_bot_active ? 'var(--color-brand)' : 'var(--color-warning)'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0">${initial}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px">
          <span style="display:flex;align-items:center;gap:6px;font-weight:${unread ? '700' : '600'};font-size:14px;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${agentDot}${name}</span>
          <span style="font-size:11px;color:var(--color-text-secondary);flex-shrink:0">${timeStr}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span style="font-size:12px;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.last_customer_message || ''}</span>
          ${unread ? `<span style="background:var(--color-brand);color:#fff;border-radius:10px;font-size:11px;padding:1px 7px;font-weight:700;flex-shrink:0">${s.unread_count}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function inboxBackToList() {
  const split = document.getElementById('inbox-split');
  if (split) split.classList.remove('thread-open');
  _inboxPhone = null;
  renderInboxList();
}

async function inboxSelectSession(phone) {
  _inboxPhone = phone;
  const split = document.getElementById('inbox-split');
  if (split) split.classList.add('thread-open');
  renderInboxList();
  // Mark read
  await api('POST', `/inbox/${phone}/read`).catch(() => {});
  const s = _inboxSessions.find(x => x.phone === phone);
  if (s) { s.unread_count = 0; _updateInboxBadge(); renderInboxList(); }
  renderInboxThread(phone);
}

function renderInboxThread(phone) {
  const s = _inboxSessions.find(x => x.phone === phone);
  if (!s) return;

  const headerPhone = document.getElementById('inbox-thread-phone');
  const headerActions = document.getElementById('inbox-thread-actions');
  const thread = document.getElementById('inbox-thread');
  const replyBar = document.getElementById('inbox-reply-bar');

  const profile = s.customer_profile || {};
  if (headerPhone) headerPhone.textContent = profile.name ? `${profile.name} (${_fmtPhone(phone)})` : _fmtPhone(phone);

  if (headerActions) {
    headerActions.style.display = 'flex';
    if (s.is_bot_active) {
      headerActions.innerHTML = `<button onclick="inboxHandoff('${phone}')" class="btn btn-sm" style="font-size:13px">${T('inbox_handoff','העבר לנציג')}</button>`;
    } else {
      headerActions.innerHTML = `<button onclick="inboxReturn('${phone}')" class="btn btn-primary btn-sm" style="font-size:13px">${T('inbox_return','החזר לבוט')}</button>`;
    }
  }

  const history = Array.isArray(s.conversation_history) ? s.conversation_history : [];
  if (thread) {
    const profile = s.customer_profile || {};
    const custName = profile.name || _fmtPhone(phone);
    thread.innerHTML = history.map(m => {
      const isAgent = typeof m.content === 'string' && m.content.startsWith('[נציג]:');
      const isUser = m.role === 'user';
      const text = isAgent ? m.content.replace('[נציג]: ', '') : m.content;
      // Customer bubbles: white, incoming side. Bot: soft brand. Agent: brand solid.
      const bg    = isUser ? 'var(--color-surface)' : (isAgent ? 'var(--color-brand)' : 'var(--color-brand-soft)');
      const fg    = isAgent ? '#fff' : 'var(--color-text)';
      const align = isUser ? 'flex-start' : 'flex-end';
      const label = isAgent ? TR('נציג') : (isUser ? custName : TR('בוט'));
      const labelColor = isAgent ? 'rgba(255,255,255,.75)' : 'var(--color-text-secondary)';
      return `<div style="display:flex;justify-content:${align}">
        <div style="max-width:75%;background:${bg};border:1px solid ${isUser ? 'var(--color-border)' : 'transparent'};border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.55;box-shadow:var(--shadow-sm)">
          <div style="font-size:10px;color:${labelColor};margin-bottom:3px;font-weight:600">${label}</div>
          <div style="white-space:pre-wrap;color:${fg}">${text}</div>
        </div>
      </div>`;
    }).join('');
    thread.scrollTop = thread.scrollHeight;
  }

  if (replyBar) {
    replyBar.style.display = s.is_bot_active ? 'none' : 'flex';
  }
}

async function inboxHandoff(phone) {
  try {
    await api('POST', `/inbox/${phone}/handoff`);
    const s = _inboxSessions.find(x => x.phone === phone);
    if (s) { s.is_bot_active = false; }
    renderInboxList();
    renderInboxThread(phone);
    showToast(TR('השיחה הועברה לנציג'));
  } catch (err) { alert(err.message); }
}

async function inboxReturn(phone) {
  try {
    await api('POST', `/inbox/${phone}/return`);
    const s = _inboxSessions.find(x => x.phone === phone);
    if (s) { s.is_bot_active = true; }
    // Remove from list if no more unread
    _inboxSessions = _inboxSessions.filter(x => x.phone !== phone || x.unread_count > 0);
    if (_inboxPhone === phone && !_inboxSessions.find(x => x.phone === phone)) {
      _inboxPhone = null;
      const split = document.getElementById('inbox-split');
      if (split) split.classList.remove('thread-open');
    }
    renderInboxList();
    if (_inboxPhone === phone) renderInboxThread(phone);
    else {
      const thread = document.getElementById('inbox-thread');
      const hdr = document.getElementById('inbox-thread-phone');
      const actions = document.getElementById('inbox-thread-actions');
      const replyBar = document.getElementById('inbox-reply-bar');
      if (thread) thread.innerHTML = '';
      if (hdr) hdr.textContent = T('inbox_pick','בחר שיחה');
      if (actions) actions.style.display = 'none';
      if (replyBar) replyBar.style.display = 'none';
    }
    _updateInboxBadge();
    showToast(TR('הבוט חזר לניהול השיחה'));
  } catch (err) { alert(err.message); }
}

async function inboxSendReply() {
  const input = document.getElementById('inbox-reply-input');
  const msg = input ? input.value.trim() : '';
  if (!msg || !_inboxPhone) return;
  try {
    await api('POST', `/inbox/${_inboxPhone}/reply`, { message: msg });
    if (input) input.value = '';
    // Optimistically append to thread
    const s = _inboxSessions.find(x => x.phone === _inboxPhone);
    if (s) {
      if (!Array.isArray(s.conversation_history)) s.conversation_history = [];
      s.conversation_history.push({ role: 'assistant', content: `[נציג]: ${msg}` });
      renderInboxThread(_inboxPhone);
    }
  } catch (err) { alert(err.message); }
}

function _inboxConnectSSE() {
  sseOnReconnect(() => loadInbox());
  sseOn('inbox_message', (e) => {
    // is_bot_active comes from the payload — bot-handled messages broadcast
    // too now, and assuming agent-mode here painted them with the amber dot.
    const { phone, message, unread_count, is_bot_active } = JSON.parse(e.data);
    let s = _inboxSessions.find(x => x.phone === phone);
    if (!s) {
      s = { phone, is_bot_active: is_bot_active !== false, unread_count, last_customer_message: message, conversation_history: [] };
      _inboxSessions.unshift(s);
    } else {
      s.is_bot_active = is_bot_active !== false;
      s.unread_count = unread_count;
      s.last_customer_message = message;
      if (!Array.isArray(s.conversation_history)) s.conversation_history = [];
      s.conversation_history.push({ role: 'user', content: message });
    }
    s.last_message_at = new Date().toISOString();
    _updateInboxBadge();
    renderInboxList();
    if (_inboxPhone === phone) renderInboxThread(phone);
  });
  sseOn('inbox_update', (e) => {
    const { phone, is_bot_active } = JSON.parse(e.data);
    const s = _inboxSessions.find(x => x.phone === phone);
    if (s) s.is_bot_active = is_bot_active;
    renderInboxList();
    if (_inboxPhone === phone) renderInboxThread(phone);
  });
}

// Reply on Enter (Shift+Enter = newline)
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('inbox-reply-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inboxSendReply(); }
    });
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

initTheme();
// Deep link (?tab=orders — used by push-notification clicks), default: orders
const _urlTab = new URLSearchParams(location.search).get('tab');
showTab(TABS.includes(_urlTab) ? _urlTab : 'orders');

// Money formatting depends on the tenant's VAT rate and delivery zones
loadBusinessConfig().then(() => { if (currentOrders.length) filterOrders(); });

// Live updates via SSE; 30s polling stays as fallback
_ordersConnectSSE();
renderPushNudge();
setInterval(() => {
  if (document.getElementById('page-orders').style.display !== 'none') loadOrders();
}, 30_000);
// Refresh incoming-card aging timers every 30s even without data changes
setInterval(() => { if (currentOrders.some(_awaitingApproval)) renderIncomingOrders(); }, 30_000);
// Inbox polling fallback — SSE is supervised now, but the feed gets the same
// safety net orders always had (only when the tab was ever opened + visible)
setInterval(() => {
  if (_inboxWired && document.getElementById('page-inbox')?.style.display !== 'none') loadInbox();
}, 30_000);

// Default prep-time for the accept quick-picks (settings are admin-only; managers get the default)
if (role === 'admin') {
  api('GET', '/settings').then(s => {
    const n = parseInt(s?.default_prep_minutes, 10);
    if (Number.isFinite(n) && n > 0) _defaultPrep = n;
  }).catch(() => {});
}

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
      btn.title = TR('התראות push פעילות — לחץ לכיבוי');
      btn.style.color = '#4ade80';
      if (slash) slash.style.display = 'none';
    } else {
      btn.title = TR('הפעל התראות push');
      btn.style.color = '';
      if (slash) slash.style.display = '';
    }
  });
}

async function togglePushSubscription() {
  if (!('serviceWorker' in navigator)) {
    alert(TR('הדפדפן שלך לא תומך בהתראות push'));
    return;
  }

  const reg = await navigator.serviceWorker.ready;

  if (_pushSubscription) {
    // Unsubscribe
    await _pushSubscription.unsubscribe();
    await api('POST', '/push-unsubscribe', { endpoint: _pushSubscription.endpoint }).catch(() => {});
    _pushSubscription = null;
    updatePushBtn(null);
    showToast(TR('התראות push כובו'));
    return;
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast(TR('נדרשת הרשאה להתראות בדפדפן'));
    return;
  }

  // Get VAPID key
  let vapidPublicKey;
  try {
    const { publicKey } = await api('GET', '/push-vapid-key');
    vapidPublicKey = publicKey;
  } catch { showToast(TR('שגיאה בהגדרת push')); return; }

  // Subscribe
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  await api('POST', '/push-subscribe', sub.toJSON());
  _pushSubscription = sub;
  updatePushBtn(sub);
  showToast(TR('התראות push הופעלו!'));
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

initPush();

// ─── Admin Users ──────────────────────────────────────────────────────────────

let _adminUsers = [];

async function loadAdminUsers() {
  const el = document.getElementById('adminUsersTable');
  if (!el) return;
  try {
    _adminUsers = await api('GET', '/admin-users');
    renderAdminUsers();
  } catch (err) {
    el.innerHTML = `<div style="color:var(--color-danger);font-size:.84rem;padding:16px 24px">${err.message}</div>`;
  }
}

function renderAdminUsers() {
  const el = document.getElementById('adminUsersTable');
  if (!el) return;

  if (!_adminUsers.length) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:.84rem;padding:20px 24px;text-align:center">
      ${TR('אין מנהלים עדיין — לחץ "+ הוסף מנהל" כדי להתחיל')}
    </div>`;
    return;
  }

  const roleLabel = { admin: TR('מנהל'), manager: TR('מנג׳ר') };

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>${TR('שם')}</th>
        <th>${TR('טלפון')}</th>
        <th>${TR('תפקיד')}</th>
        <th>${TR('נוסף')}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${_adminUsers.map(u => `
          <tr>
            <td style="font-weight:700">${u.name}</td>
            <td style="font-family:monospace;direction:ltr;font-size:.84rem;color:var(--text-muted)">${u.phone}</td>
            <td>
              <span class="badge ${u.role === 'admin' ? 'badge-new' : 'badge-done'}">
                ${roleLabel[u.role] || u.role}
              </span>
            </td>
            <td style="font-size:.78rem;color:var(--text-muted)">${formatDate(u.created_at)}</td>
            <td>
              <button onclick="deleteAdminUser('${u.id}','${u.name}')"
                class="btn-danger" style="font-size:.76rem;padding:4px 10px">${TR('מחק')}</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function openAddAdminModal() {
  document.getElementById('adminName').value  = '';
  document.getElementById('adminPhone').value = '';
  document.getElementById('adminRole').value  = 'admin';
  openModal('addAdminModal');
  setTimeout(() => document.getElementById('adminName').focus(), 100);
}

async function submitAddAdmin(e) {
  e.preventDefault();
  const name  = document.getElementById('adminName').value.trim();
  const phone = document.getElementById('adminPhone').value.trim();
  const role  = document.getElementById('adminRole').value;
  const btn   = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = TR('שומר...');

  try {
    const user = await api('POST', '/admin-users', { name, phone, role });
    _adminUsers.push(user);
    renderAdminUsers();
    closeModal('addAdminModal');
    showToast(`${name} ${TR('נוסף כמנהל')}`);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = TR('הוסף');
  }
}

async function deleteAdminUser(id, name) {
  if (!confirm(`${TR('למחוק את')} "${name}"?`)) return;
  try {
    await api('DELETE', `/admin-users/${id}`);
    _adminUsers = _adminUsers.filter(u => u.id !== id);
    renderAdminUsers();
    showToast(`${name} ${TR('הוסר')}`);
  } catch (err) {
    alert(err.message);
  }
}
