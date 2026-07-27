'use strict';

// tr() comes from i18n.js (loaded before this script); guard just in case
const TR = (str) => (typeof tr === 'function' ? tr(str) : str);

// ── Auth ──────────────────────────────────────────────────────────────────────
let _token = null;

function getToken() {
  if (_token) return _token;
  // Login page (index.html) stores the JWT under 'token'; legacy keys kept as fallback
  _token = localStorage.getItem('token') || localStorage.getItem('kitchen_token') || localStorage.getItem('dashboard_token');
  return _token;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('kitchen_token');
  localStorage.removeItem('dashboard_token');
  window.location.href = '/';
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

// ── State ─────────────────────────────────────────────────────────────────────
let _orders = {};   // id → order

// ── Render ────────────────────────────────────────────────────────────────────
// Timer basis (aligned with the dashboard kitchen tab): preparing/ready count
// from the moment the order entered 'preparing' (status_history), so the timer
// measures kitchen time — not how long the customer waited for approval.
// 'new' orders count from creation (that IS the approval wait).
function timerBase(order) {
  if (order.status !== 'new') {
    const hist = Array.isArray(order.status_history) ? order.status_history : [];
    const prep = hist.filter(h => h.status === 'preparing').pop();
    if (prep?.at) return prep.at;
  }
  return order.created_at;
}

function elapsedLabel(since) {
  const mins = Math.floor((Date.now() - new Date(since)) / 60000);
  if (mins < 1)  return TR('הרגע');
  if (mins < 60) return `${mins} ${TR("דק'")}`;
  return `${Math.floor(mins / 60)}${TR("ש'")} ${mins % 60}${TR("דק'")}`;
}

function renderCard(order) {
  const base = timerBase(order);
  const isUrgent = (Date.now() - new Date(base)) > (order.status === 'new' ? 5 : 20) * 60000;
  const items = (order.items || []).map(it => {
    const qty   = it.quantity || it.qty || 1;
    // Portion-aware label — the kitchen must see "זיתים (חצי)" exactly as ordered
    const tops  = (it.toppings || [])
      .map(t => { const n = t.name || t.name_he; return n && t.portion ? `${n} (${t.portion})` : n; })
      .filter(Boolean).join(', ');
    return `<li>
      <span class="item-qty">×${qty}</span>${it.name || it.name_he}
      ${tops ? `<span class="item-toppings">(${tops})</span>` : ''}
    </li>`;
  }).join('');

  const ico = (path) =>
    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const ICO_TRUCK = ico('<rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 7v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>');
  const ICO_HOME  = ico('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>');
  const ICO_NOTE  = ico('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>');
  const ICO_FLAME = ico('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>');
  const ICO_CHECK = ico('<polyline points="20 6 9 17 4 12"/>');

  const methodClass = order.delivery_method === 'pickup' ? 'method-pickup' : 'method-delivery';
  const methodLabel = order.delivery_method === 'pickup' ? `${ICO_HOME} ${TR('איסוף')}` : `${ICO_TRUCK} ${TR('משלוח')}`;

  const notes = order.notes ? `<div class="card-notes">${ICO_NOTE} ${order.notes}</div>` : '';

  let actions = '';
  if (order.status === 'new') {
    // Accepting from the KDS is a real approval: customer gets the
    // confirmation + prep-time message, accepted_at is stamped.
    actions = `<button class="btn-action btn-prep" onclick="acceptOrder('${order.id}')">${ICO_CHECK} ${TR('אשר והתחל הכנה')}</button>`;
  } else if (order.status === 'preparing') {
    actions = `<button class="btn-action btn-ready" onclick="setStatus('${order.id}','ready')">${ICO_CHECK} ${TR('מוכן')}</button>`;
  }

  return `
    <div class="order-card" id="card-${order.id}">
      <div class="card-head">
        <span class="card-num">#${order.order_number}</span>
        <span class="card-timer ${isUrgent ? 'urgent' : ''}">${elapsedLabel(base)}</span>
      </div>
      <span class="card-method ${methodClass}">${methodLabel}</span>
      <ul class="card-items">${items || '<li>—</li>'}</ul>
      ${notes}
      <div class="card-actions">${actions}</div>
    </div>`;
}

function renderAll() {
  const cols = { new: [], preparing: [], ready: [] };
  for (const o of Object.values(_orders)) {
    if (cols[o.status] !== undefined) cols[o.status].push(o);
  }
  // Sort each column oldest first
  for (const list of Object.values(cols)) list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const [status, list] of Object.entries(cols)) {
    const el = document.getElementById(`col-${status}`);
    el.innerHTML = list.length
      ? list.map(renderCard).join('')
      : `<div class="empty">${TR('אין הזמנות')}</div>`;
    document.getElementById(`badge-${status}`).textContent = list.length;
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function acceptOrder(id) {
  const btn = document.querySelector(`#card-${id} .btn-action`);
  if (btn) btn.disabled = true;

  const data = await apiFetch(`/api/orders/${id}/accept`, { method: 'POST', body: JSON.stringify({}) });
  if (!data) return;
  if (data.error) { showToast(TR('שגיאה') + ': ' + data.error); if (btn) btn.disabled = false; return; }

  if (data.order) { _orders[id] = data.order; renderAll(); }
  showToast(TR('הזמנה אושרה — הלקוח עודכן'));
}

async function setStatus(id, status) {
  const btn = document.querySelector(`#card-${id} .btn-action`);
  if (btn) btn.disabled = true;

  const data = await apiFetch(`/api/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!data) return;
  if (data.error) { showToast(TR('שגיאה') + ': ' + data.error); if (btn) btn.disabled = false; return; }

  // Optimistic update — SSE will confirm
  if (data.order) {
    _orders[id] = data.order;
    renderAll();
  }
  showToast(status === 'preparing' ? TR('הזמנה עברה להכנה') : TR('הזמנה מוכנה'));
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── SSE ───────────────────────────────────────────────────────────────────────
// Auth via ?token= query param — EventSource doesn't support custom headers
let _es = null;
let _reconnectTimer = null;
let _sseEverOpened = false;
let _sseLastSignal = 0;

// Full board reload — used at boot and as gap-recovery after an SSE reconnect
// (reattaching the stream loses whatever happened while it was down).
async function resyncOrders() {
  const orders = await apiFetch('/api/kitchen/orders');
  if (!orders) return;
  for (const k of Object.keys(_orders)) delete _orders[k];
  for (const o of orders) _orders[o.id] = o;
  renderAll();
}

function connectSSE() {
  if (_es) _es.close();
  _es = new EventSource(`/api/sse?token=${encodeURIComponent(getToken())}`);
  _sseLastSignal = Date.now();
  _es.addEventListener('ping', () => { _sseLastSignal = Date.now(); });

  _es.addEventListener('new_order', (e) => {
    const order = JSON.parse(e.data);
    if (['new','preparing','ready'].includes(order.status)) {
      _orders[order.id] = order;
      renderAll();
      showToast(`${TR('הזמנה חדשה')} #${order.order_number}`);
      // Push notification if page is hidden
      if (document.hidden && Notification.permission === 'granted') {
        new Notification(TR('הזמנה חדשה'), { body: `#${order.order_number} — ₪${order.total_price}` });
      }
    }
  });

  _es.addEventListener('order_updated', (e) => {
    const order = JSON.parse(e.data);
    if (['new','preparing','ready'].includes(order.status)) {
      _orders[order.id] = order;
    } else {
      delete _orders[order.id];
    }
    renderAll();
  });

  _es.onopen = () => {
    _sseLastSignal = Date.now();
    document.getElementById('dot').classList.add('connected');
    document.getElementById('connLabel').textContent = TR('מחובר');
    if (_sseEverOpened) resyncOrders();
    _sseEverOpened = true;
  };

  _es.onerror = () => {
    document.getElementById('dot').classList.remove('connected');
    document.getElementById('connLabel').textContent = TR('מתחבר מחדש…');
    clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(connectSSE, 4000);
  };
}

// Heartbeat watchdog: a handle in a variable is not a live connection — if the
// server's 25s ping goes silent (dead TCP, laptop resume), force a reconnect.
setInterval(() => {
  if (_es && _sseLastSignal && Date.now() - _sseLastSignal > 90_000) {
    console.warn('[kitchen] SSE heartbeat lost — reconnecting');
    connectSSE();
  }
}, 30_000);

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  if (!getToken()) { window.location.href = '/'; return; }

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Load orders
  const orders = await apiFetch('/api/kitchen/orders');
  if (!orders) return;
  for (const o of orders) _orders[o.id] = o;
  renderAll();

  // Start SSE
  connectSSE();

  // Refresh elapsed timers every 60s
  setInterval(() => {
    document.querySelectorAll('.card-timer').forEach(el => {
      const card = el.closest('.order-card');
      if (!card) return;
      const id = card.id.replace('card-', '');
      const o  = _orders[id];
      if (!o) return;
      const base = timerBase(o);
      const mins = Math.floor((Date.now() - new Date(base)) / 60000);
      el.textContent = elapsedLabel(base);
      el.classList.toggle('urgent', mins > (o.status === 'new' ? 5 : 20));
    });
  }, 60_000);
}

init();
