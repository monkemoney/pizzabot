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
    const page = document.getElementById('page-' + t);
    const tab  = document.getElementById('tab-'  + t);
    if (page) page.style.display = 'none';
    if (tab)  tab.classList.remove('active');
  });
  const page = document.getElementById('page-' + name);
  const tab  = document.getElementById('tab-'  + name);
  if (page) page.style.display = 'block';
  if (tab)  tab.classList.add('active');

  if (name === 'orders')    loadOrders();
  if (name === 'products')  loadProducts();
  if (name === 'customers') loadCustomers();
  if (name === 'settings')  loadSettings();
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
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>#</th><th>תאריך</th><th>לקוח</th><th>סוג</th>
          <th>תשלום</th><th>שולם</th><th>סכום</th><th>סטטוס</th><th>פעולות</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map((o) => `
        <tr>
          <td style="font-weight:800;color:var(--primary)">${o.order_number || '—'}</td>
          <td style="color:var(--text-muted);font-size:.78rem">${formatDate(o.created_at)}</td>
          <td>
            <div style="font-weight:700">${o.customer_name || '—'}</div>
            <div style="font-size:.75rem;color:var(--text-muted)">${o.address ? o.address.slice(0,28) : ''}</div>
          </td>
          <td>
            <span class="badge ${o.delivery_method === 'delivery' ? 'badge-delivery' : 'badge-done'}">
              ${o.delivery_method === 'delivery' ? '🛵 משלוח' : '🏍️ איסוף'}
            </span>
          </td>
          <td style="font-size:.82rem;color:var(--text-muted)">${o.payment_method === 'cash' ? '💵 מזומן' : '💳 אשראי'}</td>
          <td>
            <span class="badge ${o.payment_status === 'paid' ? 'badge-paid' : 'badge-pending-pay'}">
              ${o.payment_status === 'paid' ? '✓ שולם' : '⏳ ממתין'}
            </span>
          </td>
          <td style="font-weight:800">₪${(parseFloat(o.total_price)||0).toFixed(2)}</td>
          <td>
            <select onchange="updateOrderStatus('${o.id}',this.value,${o.order_number})"
              style="padding:5px 10px;border-radius:8px;border:2px solid var(--border);font-family:inherit;font-size:.8rem;cursor:pointer">
              ${Object.entries(STATUS_LABELS).map(([val, label]) =>
                `<option value="${val}" ${val===o.status?'selected':''}>${label}</option>`
              ).join('')}
            </select>
          </td>
          <td>
            <button onclick="showOrderDetail('${o.id}')"
              style="font-size:.78rem;font-weight:700;color:var(--primary);background:var(--primary-soft);border:none;padding:5px 10px;border-radius:8px;cursor:pointer">
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
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.88rem;margin-bottom:16px">
      <div><span style="color:var(--text-muted)">לקוח:</span> <strong>${order.customer_name||'—'}</strong></div>
      <div><span style="color:var(--text-muted)">טלפון:</span> <strong>${order.customer_phone||order.phone||'—'}</strong></div>
      <div><span style="color:var(--text-muted)">אספקה:</span> <strong>${order.delivery_method==='delivery'?'🛵 משלוח':'🏍️ איסוף'}</strong></div>
      <div><span style="color:var(--text-muted)">תשלום:</span> <strong>${order.payment_method==='cash'?'💵 מזומן':'💳 אשראי'}</strong></div>
      ${order.address?`<div style="grid-column:span 2"><span style="color:var(--text-muted)">כתובת:</span> <strong>${order.address}</strong></div>`:''}
      ${order.notes?`<div style="grid-column:span 2"><span style="color:var(--text-muted)">הערות:</span> <strong>${order.notes}</strong></div>`:''}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:14px;margin-bottom:14px">
      <div style="font-weight:700;font-size:.82rem;color:var(--text-muted);margin-bottom:8px">פריטים</div>
      ${(order.items||[]).map(item=>`
        <div style="display:flex;justify-content:space-between;font-size:.88rem;padding:5px 0;border-bottom:1px solid var(--border)">
          <span>${item.name||item.name_he||'פריט'}
            ${(item.toppings||[]).length?`<span style="color:var(--text-muted);font-size:.78rem"> + ${item.toppings.map(t=>t.name||t.name_he).join(', ')}</span>`:''}
          </span>
          <span style="font-weight:700">₪${item.price||0}</span>
        </div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1rem;padding:10px 0;border-top:2px solid var(--border)">
      <span>סה"כ</span>
      <span style="color:var(--primary)">₪${(parseFloat(order.total_price)||0).toFixed(2)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:.8rem;color:var(--text-muted)">
      <span>סטטוס: ${statusBadge(order.status)}</span>
      <span>${formatDate(order.created_at)}</span>
    </div>`;
  openModal('orderModal');
}

// ─── STATS ────────────────────────────────────────────────────────────────────

async function loadStats() {
  const dateInput = document.getElementById('statsDate');
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

  try {
    const s = await api('GET', `/stats?date=${dateInput.value}`);
    document.getElementById('statsCards').innerHTML = `
      <div class="stat-card violet">
        <div class="stat-value">${s.order_count}</div>
        <div class="stat-label">הזמנות היום</div>
      </div>
      <div class="stat-card green">
        <div class="stat-value">₪${s.revenue.toFixed(0)}</div>
        <div class="stat-label">הכנסות</div>
      </div>
      <div class="stat-card violet">
        <div class="stat-value">${s.avg_delivery_minutes != null ? s.avg_delivery_minutes + '′' : '—'}</div>
        <div class="stat-label">זמן מסירה ממוצע</div>
      </div>
      <div class="stat-card">
        <div style="display:flex;gap:16px">
          <div><div class="stat-value" style="font-size:1.4rem;color:#16a34a">${s.paid_count}</div><div class="stat-label">שולם</div></div>
          <div style="width:1px;background:var(--border)"></div>
          <div><div class="stat-value" style="font-size:1.4rem;color:#c07000">${s.pending_payment_count}</div><div class="stat-label">ממתין</div></div>
        </div>
      </div>
      <div class="stat-card" style="grid-column:span 2">
        <div style="font-size:.75rem;font-weight:700;color:var(--primary);margin-bottom:8px">🏆 נמכרים ביותר</div>
        ${s.top_products.map((p, i) => `
          <div style="display:flex;justify-content:space-between;font-size:.8rem;padding:3px 0;color:var(--text)">
            <span>${i+1}. ${p.name}</span><span style="font-weight:700;color:var(--primary)">${p.count}x</span>
          </div>`).join('') || '<div style="font-size:.8rem;color:var(--text-muted)">אין נתונים</div>'}
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--accent)">${s.conversations_started}</div>
        <div class="stat-label">שיחות התחילו</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:#9b93b0">${s.not_converted}</div>
        <div class="stat-label">לא הזמינו</div>
      </div>`;
  } catch { /* stats are non-critical */ }
}

document.getElementById('statsDate')?.addEventListener('change', loadStats);

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
  if (!url) return '<span class="text-gray-300 text-lg">🖼️</span>';
  return `<img src="${url}" class="w-10 h-10 object-cover rounded-lg border border-gray-100" onerror="this.replaceWith(document.createTextNode('🖼️'))">`;
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
      <div class="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
           onclick="toggleCategoryExpand('${cat.id}')">
        <div class="flex items-center gap-2">
          <span class="text-lg">${isCatExpanded ? '▾' : '▸'}</span>
          <span class="text-xl">${cat.emoji || '🍽️'}</span>
          <span class="font-semibold text-gray-800">${cat.name_he}</span>
          <span class="text-xs text-gray-400 mr-1">(${products.length} פריטים)</span>
          ${cat.has_toppings ? '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">תוספות</span>' : ''}
        </div>
        <div class="flex gap-2" onclick="event.stopPropagation()">
          <button onclick="openProductModal(null,'${cat.id}')" class="text-xs text-orange-500 hover:text-orange-700 font-medium">+ מוצר</button>
          <button onclick="openCategoryModal(${encodeProduct(cat)})" class="text-xs text-gray-500 hover:text-gray-700">עריכה</button>
          <button onclick="deleteCategory('${cat.id}','${cat.name_he}')" class="text-xs text-red-400 hover:text-red-600">מחיקה</button>
        </div>
      </div>`;

    if (!isCatExpanded) return catHeader;

    const productRows = products.length
      ? products.map((p) => renderProductRow(p, cat)).join('')
      : '<div class="px-5 py-4 text-gray-400 text-sm">אין מוצרים — לחץ "+ מוצר"</div>';

    return catHeader + productRows;
  }).join('');

  container.innerHTML = `<div class="overflow-hidden">${categoryBlocks}</div>`;
}

function renderProductRow(p, cat) {
  const isExpanded = expandedProducts.has(p.id);
  const pData = encodeProduct(p);
  const showAdditions = cat?.has_toppings;

  const additionsSection = (isExpanded && showAdditions) ? `
    <div class="mx-4 mb-3 rounded-xl border border-orange-100 overflow-hidden">
      <table class="w-full text-xs">
        <thead class="bg-orange-50 border-b border-orange-100">
          <tr class="text-gray-500 font-medium">
            <th class="px-4 py-2 text-right">תוספת</th>
            <th class="px-4 py-2 text-right">מחיר</th>
            <th class="px-4 py-2 text-right">תמונה</th>
            <th class="px-4 py-2 text-right">זמין</th>
            <th class="px-4 py-2 text-right">פעולות</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-orange-50">
          ${(p.additions || []).map((a) => `
            <tr class="hover:bg-orange-50/60">
              <td class="px-4 py-2.5 font-medium text-gray-800">${a.name_he}</td>
              <td class="px-4 py-2.5 font-semibold text-gray-700">₪${parseFloat(a.price).toFixed(2)}</td>
              <td class="px-4 py-2.5">${imgThumb(a.image_url)}</td>
              <td class="px-4 py-2.5">${toggleSwitch(a.is_available, `toggleAddition('${p.id}','${a.id}',${!a.is_available})`)}</td>
              <td class="px-4 py-2.5">
                <div class="flex gap-3">
                  <button onclick="openAdditionModal('${p.id}',${encodeAddition(a)})" class="text-orange-500 hover:text-orange-700">עריכה</button>
                  <button onclick="deleteAddition('${p.id}','${a.id}','${a.name_he}')" class="text-red-400 hover:text-red-600">מחיקה</button>
                </div>
              </td>
            </tr>`).join('')}
          ${!(p.additions||[]).length ? '<tr><td colspan="5" class="px-4 py-3 text-gray-400 text-center">אין תוספות</td></tr>' : ''}
        </tbody>
      </table>
      <div class="px-4 py-2 border-t border-orange-100">
        <button onclick="openAdditionModal('${p.id}',null)" class="text-xs text-orange-600 hover:text-orange-800 font-medium">+ הוסף תוספת</button>
      </div>
    </div>` : '';

  const expandBtn = showAdditions
    ? `<span class="text-gray-400 text-sm cursor-pointer select-none" onclick="toggleExpand('${p.id}')">${isExpanded ? '▾' : '▸'}</span>`
    : '<span class="w-4"></span>';

  return `
    <div class="border-b border-gray-50 hover:bg-gray-50/50">
      <div class="flex items-center gap-3 px-5 py-3">
        ${expandBtn}
        ${imgThumb(p.image_url)}
        <div class="flex-1 min-w-0">
          <div class="font-medium text-gray-900 text-sm">${p.name_he}</div>
          <div class="text-xs text-gray-400" dir="ltr">${p.name_en || ''}</div>
        </div>
        <div class="font-semibold text-gray-800 text-sm w-16 text-left">₪${parseFloat(p.price).toFixed(2)}</div>
        ${showAdditions ? `<div class="text-xs text-gray-400 w-16">${(p.additions||[]).length} תוספות</div>` : '<div class="w-16"></div>'}
        <div>${toggleSwitch(p.is_available, `toggleProduct('${p.id}',${!p.is_available})`)}</div>
        <div class="flex gap-3 mr-2">
          <button onclick="openProductModal(${pData},'${p.category_id||''}')" class="text-xs text-orange-500 hover:text-orange-700 font-medium">עריכה</button>
          <button onclick="deleteProduct('${p.id}','${p.name_he}')" class="text-xs text-red-400 hover:text-red-600">מחיקה</button>
        </div>
      </div>
      ${additionsSection}
    </div>`;
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
  document.getElementById('productId').value       = p?.id        || '';
  document.getElementById('productNameHe').value   = p?.name_he   || '';
  document.getElementById('productNameEn').value   = p?.name_en   || '';
  document.getElementById('productPrice').value    = p?.price      || '';
  document.getElementById('productImageUrl').value = p?.image_url  || '';
  document.getElementById('productModal').classList.remove('hidden');
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const body = {
    name_he:     document.getElementById('productNameHe').value.trim(),
    name_en:     document.getElementById('productNameEn').value.trim(),
    price:       parseFloat(document.getElementById('productPrice').value),
    image_url:   document.getElementById('productImageUrl').value.trim() || null,
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
  document.getElementById('additionModal').classList.remove('hidden');
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
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="selectAll" onchange="toggleSelectAll(this)"></th>
          <th>שם</th><th>טלפון</th><th>כתובת אחרונה</th>
          <th>הזמנות</th><th>סה"כ רכישות</th><th>הזמנה אחרונה</th>
        </tr>
      </thead>
      <tbody>
        ${customers.map((c) => `
        <tr>
          <td><input type="checkbox" value="${c.phone}" onchange="toggleCustomer('${c.phone}',this.checked)" class="customer-checkbox"></td>
          <td style="font-weight:700">${c.name||'—'}</td>
          <td style="color:var(--text-muted);font-size:.8rem" dir="ltr">${c.customer_phone||c.phone||'—'}</td>
          <td style="color:var(--text-muted);font-size:.8rem">${c.last_address||'—'}</td>
          <td style="text-align:center;font-weight:800;color:var(--primary)">${c.order_count}</td>
          <td style="font-weight:800">₪${parseFloat(c.total_spent||0).toFixed(0)}</td>
          <td style="color:var(--text-muted);font-size:.8rem">${formatDate(c.last_order_at)}</td>
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

const DAY_LABELS = { sun:'ראשון', mon:'שני', tue:'שלישי', wed:'רביעי', thu:'חמישי', fri:'שישי', sat:'שבת' };
const DAY_ORDER  = ['sun','mon','tue','wed','thu','fri','sat'];

function renderSettingsForm(s) {
  const card = (title, content) => `
    <div class="card" style="padding:22px 24px">
      <div style="font-size:1rem;font-weight:800;color:var(--text);margin-bottom:16px">${title}</div>
      ${content}
    </div>`;

  const toggle = (key, label, checked) => `
    <div class="setting-row">
      <label style="cursor:pointer">${label}</label>
      <input type="checkbox" class="setting-toggle" data-key="${key}" ${checked?'checked':''}>
    </div>`;

  const hours = s.business_hours || {};
  const hoursRows = DAY_ORDER.map((day) => {
    const h = hours[day] || { open: '10:00', close: '23:00' };
    return `
      <div class="hours-row">
        <span class="hours-day">יום ${DAY_LABELS[day]}</span>
        <input type="time" value="${h.open}"  data-day="${day}" data-field="open"  class="hours-input" style="width:110px">
        <span style="color:var(--text-muted);font-size:.82rem">—</span>
        <input type="time" value="${h.close}" data-day="${day}" data-field="close" class="hours-input" style="width:110px">
      </div>`;
  }).join('');

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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:.82rem;font-weight:700;color:#3d3352;margin-bottom:6px">מחיר משלוח (₪)</label>
          <input type="number" id="deliveryPrice" value="${s.delivery_price ?? 30}" min="0" step="1" style="width:100%">
        </div>
        <div>
          <label style="display:block;font-size:.82rem;font-weight:700;color:#3d3352;margin-bottom:6px">מינימום הזמנה (₪)</label>
          <input type="number" id="minOrderDelivery" value="${s.min_order_delivery ?? 0}" min="0" step="1" style="width:100%">
        </div>
      </div>
      <div>
        <label style="display:block;font-size:.82rem;font-weight:700;color:#3d3352;margin-bottom:6px">ערים למשלוח (מופרדות בפסיקים)</label>
        <input type="text" id="deliveryCities" value="${(s.delivery_cities||[]).join(', ')}" style="width:100%">
      </div>
    `)}
    <div class="card" style="padding:22px 24px">
      <div style="font-size:1rem;font-weight:800;color:var(--text);margin-bottom:16px">🕐 שעות פתיחה</div>
      <div class="hours-grid">${hoursRows}</div>
    </div>
    <div style="display:flex;justify-content:flex-end">
      <button onclick="saveSettings()" class="btn btn-primary" style="padding:12px 28px;font-size:.95rem">
        שמור הגדרות
      </button>
    </div>`;
}

async function saveSettings() {
  const updates = {};
  document.querySelectorAll('.setting-toggle').forEach((el) => {
    updates[el.dataset.key] = el.checked;
  });
  updates.delivery_price      = parseFloat(document.getElementById('deliveryPrice').value) || 30;
  updates.min_order_delivery  = parseFloat(document.getElementById('minOrderDelivery').value) || 0;
  updates.delivery_cities     = document.getElementById('deliveryCities').value
    .split(',').map((c) => c.trim()).filter(Boolean);

  // Business hours
  const businessHours = {};
  document.querySelectorAll('.hours-input').forEach((el) => {
    const { day, field } = el.dataset;
    if (!businessHours[day]) businessHours[day] = {};
    businessHours[day][field] = el.value;
  });
  updates.business_hours = businessHours;

  try {
    await api('PATCH', '/settings', updates);
    alert('הגדרות נשמרו בהצלחה ✅');
  } catch (err) { alert(err.message); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Init: show orders tab
showTab('orders');
// Auto-refresh orders every 30s
setInterval(() => {
  if (!document.getElementById('page-orders').classList.contains('hidden')) loadOrders();
}, 30_000);
