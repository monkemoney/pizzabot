'use strict';

// ─── Auth guard ───────────────────────────────────────────────────────────────

const token    = localStorage.getItem('token');
const role     = localStorage.getItem('role');
const username = localStorage.getItem('username');

if (!token || role !== 'vendor') {
  localStorage.clear();
  window.location.href = '/';
}

/**
 * The vendor portal's date locale.
 *
 * `he-IL` was written into four render calls, so a vendor reading the portal in
 * English still got Hebrew month names and d/m/y dates. The portal is the
 * PLATFORM's own screen, not a client's, so it follows the operator's chosen
 * dashboard language — not any tenant's region. One definition; a literal
 * repeated at each call site is how the four drifted apart in the first place.
 */
const VLOCALE = (typeof LANG !== 'undefined' && LANG === 'en') ? 'en-US' : 'he-IL';

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
  if (name === 'kpi')         loadKpi();
  if (name === 'brain')      loadBrain();
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  const bottomOffset = window.innerWidth <= 768 ? '80px' : '28px';
  t.style.cssText = `position:fixed;bottom:${bottomOffset};left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 24px;border-radius:50px;font-weight:700;font-size:.88rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.25)`;
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
      card('סה"כ לקוחות',    stats.total_clients,  'var(--text)') +
      card('סה"כ הזמנות',    stats.total_orders,   'var(--text)') +
      card('הכנסות כוללות',  `₪${(stats.total_revenue||0).toFixed(0)}`, '#16a34a') +
      card('שיחות פתוחות',   stats.total_sessions, 'var(--text)');

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
              <td><span class="badge" style="background:#f0f0f0;color:#555">${c.plan}</span></td>
              <td><span class="badge badge-${c.status}">${{active:'פעיל',trial:'ניסיון',inactive:'מושבת'}[c.status]||c.status}</span></td>
              <td style="font-size:.78rem;color:#9b8fc0">${new Date(c.created_at).toLocaleDateString(VLOCALE)}</td>
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
        <th>עלות</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td style="font-weight:700">${fmtMonth(r.month)}</td>
          <td style="font-family:monospace;font-size:.75rem;direction:ltr;color:#9b8fc0">${r.tenant_id.slice(0,8)}…</td>
          <td>${r.calls}</td>
          <td style="font-size:.82rem;color:#555">${fmt(r.input)}</td>
          <td style="font-size:.82rem;color:#555">${fmt(r.output)}</td>
          <td style="font-size:.82rem;color:#555">${fmt(r.cache_read)}</td>
          <td style="font-weight:700;color:var(--text)">${fmtCost(r.cost_usd)}</td>
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

// ─── KPI (ביצועים) ────────────────────────────────────────────────────────────

let _kpiInit = false;

const KPI_ICONS = {
  orders:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  revenue:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  recovered:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 2 16 8 22 8"/><line x1="23" y1="1" x2="16" y2="8"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  saved:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  inbox:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  gauge:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>',
  shield:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  coin:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9.5A3.5 3.5 0 0 0 9 12a3.5 3.5 0 0 0 6 2.5"/></svg>',
};

// ── Shared card/row templates (used by the KPI and Bot Brain pages) ──────────
const kpiCard = (icon, tone, value, label, sub) => `
  <div class="kpi-card">
    <div class="kpi-icon ${tone}">${KPI_ICONS[icon] || ''}</div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-label">${label}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;

const funnelRow = (label, value, base, color) => {
  const pct = base > 0 ? Math.round((value / base) * 100) : 0;
  return `
    <div class="funnel-row">
      <div class="funnel-head"><span style="font-weight:600">${label}</span><span style="font-weight:800">${value}</span></div>
      <div class="funnel-track"><div class="funnel-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
};

const kv = (label, value) =>
  `<div class="kv-row"><span class="kv-label">${label}</span><span class="kv-value">${value}</span></div>`;

async function loadKpi() {
  const sel   = document.getElementById('kpiClient');
  const month = document.getElementById('kpiMonth');
  const body  = document.getElementById('kpiBody');

  if (!_kpiInit) {
    if (!_clients.length) {
      try { _clients = await api('GET', '/vendor/clients'); } catch { _clients = []; }
    }
    const tenants = _clients.filter(c => c.tenant_id);
    // The pilot's live data sits on the default tenant (env creds), which no
    // client row points to — always offer it so the main numbers are reachable.
    const DEFAULT_TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';
    const options = tenants.map(c => `<option value="${c.tenant_id}">${c.name}</option>`);
    if (!tenants.some(c => c.tenant_id === DEFAULT_TENANT)) {
      options.push(`<option value="${DEFAULT_TENANT}">הטנאנט הראשי (פיילוט)</option>`);
    }
    sel.innerHTML = '<option value="">בחר לקוח…</option>' + options.join('');
    if (tenants.length === 1) sel.value = tenants[0].tenant_id;
    if (!month.value) {
      month.value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).slice(0, 7);
    }
    _kpiInit = true;
  }

  if (!sel.value) {
    body.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem">בחר לקוח כדי לראות מדדים</div>';
    return;
  }

  body.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem">טוען מדדים…</div>';
  let k;
  try {
    k = await api('GET', `/vendor/kpi/${sel.value}?month=${month.value}`);
  } catch (err) {
    body.innerHTML = `<div style="color:#e0004d;font-size:.85rem">${err.message}</div>`;
    return;
  }

  const r = k.recovery, o = k.orders, ops = k.operations;
  const skippedTotal = Object.values(r.skipped || {}).reduce((s, n) => s + n, 0);

  body.innerHTML = `
    <div class="kpi-grid">
      ${kpiCard('orders', '', o.count, 'הזמנות החודש', o.cancelled ? `${o.cancelled} בוטלו` : '')}
      ${kpiCard('revenue', 'green', `₪${o.revenue_paid.toLocaleString()}`, 'הכנסות (שולם)',
                o.revenue_pending ? `₪${o.revenue_pending.toLocaleString()} ממתין לתשלום` : '')}
      ${kpiCard('recovered', 'brand', `₪${r.revenue_recovered.toLocaleString()}`, 'שוחזר משיחות שפוספסו',
                `${r.orders_recovered} הזמנות מ-${r.sent} הודעות שחזור`)}
      ${kpiCard('saved', 'amber', `₪${k.commission_saved.amount.toLocaleString()}`, 'עמלות שנחסכו (אומדן)',
                `לפי ${Math.round(k.commission_saved.rate * 100)}% עמלת אפליקציות משלוח`)}
    </div>

    <div class="kpi-two">
      <div class="card" style="padding:24px 26px">
        <div style="font-size:.9rem;font-weight:800;margin-bottom:18px">משפך שחזור שיחות</div>
        ${r.calls_total === 0
          ? '<div style="color:var(--text-muted);font-size:.84rem">אין אירועי שיחות החודש</div>'
          : funnelRow('שיחות נכנסות', r.calls_total, r.calls_total, 'var(--color-border)')
          + funnelRow('לא נענו', r.missed, r.calls_total, '#c07000')
          + funnelRow('הודעת שחזור נשלחה', r.sent, r.calls_total, 'var(--primary)')
          + funnelRow('הלקוח הגיב', r.responded, r.calls_total, 'var(--primary)')
          + funnelRow('הבשילו להזמנה', r.orders_recovered, r.calls_total, '#008043')}
        ${skippedTotal || r.send_failed ? `
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);font-size:.74rem;color:var(--text-muted)">
            ${skippedTotal ? `לא נשלחו: ${r.skipped.throttled} חוזרות · ${r.skipped.closed} מחוץ לשעות · ${r.skipped.admin + r.skipped.courier + r.skipped.forward} צוות · ${r.skipped.opted_out} הוסרו · ${r.skipped.unusable} מספר חסוי` : ''}
            ${r.send_failed ? `<div style="color:#e0004d;font-weight:700;margin-top:4px">⚠ ${r.send_failed} שליחות נכשלו</div>` : ''}
          </div>` : ''}
      </div>

      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="card" style="padding:24px 26px">
          <div style="font-size:.9rem;font-weight:800;margin-bottom:10px">תפעול</div>
          ${kv('זמן אישור הזמנה (חציון)', ops.accept_median_min != null ? `${ops.accept_median_min} דק'` : '—')}
          ${kv('זמן אישור (p95)', ops.accept_p95_min != null ? `${ops.accept_p95_min} דק'` : '—')}
          ${kv('הגיעו לתזכורת (אסקלציה)', ops.escalated)}
          ${kv('שיחות שהועברו לנציג', ops.handoffs)}
          ${kv('לקוחות חדשים / חוזרים', `${o.new_customers} / ${o.returning_customers}`)}
        </div>
        <div class="card" style="padding:24px 26px">
          <div style="font-size:.9rem;font-weight:800;margin-bottom:10px">עלויות</div>
          ${kv('Claude API', `$${k.costs.claude_usd.toFixed(2)}`)}
          ${kv('קריאות מודל', k.costs.claude_calls)}
          <div style="margin-top:10px;font-size:.72rem;color:var(--text-muted)">לא כולל עלויות Meta / DIDWW / תשתית</div>
        </div>
      </div>
    </div>`;
}

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
          <td><span class="badge" style="background:#f0f0f0;color:#555">${PLAN_LABELS[c.plan]||c.plan}</span></td>
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
          <td style="font-size:.78rem;color:#9b8fc0">${new Date(c.created_at).toLocaleDateString(VLOCALE)}</td>
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
          <button onclick="waShareLink('${s.token}', '${(s.clients?.contact_phone || '').replace(/\D/g,'')}', '${(s.clients?.name || s.business_name || '').replace(/'/g,'')}')" class="btn btn-ghost btn-sm" title="שלח לינק בוואטסאפ">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            וואטסאפ
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
  document.getElementById('obRegion').value = 'IL';
  // Reset the rate with the region it belongs to — reopening after a US draft
  // otherwise leaves the field visible and pre-filled under an Israeli region.
  document.getElementById('obTaxRate').value = '';
  toggleObTaxRate();
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
      region:        document.getElementById('obRegion').value,
      tax_rate:      document.getElementById('obTaxRate').value.trim() || null,
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

// The rate field only means anything for a region that adds tax at checkout.
function toggleObTaxRate() {
  const isUS = document.getElementById('obRegion').value === 'US';
  document.getElementById('obTaxRateGroup').style.display = isUS ? '' : 'none';
}

function copyOnboardingLink() {
  const val = document.getElementById('obLinkInput').value;
  navigator.clipboard.writeText(val).then(() => showToast('לינק הועתק'));
}

// Open WhatsApp with a ready-made onboarding message. Phone may be empty —
// wa.me then opens with just the text and the vendor picks the contact.
function waShareLink(token, phone, name) {
  const link = `${location.origin}/onboarding/${token}`;
  const ilPhone = phone && phone.startsWith('0') ? '972' + phone.slice(1) : phone;
  const msg = `היי${name ? ' ' + name : ''}! כדי להקים את הבוט של העסק שלך ב-Jasell, מלאו את הפרטים כאן (לוקח כ-5 דקות):\n${link}`;
  const url = ilPhone
    ? `https://wa.me/${ilPhone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function copyLink(token) {
  const link = `${location.origin}/onboarding/${token}`;
  navigator.clipboard.writeText(link).then(() => showToast('לינק הועתק'));
}

// ── Session details modal ─────────────────────────────────────────────────────

let _currentSession = null;

async function openSessionModal(id) {
  _obStep = 1; // always start from step 1
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

// Current wizard step (1 = client info, 2 = tech fields)
let _obStep = 1;

function renderSessionModal() {
  const s = _currentSession;
  const body = document.getElementById('sessionModalBody');
  const isApproved = s.status === 'approved';
  const step1Done  = s.status !== 'pending_client'; // client submitted their form
  const step2Done  = _hasChannelCreds(s);

  // ── Stepper ───────────────────────────────────────────────────────────────
  const stepperHtml = `
    <div style="display:flex;align-items:center;gap:0;margin-bottom:24px;border-radius:10px;overflow:hidden;border:1.5px solid var(--border)">
      ${_stepBtn(1, 'שלב 1', 'מידע לקוח', step1Done)}
      <div style="width:1px;background:var(--border);align-self:stretch"></div>
      ${_stepBtn(2, 'שלב 2', 'הגדרות טכניות', step2Done)}
    </div>`;

  if (isApproved) {
    // The password is shown once, at approval. When it gets lost — closed modal,
    // failed WhatsApp — this is the way back in, rather than hand-written SQL.
    body.innerHTML = stepperHtml +
      `<div style="background:#e0fbef;border-radius:12px;padding:20px;text-align:center;font-size:.9rem;font-weight:700;color:#16a34a;margin-bottom:16px">
        הלקוח מאושר ופעיל
       </div>
       <div style="border:1px solid var(--border);border-radius:12px;padding:16px">
         <div style="font-weight:700;font-size:.88rem;margin-bottom:4px">פרטי כניסה לדשבורד</div>
         <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px">
           שם משתמש: <strong style="font-family:monospace">${s.approved_username || '—'}</strong><br>
           הסיסמא מוצגת פעם אחת בלבד. אם היא אבדה — הנפק סיסמא חדשה והיא תישלח ללקוח בוואטסאפ.
         </div>
         <button onclick="resetClientCredentials('${s.id}')" class="btn btn-outline btn-sm">הנפק סיסמא חדשה</button>
       </div>`;
    return;
  }

  body.innerHTML = stepperHtml + (_obStep === 1
    ? _renderStep1(s, step1Done)
    : _renderStep2(s, step1Done, step2Done)
  );

  // live approve-button gate when on step 2
  if (_obStep === 2) _watchTechFields(s.id);
}

function _stepBtn(n, label, sub, done) {
  const active = _obStep === n;
  const bg     = active ? 'var(--color-brand-soft,#ede8fd)' : '#fff';
  const col    = active ? 'var(--color-brand,#5e17eb)' : (done ? '#16a34a' : 'var(--text-muted)');
  const badge  = done
    ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#16a34a;color:#fff;margin-left:6px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>'
    : `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;border:1.5px solid currentColor;font-size:.7rem;font-weight:700;margin-left:6px">${n}</span>`;
  return `
    <button onclick="_obStep=${n};renderSessionModal()"
      style="flex:1;padding:12px 10px;background:${bg};border:none;cursor:pointer;text-align:center;color:${col};transition:background .15s">
      <div style="display:flex;align-items:center;justify-content:center;gap:4px;font-size:.8rem;font-weight:700">${badge}${label}</div>
      <div style="font-size:.7rem;margin-top:2px;opacity:.75">${sub}</div>
    </button>`;
}

function _renderStep1(s, step1Done) {
  const row = (label, val) => val
    ? `<div style="display:flex;gap:8px;font-size:.84rem;padding:7px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--text-muted);flex-shrink:0;min-width:130px">${label}</span>
        <span style="font-weight:600;direction:ltr;text-align:right;flex:1">${val}</span>
       </div>`
    : '';

  const zonesSummary  = (s.delivery_zones || []).map(z => `${z.city} ₪${z.fee}`).join(' · ') || '—';
  const adminsSummary = (s.admin_phones  || []).map(a => a.name || a.phone).join(', ') || '—';
  const hoursSummary  = s.business_hours
    ? Object.entries(s.business_hours).filter(([,h]) => h.is_open !== false).length + ' ימים פתוחים'
    : '—';

  const statusBadge = step1Done
    ? `<span style="background:#e0fbef;border:1px solid #86efac;color:#16a34a;border-radius:50px;padding:3px 12px;font-size:.75rem;font-weight:700">הלקוח מילא <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`
    : `<span style="background:#fff8e0;border:1px solid #fcd34d;color:#c07000;border-radius:50px;padding:3px 12px;font-size:.75rem;font-weight:700">ממתין ללקוח</span>`;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em">פרטי עסק</div>
      ${statusBadge}
    </div>
    <div style="margin-bottom:24px">
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
    ${s.menu_notes ? `
    <div style="margin-bottom:24px">
      <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">התפריט שהלקוח שלח</div>
      <div style="background:var(--color-bg,#eeede9);border:1px solid var(--border);border-radius:10px;padding:12px 14px;font-size:.82rem;white-space:pre-wrap;max-height:220px;overflow-y:auto">${s.menu_notes.replace(/</g,'&lt;')}</div>
    </div>` : ''}
    <button onclick="_obStep=2;renderSessionModal()" class="btn btn-primary" style="width:100%">
      הבא: הגדרות טכניות →
    </button>`;
}

function _renderStep2(s, step1Done, step2Done) {
  const tenantId = s.clients?.tenant_id || '';
  const checklistHtml = (s.checklist || []).map(item => `
    <label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer;font-size:.84rem">
      <input type="checkbox" ${item.done?'checked':''} style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;flex-shrink:0"
        onchange="toggleChecklist('${s.id}','${item.key}',this.checked)">
      <span style="${item.done?'text-decoration:line-through;color:var(--text-muted)':''}">${item.label}</span>
    </label>`).join('');

  const canApprove = step1Done && step2Done;

  return `
    <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px">הגדרות טכניות</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px" id="techFields">
      <div style="font-size:.72rem;color:var(--text-muted);padding:2px 0">WhatsApp רשמי (Meta Cloud API) — מומלץ. צור WABA + מספר במטא והדבק כאן</div>
      ${techInput('meta_phone_number_id', 'Meta Phone Number ID', s.meta_phone_number_id || '', 'ltr')}
      ${techInput('meta_access_token',    'Meta Access Token',    s.meta_access_token    || '', 'ltr')}
      ${techInput('meta_waba_id',         'Meta WABA ID',         s.meta_waba_id         || '', 'ltr')}
      <div style="font-size:.72rem;color:var(--text-muted);padding:6px 0 2px;border-top:1px solid var(--border);margin-top:4px">או Green API (לא רשמי — fallback בלבד)</div>
      ${techInput('green_api_instance', 'Green API Instance ID', s.green_api_instance || '', 'ltr')}
      ${techInput('green_api_token',    'Green API Token',       s.green_api_token    || '', 'ltr')}
      <div style="font-size:.72rem;color:var(--text-muted);padding:6px 0 2px;border-top:1px solid var(--border);margin-top:4px">Cardcom — מתקבל מנציג Cardcom לאחר הרשמת הלקוח</div>
      ${techInput('cardcom_terminal',   'Cardcom Terminal Number',  s.cardcom_terminal   || '', 'ltr')}
      ${techInput('cardcom_username',   'Cardcom Secret (ApiName)', s.cardcom_username   || '', 'ltr')}
      <div>
        <div style="font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">Tenant ID</div>
        <div style="display:flex;align-items:center;gap:8px">
          <input readonly value="${tenantId || '—'}" dir="ltr"
            style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;font-family:monospace;font-size:.82rem;background:#fafafa;color:var(--text-muted)">
          <button type="button" onclick="navigator.clipboard.writeText('${tenantId}').then(()=>showToast('הועתק'))"
            class="btn btn-ghost btn-sm" style="flex-shrink:0">העתק</button>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:24px">
      <button onclick="saveTechFields('${s.id}')" class="btn btn-ghost btn-sm">שמור</button>
    </div>

    <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">צ'קליסט</div>
    <div style="margin-bottom:24px">${checklistHtml}</div>

    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button onclick="_obStep=1;renderSessionModal()" class="btn btn-ghost btn-sm">← חזור</button>
      <button id="approveBtn" onclick="approveOnboarding('${s.id}')"
        class="btn btn-primary btn-sm" style="flex:1;background:#16a34a;border-color:#16a34a;${!canApprove?'opacity:.45;pointer-events:none;cursor:default':''}"
        ${!canApprove ? 'disabled' : ''}>
        ${!step1Done ? 'ממתין ללקוח — לא ניתן לאשר' : !step2Done ? 'מלא פרטי Meta או Green API תחילה' : 'אשר לקוח'}
      </button>
    </div>
    ${!canApprove && step1Done ? '<div style="font-size:.72rem;color:var(--text-muted);margin-top:8px;text-align:center">* שמור פרטי Meta (Phone Number ID + Token) או Green API כדי להפעיל את כפתור האישור</div>' : ''}`;
}

function techInput(id, label, val, dir='rtl') {
  return `<div>
    <div style="font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">${label}</div>
    <input id="tech_${id}" type="text" value="${val}" dir="${dir}" placeholder="${label}" oninput="_updateApproveBtn()"
      style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;font-family:monospace;font-size:.82rem">
  </div>`;
}

function _watchTechFields(id) {
  // inputs already fire _updateApproveBtn via oninput
}

// A tenant is connectable when it has either official Meta Cloud API creds
// (recommended) or legacy Green API creds (fallback).
function _hasChannelCreds(s) {
  return !!((s.meta_phone_number_id && s.meta_access_token) ||
            (s.green_api_instance && s.green_api_token));
}

function _updateApproveBtn() {
  const btn = document.getElementById('approveBtn');
  if (!btn) return;
  const s = _currentSession;
  const live = {
    meta_phone_number_id: document.getElementById('tech_meta_phone_number_id')?.value.trim(),
    meta_access_token:    document.getElementById('tech_meta_access_token')?.value.trim(),
    green_api_instance:   document.getElementById('tech_green_api_instance')?.value.trim(),
    green_api_token:      document.getElementById('tech_green_api_token')?.value.trim(),
  };
  const step1Done = s?.status !== 'pending_client';
  const canApprove = step1Done && _hasChannelCreds(live);
  btn.disabled = !canApprove;
  btn.style.opacity = canApprove ? '1' : '.45';
  btn.style.pointerEvents = canApprove ? '' : 'none';
  btn.textContent = !step1Done ? 'ממתין ללקוח — לא ניתן לאשר'
    : !canApprove ? 'מלא פרטי Meta או Green API תחילה'
    : 'אשר לקוח';
}

async function saveTechFields(id) {
  const fields = {
    meta_phone_number_id: document.getElementById('tech_meta_phone_number_id')?.value.trim() || '',
    meta_access_token:    document.getElementById('tech_meta_access_token')?.value.trim()    || '',
    meta_waba_id:         document.getElementById('tech_meta_waba_id')?.value.trim()         || '',
    green_api_instance: document.getElementById('tech_green_api_instance')?.value.trim() || '',
    green_api_token:    document.getElementById('tech_green_api_token')?.value.trim()    || '',
    cardcom_terminal:   document.getElementById('tech_cardcom_terminal')?.value.trim()   || '',
    cardcom_username:   document.getElementById('tech_cardcom_username')?.value.trim()   || '',
  };
  try {
    const resp = await api('PATCH', `/vendor/onboarding/${id}`, fields);
    if (_currentSession) Object.assign(_currentSession, fields);
    if (resp?.warning) {
      alert(`⚠️ ${resp.warning}`);
    } else {
      showToast('הגדרות טכניות נשמרו');
    }
    _updateApproveBtn();
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
  if (!confirm('לאשר את הלקוח? הפעולה תגדיר את כל הנתונים ותשלח ל-WhatsApp.')) return;
  const btn = document.getElementById('approveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'מפעיל...'; }
  try {
    const result = await api('POST', `/vendor/onboarding/${id}/approve`);
    closeSessionModal();
    _showCredentialsModal(result);
  } catch (err) {
    alert(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'אשר לקוח'; }
  }
}

async function resetClientCredentials(sessionId) {
  if (!confirm('להנפיק סיסמא חדשה ללקוח? הסיסמא הנוכחית תפסיק לעבוד מיד.')) return;
  try {
    const result = await api('POST', `/vendor/onboarding/${sessionId}/reset-credentials`, {});
    _showCredentialsModal({
      ...result,
      title: 'סיסמא חדשה הונפקה',
      credentialsDelivered: result.delivered,
      webhookUrl: '', tenantId: '',
    });
  } catch (err) {
    alert(err.message);
  }
}

function _showCredentialsModal(result) {
  const existing = document.getElementById('credentialsModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'credentialsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:1.1rem;font-weight:800;margin-bottom:4px;color:#16a34a">${result.title || 'הלקוח אושר בהצלחה!'}</div>
      <div style="font-size:.8rem;color:${result.credentialsDelivered === false ? '#b45309' : 'var(--text-muted)'};margin-bottom:20px">
        ${result.credentialsDelivered === false
          ? '⚠️ שליחת ההודעה ללקוח נכשלה — העבירו את הפרטים ידנית. הסיסמא לא תוצג שוב.'
          : 'הפרטים נשלחו ל-WhatsApp. שמור אותם גם כאן — הסיסמא לא תוצג שוב:'}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
        ${_credRow('שם משתמש', result.username)}
        ${_credRow('סיסמא', result.password)}
        ${_credRow('כתובת דשבורד', location.origin)}
        ${_credRow('Webhook URL', result.webhookUrl, 'חיבור ה-WhatsApp הוגדר אוטומטית')}
        ${_credRow('Tenant ID', result.tenantId, 'לשימוש עתידי בלבד')}
      </div>
      <button onclick="document.getElementById('credentialsModal').remove();loadOnboarding()"
        class="btn btn-primary" style="width:100%">סגור</button>
    </div>`;
  document.body.appendChild(modal);
}

function _credRow(label, value, note) {
  const safeVal = (value || '').replace(/'/g, "\\'");
  return `
    <div style="border:1.5px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px">${label}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:monospace;font-size:.85rem;flex:1;word-break:break-all">${value || ''}</span>
        <button type="button" onclick="navigator.clipboard.writeText('${safeVal}').then(()=>showToast('הועתק'))"
          class="btn btn-ghost btn-sm" style="flex-shrink:0;padding:4px 8px">העתק</button>
      </div>
      ${note ? '<div style="font-size:.7rem;color:var(--text-muted);margin-top:4px">' + note + '</div>' : ''}
    </div>`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Show vendor name in sidebar
api('GET', '/settings').then(s => {
  const el = document.getElementById('vendorNameDisplay');
  if (el && s.vendor_name) el.textContent = s.vendor_name;
}).catch(() => {});

refreshDashboard();


// ─── Bot Brain — the learning loop's control room ────────────────────────────
// Every insight the system proposes lands here with its evidence, and a
// decision is one click. Before this page the queue lived in a markdown file
// nobody opened, so proposals quietly expired.

function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const TYPE_LABEL = { lesson: 'לקח', code: 'קוד', setting: 'הגדרה', info: 'מידע' };

// Hand-rolled trend chart: no chart library in this codebase, and one polyline
// is cheaper than adding one.
function trendChart(runs, key, label, color) {
  const pts = runs.map((r) => (r.scores || {})[key]).map((v) => (typeof v === 'number' ? v : null));
  if (pts.filter((v) => v !== null).length < 2) return '';
  const W = 520, H = 120, PAD = 26;
  const vals = pts.filter((v) => v !== null);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 100);
  const x = (i) => PAD + (i * (W - PAD * 2)) / Math.max(1, pts.length - 1);
  const y = (v) => H - PAD - ((v - min) / Math.max(1, max - min)) * (H - PAD * 2);
  const poly = pts.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ');
  const dots = pts.map((v, i) => (v === null ? '' :
    `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${color}"><title>${v}</title></circle>`)).join('');
  const last = vals[vals.length - 1];
  return `
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:4px">
        <span style="font-weight:600">${label}</span><span style="font-weight:800;color:${color}">${last}</span>
      </div>
      <div class="trend-wrap"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:320px;height:120px">
        <polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        ${dots}
      </svg></div>
    </div>`;
}

function insightCard(it) {
  const thin = (it.metrics && it.metrics.sample_size != null && it.metrics.sample_size < 10);
  const open = it.status === 'proposed' || it.status === 'monitoring';
  return `
    <div class="insight-card" id="ins-${it.id}">
      <div class="insight-title">${esc(it.title)}</div>
      <div class="insight-meta">
        <span class="chip ${it.type}">${TYPE_LABEL[it.type] || it.type}</span>
        <span class="chip">${esc(it.source)}</span>
        <span class="chip">${new Date(it.created_at).toLocaleDateString(VLOCALE)}</span>
        ${it.metrics && it.metrics.sample_size != null
          ? `<span class="chip ${thin ? 'thin' : ''}">מדגם ${it.metrics.sample_size}${thin ? ' — קטן' : ''}</span>` : ''}
        ${!open ? `<span class="chip">${esc(it.status)}</span>` : ''}
      </div>
      ${it.evidence ? `<div class="insight-body"><b>ראיות:</b> ${esc(it.evidence)}</div>` : ''}
      ${it.proposal ? `<div class="insight-body" style="margin-top:6px"><b>הצעה:</b> ${esc(it.proposal)}</div>` : ''}
      ${open ? `<div class="insight-actions">
        <button class="btn-approve" onclick="decideInsight('${it.id}','approve')">אשר</button>
        <button class="btn-reject" onclick="decideInsight('${it.id}','reject')">דחה</button>
      </div>` : ''}
    </div>`;
}

async function decideInsight(id, action) {
  const card = document.getElementById('ins-' + id);
  try {
    await api('PATCH', `/vendor/brain/insights/${id}`, { action });
    showToast(action === 'approve' ? 'אושר' : 'נדחה');
    if (card) card.remove();
    loadBrain();
  } catch (err) { alert(err.message); }
}

async function loadBrain() {
  const body = document.getElementById('brainBody');
  body.innerHTML = '<div class="empty-note">טוען…</div>';
  try {
    const [ov, insights, trends, funnel, lessons] = await Promise.all([
      api('GET', '/vendor/brain/overview'),
      api('GET', '/vendor/brain/insights?status=proposed'),
      api('GET', '/vendor/brain/trends'),
      api('GET', '/vendor/brain/funnel?days=7'),
      api('GET', '/vendor/brain/lessons'),
    ]);

    // Pending count on the nav, so a decision is visible without opening the page.
    const badge = document.getElementById('brainNavBadge');
    if (badge) {
      badge.textContent = ov.pending_insights || '';
      badge.style.display = ov.pending_insights ? 'inline-block' : 'none';
    }

    // Staleness: a run that never reported is the failure mode this whole page exists to expose.
    const lr = ov.last_run;
    let banner;
    if (!lr) {
      banner = `<div class="stale-banner stale-bad">אף ריצת בדיקה לא נרשמה עדיין.</div>`;
    } else {
      const when = new Date(lr.run_at).toLocaleString(VLOCALE, { dateStyle: 'short', timeStyle: 'short' });
      const days = ov.staleness_days;
      const cls = lr.status === 'failed' ? 'stale-bad' : days > 8 ? 'stale-warn' : 'stale-ok';
      const statusHe = lr.status === 'completed' ? `הושלמה — ${lr.verdict || '—'}`
        : lr.status === 'failed' ? 'נכשלה' : 'רצה כעת';
      banner = `<div class="stale-banner ${cls}">ריצה אחרונה: ${when} · ${statusHe}${days > 8 ? ` · לפני ${days} ימים — ישן` : ''}</div>`;
    }

    const scores = (lr && lr.scores) || {};
    const cards = `
      <div class="kpi-grid">
        ${kpiCard('inbox', 'brand', ov.pending_insights, 'ממתינות להחלטה', ov.approved_insights ? `${ov.approved_insights} אושרו וממתינות למימוש` : '')}
        ${kpiCard('gauge', '', scores.replay != null ? scores.replay : '—', 'ציון על שיחות אמיתיות', scores.synthetic != null ? `סינתטי ${scores.synthetic}` : '')}
        ${kpiCard('shield', 'green', scores.autonomy_pct != null ? scores.autonomy_pct + '%' : '—', 'אוטונומיה במקביליות', scores.p95_ms ? `p95 ${scores.p95_ms}ms` : '')}
        ${kpiCard('coin', 'amber', `$${(ov.cost_today_usd || 0).toFixed(2)}`, 'עלות Claude היום', ov.handoffs_pending ? `${ov.handoffs_pending} שיחות אצל נציג` : '')}
      </div>`;

    const queue = `
      <div class="card" style="padding:20px 22px;margin-bottom:20px">
        <div style="font-weight:800;margin-bottom:14px">תור החלטות</div>
        ${insights.length ? insights.map(insightCard).join('') : '<div class="empty-note">אין תובנות ממתינות.</div>'}
      </div>`;

    const trendsHtml = `
      <div class="card" style="padding:20px 22px;margin-bottom:20px">
        <div style="font-weight:800;margin-bottom:14px">מגמות (${trends.length} ריצות)</div>
        ${trends.length >= 2
          ? trendChart(trends, 'replay', 'שיחות אמיתיות', '#5e17eb') +
            trendChart(trends, 'synthetic', 'סינתטי', '#2563eb') +
            trendChart(trends, 'autonomy_pct', 'אוטונומיה %', '#008043')
          : '<div class="empty-note">צריך לפחות שתי ריצות שהושלמו כדי להציג מגמה.</div>'}
      </div>`;

    const funnelHtml = `
      <div class="card" style="padding:20px 22px">
        <div style="font-weight:800;margin-bottom:14px">משפך — 7 ימים</div>
        ${funnel.length ? funnel.map((f) => `
          <div style="margin-bottom:18px">
            <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:8px">${esc(f.tenant.slice(0, 8))}</div>
            ${funnelRow('שיחות', f.conversations, f.conversations, '#94a3b8')}
            ${funnelRow('הזמנות', f.orders, f.conversations, '#5e17eb')}
            ${funnelRow('הושלמו / פעילות', f.completedOrActive, f.conversations, '#008043')}
            ${f.cancelled ? funnelRow('בוטלו', f.cancelled, f.conversations, '#ef4444') : ''}
            <div style="margin-top:10px">
              ${kv('המרה', f.conversionPct + '%')}
              ${kv('חציון זמן אישור', f.medianAcceptMin != null ? f.medianAcceptMin + ' דק׳' : '—')}
              ${kv('ממוצע הזמנה', '₪' + f.avgOrder)}
              ${kv('שביעות רצון', f.csatAvg != null ? `${f.csatAvg}/5 (${f.csatCount} דירוגים)` : 'אין דירוגים עדיין')}
            </div>
          </div>`).join('') : '<div class="empty-note">אין נתונים בחלון.</div>'}
      </div>`;

    const active = (lessons.lessons || []).filter((l) => l.active);
    const off = (lessons.lessons || []).filter((l) => !l.active);
    const lessonRow = (l) => `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
        <input type="checkbox" ${l.active ? 'checked' : ''} onchange="toggleLesson('${l.id}', this.checked)"
               style="margin-top:3px;width:15px;height:15px;flex-shrink:0;cursor:pointer">
        <div style="min-width:0">
          <div style="font-size:.84rem;color:${l.active ? 'var(--text)' : 'var(--text-muted)'};line-height:1.5">${esc(l.text)}</div>
          ${l.note ? `<div style="font-size:.7rem;color:var(--text-muted);margin-top:3px">${esc(l.note)}</div>` : ''}
        </div>
      </div>`;

    const lessonsHtml = `
      <div class="card" style="padding:20px 22px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <div style="font-weight:800">לקחים פעילים בבוט (${active.length})</div>
          <span class="chip ${lessons.enabled ? '' : 'thin'}">${lessons.enabled ? 'הזרקה פעילה' : 'הזרקה כבויה'}</span>
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">
          כיבוי לקח משפיע על הבוט החי תוך כדקה — בלי פריסה.
        </div>
        ${active.map(lessonRow).join('')}
        ${off.length ? `<div style="font-weight:700;font-size:.8rem;color:var(--text-muted);margin-top:16px;margin-bottom:4px">כבויים (${off.length})</div>${off.map(lessonRow).join('')}` : ''}
        ${!(lessons.lessons || []).length ? '<div class="empty-note">אין לקחים.</div>' : ''}
      </div>`;

    body.innerHTML = banner + cards + queue + lessonsHtml + trendsHtml + funnelHtml;
  } catch (err) {
    body.innerHTML = `<div class="stale-banner stale-bad">שגיאה בטעינה: ${esc(err.message)}</div>`;
  }
}

async function toggleLesson(id, active) {
  try {
    await api('PATCH', `/vendor/brain/lessons/${id}`, { active });
    showToast(active ? 'הלקח הופעל' : 'הלקח כובה');
    loadBrain();
  } catch (err) { alert(err.message); loadBrain(); }
}
