# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**פיצה דליבריס (Jasell)** — a WhatsApp pizza ordering bot with a web management dashboard. Built as a platform (Jasell) that can serve multiple restaurant businesses (tenants).

- **Customer bot:** AI-powered WhatsApp conversation (Claude) acts as a waiter → deal-breakers first (delivery/payment) → takes order → Cardcom payment → confirms
- **Admin bot:** Same WhatsApp instance — if sender phone is in `admin_users` table, routed to `admin-handler.js` instead of customer bot
- **Public menu page:** `/menu.html` — mobile-first customer-facing menu with photos, toppings, WhatsApp CTA
- **Business dashboard:** `/dashboard.html` — SPA for admin/manager roles — orders, products, customers, settings, stats
- **Vendor portal:** `/admin` — separate SPA for the platform owner (vendor role) — client management, KPIs, alert settings
- **Courier notifications:** Auto-WhatsApp to courier(s) when order reaches configured status
- **Vendor alerts:** Real-time WhatsApp alerts to vendor on server errors, payment failures, restarts

**Stack:** Node.js + Express · Supabase (PostgreSQL) · Render (hosting) · Green API (WhatsApp) · Anthropic Claude `claude-opus-4-7` · Cardcom (Israeli payment processor)

**Live:**
- Dashboard + bot: `https://www.jasell.com` (jasell.com → 301 → www)
- Public menu: `https://www.jasell.com/menu.html`
- Vendor portal: `https://www.jasell.com/admin`
- Webhook: `https://www.jasell.com/webhook`
- GitHub: `git@github.com:monkemoney/pizzabot.git`
- Render service ID: `srv-d831jc8js32c73ef8mng`
- Render owner ID: `tea-cuppja5umphs73ea2qe0`
- Render API key: `rnd_aymW3XEYR53CgqhIR5PgqDvP7Q97`
- Fallback URL: `https://pizzabot-jasell.onrender.com` (still works — do NOT change this)

---

## Environment Variables

```env
PORT=3000
PUBLIC_URL=https://www.jasell.com

# Green API — customer + admin WhatsApp bot (same instance)
GREEN_API_INSTANCE_ID=7105619659
GREEN_API_TOKEN=ba8c5d2471a3458fb65bff54f108023965e01a7afb644344aa
GREEN_API_BASE_URL=https://api.green-api.com

# Supabase
SUPABASE_URL=https://umoftdmutxhrbknowbyh.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtb2Z0ZG11dHhocmJrbm93YnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODc1NDUyMSwiZXhwIjoyMDk0MzMwNTIxfQ.N0hk2fdeRJQC0yGWehAuSRqFv4Oluu-N19zzcorm_wk
SUPABASE_DB_PASSWORD=mUprot-tefno8-zikgak   # direct pg access (Render only — IPv6)

# Anthropic  (real value in .env.production — never commit the actual key)
ANTHROPIC_API_KEY=sk-ant-api03-...  # get from .env.production or Render dashboard

# Cardcom payments — TEST account
CARDCOM_API_URL=https://secure.cardcom.solutions
CARDCOM_TERMINAL=1000          # ← TERMINAL NUMBER (NOT CompanyId 040617649)
CARDCOM_USERNAME=CardTest1994  # ApiName for JSON API v11

# Push notifications (VAPID)
VAPID_PUBLIC_KEY=BM-j1EvpL7QoX1HcNaYpWDaHdjIQsNtEwwGbBdhFFd_a2FIlEOVtDAyxm8SN-8yFomMC_jsqpnDh8c4FvGrtNpk
VAPID_PRIVATE_KEY=A5G6P2JTHYA77V85yrbqVJ_t1V_MvJceyQx_rJ36wDY
VAPID_EMAIL=mailto:admin@jasell.com

# Dashboard auth — three roles
ADMIN_SECRET=jasell-admin-2026
DASHBOARD_ADMIN_PASSWORD=admin2026
DASHBOARD_MANAGER_PASSWORD=manager2026
DASHBOARD_VENDOR_PASSWORD=jasell-vendor-2026   # platform owner
JWT_SECRET=pizzabot-jwt-secret-2026-change-in-prod

# Tenant isolation
TENANT_ID=aaaaaaaa-0000-0000-0000-000000000001  # default; override per deployment for multi-tenant
```

**Supabase DB credentials:**
```
Host:         db.umoftdmutxhrbknowbyh.supabase.co:5432  ← IPv6 only
User:         postgres
Password:     mUprot-tefno8-zikgak
SQL Editor:   https://supabase.com/dashboard/project/umoftdmutxhrbknowbyh/sql/new
Direct pg:    DOES NOT WORK — both local and Render (free tier) get ENETUNREACH on IPv6
```

**Cardcom test login:** `https://secure.cardcom.solutions/LogInNew.aspx`
- Username: `CardTest1994` / Password: `Terminaltest2026`
- Terminal `1000` = test terminal · CompanyId `040617649` = unrelated

**Green API:** Connected to WhatsApp +1 (470) 746-4602 · Instance `7105619659`

---

## Commands

```bash
npm start        # production
npm run dev      # nodemon watch

# Schema changes — two options:
#   A) Supabase SQL Editor (always works): https://supabase.com/dashboard/project/umoftdmutxhrbknowbyh/sql/new
#   B) startup migration in index.js via pg (runs on Render, not locally — IPv6 only)

# Env var backup/restore (ALWAYS before infra changes)
node scripts/backup-render-env.js   # pulls from Render → .env.production
node scripts/sync-render-env.js     # pushes .env.production → Render

# Fetch Render runtime logs
curl -s "https://api.render.com/v1/logs?resource=srv-d831jc8js32c73ef8mng&ownerId=tea-cuppja5umphs73ea2qe0&limit=200" \
  -H "Authorization: Bearer rnd_aymW3XEYR53CgqhIR5PgqDvP7Q97" | python3 -c "
import sys,json; data=json.load(sys.stdin)
logs=data if isinstance(data,list) else data.get('logs',data.get('data',[]))
[print(l.get('timestamp','')[-12:], l.get('message','')) for l in logs]
" | tail -100

# Syntax check before every push (MANDATORY)
node --check public/app.js
node --check public/admin.js

# Deploy (auto on push)
git push origin main
```

---

## Folder Structure

```
pizza-bot/
├── src/
│   ├── index.js                  # Express server, webhook entry, startup migrations
│   ├── bot/
│   │   ├── handler.js            # Thin re-export of ai-handler
│   │   ├── ai-handler.js         # Customer bot: dispute handler, stale-session guard, Claude, ACTIONs
│   │   ├── admin-handler.js      # Admin bot: Claude with live state, dispatches ADMIN: ACTION blocks
│   │   ├── prompts.js            # Customer system prompt — waiter flow, deal-breakers, delivery zones
│   │   └── menu.js               # Legacy static menu helpers (mostly unused)
│   ├── services/
│   │   ├── claude.js             # Anthropic SDK wrapper, prompt caching
│   │   ├── greenapi.js           # sendMessage, sendToppingsPoll
│   │   ├── supabase.js           # All DB functions (sessions, orders, pending_payments)
│   │   ├── cardcom.js            # Cardcom JSON API v11 — createPaymentPage; verifyPayment is no-op
│   │   ├── push-notifier.js      # Web Push (VAPID) — saveSubscription, notifyNewOrder
│   │   ├── settings.js           # Live settings from DB with 60s cache; isOpen() uses Asia/Jerusalem TZ
│   │   ├── menu-service.js       # Live products from DB with 60s cache
│   │   ├── status-notifier.js    # Customer + courier WhatsApp notifications on status change
│   │   └── vendor-alerts.js      # Throttled WhatsApp alerts to vendor (errors, payments, restart)
│   ├── routes/
│   │   ├── dashboard-api.js      # All /api/* endpoints — tenant-scoped orders, vendor routes, etc.
│   │   ├── payment.js            # POST /webhook/payment + GET /payment/success (embeds rv= in URL)
│   │   ├── admin.js              # Legacy /admin/orders (backwards compat)
│   │   └── business-bot.js       # POST /webhook/business (not yet active)
│   └── middleware/
│       └── auth.js               # HMAC-SHA256 sign/verify, signDashboard(), requireAuth/Admin/Vendor
├── public/
│   ├── index.html                # Login page — routes vendor→/admin, others→/dashboard.html
│   ├── dashboard.html            # Business dashboard SPA (admin + manager roles)
│   ├── app.js                    # Business dashboard JS
│   ├── admin.html                # Vendor portal SPA (vendor role only)
│   ├── admin.js                  # Vendor portal JS
│   ├── menu.html                 # Public customer menu
│   └── sw.js                     # Service Worker for push notifications
├── supabase/
│   └── schema.sql                # Full DB schema, safe to re-run
├── scripts/
│   ├── backup-render-env.js
│   ├── sync-render-env.js
│   └── render-guard.sh
├── .claude/settings.json
├── .env.production               # Gitignored
└── CLAUDE.md
```

---

## Architecture

### URL Routing

```
GET  /              → index.html (login page)
GET  /dashboard.html → business SPA (admin/manager); vendor role redirected to /admin
GET  /admin         → admin.html (vendor-only SPA); non-vendor redirected to /
GET  /menu.html     → public menu (no auth)
POST /webhook       → WhatsApp webhook (customer + admin bot)
/api/*              → dashboard-api.js (auth required)
```

**Login redirect logic (index.html → app.js):**
```
POST /api/auth/login → { token, role }
  role === 'vendor'  → /admin
  role === 'admin' | 'manager' → /dashboard.html
```

### Auth & Tenant Isolation (auth.js)

```
signDashboard(username, role):
  → sign({ username, role, tenant_id: DEFAULT_TENANT_ID, exp: +24h })

requireAuth: verifies HMAC token, attaches req.user (incl. tenant_id fallback)
requireAdmin: requireAuth + role ∈ {admin, vendor}
requireVendor: requireAuth + role === 'vendor'

DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001'
```

All order queries in dashboard-api.js are scoped with `.eq('tenant_id', tid(req))`.
All order mutations use `assertTenant(row, req)` before writing.

### Webhook Routing (index.js)

```
Incoming WhatsApp message (POST /webhook)
  → formatPhone(sender)
  → getAdminUser(phone) — checks admin_users table
    → found: handleAdminMessage(phone, text, adminUser)  [admin-handler.js]
    → not found: handleMessage(phone, text)               [ai-handler.js]
```

Admin sessions stored with `admin:` prefix in sessions table (separate from customer sessions).

### Customer Message Flow

```
ai-handler.js handleMessage(phone, text):
  0. pending_dispute in session? → handleDisputeResponse()
  1. isOpen() — Asia/Jerusalem TZ
  2. Stale-session guard — reset if age > 3h or has old-flow markers
  3. 15-min edit window check
  4. buildSystemPrompt() — live menu + delivery_zones + settings
  5. callClaude() — claude-opus-4-7, history ≤40 msgs, system prompt cached
  6. Parse + strip ACTION blocks → send clean text to customer
  7. Dispatch: SHOW_TOPPINGS | SAVE_ORDER | CREATE_PAYMENT | RESET
```

### Admin Bot (admin-handler.js)

Triggered when sender phone is in `admin_users` table. Same Green API instance.

**System prompt includes live state:**
- Restaurant status (is_open, delivery/pickup/payment)
- Full product list with availability per item and topping
- All active orders (not done/cancelled)

**ADMIN: ACTION blocks Claude can emit:**

| Action | Example trigger | Effect |
|--------|----------------|--------|
| `SET_AVAILABLE` | "נגמרה בולגרית" / "חזרה X" | Sets product or topping `is_available`, invalidates cache |
| `ORDER_STATUS` | "הזמנה 1042 בהכנה" | Updates status + notifies customer |
| `CANCEL_ORDER` | "בטל הזמנה 1042 — נגמרה פיצה" | Cancels + optional customer notify |
| `DISPUTE` | "פתח מחלוקת 1042 — חסרה בולגרית" | Opens dispute, sends 1/2/3 to customer |
| `SET` | "סגור הזמנות" / "פתח" | Toggles is_open / delivery / payment settings |
| `UPDATE_PRICE` | "עדכן פיצה משפחתית ל-65" | Updates product price, invalidates cache |
| `LIST_ORDERS` | "מה ההזמנות?" | Returns active orders summary |

`reset` / `אפס` clears admin session history.

### Vendor Portal (/admin — admin.html + admin.js)

Separate SPA for the platform owner. Auth guard: `role !== 'vendor'` → redirect to `/`.

**Pages:**
- **סקירה כללית:** KPI cards (active clients, total clients, total orders, total revenue, sessions) + recent clients table. Pulls from `GET /api/vendor/stats` and `GET /api/vendor/clients`.
- **לקוחות:** Full CRUD table — add client (name/phone/plan/notes), update status inline via `<select>`, delete. Uses `GET/POST/PATCH/DELETE /api/vendor/clients`.
- **התראות:** WhatsApp phone input, alert toggle checkboxes (errors/payments/restarts), test alert button. Uses `PATCH /api/vendor/settings` and `POST /api/vendor/alerts-test`.

**Vendor API routes (all require `requireVendor`):**
```
GET    /api/vendor/clients        → all clients
POST   /api/vendor/clients        → create client
PATCH  /api/vendor/clients/:id    → update status/plan/notes
DELETE /api/vendor/clients/:id    → remove client
GET    /api/vendor/stats          → cross-client KPIs
PATCH  /api/vendor/settings       → vendor_phone, alert prefs
POST   /api/vendor/alerts-test    → send test WhatsApp
```

### Vendor Alerts (vendor-alerts.js)

Real-time WhatsApp alerts to vendor on system events.

- **Throttle:** max one alert per type per 5 minutes
- **Phone source:** `settings` table key `vendor_phone` (cached, invalidated on PATCH /vendor/settings)
- **Hooks:** `uncaughtException`, `unhandledRejection`, Express error middleware, `ai-handler.js` Claude errors

| Alert type | Trigger |
|-----------|---------|
| `server_error` | uncaughtException / unhandledRejection / Express 500 |
| `bot_error` | Claude API failure per customer |
| `payment_failed` | Cardcom verification failure |
| `restart` | Server startup (every deploy) |
| `low_balance` | Green API balance warning |

### Courier Notification Flow

```
PATCH /orders/:id/status
  → assertTenant(order, req)
  → updateOrderStatus()
  → notifyStatusChange(phone, status, lang, orderNumber, order)
      → sends customer WhatsApp (status message)
      → loads settings: courier_notify_enabled, courier_notify_on_status, couriers[]
      → if status === courier_notify_on_status:
          for each courier in couriers[]:
            sends WhatsApp with full order details
```

**Settings keys for couriers:**
- `courier_notify_enabled` (bool) — master toggle
- `courier_notify_on_status` (string) — `'preparing'` | `'out_for_delivery'` | `'new'`
- `couriers` (array) — `[{ name, phone }]`

Configured in Settings page → "שליחים" section.

### Dispute Flow (Missing Item)

```
Dashboard: ⚠️ button → modal with checkboxes (items + per-item toppings)
  → POST /api/orders/:id/item-dispute { disputes: [{type,name,price,qty}] }
  → order.dispute_status = 'pending'
  → session.pending_dispute = { order_id, items[], refund, created_at }
  → WhatsApp to customer: 1=cancel | 2=continue without | 3=replace

Bot intercepts next message (before isOpen check):
  1 → cancel order
  2 → remove items/toppings, recalculate total
  3 → awaiting_replacement → customer writes → Claude handles replacement
```

### Cancel + Refund Flow

```
Dashboard: ✕ button → modal:
  - Radio: יוזמת העסק | בקשת הלקוח (→ cancelled_by in DB)
  - Reason textarea (→ cancel_reason in DB)
  - "Send to customer" toggle (controls whether reason is in WhatsApp)
  - Editable WhatsApp preview (auto-generates, stops auto-sync on manual edit)
  - ↺ Reset regenerates preview from fields
  - custom_message sent if preview was edited

POST /api/orders/:id/cancel-refund:
  - assertTenant check first
  - cancelDeal(order.cardcom_deal_number) from cardcom.js
      → has deal number: calls CancelDeal.aspx → refund_status='refunded'
      → no deal number:  refund_status='manual' (order confirmed via redirect/polling, not webhook)
  - Always sends WhatsApp to customer

refund_status='manual' → red indicator in dashboard:
  - Summary row: "💳 זיכוי ידני" badge under status
  - Expanded panel: red bar with direct link to Cardcom portal
  - Actions area: "💳 זיכוי ידני נדרש ↗" clickable badge
  - Mobile card: full-width red bar at bottom
```

### Cardcom Payment Flow

```
1. CREATE_PAYMENT → POST /api/v11/LowProfile/Create
   SuccessRedirectUrl = .../payment/success?rv=PB-XXXX
2. pending_payments saved, URL sent to customer
3a. IndicatorUrl POST → confirmPending(pending, 'webhook', dealNumber)
      extracts: DealNumber || InternalDealNumber || CardcomDealNumber
      saveOrder saves cardcom_deal_number → enables auto-refund later
3b. /payment/success?rv= → confirmPending(pending, 'success-redirect', null)
      no dealNumber from redirect — cardcom_deal_number stays null
3c. Polling every 2 min — confirmPending(pending, 'poll', null)
      no dealNumber — cardcom_deal_number stays null

NOTE: GetLowProfileIndicatorData = 404. verifyPayment() = no-op.
NOTE: auto-refund only works when order confirmed via webhook (has dealNumber).
      redirect/polling confirmations → refund_status='manual' on cancellation.
```

### Products — Always-Visible Topping Toggles

Each product row shows toppings as clickable chips (green=available, red=אזל) **without needing to expand**. Click = `toggleAddition()` instant update. "✏️ עריכה" opens the edit panel with name/price/image/delete.

### Settings — Always Live (60s cache)

All loaded from `settings` table (key/value JSONB). Keys:
`is_open`, `delivery_enabled`, `pickup_enabled`, `payment_cash`, `payment_credit`,
`delivery_price`, `delivery_cities`, `delivery_zones[]`, `business_hours`,
`pickup_address`, `business_name`, `bot_url`,
`couriers[]`, `courier_notify_enabled`, `courier_notify_on_status`,
`allow_order_edits`, `edit_time_limit`,
`vendor_phone`, `vendor_name`, `vendor_alert_error`, `vendor_alert_payment`, `vendor_alert_restart`

**`delivery_zones` vs `delivery_cities`:** Bot reads `delivery_zones` first. `saveZones()` auto-syncs `delivery_cities`.

---

## Database Schema

```sql
categories         -- emoji, name_he, name_en, is_topping_addon, has_toppings, sort_order
products           -- name_he, name_en, price, description, image_url, category_id, is_available
product_additions  -- per-product toppings, FK → products CASCADE, is_available
settings           -- key/value JSONB (all app + vendor settings)
sessions           -- per-phone (customer: phone, admin: 'admin:phone'):
                   --   conversation_history, pending_order, pending_dispute, customer_profile
pending_payments   -- Cardcom: phone, cardcom_code, return_value, order_data, expires_at
push_subscriptions -- endpoint, p256dh, auth, user_agent
admin_users        -- phone (unique, normalised), name, role ('admin'|'manager'), created_at
orders             -- order_number (seq 1000+), items JSONB, status, payment_method, payment_status,
                   -- cardcom_code, cardcom_deal_number, refund_status,
                   -- cancelled_by, cancel_reason, dispute_status, dispute_item,
                   -- destination_type, courier_notes,
                   -- tenant_id UUID (DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001')
customers          -- VIEW over orders
clients            -- platform clients: name, contact_phone, plan, status, notes
                   -- plan: 'trial'|'basic'|'pro'|'enterprise'
                   -- status: 'active'|'trial'|'inactive'
```

**Order status:** `new → preparing → out_for_delivery → delivered → done` (auto 1h) | `cancelled`
**Dispute status:** `pending` → `resolved` (cancelled | removed | replaced | continued)

---

## What's Built

### ✅ Working
- Customer waiter-mode bot: deal-breakers first, cart management, delivery zones from DB
- Admin management bot: same WhatsApp instance, natural Hebrew commands, live state
- Courier notifications: auto-WhatsApp on status change with full order details
- Admin users management: Settings page → table of admins (phone, name, role, add, delete)
- Always-visible topping availability toggles in products page
- Credit payment: Cardcom v11, success-redirect rv=, 5-min polling fallback
- Cash payment: direct save
- Dispute flow: multi-item/topping checkbox, bot handles 1/2/3 responses
- Cancel + refund: editable WhatsApp preview, `cancelDeal()` auto-refund via Cardcom
- `cardcom_deal_number` saved from IndicatorUrl webhook → enables auto-refund
- Red manual-refund indicator in dashboard when `refund_status='manual'` (4 locations)
- Expandable order rows with full details + actions inline
- Stats page: 7 Chart.js charts
- Push notifications: VAPID + Service Worker
- Image upload to Supabase Storage (menu-images bucket)
- Export orders CSV (UTF-8 BOM)
- Receipt popup
- Mobile: burger menu, order cards, responsive modals
- Public menu `/menu.html`
- **Vendor portal** `/admin`: isolated SPA for platform owner — client CRUD, KPI dashboard, alert settings
- **Vendor alerts**: real-time throttled WhatsApp alerts for errors/payments/restarts
- `assertTenant()` soft guard on all order mutation endpoints

### ❌ Missing / needs work
| Item | Notes |
|------|-------|
| Cardcom production | Test terminal 1000 — switch to prod terminal before go-live |
| Cardcom auto-refund blind spot | Orders confirmed via success-redirect or polling have no `cardcom_deal_number` → manual refund |
| No test suite | Zero automated tests |
| Bit / Paybox | Settings toggles only |
| Multi-tenant full isolation | deferred — one deployment per client (model A) for now |

---

## Operational Rules

1. **Backup before infra change:** `node scripts/backup-render-env.js`
2. **Schema changes — only one option that works:**
   - Supabase SQL editor: `https://supabase.com/dashboard/project/umoftdmutxhrbknowbyh/sql/new`
   - Direct `pg` connection fails everywhere (local and Render free tier both get ENETUNREACH on IPv6)
3. **Always run** `node --check public/app.js && node --check public/admin.js` before committing
4. **Every desktop UI change must include mobile** — check `window.innerWidth <= 768` branches
5. **delivery_zones** is authoritative; `saveZones()` syncs `delivery_cities`; bot reads zones first
6. **Admin users added via dashboard Settings** → "מנהלי וואצפ" section, stored in `admin_users` table
7. **Vendor portal** is at `/admin` (admin.html + admin.js) — completely separate from business dashboard; any change to one does NOT affect the other
8. **Always update CLAUDE.md** when architecture changes

---

## Known Issues & Lessons Learned

### Supabase DB is IPv6-only — pg fails everywhere (local AND Render)
`db.umoftdmutxhrbknowbyh.supabase.co` resolves to IPv6 only. Local machine times out. Render free tier also gets `ENETUNREACH` — it has no outbound IPv6 route. **The only working option for schema changes is the Supabase SQL editor in the browser.**

### Supabase pooler (Supavisor) — credentials don't work locally either
`aws-0-[region].pooler.supabase.com` returns "Tenant or user not found" for this project. Don't try the pooler. Use the SQL editor or the Render startup migration.

### admin_users table must be created via SQL editor
No pg access locally. Created via Supabase SQL editor. All new tables must be created the same way (or via startup migration).

### Admin bot routing — same instance, no second Green API needed
`getAdminUser(phone)` checks `admin_users` table. If found, routes to `admin-handler.js`. Admin sessions use `admin:` prefix in the sessions table so they don't mix with customer sessions. The check is non-blocking (Promise chain after `res.sendStatus(200)`).

### Vendor portal is fully isolated from business dashboard
- `admin.html` + `admin.js` are vendor-only. No shared JS with `app.js`.
- Login page routes: `role === 'vendor'` → `/admin`; others → `/dashboard.html`.
- `app.js` has a guard: if `role === 'vendor'` on load → redirect to `/admin`.
- vendor tab was removed from dashboard.html entirely.

### requireAdmin also passes vendor role
`requireAdmin` allows both `admin` and `vendor` roles (vendor is a superset). This lets the vendor portal call most business endpoints. `requireVendor` is strictly vendor-only.

### tenant_id on orders — must be added via Supabase SQL editor
Startup migration via `pg` in `index.js` was tried but fails — Render free tier has no IPv6 outbound. Run this once in the SQL editor:
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE orders SET tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
```
Until this runs, all order API calls return empty (`.eq('tenant_id', ...)` on a missing column → error).

### assertTenant() is a soft check — only enforces when column exists
`assertTenant(row, req)` returns `true` if `row.tenant_id` is null/undefined. Designed for forward compatibility: works before migration (passes everything) and after (enforces isolation).

### notifyStatusChange() needs full order object for courier messages
The function signature is `notifyStatusChange(phone, status, lang, orderNumber, order)`. The 5th param `order` is needed to build the courier WhatsApp message. Dashboard API's `PATCH /orders/:id/status` passes the full order object. Other callers (admin-handler, payment.js) should also pass it when available.

### Cardcom GetLowProfileIndicatorData = 404
Verified 2026-05. No v11 JSON verification endpoint exists. `verifyPayment()` returns `success:true` immediately. Confirmation via: IndicatorUrl POST (preferred — sends `DealNumber`), success-redirect `?rv=`, 5-min polling.

### cardcom_deal_number only available from IndicatorUrl POST
`DealNumber` (also `InternalDealNumber`, `CardcomDealNumber`) comes only in the Cardcom IndicatorUrl webhook POST. Success-redirect and polling do not carry it. Orders confirmed via redirect/polling will have `cardcom_deal_number=null` and cannot be auto-refunded — `refund_status` is set to `'manual'` and a red indicator appears in the dashboard.

### cancelDeal() lives in cardcom.js
`cancelDeal(dealNumber)` posts to `CancelDeal.aspx` (form-encoded, not JSON v11). Returns `{ success, message }`. Called from cancel-refund handler in dashboard-api.js. If `dealNumber` is null, returns `{ success: false }` immediately.

### Cardcom success redirect doesn't pass params
Test terminal doesn't append params to SuccessRedirectUrl. Fix: embed `ReturnValue` in the URL itself as `?rv=PB-XXXX`.

### delivery_zones ignored by bot — was hardcoded "תל אביב only"
`prompts.js` now reads `delivery_zones`, builds dynamic cities + fees. `saveZones()` syncs `delivery_cities`.

### isOpen() used UTC not Israel time
Fix: `new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })`.

### Toppings poll fired on free-text orders with toppings specified
Iron rule in `prompts.js`: any topping keyword in the *current message* → skip SHOW_TOPPINGS.

### Stale sessions after deploys
Sessions > 3h old or containing old-flow markers reset via stale-session guard in `ai-handler.js`.

### page-stats outside .main — invisible
All `page-*` divs must be inside `.main`. `display:none` + JS toggling only works inside the layout wrapper. Applies to both dashboard.html and admin.html.

### Cancel button hidden — order was "done"
Button hidden for `['cancelled','done']` — intentional. Shows for `new`, `preparing`, `out_for_delivery`, `delivered`.

### Green API monthly quota
Test instance limited to 3 whitelisted numbers. HTTP 466 for others. Fix: upgrade to Business at console.green-api.com.

### Missing backtick crashes dashboard silently
Run `node --check public/app.js` and `node --check public/admin.js` before every push. All tabs stay `display:none` if JS fails to load.

### SVG doesn't print in popup windows
Receipt HTML uses plain-text characters (₪, →), never SVG.

### Cancel modal — editable preview
`_previewEdited` flag stops auto-sync once user edits preview. `↺ אפס` resets. Backend receives `custom_message` and uses it verbatim.

### Dispute — backwards compat
API accepts `disputes[]` (new, multi-item) or `item_name`+`item_price` (old, single). `handleDisputeResponse()` supports both formats.

### CARDCOM_TERMINAL ≠ CompanyId
`040617649` = CompanyId. Test terminal = `1000`.

### ANTHROPIC_API_KEY lost after Render recreation
Always `backup-render-env.js` first. render-guard hook enforces.

### Poll webhook fires on every vote change
Filter: process only when `✅ confirm` is voted. Intermediate votes ignored.

### Vendor alerts throttle — 5 min cooldown per type
`_alertCooldowns` is in-memory. Resets on server restart. On deploy, restart alert fires immediately; subsequent error alerts within 5 min are suppressed.
