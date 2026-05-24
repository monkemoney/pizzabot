'use strict';

// ─── Auth guard ───────────────────────────────────────────────────────────────

const token    = localStorage.getItem('token');
const role     = localStorage.getItem('role');
const username = localStorage.getItem('username');

if (!token || role !== 'vendor') {
  localStorage.clear();
  window.location.href = '/';
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

// ─── Navigation ───────────────────────────────────────────────────────────────

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mnav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  const mb = document.getElementById('mnav-' + name);
  if (mb) mb.classList.add('active');

  if (name === 'dashboard') refreshDashboard();
  if (name === 'clients')   loadClients();
  if (name === 'alerts')    loadAlertSettings();
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1a0a3d;color:#fff;padding:10px 24px;border-radius:50px;font-weight:700;font-size:.88rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function openModal() {
  const m = document.getElementById('addClientModal');
  m.style.display = 'flex'; m.classList.add('open');
  document.getElementById('clientName').value  = '';
  document.getElementById('clientPhone').value = '';
  document.getElementById('clientPlan').value  = 'basic';
  document.getElementById('clientNotes').value = '';
  setTimeout(() => document.getElementById('clientName').focus(), 80);
}
function closeModal() {
  const m = document.getElementById('addClientModal');
  m.style.display = 'none'; m.classList.remove('open');
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

async function refreshDashboard() {
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = '<div style="color:#9b8fc0;font-size:.85rem">טוען...</div>';
  try {
    const [stats, clients] = await Promise.all([
      api('GET', '/vendor/stats'),
      api('GET', '/vendor/clients'),
    ]);

    const card = (label, value, color) =>
      `<div class="stat-card">
        <div class="stat-value" style="color:${color}">${value}</div>
        <div class="stat-label">${label}</div>
      </div>`;

    grid.innerHTML =
      card('לקוחות פעילים',  stats.active_clients, '#16a34a') +
      card('סה"כ לקוחות',    stats.total_clients,  '#5e17eb') +
      card('סה"כ הזמנות',    stats.total_orders,   '#0369a1') +
      card('הכנסות כוללות',  `₪${(stats.total_revenue||0).toFixed(0)}`, '#7c3aed') +
      card('שיחות פתוחות',   stats.total_sessions, '#7a6f8a');

    // Recent clients
    const rc = document.getElementById('recentClients');
    if (!clients.length) {
      rc.innerHTML = '<div style="color:#9b8fc0;font-size:.84rem;padding:8px 0">אין לקוחות עדיין</div>';
    } else {
      rc.innerHTML = `<table>
        <thead><tr><th>שם עסק</th><th>תוכנית</th><th>סטטוס</th><th>נוסף</th></tr></thead>
        <tbody>
          ${clients.slice(0, 5).map(c => `
            <tr>
              <td style="font-weight:700">${c.name}</td>
              <td><span class="badge" style="background:#f0ebff;color:#5e17eb">${c.plan}</span></td>
              <td><span class="badge badge-${c.status}">${{active:'פעיל',trial:'ניסיון',inactive:'מושבת'}[c.status]||c.status}</span></td>
              <td style="font-size:.78rem;color:#9b8fc0">${new Date(c.created_at).toLocaleDateString('he-IL')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    }
  } catch (err) {
    grid.innerHTML = `<div style="color:red;font-size:.84rem">${err.message}</div>`;
  }
}

// ─── Clients ──────────────────────────────────────────────────────────────────

let _clients = [];

async function loadClients() {
  const el = document.getElementById('clientsTable');
  el.innerHTML = '<div style="color:#9b8fc0;font-size:.84rem;padding:8px 0">טוען...</div>';
  try {
    _clients = await api('GET', '/vendor/clients');
    renderClients();
  } catch (err) {
    el.innerHTML = `<div style="color:red;font-size:.84rem">${err.message}</div>`;
  }
}

function renderClients() {
  const el = document.getElementById('clientsTable');
  if (!_clients.length) {
    el.innerHTML = '<div style="color:#9b8fc0;font-size:.84rem;padding:20px;text-align:center">אין לקוחות — לחץ "+ הוסף לקוח"</div>';
    return;
  }

  const PLAN_LABELS = { basic:'Basic', pro:'Pro', enterprise:'Enterprise', trial:'Trial' };

  el.innerHTML = `<table>
    <thead><tr>
      <th>שם עסק</th><th>טלפון</th><th>תוכנית</th><th>סטטוס</th><th>הערות</th><th>נוסף</th><th></th>
    </tr></thead>
    <tbody>
      ${_clients.map(c => `
        <tr>
          <td style="font-weight:700">${c.name}</td>
          <td style="font-family:monospace;direction:ltr;font-size:.82rem;color:#9b8fc0">${c.contact_phone||'—'}</td>
          <td><span class="badge" style="background:#f0ebff;color:#5e17eb">${PLAN_LABELS[c.plan]||c.plan}</span></td>
          <td>
            <select onchange="updateClientStatus('${c.id}',this.value)"
              style="padding:4px 10px;border-radius:8px;border:2px solid #e8e4f5;font-family:inherit;font-size:.78rem;width:auto">
              <option value="active"   ${c.status==='active'  ?'selected':''}>פעיל</option>
              <option value="trial"    ${c.status==='trial'   ?'selected':''}>ניסיון</option>
              <option value="inactive" ${c.status==='inactive'?'selected':''}>מושבת</option>
            </select>
          </td>
          <td style="color:#9b8fc0;font-size:.78rem;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.notes||'—'}</td>
          <td style="font-size:.78rem;color:#9b8fc0">${new Date(c.created_at).toLocaleDateString('he-IL')}</td>
          <td>
            <button onclick="deleteClient('${c.id}','${c.name}')" class="btn-danger">הסר</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

async function submitAddClient(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'שומר...';
  try {
    const c = await api('POST', '/vendor/clients', {
      name:          document.getElementById('clientName').value.trim(),
      contact_phone: document.getElementById('clientPhone').value.replace(/\D/g,''),
      plan:          document.getElementById('clientPlan').value,
      notes:         document.getElementById('clientNotes').value.trim(),
    });
    _clients.unshift(c);
    renderClients();
    closeModal();
    showToast(`✅ ${c.name} נוסף בהצלחה`);
  } catch (err) { alert(err.message); }
  finally { btn.disabled = false; btn.textContent = 'הוסף לקוח'; }
}

async function updateClientStatus(id, status) {
  try {
    await api('PATCH', `/vendor/clients/${id}`, { status });
    const c = _clients.find(x => x.id === id);
    if (c) c.status = status;
    showToast('סטטוס עודכן');
  } catch (err) { alert(err.message); loadClients(); }
}

async function deleteClient(id, name) {
  if (!confirm(`להסיר את "${name}" לצמיתות?`)) return;
  try {
    await api('DELETE', `/vendor/clients/${id}`);
    _clients = _clients.filter(c => c.id !== id);
    renderClients();
    showToast(`${name} הוסר`);
  } catch (err) { alert(err.message); }
}

// ─── Alert settings ───────────────────────────────────────────────────────────

async function loadAlertSettings() {
  try {
    const s = await api('GET', '/settings');
    document.getElementById('vendorPhone').value      = s.vendor_phone   || '';
    document.getElementById('alertOnError').checked   = s.vendor_alert_error   !== false;
    document.getElementById('alertOnPayment').checked = s.vendor_alert_payment !== false;
    document.getElementById('alertOnRestart').checked = s.vendor_alert_restart !== false;
  } catch {}
}

async function saveAlertSettings() {
  try {
    await api('PATCH', '/vendor/settings', {
      vendor_phone:          document.getElementById('vendorPhone').value.replace(/\D/g,''),
      alert_on_error:        document.getElementById('alertOnError').checked,
      alert_on_payment_fail: document.getElementById('alertOnPayment').checked,
      alert_on_restart:      document.getElementById('alertOnRestart').checked,
    });
    showToast('הגדרות נשמרו ✅');
  } catch (err) { alert(err.message); }
}

async function sendTestAlert() {
  try {
    await api('POST', '/vendor/alerts-test', {});
    showToast('התראת טסט נשלחה ב-WhatsApp 📱');
  } catch (err) { alert(err.message); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Show vendor name in sidebar
api('GET', '/settings').then(s => {
  const el = document.getElementById('vendorNameDisplay');
  if (el && s.vendor_name) el.textContent = s.vendor_name;
}).catch(() => {});

refreshDashboard();
