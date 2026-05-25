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

  if (name === 'dashboard')   refreshDashboard();
  if (name === 'clients')     loadClients();
  if (name === 'alerts')      loadAlertSettings();
  if (name === 'onboarding')  loadOnboarding();
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  const bottomOffset = window.innerWidth <= 768 ? '80px' : '28px';
  t.style.cssText = `position:fixed;bottom:${bottomOffset};left:50%;transform:translateX(-50%);background:#1a0a3d;color:#fff;padding:10px 24px;border-radius:50px;font-weight:700;font-size:.88rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3)`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function openAddClientModal() { openModal(); }
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
    loadUsage();

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

// ─── Usage / Cost ─────────────────────────────────────────────────────────────

const MONTH_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

async function loadUsage() {
  const el = document.getElementById('usageTable');
  if (!el) return;
  try {
    const rows = await api('GET', '/vendor/usage');
    if (!rows || !rows.length) {
      el.innerHTML = '<div style="color:#9b8fc0;font-size:.84rem;padding:8px 0">אין נתונים עדיין</div>';
      return;
    }

    const fmt = n => n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : String(n);
    const fmtMonth = s => { const [y,m] = s.split('-'); return `${MONTH_HE[+m-1]} ${y}`; };
    const fmtCost  = n => n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`;

    el.innerHTML = `<table>
      <thead><tr>
        <th>חודש</th>
        <th style="text-align:left">Tenant</th>
        <th>קריאות</th>
        <th>Input</th>
        <th>Output</th>
        <th>Cache</th>
        <th style="color:#5e17eb">עלות</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td style="font-weight:700">${fmtMonth(r.month)}</td>
          <td style="font-family:monospace;font-size:.75rem;direction:ltr;color:#9b8fc0">${r.tenant_id.slice(0,8)}…</td>
          <td>${r.calls}</td>
          <td style="font-size:.82rem;color:#555">${fmt(r.input)}</td>
          <td style="font-size:.82rem;color:#555">${fmt(r.output)}</td>
          <td style="font-size:.82rem;color:#555">${fmt(r.cache_read)}</td>
          <td style="font-weight:700;color:#5e17eb">${fmtCost(r.cost_usd)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  } catch (err) {
    const el2 = document.getElementById('usageTable');
    if (el2) el2.innerHTML = `<div style="color:red;font-size:.84rem">${err.message}</div>`;
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

  const q = (document.getElementById('clientSearch')?.value || '').trim().toLowerCase();
  const list = q
    ? _clients.filter(c =>
        (c.name         || '').toLowerCase().includes(q) ||
        (c.contact_phone|| '').includes(q) ||
        (c.notes        || '').toLowerCase().includes(q))
    : _clients;

  if (!list.length) {
    el.innerHTML = '<div style="color:#9b8fc0;font-size:.84rem;padding:20px;text-align:center">לא נמצאו תוצאות</div>';
    return;
  }

  const PLAN_LABELS = { basic:'Basic', pro:'Pro', enterprise:'Enterprise', trial:'Trial' };

  const fmtCost = n => n <= 0 ? '—' : n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`;

  el.innerHTML = `<table>
    <thead><tr>
      <th>שם עסק</th><th>טלפון</th><th>תוכנית</th><th>סטטוס</th><th>צריכה החודש</th><th>נוסף</th><th></th>
    </tr></thead>
    <tbody>
      ${list.map(c => `
        <tr>
          <td>
            <div style="font-weight:700">${c.name}</div>
            ${c.tenant_id ? `<div style="font-family:monospace;font-size:.68rem;color:#c4b8e0;direction:ltr;margin-top:2px">${c.tenant_id.slice(0,8)}…</div>` : ''}
          </td>
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
          <td>
            <div style="font-weight:700;color:${c.month_cost>0?'#5e17eb':'#c4b8e0'};font-size:.85rem">${fmtCost(c.month_cost)}</div>
            ${c.month_calls>0 ? `<div style="font-size:.7rem;color:#9b8fc0">${c.month_calls} קריאות</div>` : ''}
          </td>
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
    showToast(`${c.name} נוסף בהצלחה`);
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
    showToast('הגדרות נשמרו');
  } catch (err) { alert(err.message); }
}

async function sendTestAlert() {
  try {
    await api('POST', '/vendor/alerts-test', {});
    showToast('התראת טסט נשלחה ב-WhatsApp');
  } catch (err) { alert(err.message); }
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  pending_client: 'ממתין ללקוח',
  pending_vendor: 'ממתין לספק',
  approved:       'מאושר',
};
const STATUS_COLOR = {
  pending_client: { bg:'#fff8e0', color:'#c07000', border:'#fcd34d' },
  pending_vendor: { bg:'#ede8fd', color:'#5e17eb', border:'#c4b8e0' },
  approved:       { bg:'#e0fbef', color:'#16a34a', border:'#86efac' },
};

async function loadOnboarding() {
  const list  = document.getElementById('onboardingList');
  const stats = document.getElementById('onboardingStats');
  list.innerHTML  = '<div style="color:var(--text-muted);font-size:.84rem;padding:8px 0">טוען...</div>';
  stats.innerHTML = '';
  try {
    const sessions = await api('GET', '/vendor/onboarding');
    const pc = sessions.filter(s => s.status === 'pending_client').length;
    const pv = sessions.filter(s => s.status === 'pending_vendor').length;
    stats.innerHTML = [
      pc ? `<span style="background:#fff8e0;border:1px solid #fcd34d;color:#c07000;border-radius:50px;padding:4px 14px;font-size:.78rem;font-weight:700">${pc} ממתין ללקוח</span>` : '',
      pv ? `<span style="background:#ede8fd;border:1px solid #c4b8e0;color:#5e17eb;border-radius:50px;padding:4px 14px;font-size:.78rem;font-weight:700">${pv} ממתין לספק</span>` : '',
    ].join('');

    if (!sessions.length) {
      list.innerHTML = '<div class="card" style="padding:32px;text-align:center;color:var(--text-muted);font-size:.84rem">אין תהליכי אונבורדינג פתוחים</div>';
      return;
    }

    list.innerHTML = sessions.map(s => {
      const sc = STATUS_COLOR[s.status] || STATUS_COLOR.pending_client;
      const done = (s.checklist || []).filter(i => i.done).length;
      const total = (s.checklist || []).length;
      const pct   = total ? Math.round(done / total * 100) : 0;
      return `
      <div class="card" style="padding:18px 20px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:160px">
          <div style="font-weight:700;font-size:.95rem">${s.clients?.name || s.business_name || '—'}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">${s.clients?.contact_phone || ''}</div>
        </div>
        <div>
          <span style="background:${sc.bg};border:1px solid ${sc.border};color:${sc.color};border-radius:50px;padding:3px 12px;font-size:.75rem;font-weight:700">
            ${STATUS_LABEL[s.status] || s.status}
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;min-width:80px">
          <div style="font-size:.72rem;color:var(--text-muted)">${done}/${total} צעדים</div>
          <div style="height:4px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct===100?'#16a34a':'var(--primary)'};transition:width .3s"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button onclick="copyLink('${s.token}')" class="btn btn-ghost btn-sm" title="העתק לינק ללקוח">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            לינק
          </button>
          <button onclick="openSessionModal('${s.id}')" class="btn btn-primary btn-sm">פרטים</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = `<div style="color:red;font-size:.84rem">${err.message}</div>`;
  }
}

// ── New onboarding modal ──────────────────────────────────────────────────────

function openNewOnboardingModal() {
  document.getElementById('obName').value  = '';
  document.getElementById('obPhone').value = '';
  document.getElementById('obPlan').value  = 'trial';
  document.getElementById('obLinkBox').style.display = 'none';
  document.getElementById('obSubmitBtn').style.display = '';
  document.getElementById('newOnboardingModal').style.display = 'flex';
}
function closeNewOnboardingModal() {
  document.getElementById('newOnboardingModal').style.display = 'none';
  loadOnboarding();
}

async function submitNewOnboarding(e) {
  e.preventDefault();
  const btn = document.getElementById('obSubmitBtn');
  btn.disabled = true; btn.textContent = 'יוצר...';
  try {
    const data = await api('POST', '/vendor/onboarding', {
      name:          document.getElementById('obName').value.trim(),
      contact_phone: document.getElementById('obPhone').value.trim(),
      plan:          document.getElementById('obPlan').value,
    });
    document.getElementById('obLinkInput').value = data.link;
    document.getElementById('obLinkBox').style.display = '';
    btn.style.display = 'none';
    showToast('לקוח נוצר — שלח את הלינק ללקוח');
  } catch (err) {
    alert(err.message);
    btn.disabled = false; btn.textContent = 'צור לקוח ויצר לינק';
  }
}

function copyOnboardingLink() {
  const val = document.getElementById('obLinkInput').value;
  navigator.clipboard.writeText(val).then(() => showToast('לינק הועתק'));
}

function copyLink(token) {
  const link = `${location.origin}/onboarding/${token}`;
  navigator.clipboard.writeText(link).then(() => showToast('לינק הועתק'));
}

// ── Session details modal ─────────────────────────────────────────────────────

let _currentSession = null;

async function openSessionModal(id) {
  const modal = document.getElementById('sessionModal');
  const body  = document.getElementById('sessionModalBody');
  modal.style.display = 'flex';
  body.innerHTML = '<div style="color:var(--text-muted);font-size:.84rem;padding:20px 0">טוען...</div>';

  try {
    const sessions = await api('GET', '/vendor/onboarding');
    _currentSession = sessions.find(s => s.id === id);
    if (!_currentSession) { body.innerHTML = '<div style="color:red">לא נמצא</div>'; return; }
    document.getElementById('sessionModalTitle').textContent = _currentSession.clients?.name || _currentSession.business_name || 'אונבורדינג';
    renderSessionModal();
  } catch (err) {
    body.innerHTML = `<div style="color:red">${err.message}</div>`;
  }
}

function closeSessionModal() {
  document.getElementById('sessionModal').style.display = 'none';
  _currentSession = null;
  loadOnboarding();
}

function renderSessionModal() {
  const s = _currentSession;
  const body = document.getElementById('sessionModalBody');

  const row = (label, val) => val
    ? `<div style="display:flex;gap:8px;font-size:.84rem;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--text-muted);flex-shrink:0;min-width:130px">${label}</span>
        <span style="font-weight:600;direction:ltr;text-align:right;flex:1">${val}</span>
       </div>`
    : '';

  const zonesSummary = (s.delivery_zones || []).map(z => `${z.city} ₪${z.fee}`).join(' · ') || '—';
  const adminsSummary = (s.admin_phones || []).map(a => a.name || a.phone).join(', ') || '—';
  const hoursSummary = s.business_hours
    ? Object.entries(s.business_hours).filter(([,h]) => h.is_open !== false).length + ' ימים פתוחים'
    : '—';

  const checklistHtml = (s.checklist || []).map(item => `
    <label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;font-size:.86rem">
      <input type="checkbox" ${item.done?'checked':''} style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;flex-shrink:0"
        onchange="toggleChecklist('${s.id}','${item.key}',this.checked)">
      <span style="${item.done?'text-decoration:line-through;color:var(--text-muted)':''}">${item.label}</span>
    </label>`).join('');

  const isApproved = s.status === 'approved';

  body.innerHTML = `
    <!-- Client info -->
    <div style="font-size:.72rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">פרטי עסק (מהלקוח)</div>
    <div style="margin-bottom:20px">
      ${row('שם עסק', s.business_name)}
      ${row('WhatsApp בוט', s.bot_whatsapp)}
      ${row('כתובת סניף', s.business_address)}
      ${row('כתובת איסוף', s.pickup_address)}
      ${row('סוגי הזמנה', [s.delivery_enabled!==false&&'משלוח', s.pickup_enabled!==false&&'איסוף עצמי'].filter(Boolean).join(', ') || '—')}
      ${row('שעות פעילות', hoursSummary)}
      ${row('אזורי משלוח', zonesSummary)}
      ${row('תשלום', [s.payment_cash&&'מזומן', s.payment_credit&&'אשראי', s.payment_bit&&'Bit', s.payment_paybox&&'Paybox'].filter(Boolean).join(', ') || '—')}
      ${row('מנהלי WhatsApp', adminsSummary)}
    </div>

    <!-- Technical fields -->
    <div style="font-size:.72rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">הגדרות טכניות (ספק)</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px" id="techFields">
      ${techInput('cardcom_terminal',   'Cardcom Terminal', s.cardcom_terminal   || '', 'ltr')}
      ${techInput('cardcom_username',   'Cardcom Username', s.cardcom_username   || '', 'ltr')}
      ${techInput('green_api_instance', 'Green API Instance ID *', s.green_api_instance || '', 'ltr')}
      ${techInput('green_api_token',    'Green API Token *',  s.green_api_token    || '', 'ltr')}
      <div>
        <div style="font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">Tenant ID (להכנסה ב-Render env: TENANT_ID)</div>
        <div style="display:flex;align-items:center;gap:8px">
          <input readonly value="${s.clients?.tenant_id || '—'}" dir="ltr"
            style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;font-family:monospace;font-size:.82rem;background:#fafafa;color:var(--text-muted)">
          <button type="button" onclick="navigator.clipboard.writeText('${s.clients?.tenant_id || ''}').then(()=>showToast('Tenant ID הועתק'))"
            class="btn btn-ghost btn-sm" style="flex-shrink:0">העתק</button>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:24px">
      <button onclick="saveTechFields('${s.id}')" class="btn btn-ghost btn-sm">שמור הגדרות טכניות</button>
    </div>

    <!-- Checklist -->
    <div style="font-size:.72rem;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">צ'קליסט</div>
    <div style="margin-bottom:24px">${checklistHtml}</div>

    <!-- Approve -->
    ${!isApproved ? `
    <div style="background:var(--color-success-bg,#e0fbef);border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="font-size:.84rem;font-weight:600;color:#16a34a">לאחר השלמת כל הצעדים — אשר את הלקוח</div>
      <button onclick="approveOnboarding('${s.id}')" class="btn btn-primary btn-sm" style="background:#16a34a;border-color:#16a34a">אשר לקוח</button>
    </div>` : `
    <div style="background:#e0fbef;border-radius:12px;padding:14px;text-align:center;font-size:.84rem;font-weight:700;color:#16a34a">הלקוח מאושר ופעיל</div>`}
  `;
}

function techInput(id, label, val, dir='rtl') {
  return `<div>
    <div style="font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">${label}</div>
    <input id="tech_${id}" type="text" value="${val}" dir="${dir}" placeholder="${label}"
      style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;font-family:monospace;font-size:.82rem">
  </div>`;
}

async function saveTechFields(id) {
  const fields = {
    cardcom_terminal:   document.getElementById('tech_cardcom_terminal').value.trim(),
    cardcom_username:   document.getElementById('tech_cardcom_username').value.trim(),
    green_api_instance: document.getElementById('tech_green_api_instance').value.trim(),
    green_api_token:    document.getElementById('tech_green_api_token').value.trim(),
  };
  try {
    await api('PATCH', `/vendor/onboarding/${id}`, fields);
    if (_currentSession) Object.assign(_currentSession, fields);
    showToast('הגדרות טכניות נשמרו');
  } catch (err) { alert(err.message); }
}

async function toggleChecklist(id, key, done) {
  try {
    await api('PATCH', `/vendor/onboarding/${id}/checklist`, { key, done });
    if (_currentSession) {
      _currentSession.checklist = (_currentSession.checklist || []).map(i =>
        i.key === key ? { ...i, done } : i
      );
    }
  } catch (err) { alert(err.message); }
}

async function approveOnboarding(id) {
  const s = _currentSession;
  const missing = [];
  if (!s?.green_api_instance) missing.push('Green API Instance ID');
  if (!s?.green_api_token)    missing.push('Green API Token');
  if (missing.length) {
    alert(`שדות חובה חסרים לפני אישור:\n• ${missing.join('\n• ')}\n\nשמור את ההגדרות הטכניות תחילה.`);
    return;
  }
  if (!confirm('לאשר את הלקוח ולסמן אותו כפעיל?')) return;
  try {
    await api('POST', `/vendor/onboarding/${id}/approve`);
    showToast('הלקוח אושר ומסומן כפעיל');
    closeSessionModal();
  } catch (err) { alert(err.message); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Show vendor name in sidebar
api('GET', '/settings').then(s => {
  const el = document.getElementById('vendorNameDisplay');
  if (el && s.vendor_name) el.textContent = s.vendor_name;
}).catch(() => {});

refreshDashboard();
