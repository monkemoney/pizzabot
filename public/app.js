'use strict';

// ─── Auth ─────────────────────────────────────────────────────────────────────

const token    = localStorage.getItem('token');
const role     = localStorage.getItem('role');
const username = localStorage.getItem('username');

if (!token) { window.location.href = '/'; }

document.getElementById('userBadge').textContent = `${username} (${role === 'admin' ? 'מנהל' : 'מנג׳ר'})`;

// Show admin-only elements
if (role === 'admin') {
  document.querySelectorAll('.admin-only').forEach((el) => el.classList.remove('hidden'));
}

function logout() {
  localStorage.clear();
  window.location.href = '/';
}

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

const TABS = ['orders', 'products', 'customers', 'settings'];

function showTab(name) {
  TABS.forEach((t) => {
    document.getElementById('page-' + t).classList.add('hidden');
    document.getElementById('tab-'  + t)?.classList.remove('tab-active');
  });
  document.getElementById('page-' + name).classList.remove('hidden');
  document.getElementById('tab-'  + name)?.classList.add('tab-active');

  if (name === 'orders')    loadOrders();
  if (name === 'products')  loadProducts();
  if (name === 'customers') loadCustomers();
  if (name === 'settings')  loadSettings();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

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
const STATUS_NEXT = {
  new:              ['preparing', 'cancelled'],
  preparing:        ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered:        ['done'],
  done:             [],
  cancelled:        [],
};

function statusBadge(status) {
  return `<span class="status-badge status-${status}">${STATUS_LABELS[status] || status}</span>`;
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────

let currentOrders = [];

async function loadOrders() {
  if (role === 'admin') loadStats();

  const filter = document.getElementById('orderStatusFilter').value;
  const container = document.getElementById('ordersTable');
  container.innerHTML = '<div class="p-8 text-center text-gray-400">טוען...</div>';

  try {
    const data = await api('GET', `/orders?status=${filter}`);
    currentOrders = data.orders;
    renderOrdersTable(currentOrders);
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-center text-red-500">${err.message}</div>`;
  }
}

function renderOrdersTable(orders) {
  const container = document.getElementById('ordersTable');
  if (!orders.length) {
    container.innerHTML = '<div class="p-12 text-center text-gray-400 text-lg">אין הזמנות</div>';
    return;
  }

  container.innerHTML = `
    <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-gray-50 border-b border-gray-100">
        <tr class="text-gray-500 text-xs font-medium">
          <th class="px-4 py-3 text-right">#</th>
          <th class="px-4 py-3 text-right">תאריך</th>
          <th class="px-4 py-3 text-right">לקוח</th>
          <th class="px-4 py-3 text-right">סוג</th>
          <th class="px-4 py-3 text-right">תשלום</th>
          <th class="px-4 py-3 text-right">סכום</th>
          <th class="px-4 py-3 text-right">סטטוס</th>
          <th class="px-4 py-3 text-right">פעולות</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50">
        ${orders.map((o) => `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-3 font-semibold text-orange-600">${o.order_number || '—'}</td>
          <td class="px-4 py-3 text-gray-500 text-xs">${formatDate(o.created_at)}</td>
          <td class="px-4 py-3">
            <div class="font-medium text-gray-900">${o.customer_name || '—'}</div>
            <div class="text-xs text-gray-400">${o.address ? o.address.slice(0, 30) : ''}</div>
          </td>
          <td class="px-4 py-3">
            <span class="text-xs px-2 py-1 rounded-full ${o.delivery_method === 'delivery' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}">
              ${o.delivery_method === 'delivery' ? '🛵 משלוח' : '🏍️ איסוף'}
            </span>
          </td>
          <td class="px-4 py-3 text-xs text-gray-500">${o.payment_method === 'cash' ? '💵 מזומן' : '💳 אשראי'}</td>
          <td class="px-4 py-3 font-semibold">₪${(parseFloat(o.total_price) || 0).toFixed(2)}</td>
          <td class="px-4 py-3">
            <select onchange="updateOrderStatus('${o.id}', this.value, ${o.order_number})"
              class="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white cursor-pointer">
              ${Object.entries(STATUS_LABELS).map(([val, label]) =>
                `<option value="${val}" ${val === o.status ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </td>
          <td class="px-4 py-3">
            <button onclick="showOrderDetail('${o.id}')"
              class="text-orange-500 hover:text-orange-700 text-xs font-medium hover:underline">
              פרטים
            </button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

async function updateOrderStatus(orderId, status, orderNumber) {
  try {
    await api('PATCH', `/orders/${orderId}/status`, { status });
    loadOrders();
  } catch (err) {
    alert('שגיאה בעדכון סטטוס: ' + err.message);
    loadOrders(); // refresh to restore correct value
  }
}

async function showOrderDetail(orderId) {
  const order = currentOrders.find((o) => o.id === orderId);
  if (!order) return;

  document.getElementById('orderModalTitle').textContent = `הזמנה #${order.order_number}`;
  document.getElementById('orderModalContent').innerHTML = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div><span class="text-gray-500">לקוח:</span> <strong>${order.customer_name || '—'}</strong></div>
        <div><span class="text-gray-500">טלפון:</span> <strong>${order.customer_phone || order.phone || '—'}</strong></div>
        <div><span class="text-gray-500">אספקה:</span> <strong>${order.delivery_method === 'delivery' ? '🛵 משלוח' : '🏍️ איסוף'}</strong></div>
        <div><span class="text-gray-500">תשלום:</span> <strong>${order.payment_method === 'cash' ? '💵 מזומן' : '💳 אשראי'}</strong></div>
        ${order.address ? `<div class="col-span-2"><span class="text-gray-500">כתובת:</span> <strong>${order.address}</strong></div>` : ''}
        ${order.notes  ? `<div class="col-span-2"><span class="text-gray-500">הערות:</span> <strong>${order.notes}</strong></div>` : ''}
      </div>

      <div class="border-t pt-4">
        <p class="text-sm font-semibold text-gray-700 mb-2">פריטים:</p>
        <ul class="space-y-1">
          ${(order.items || []).map((item) => `
            <li class="text-sm flex justify-between">
              <span>${item.name || item.name_he || 'פריט'}
                ${(item.toppings || []).length ? `<span class="text-gray-400 text-xs"> + ${item.toppings.map(t => t.name || t.name_he).join(', ')}</span>` : ''}
              </span>
              <span class="font-medium">₪${item.price || 0}</span>
            </li>`).join('')}
        </ul>
      </div>

      <div class="border-t pt-3 flex justify-between font-bold text-base">
        <span>סה"כ</span>
        <span>₪${(parseFloat(order.total_price) || 0).toFixed(2)}</span>
      </div>

      <div class="flex justify-between items-center border-t pt-3">
        <span class="text-sm text-gray-500">סטטוס: ${statusBadge(order.status)}</span>
        <span class="text-xs text-gray-400">${formatDate(order.created_at)}</span>
      </div>
    </div>`;
  document.getElementById('orderModal').classList.remove('hidden');
}

// ─── STATS ────────────────────────────────────────────────────────────────────

async function loadStats() {
  const dateInput = document.getElementById('statsDate');
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

  try {
    const s = await api('GET', `/stats?date=${dateInput.value}`);
    document.getElementById('statsCards').innerHTML = `
      <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div class="text-2xl font-bold text-orange-500">${s.order_count}</div>
        <div class="text-xs text-gray-500 mt-1">הזמנות היום</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div class="text-2xl font-bold text-green-600">₪${s.revenue.toFixed(0)}</div>
        <div class="text-xs text-gray-500 mt-1">הכנסות</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm col-span-2 md:col-span-1">
        <div class="text-xs font-semibold text-gray-700 mb-2">🏆 נמכרים ביותר</div>
        ${s.top_products.map((p, i) => `
          <div class="text-xs flex justify-between py-0.5">
            <span>${i + 1}. ${p.name}</span><span class="font-medium">${p.count}x</span>
          </div>`).join('') || '<div class="text-xs text-gray-400">אין נתונים</div>'}
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div class="text-2xl font-bold text-blue-600">${s.conversations_started}</div>
        <div class="text-xs text-gray-500 mt-1">שיחות התחילו</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div class="text-2xl font-bold text-gray-400">${s.not_converted}</div>
        <div class="text-xs text-gray-500 mt-1">לא הזמינו</div>
      </div>`;
  } catch { /* stats are non-critical */ }
}

document.getElementById('statsDate')?.addEventListener('change', loadStats);

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

let allProducts = [];

async function loadProducts() {
  const container = document.getElementById('productsTable');
  container.innerHTML = '<div class="p-8 text-center text-gray-400">טוען...</div>';
  try {
    allProducts = await api('GET', '/products');
    renderProductsTable(allProducts);
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-center text-red-500">${err.message}</div>`;
  }
}

function renderProductsTable(products) {
  const container = document.getElementById('productsTable');
  const main     = products.filter((p) => p.category === 'main');
  const toppings = products.filter((p) => p.category === 'topping');

  const renderSection = (title, items) => `
    <div class="px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">${title}</div>
    ${items.map((p) => `
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-50 hover:bg-gray-50">
        <div class="flex items-center gap-3">
          <button onclick="toggleProduct('${p.id}', ${!p.is_available})"
            class="w-10 h-6 rounded-full transition-colors ${p.is_available ? 'bg-green-500' : 'bg-gray-300'} relative flex-shrink-0">
            <span class="block w-4 h-4 rounded-full bg-white shadow absolute top-1 transition-all ${p.is_available ? 'right-1' : 'left-1'}"></span>
          </button>
          <div>
            <div class="font-medium text-gray-900">${p.name_he}</div>
            <div class="text-xs text-gray-400" dir="ltr">${p.name_en}</div>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <span class="font-semibold text-gray-900">₪${parseFloat(p.price).toFixed(2)}</span>
          <button onclick="openProductModal(${JSON.stringify(p).replace(/"/g, '&quot;')})"
            class="text-xs text-orange-500 hover:text-orange-700 font-medium">עריכה</button>
          <button onclick="deleteProduct('${p.id}', '${p.name_he}')"
            class="text-xs text-red-400 hover:text-red-600 font-medium">מחיקה</button>
        </div>
      </div>`).join('')}`;

  container.innerHTML = renderSection('מנות עיקריות', main) + renderSection('תוספות', toppings);
}

async function toggleProduct(id, available) {
  try {
    await api('PATCH', `/products/${id}`, { is_available: available });
    loadProducts();
  } catch (err) { alert(err.message); }
}

function openProductModal(product) {
  document.getElementById('productModalTitle').textContent = product?.id ? 'עריכת מוצר' : 'מוצר חדש';
  document.getElementById('productId').value        = product?.id        || '';
  document.getElementById('productNameHe').value    = product?.name_he   || '';
  document.getElementById('productNameEn').value    = product?.name_en   || '';
  document.getElementById('productPrice').value     = product?.price      || '';
  document.getElementById('productCategory').value  = product?.category   || 'main';
  document.getElementById('productModal').classList.remove('hidden');
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const body = {
    name_he:  document.getElementById('productNameHe').value.trim(),
    name_en:  document.getElementById('productNameEn').value.trim(),
    price:    parseFloat(document.getElementById('productPrice').value),
    category: document.getElementById('productCategory').value,
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
    loadProducts();
  } catch (err) { alert(err.message); }
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

let allCustomers = [];
let selectedPhones = new Set();

async function loadCustomers() {
  const container = document.getElementById('customersTable');
  container.innerHTML = '<div class="p-8 text-center text-gray-400">טוען...</div>';
  selectedPhones.clear();
  const returning = document.getElementById('returningOnly').checked ? '1' : '0';
  try {
    allCustomers = await api('GET', `/customers?returning=${returning}`);
    renderCustomersTable(allCustomers);
  } catch (err) {
    container.innerHTML = `<div class="p-8 text-center text-red-500">${err.message}</div>`;
  }
}

function renderCustomersTable(customers) {
  const container = document.getElementById('customersTable');
  if (!customers.length) {
    container.innerHTML = '<div class="p-12 text-center text-gray-400">אין לקוחות</div>';
    return;
  }
  container.innerHTML = `
    <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-gray-50 border-b border-gray-100">
        <tr class="text-gray-500 text-xs font-medium">
          <th class="px-4 py-3"><input type="checkbox" id="selectAll" onchange="toggleSelectAll(this)"></th>
          <th class="px-4 py-3 text-right">שם</th>
          <th class="px-4 py-3 text-right">כתובת אחרונה</th>
          <th class="px-4 py-3 text-right">הזמנות</th>
          <th class="px-4 py-3 text-right">סה"כ רכישות</th>
          <th class="px-4 py-3 text-right">הזמנה אחרונה</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50">
        ${customers.map((c) => `
        <tr class="hover:bg-gray-50">
          <td class="px-4 py-3">
            <input type="checkbox" value="${c.phone}" onchange="toggleCustomer('${c.phone}', this.checked)" class="customer-checkbox">
          </td>
          <td class="px-4 py-3">
            <div class="font-medium text-gray-900">${c.name || '—'}</div>
          </td>
          <td class="px-4 py-3 text-gray-500 text-xs">${c.last_address || '—'}</td>
          <td class="px-4 py-3 text-center font-semibold text-orange-500">${c.order_count}</td>
          <td class="px-4 py-3 font-semibold">₪${parseFloat(c.total_spent || 0).toFixed(0)}</td>
          <td class="px-4 py-3 text-xs text-gray-400">${formatDate(c.last_order_at)}</td>
        </tr>`).join('')}
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
  if (selectedPhones.size === 0) {
    alert('יש לבחור לקוחות לפני השליחה');
    return;
  }
  document.getElementById('broadcastRecipients').textContent = `נמענים נבחרו: ${selectedPhones.size}`;
  document.getElementById('broadcastMessage').value = '';
  document.getElementById('broadcastModal').classList.remove('hidden');
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

async function loadSettings() {
  const container = document.getElementById('settingsForm');
  container.innerHTML = '<div class="text-gray-400">טוען...</div>';
  try {
    const s = await api('GET', '/settings');
    renderSettingsForm(s);
  } catch (err) {
    container.innerHTML = `<div class="text-red-500">${err.message}</div>`;
  }
}

function renderSettingsForm(s) {
  const card = (title, content) => `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 class="font-semibold text-gray-900 mb-4">${title}</h3>
      ${content}
    </div>`;

  const toggle = (key, label, checked) => `
    <label class="flex items-center justify-between cursor-pointer py-1">
      <span class="text-sm text-gray-700">${label}</span>
      <input type="checkbox" class="setting-toggle w-4 h-4 accent-orange-500" data-key="${key}" ${checked ? 'checked' : ''}>
    </label>`;

  document.getElementById('settingsForm').innerHTML = `
    ${card('🍕 הזמנות', `
      ${toggle('is_open',          'פתוח לקבלת הזמנות', s.is_open !== false)}
      ${toggle('delivery_enabled', 'משלוח מאופשר',       s.delivery_enabled !== false)}
      ${toggle('pickup_enabled',   'איסוף עצמי מאופשר',  s.pickup_enabled   !== false)}
    `)}
    ${card('💳 תשלום', `
      ${toggle('payment_cash',   'קבלת מזומן',  s.payment_cash   !== false)}
      ${toggle('payment_credit', 'קבלת אשראי',  s.payment_credit !== false)}
    `)}
    ${card('🛵 משלוח', `
      <div class="mb-3">
        <label class="text-sm text-gray-700 block mb-1">מחיר משלוח (₪)</label>
        <input type="number" id="deliveryPrice" value="${s.delivery_price ?? 30}" min="0" step="1"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32">
      </div>
      <div>
        <label class="text-sm text-gray-700 block mb-1">ערים למשלוח (מופרדות בפסיקים)</label>
        <input type="text" id="deliveryCities" value="${(s.delivery_cities || []).join(', ')}"
          class="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full">
      </div>
    `)}
    <div class="flex justify-end">
      <button onclick="saveSettings()" class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium">
        שמור הגדרות
      </button>
    </div>`;
}

async function saveSettings() {
  const updates = {};
  document.querySelectorAll('.setting-toggle').forEach((el) => {
    updates[el.dataset.key] = el.checked;
  });
  updates.delivery_price  = parseFloat(document.getElementById('deliveryPrice').value) || 30;
  updates.delivery_cities = document.getElementById('deliveryCities').value
    .split(',').map((c) => c.trim()).filter(Boolean);

  try {
    await api('PATCH', '/settings', updates);
    alert('הגדרות נשמרו בהצלחה ✅');
  } catch (err) { alert(err.message); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

showTab('orders');
// Auto-refresh orders every 30s
setInterval(() => {
  if (!document.getElementById('page-orders').classList.contains('hidden')) loadOrders();
}, 30_000);
