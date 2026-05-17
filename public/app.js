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
  const isExpanded = expandedProducts.has(p.id);
  const pData = encodeProduct(p);
  const showAdditions = cat?.has_toppings;

  const additionsSection = (isExpanded && showAdditions) ? `
    <div style="margin:0 20px 16px;border-radius:14px;border:1.5px solid var(--primary-soft);overflow:hidden;background:#faf8ff">
      <div style="display:grid;grid-template-columns:1fr 80px 44px 44px 100px;padding:10px 18px;background:var(--primary-soft);font-size:.72rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.04em;gap:16px">
        <span>תוספת</span><span>מחיר</span><span>תמונה</span><span>זמין</span><span></span>
      </div>
      ${(p.additions||[]).map((a) => `
        <div style="display:grid;grid-template-columns:1fr 80px 44px 44px 100px;padding:12px 18px;border-top:1px solid var(--primary-soft);align-items:center;gap:16px;font-size:.85rem">
          <span style="font-weight:600">${a.name_he}</span>
          <span style="font-weight:700;color:var(--primary)">₪${parseFloat(a.price).toFixed(2)}</span>
          <span>${imgThumb(a.image_url)}</span>
          <span>${toggleSwitch(a.is_available, `toggleAddition('${p.id}','${a.id}',${!a.is_available})`)}</span>
          <div style="display:flex;gap:6px">
            <button onclick="openAdditionModal('${p.id}',${encodeAddition(a)})" class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:.75rem">עריכה</button>
            <button onclick="deleteAddition('${p.id}','${a.id}','${a.name_he}')" class="btn-danger" style="font-size:.75rem;padding:4px 8px">מחק</button>
          </div>
        </div>`).join('')}
      ${!(p.additions||[]).length ? `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.82rem">אין תוספות עדיין</div>` : ''}
      <div style="padding:12px 18px;border-top:1px solid var(--primary-soft)">
        <button onclick="openAdditionModal('${p.id}',null)" class="btn btn-outline btn-sm">+ הוסף תוספת</button>
      </div>
    </div>` : '';

  const expandBtn = showAdditions
    ? `<button onclick="toggleExpand('${p.id}')" style="background:var(--primary-soft);border:none;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:.85rem;color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0">${isExpanded ? '▾' : '▸'}</button>`
    : `<span style="width:28px;flex-shrink:0"></span>`;

  return `
    <div class="product-row">
      ${expandBtn}
      ${imgThumb(p.image_url)}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.92rem">${p.name_he}</div>
        ${p.name_en ? `<div style="font-size:.75rem;color:var(--text-muted)" dir="ltr">${p.name_en}</div>` : ''}
      </div>
      <div style="font-weight:800;font-size:.95rem;color:var(--primary);min-width:70px">₪${parseFloat(p.price).toFixed(2)}</div>
      ${showAdditions ? `<div style="font-size:.75rem;color:var(--text-muted);min-width:60px;text-align:center">${(p.additions||[]).length} תוספות</div>` : `<div style="min-width:60px"></div>`}
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
    <label style="font-weight:600;cursor:pointer">${label}</label>
    <input type="checkbox" class="setting-toggle" data-key="${key}" ${checked?'checked':''}>
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
    showToast(successMsg || 'נשמר ✅');
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
    return `<div class="hours-row" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#faf8ff;border-radius:12px;margin-bottom:8px">
      <input type="checkbox" class="hours-active" data-day="${day}" ${open?'checked':''} style="width:16px;height:16px;accent-color:var(--primary)">
      <span class="hours-day" style="font-weight:700;color:var(--primary);min-width:62px">יום ${DAY_LABELS[day]}</span>
      <input type="time" value="${h.open}"  data-day="${day}" data-field="open"  class="hours-input" style="width:110px" ${!open?'disabled':''}>
      <span style="color:var(--text-muted);font-size:.82rem">—</span>
      <input type="time" value="${h.close}" data-day="${day}" data-field="close" class="hours-input" style="width:110px" ${!open?'disabled':''}>
    </div>`;
  }).join('');

  document.getElementById('settingsForm').innerHTML = `

    ${sCard('🏢 פרטי העסק', `
      ${sField('biz_name',    'שם העסק',           s.business_name    || '', 'text', 'פיצה דליבריס')}
      ${sField('biz_address', 'כתובת העסק',         s.business_address || '', 'text', 'רוטשילד 19, תל אביב')}
      ${sField('biz_bot_url', 'כתובת שרת הבוט',     s.bot_url          || '', 'url',  'https://...')}
      ${sField('biz_pickup',  'כתובת לאיסוף עצמי', s.pickup_address   || '', 'text', 'רוטשילד 19, תל אביב')}
      ${saveBtn('saveBizInfo')}
    `)}

    ${sCard('💳 אמצעי תשלום', `
      ${sToggle('payment_cash',   '💵 מזומן',   s.payment_cash   !== false)}
      ${sToggle('payment_credit', '💳 אשראי',   s.payment_credit !== false)}
      ${sToggle('payment_bit',    '🔵 ביט',      !!s.payment_bit)}
      ${sToggle('payment_paybox', '🟣 פייבוקס',  !!s.payment_paybox)}
      ${sToggle('payment_other',  '💸 אחר',      !!s.payment_other)}
      ${saveBtn('savePayments')}
    `)}

    ${sCard('🛵 סוגי הזמנה', `
      ${sToggle('delivery_enabled', 'משלוח מאופשר',      s.delivery_enabled !== false)}
      ${sToggle('pickup_enabled',   'איסוף עצמי מאופשר', s.pickup_enabled   !== false)}
      ${sToggle('is_open',          'בוט פתוח לקבלת הזמנות', s.is_open !== false)}
      ${saveBtn('saveOrderTypes')}
    `)}

    ${sCard('✏️ הגדרות שינוי הזמנות', `
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

    ${sCard('🕐 שעות פעילות', `
      <div>${hoursRows}</div>
      ${saveBtn('saveHours')}
    `)}

    ${sCard('📍 אזורי משלוח', `
      <div id="zonesTable"></div>
      <div style="margin-top:12px">
        <button onclick="addZoneRow()" class="btn btn-outline btn-sm">+ הוסף אזור</button>
      </div>
      ${saveBtn('saveZones')}
    `)}
  `;

  renderZonesTable();

  // Sync hours-active toggles
  document.querySelectorAll('.hours-active').forEach((cb) => {
    cb.addEventListener('change', () => {
      const day = cb.dataset.day;
      document.querySelectorAll(`.hours-input[data-day="${day}"]`)
        .forEach((inp) => inp.disabled = !cb.checked);
    });
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
  await saveSection({ delivery_zones: _deliveryZones });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Init: show orders tab
showTab('orders');
// Auto-refresh orders every 30s
setInterval(() => {
  if (!document.getElementById('page-orders').classList.contains('hidden')) loadOrders();
}, 30_000);
