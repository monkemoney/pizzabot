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

# Dashboard auth — three roles  (all rotated 2026-05-26 — real values in .env.production / Render)
ADMIN_SECRET=<random base64url>
DASHBOARD_ADMIN_PASSWORD=<random>
DASHBOARD_MANAGER_PASSWORD=<random>
DASHBOARD_VENDOR_PASSWORD=<random>
JWT_SECRET=<96-char random hex>

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

**Green API:** Connected to WhatsApp +1 (323) 774-8500 · Instance `7105619659`

---

## Commands

```bash
npm start        # production
npm run dev      # nodemon watch

# Schema changes — preferred: Supabase Management API (runs from local, no browser needed)
curl -s -X POST "https://api.supabase.com/v1/projects/umoftdmutxhrbknowbyh/database/query" \
  -H "Authorization: Bearer <SUPABASE_MGMT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL here>"}'
# Returns [] on success (DDL), rows array on SELECT.
# Fallback: Supabase SQL Editor: https://supabase.com/dashboard/project/umoftdmutxhrbknowbyh/sql/new
# Avoid: startup migration via pg in index.js (Render free tier has no IPv6 outbound)

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
│   │   ├── settings.js           # Live settings from DB with 60s cache; isOpen()/isDeliveryOpen() use Asia/Jerusalem TZ
│   │   ├── menu-service.js       # Live products from DB with 60s cache
│   │   ├── status-notifier.js    # Customer + courier WhatsApp notifications on status change
│   │   ├── sse.js                # SSE broker — Map<tenantId, Set<res>>, broadcast(), subscribe()
│   │   └── vendor-alerts.js      # Throttled WhatsApp alerts to vendor (errors, payments, restart)
│   ├── routes/
│   │   ├── dashboard-api.js      # All /api/* endpoints — tenant-scoped orders, vendor routes, etc.
│   │   ├── payment.js            # POST /webhook/payment + GET /payment/success (embeds rv= in URL)
│   │   ├── admin.js              # Legacy /admin/orders (backwards compat)
│   │   └── business-bot.js       # POST /webhook/business (not yet active)
│   └── middleware/
│       └── auth.js               # HMAC-SHA256 sign/verify, signDashboard(), requireAuth/Admin/Vendor
├── public/
│   ├── index.html                # Login page — routes vendor→/admin, kitchen→/kitchen, others→/dashboard.html
│   ├── dashboard.html            # Business dashboard SPA (admin + manager roles)
│   ├── app.js                    # Business dashboard JS
│   ├── admin.html                # Vendor portal SPA (vendor role only)
│   ├── admin.js                  # Vendor portal JS
│   ├── kitchen.html              # Standalone kitchen SPA (kitchen role login)
│   ├── kitchen.js                # Kitchen SPA JS — SSE client, order feed
│   ├── menu.html                 # Public customer menu
│   └── sw.js                     # Service Worker for push notifications
├── supabase/
│   └── schema.sql                # Full DB schema, safe to re-run
├── scripts/
│   ├── backup-render-env.js
│   ├── sync-render-env.js
│   └── render-guard.sh
├── tests/
│   ├── auth.test.js              # sign/verify/signDashboard, requireAuth/Admin/Vendor, tenant isolation
│   ├── session-isolation.test.js # session key isolation by (phone, tenant_id), admin: prefix
│   ├── admin-bot.test.js         # all 7 ADMIN: ACTION blocks + reset command
│   ├── webhook-routing.test.js   # per-tenant routing, admin vs customer dispatch
│   ├── onboarding.test.js        # client GET/PATCH, vendor POST/GET/PATCH, auth enforcement
│   ├── payment-webhook.test.js   # confirmPending success/failure/idempotency, success-redirect
│   ├── audit-trail.test.js       # updated_at + updated_by='client'/'vendor' on every mutation
│   ├── settings.test.js          # isOpen() with Israel TZ, business hours
│   └── ai-handler.test.js        # stripAction, detectLang, parsePayload
├── .claude/settings.json
├── .env.production               # Gitignored
└── CLAUDE.md
```

---

## Architecture

### URL Routing

```
GET  /                    → index.html (login page)
GET  /dashboard.html      → business SPA (admin/manager); vendor role redirected to /admin
GET  /admin               → admin.html (vendor-only SPA); non-vendor redirected to /
GET  /kitchen             → kitchen.html (kitchen role SPA); also embedded tab in dashboard
GET  /menu.html           → public menu (no auth)
GET  /onboarding/:token   → onboarding.html (public, client-facing, no auth)
POST /webhook             → WhatsApp webhook — DEFAULT_TENANT_ID (backward compat)
POST /webhook/:tenantId   → WhatsApp webhook — per-tenant (Green API points here per client)
POST /webhook/payment     → Cardcom IndicatorUrl (handled by paymentRouter before :tenantId)
/api/*                    → dashboard-api.js (auth required)
```

**Express route ordering matters for `/webhook`:**
`app.use('/webhook', paymentRouter)` is registered first — runs for every `/webhook/*` request. paymentRouter only defines `/payment`, `/success`, `/failed` — anything else falls through via `next()`. So `POST /webhook/<uuid>` always reaches `app.post('/webhook/:tenantId', ...)` cleanly. Never reorder these registrations.

**Login redirect logic (index.html → app.js):**
```
POST /api/auth/login → { token, role }
  role === 'vendor'  → /admin
  role === 'admin' | 'manager' → /dashboard.html
```

### Auth & Tenant Isolation (auth.js)

```
signDashboard(username, role, tenantId):
  → sign({ username, role, tenant_id: tenantId, exp: +24h })

requireAuth: verifies HMAC token, attaches req.user (incl. tenant_id fallback)
requireAdmin: requireAuth + role ∈ {admin, vendor}
requireVendor: requireAuth + role === 'vendor'

DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001'
```

**Login flow (multi-tenant):**
1. Check `tenant_users` table by username → if found, use `tenantUser.tenant_id` in JWT
2. Fall back to env vars (`admin`/`manager`/`vendor`) → use `DEFAULT_TENANT_ID` in JWT

All order queries in dashboard-api.js are scoped with `.eq('tenant_id', tid(req))`.
All order mutations use `assertTenant(row, req)` before writing.

### Multi-Tenant System (built 2026-05-25)

All clients share one Render deployment under `jasell.com`. Isolated by `tenant_id` in every DB query.

**Tables with `tenant_id` column (default `aaaaaaaa-0000-0000-0000-000000000001`):**
`settings`, `sessions`, `categories`, `products`, `admin_users`, `orders`

**New table `tenant_users`:** per-tenant dashboard credentials — `tenant_id`, `username`, `password`, `role`

**Per-tenant services:**
- `settings.js` — `Map<tenantId, {data, time}>` cache; all queries filtered by `.eq('tenant_id', tenantId)`
- `menu-service.js` — same Map cache pattern
- `greenapi.js` — `_tenantCreds(tenantId)` reads `green_api_instance` + `green_api_token` from settings at runtime

**Provisioning on approve (`POST /vendor/onboarding/:id/approve`):**
1. Generate UUID tenant_id from `clients` row
2. Seed settings (business info, Green API creds, Cardcom creds, bot_url)
3. Copy menu from DEFAULT_TENANT_ID (categories → products → product_additions, remapping IDs)
4. Create `admin_users` from admin_phones
5. Auto-generate dashboard credentials → upsert into `tenant_users`
6. Call Green API `setSettings` → sets `webhookUrl = https://www.jasell.com/webhook/<tenant_id>`
7. Send WhatsApp to first admin phone with credentials
8. Mark `onboarding_sessions.status = 'approved'`, `clients.status = 'active'`
9. Return `{ username, password, webhookUrl, tenantId }` → show in credentials modal

**`getAdminUser(phone, tenantId)`** lives in `supabase.js` (not admin-handler.js). Called from `handleWebhook()` in index.js with the correct tenantId per route.

### Webhook Routing (index.js)

```
Incoming WhatsApp message (POST /webhook or POST /webhook/:tenantId)
  → handleWebhook(req, res, tenantId)
      → res.sendStatus(200)  ← immediate ack, Green API retries on non-200
      → formatPhone(sender)
      → getAdminUser(phone, tenantId) — checks admin_users filtered by tenant_id
          → found: handleAdminMessage(phone, text, adminUser, tenantId)  [admin-handler.js]
          → not found: handleMessage(phone, text, tenantId)               [ai-handler.js]
```

Admin sessions stored with `admin:` prefix in sessions table (separate from customer sessions).
All bot handlers receive `tenantId` and pass it to every service call — no cross-tenant leakage.

### Customer Message Flow

```
ai-handler.js handleMessage(phone, text):
  0. pending_dispute in session? → handleDisputeResponse()
  1. isOpen() — Asia/Jerusalem TZ
  2. Stale-session guard — reset if age > 3h or has old-flow markers
  3. Order edit/cancel window — see below
  4. buildSystemPrompt() — live menu + delivery_zones + settings
  5. callClaude() — claude-opus-4-7, history ≤40 msgs, system prompt cached
  6. Parse + strip ACTION blocks → send clean text to customer
  7. Dispatch: SHOW_TOPPINGS | SAVE_ORDER | CREATE_PAYMENT | RESET
```

### Order Edit/Cancel Window (Customer Self-Service)

Customer can change/cancel their own last order via WhatsApp only while it hasn't started preparing yet — **status-based, no time limit**:

```
ai-handler.js handleMessage(), when history.length === 0 (fresh conversation):
  1. getLastOrderByPhone(phone, tid)
  2. settings.get('allow_order_edits', tid) — master on/off toggle (default true)
  3. if lastOrder.status ∈ {'new', 'scheduled'} and edits allowed:
       - message contains cancel keyword (בטל/ביטול/לבטל/cancel/שנה/לשנות) → updateOrderStatus('cancelled'), reply, return
       - otherwise → reply "still cancellable, send בטל", return (skip Claude entirely)
  4. once status moves to 'preparing' (or beyond) → falls through to normal Claude flow, no edit offer
```

**Settings:** only `allow_order_edits` (bool) — the master toggle. No time-limit setting exists; the condition is purely the order's status.

**Why both `'new'` AND `'scheduled'` are checked:** scheduled orders never pass through `'new'` — `processScheduledOrders()` in `index.js` (runs every minute) transitions them directly `'scheduled' → 'preparing'` when within `prep_lead_time` minutes of the requested time. Checking only `'new'` would make scheduled orders impossible to self-cancel from the moment they're placed.

**Staff editing is unrestricted by design:** dashboard `PUT /orders/:id`, admin bot `ORDER_STATUS`/`CANCEL_ORDER` actions, and the dispute flow (`handleDisputeResponse`) all ignore `allow_order_edits` — that setting only gates the *customer's* self-service path. Staff can edit/cancel orders at any status.

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
| `CONFIRM_PAYMENT` | "קיבלתי Bit 1042" / "שילמו #1042" | Sets `payment_status='paid'`, notifies customer |

Pending Bit orders appear with `💳 ממתין לBit` in the order list inside the admin prompt, so the admin sees immediately which orders need confirmation.

`reset` / `אפס` clears admin session history.

### Vendor Portal (/admin — admin.html + admin.js)

Separate SPA for the platform owner. Auth guard: `role !== 'vendor'` → redirect to `/`.

**Pages:**
- **סקירה כללית:** KPI cards + recent clients table + Claude API cost table (last 6 months). Pulls from `GET /api/vendor/stats`, `GET /api/vendor/clients`, `GET /api/vendor/usage`.
- **לקוחות:** Full CRUD table with live search (name/phone/notes). Each row shows monthly API cost + call count from `api_usage` joined by `tenant_id`. Uses `GET/POST/PATCH/DELETE /api/vendor/clients`.
- **התראות:** WhatsApp phone input, alert toggle checkboxes (errors/payments/restarts), test alert button. Uses `PATCH /api/vendor/settings` and `POST /api/vendor/alerts-test`.
- **Mobile:** fully responsive — sidebar hidden on ≤768px, bottom nav + fixed header shown.

**Vendor API routes (all require `requireVendor`):**
```
GET    /api/vendor/clients                    → all clients + current-month usage (month_calls, month_cost)
POST   /api/vendor/clients                    → create client (tenant_id auto-generated)
PATCH  /api/vendor/clients/:id               → update status/plan/notes/tenant_id
DELETE /api/vendor/clients/:id               → remove client
GET    /api/vendor/stats                     → cross-client KPIs
GET    /api/vendor/usage                     → Claude API usage + cost per tenant per month (last 6 months)
PATCH  /api/vendor/settings                  → vendor_phone, alert prefs
POST   /api/vendor/alerts-test               → send test WhatsApp

# Onboarding
POST   /api/vendor/onboarding                → create client + session, return shareable link
GET    /api/vendor/onboarding                → list active sessions (pending_client + pending_vendor)
PATCH  /api/vendor/onboarding/:id            → save tech fields (Green API, Cardcom)
PATCH  /api/vendor/onboarding/:id/checklist  → toggle one checklist item
POST   /api/vendor/onboarding/:id/approve    → full provisioning (see Multi-Tenant section)

# Public (no auth)
GET    /api/onboarding/:token                → client fetches their session
PATCH  /api/onboarding/:token                → client submits their info → status: pending_vendor
```

**Onboarding 2-step wizard (admin.js):**
- Step 1 (client info): read-only display of what the client submitted + status badge. "הבא →" navigates to step 2.
- Step 2 (tech fields): vendor fills Green API Instance ID*, Green API Token*, Cardcom Terminal Number, Cardcom Secret (ApiName). Tenant ID shown read-only/copyable.
- Approve button: disabled until `step1Done` (client submitted) AND `step2Done` (instance + token saved).
- After approve: credentials modal shows username, password, dashboard URL, webhook URL, tenant ID — all copyable.

**Cardcom onboarding flow:**
- Client form: link "הירשם ל-Cardcom ↗" → `cardcom.co.il`. Explains that Cardcom rep will send credentials to Jasell after signup.
- Vendor step 2: enters Terminal Number + Secret (ApiName) received from Cardcom rep.
- These seed the tenant's settings as `cardcom_terminal` / `cardcom_username`.

### Vendor Alerts (vendor-alerts.js)

Real-time WhatsApp alerts to vendor on system events.

- **Throttle:** max one alert per type per 5 minutes
- **Phone source:** `settings` table key `vendor_phone` (cached, invalidated on PATCH /vendor/settings)
- **Hooks:** `uncaughtException`, `unhandledRejection`, Express error middleware, `ai-handler.js` Claude errors
- **Settings check:** before each alert, reads `vendor_alert_error` / `vendor_alert_payment` / `vendor_alert_restart` from DB — if `false`, alert is suppressed

| Alert type | Settings key | Trigger |
|-----------|-------------|---------|
| `server_error` | `vendor_alert_error` | uncaughtException / unhandledRejection / Express 500 |
| `bot_error` | `vendor_alert_error` | Claude API failure per customer |
| `payment_failed` | `vendor_alert_payment` | Cardcom verification failure |
| `restart` | `vendor_alert_restart` | Server startup (every deploy) |
| `low_balance` | — (always) | Green API balance warning |

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
`allow_order_edits`,
`vendor_phone`, `vendor_name`, `vendor_alert_error`, `vendor_alert_payment`, `vendor_alert_restart`

**`delivery_zones` vs `delivery_cities`:** Bot reads `delivery_zones` first. `saveZones()` auto-syncs `delivery_cities`.

---

## Database Schema

```sql
categories         -- emoji, name_he, name_en, is_topping_addon, has_toppings, sort_order
                   -- tenant_id UUID (DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001')
products           -- name_he, name_en, price, description, image_url, category_id, is_available
                   -- tenant_id UUID (DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001')
product_additions  -- per-product toppings, FK → products CASCADE, is_available
settings           -- key/value JSONB (all app + vendor settings)
                   -- tenant_id UUID (DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001')
                   -- UNIQUE(tenant_id, key)
sessions           -- per-phone (customer: phone, admin: 'admin:phone'):
                   --   conversation_history, pending_order, pending_dispute, customer_profile
                   -- tenant_id UUID (DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001')
                   -- UNIQUE(tenant_id, phone)
pending_payments   -- Cardcom: phone, cardcom_code, return_value, order_data, expires_at
                   -- tenant_id UUID (DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001') — real column (2026-05-26)
                   -- INDEX: idx_pending_payments_tenant
push_subscriptions -- endpoint, p256dh, auth, user_agent
admin_users        -- phone (unique per tenant), name, role ('admin'|'manager'), created_at
                   -- tenant_id UUID (DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001')
tenant_users       -- per-tenant dashboard credentials (created on approve)
                   -- tenant_id UUID, username TEXT, password TEXT (bcrypt hash), role TEXT
orders             -- order_number (seq 1000+), items JSONB, status, payment_method, payment_status,
                   -- cardcom_code, cardcom_deal_number, refund_status,
                   -- cancelled_by, cancel_reason, dispute_status, dispute_item,
                   -- destination_type, courier_notes,
                   -- status_history JSONB DEFAULT '[]' — [{status, at}] appended on every transition
                   -- tenant_id UUID (DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001')
                   -- INDEXES: idx_orders_tenant, idx_orders_tenant_status, idx_orders_tenant_created
                   -- CHECK: orders_status_check — new|preparing|ready|out_for_delivery|delivered|done|cancelled
customers          -- VIEW over orders
clients            -- platform clients: name, contact_phone, plan, status, notes, tenant_id
                   -- plan: 'trial'|'basic'|'pro'|'enterprise'
                   -- status: 'active'|'trial'|'inactive'
                   -- tenant_id: links to api_usage for cost tracking; auto-generated UUID per client
onboarding_sessions -- client onboarding state machine
                   -- client_id, token (UUID, shareable link), status ('pending_client'|'pending_vendor'|'approved')
                   -- business fields: business_name, bot_whatsapp, business_address, pickup_address,
                   --   delivery_enabled, pickup_enabled, payment_cash/credit/bit/paybox,
                   --   business_hours JSONB, delivery_zones JSONB, admin_phones TEXT[]
                   -- tech fields: green_api_instance, green_api_token, cardcom_terminal, cardcom_username
                   -- business fields also: bit_phone TEXT (seeded into settings on approve)
                   -- approval: approved_username, approved_password (bcrypt hash), webhook_url
                   -- audit: updated_at TIMESTAMPTZ, updated_by TEXT ('client'|'vendor')
                   -- expires_at, checklist JSONB
api_usage          -- Claude API token logging per call:
                   -- tenant_id, created_at, input_tokens, output_tokens,
                   -- cache_read_tokens, cache_write_tokens
                   -- Pricing (claude-opus-4-7): input=$15/MTok, output=$75/MTok, cache_read=$1.50/MTok
```

**Order status:** `new → preparing → ready → out_for_delivery → delivered → done` (auto 1h) | `cancelled`
- `ready`: chef marked done in kitchen window. Pickup orders → WhatsApp to customer. Delivery orders → silent.
- Kitchen window shows: `preparing` + `ready` only. `new` stays in dashboard until manager moves it.
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
- **Vendor portal mobile:** fully responsive — bottom nav, fixed header, single-column layout on ≤768px
- **Vendor alerts**: real-time throttled WhatsApp alerts — now respects DB settings (error/payment/restart toggles)
- **Client search:** live search in clients page (name, phone, notes)
- **Claude API usage tracking:** every `callClaude()` logs tokens to `api_usage` table (fire-and-forget)
- **Cost per client:** vendor dashboard shows monthly Claude cost + call count per client (joined by `tenant_id`)
- **API cost dashboard:** 6-month history table in vendor סקירה כללית (claude-opus-4-7 pricing)
- `assertTenant()` soft guard on all order mutation endpoints
- **Client onboarding flow:** vendor creates client → shareable link → client fills business details (step 1) → vendor fills Green API + Cardcom credentials (step 2) → approve provisions everything automatically. Table: `onboarding_sessions`. Public page: `/onboarding/:token`. Vendor portal page: "אונבורדינג" tab.
- **Multi-tenant platform (2026-05-25):** all clients under `jasell.com`, isolated by `tenant_id`. Per-tenant settings/menu/sessions/admin_users. `tenant_users` table for per-tenant credentials. Full provisioning on approve. Per-tenant webhook at `/webhook/:tenantId`.
- **Onboarding audit trail:** `onboarding_sessions.updated_at` + `updated_by` stamped on every client PATCH, vendor PATCH, checklist toggle, and approve.
- **Design token system:** `public/tokens.css` — single source of truth for all colors, spacing, radius, shadows, typography, icon sizes, layout constants, transitions
- **Icon system:** all UI emoji replaced with Lucide inline SVGs (`currentColor`, `stroke-width:1.75`). `SVG` object in `app.js` holds all icons; `S(path, size)` helper builds them. WhatsApp message emoji kept intentionally.
- **CSS variable aliasing:** old names (`--primary`, `--bg`, `--text-muted`, etc.) are aliases to new tokens — `var(--color-brand)`, `var(--color-bg)`, `var(--color-text-secondary)`. Change values only in `tokens.css`.
- **Bit payment flow:** bot emits `SAVE_ORDER` with `payment_method='bit'`, `payment_status='pending'`; sends customer Bit phone + amount; dashboard shows teal "ממתין לBit" badge + "אשר קבלת תשלום Bit" button → `POST /api/orders/:id/confirm-payment` sets `payment_status='paid'`. `bit_phone` stored in settings, shown/hidden in Settings page when Bit toggle is on.
- **Admin bot Bit confirmation:** `CONFIRM_PAYMENT` action in admin-handler.js — "קיבלתי Bit #1042" → sets `payment_status='paid'`, sends WhatsApp to customer. Bit-pending orders show `💳 ממתין לBit` in the admin prompt order list.
- **Comprehensive test suite (2026-05-25):** 96 tests across 9 files — auth, session isolation, all admin bot actions, webhook routing, onboarding flow (both sides), payment webhook, audit trail. `supertest` used for HTTP-level integration tests. `npm test -- --forceExit` is the run command.
- **Security hardening (2026-05-26):** JWT_SECRET + dashboard passwords rotated to random values. bcrypt hashing for `tenant_users.password`. Rate limiting on login (10/15min) and public onboarding endpoint (20/hr). Green API webhook instanceId verification. `_tenantCreds()` throws on missing credentials. tenant_id passed to `saveOrder()` from all payment confirmation paths. Session pruning job (90-day TTL, runs daily).
- **GDPR / privacy (2026-05-27):** `DELETE /api/customers/:phone` (requireAdmin) — deletes session row + anonymizes orders (phone→'deleted', customer_name→'[deleted]', address→'[deleted]', notes→null). First bot message appends italic privacy-policy link `_מדיניות הפרטיות: ${botUrl}/privacy.html_`. Public page: `public/privacy.html` (Hebrew, RTL, covers data collected, third parties, retention, rights, contact).
- **Delivery hours (2026-06-29):** `delivery_hours` settings key — same structure as `business_hours` (`{sun:{is_open,open,close},...}`). `isDeliveryOpen(tenantId)` in `settings.js` checks current IL time against today's window. Customer bot gates delivery on `isDeliveryOpen()`. Admin bot shows today's delivery hours in system prompt and supports `SET_DELIVERY_HOURS` action ("משלוח עד 22:00", "סגור משלוח היום"). Dashboard Settings page has "שעות משלוח" card.
- **Kitchen window (2026-06-29):** Tab in dashboard for admin/manager + standalone `/kitchen` route for `kitchen` role. Shows orders in `preparing` and `ready` status only (`new` stays in dashboard). Single vertical feed sorted oldest-first: order number, name, items+toppings, notes. "מוכן ✓" button → `ready`. SSE push — new orders appear instantly without polling. `GET /api/kitchen/orders`, `GET /api/sse` (token via `?token=` for EventSource). `requireKitchenOrAdmin` middleware. `status_history` JSONB column on orders — every status transition appended with timestamp.
- **`ready` status (2026-06-29):** Added between `preparing` and `out_for_delivery`. WhatsApp to customer on `ready` only for pickup orders (`delivery_method='pickup'`). Delivery orders: silent (out_for_delivery message covers it). `orders_status_check` DB constraint updated to include `ready`.
- **SSE broker (2026-06-29):** `src/services/sse.js` — `Map<tenantId, Set<res>>`, 25s keepalive ping. `broadcast(tenantId, event, data)` fires on `updateOrderStatus` and `saveOrder`. Events: `new_order`, `order_updated`.
- **Tenant isolation audit (2026-06-29):** Full audit of all DB queries and WhatsApp sends. 22 HIGH + 4 MEDIUM issues found and fixed. See "Tenant Isolation Rules" in Operational Rules.
- **Scheduled orders (2026-06-29):** Customer can request "לשעה 21:30" → bot saves `status='scheduled'`, `scheduled_for=ISO`. Scheduler in `index.js` (every 60s) moves orders to `preparing` when `scheduled_for - prep_lead_time <= now`. WhatsApp sent to customer. `prep_lead_time` setting (default 45 min, min 15, max 120) — configurable in dashboard Settings card "הזמנות מתוזמנות". Minimum scheduling distance enforced in ai-handler.js.
- **Customer bot — live state in system prompt (2026-06-29):** Every message rebuilds prompt with "מצב נוכחי" section: current IL time, is_open, today's business hours, delivery hours, delivery/pickup availability, payment methods. Bot answers questions about hours/status from this section only, not from training data.
- **Customer bot — business_name from settings (2026-06-29):** Both bots (customer + admin) now use `allSettings.business_name` instead of hardcoded "פיצה דליבריס". Every tenant's bot introduces itself with the correct business name.
- **Customer bot — mid-conversation availability check (2026-06-29):** Before every Claude call (when history > 0), ai-handler queries DB for unavailable `product_additions` of this tenant, checks if any were mentioned in customer messages. If yes → injects `⚠️ התראת מלאי` into system prompt. Bot must notify customer and cannot include unavailable items in SAVE_ORDER.
- **Customer bot — greeting with menu link (2026-06-29):** First message always includes `menuUrl` in the greeting template. Privacy notice only appended when Claude produced non-empty text; empty-text fallback greeting sent if Claude returns only an ACTION block.

### ❌ Missing / needs work
| Item | Notes |
|------|-------|
| Cardcom credentials | Per-tenant — each client provides their own via onboarding (cardcom_terminal + cardcom_username) |
| Cardcom auto-refund blind spot | Orders confirmed via success-redirect or polling have no `cardcom_deal_number` → manual refund |
| Paybox | Settings toggle only — no payment flow yet |
| UptimeRobot | Set up free monitor on `https://www.jasell.com/health` every 5 min |

---

## Operational Rules

1. **Backup before infra change:** `node scripts/backup-render-env.js`
2. **Schema changes — preferred: Supabase Management API** (curl from local, see Commands section). Fallback: SQL editor in browser. Never try direct `pg` (IPv6 fails everywhere).
3. **Always run** `node --check public/app.js && node --check public/admin.js` before committing
4. **Run tests:** `npm test -- --forceExit` — runs `tests/` with Jest. **96 tests** across 9 suites. Use `--forceExit` to avoid hanging on the `setInterval` poll timer.
5. **Every desktop UI change must include mobile** — check `window.innerWidth <= 768` branches
6. **delivery_zones** is authoritative; `saveZones()` syncs `delivery_cities`; bot reads zones first
7. **Admin users added via dashboard Settings** → "מנהלי וואצפ" section, stored in `admin_users` table
8. **Vendor portal** is at `/admin` (admin.html + admin.js) — completely separate from business dashboard; any change to one does NOT affect the other
9. **Always update CLAUDE.md** when architecture changes

---

## Tenant Isolation Rules — MANDATORY

כל שינוי קוד שנוגע ב-DB, WhatsApp, או settings חייב לעמוד ב-5 כללים אלו. דפוסים שגויים אלו גרמו ל-26 בעיות בביקורת 2026-06-29.

### כלל 1 — כל query על טבלה tenant-scoped חייב `.eq('tenant_id', tenantId)`

טבלאות tenant-scoped: `orders`, `products`, `categories`, `settings`, `sessions`, `admin_users`, `pending_payments`, `push_subscriptions`

```js
// ❌ אסור
supabase.from('orders').select('*')
supabase.from('products').insert({ name_he, price })

// ✅ חייב
supabase.from('orders').select('*').eq('tenant_id', tid(req))       // ב-routes
supabase.from('products').insert({ name_he, price, tenant_id: tid(req) })
supabase.from('orders').select('*').eq('tenant_id', tenantId)        // ב-services
```

`product_additions` אין לה `tenant_id` ישיר — מסננים לפי `product_id IN (רשימת IDs של הטנאנט)`.

### כלל 2 — כל `sendMessage()` חייב לקבל tenantId

```js
// ❌ אסור — שולח דרך Green API של DEFAULT_TENANT
await sendMessage(phone, text)

// ✅ חייב — שולח דרך ה-instance הנכון של הטנאנט
await sendMessage(phone, text, tenantId)
await sendMessage(order.phone, text, order.tenant_id)
```

### כלל 3 — כל `settings.loadAll()` / `settings.get()` / `settings.set()` חייב tenantId

```js
// ❌ אסור — קורא הגדרות של DEFAULT_TENANT_ID
await settings.loadAll()
await settings.get('is_open')

// ✅ חייב
await settings.loadAll(tenantId)
await settings.get('is_open', tenantId)
await settings.set('is_open', true, tenantId)
```

יוצא דופן: `vendor-alerts.js` תמיד משתמש ב-`DEFAULT_TENANT_ID` מפורש — vendor alerts הם platform-level.

### כלל 4 — כל פונקציית service חדשה חייבת לקבל `tenantId = DEFAULT_TENANT_ID`

```js
// ❌ אסור
async function getOrders(status) {
  return supabase.from('orders').select('*')...
}

// ✅ חייב
async function getOrders(status, tenantId = DEFAULT_TENANT_ID) {
  return supabase.from('orders').select('*').eq('tenant_id', tenantId)...
}
```

### כלל 5 — כל `notifyStatusChange()` חייב להעביר tenantId

```js
// ❌ אסור
await notifyStatusChange(order.phone, status, 'he', order.order_number, order)

// ✅ חייב
await notifyStatusChange(order.phone, status, 'he', order.order_number, order, tenantId)
// או
await notifyStatusChange(order.phone, status, 'he', order.order_number, order, order.tenant_id)
```

### Checklist לפני PR

לפני כל commit שנוגע ב-DB/WhatsApp/settings — בדוק:
- [ ] כל `supabase.from('TABLE')` על טבלה tenant-scoped כולל `.eq('tenant_id', ...)`
- [ ] כל `insert()` על טבלה tenant-scoped כולל `tenant_id` בשדות
- [ ] כל `sendMessage()` מעביר את ה-tenantId הנכון
- [ ] כל `settings.loadAll/get/set` מעביר tenantId
- [ ] כל פונקציה חדשה ב-supabase.js מקבלת `tenantId = DEFAULT_TENANT_ID`
- [ ] כל קריאה ל-`notifyStatusChange` מעבירה tenantId

---

## Known Issues & Lessons Learned

### Supabase Management API — run SQL from terminal (preferred)
`POST https://api.supabase.com/v1/projects/umoftdmutxhrbknowbyh/database/query` with a personal access token (`sbp_...`) from supabase.com/dashboard/account/tokens. Returns `[]` on DDL success. Works from local, no browser needed. Token saved in Claude memory (not in CLAUDE.md — GitHub blocks `sbp_` secrets). The old SQL editor still works as fallback.

### Supabase DB is IPv6-only — pg fails everywhere (local AND Render)
`db.umoftdmutxhrbknowbyh.supabase.co` resolves to IPv6 only. Local machine times out. Render free tier also gets `ENETUNREACH` — it has no outbound IPv6 route. Use the Management API or SQL editor instead — never direct `pg`.

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
- vendor tab was removed from dashboard.html entirely — nav button AND page content both deleted.

### requireAdmin also passes vendor role
`requireAdmin` allows both `admin` and `vendor` roles (vendor is a superset). This lets the vendor portal call most business endpoints. `requireVendor` is strictly vendor-only.

### Schema drift — DB can silently fall behind schema.sql
schema.sql is documentation, not auto-applied. Columns added only via `ALTER TABLE` in SQL editor or Management API. In one incident, 9 columns were in schema.sql but missing from the DB (cardcom_deal_number, refund_status, cancelled_by, cancel_reason, dispute_status, dispute_item, dispute_resolution, tenant_id, pending_dispute) — features silently failed. **Always verify new columns exist in DB after adding them to schema.sql.** Use: `SELECT column_name FROM information_schema.columns WHERE table_name='X' AND column_name='Y'`.

### tenant_id on orders — applied via Management API
Applied: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001'` + UPDATE + CREATE INDEX. All done. Until tenant_id existed, `.eq('tenant_id', ...)` queries returned empty (column missing = filter fails silently).

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

### Vendor alerts were firing regardless of settings
Bug: `alert()` in `vendor-alerts.js` never read the DB settings — sent unconditionally. Fixed: before sending, reads `vendor_alert_error` / `vendor_alert_payment` / `vendor_alert_restart` from `settings` table via `settings.get()`. If value is `false` or `'false'`, alert is suppressed.

### Supabase SQL editor 08P01 error on mobile
Running SQL from mobile browser gives `ERROR: 08P01: invalid message format` — protocol issue with mobile browsers. Always run schema migrations from a desktop browser. Running statements one at a time also helps avoid this error.

### api_usage logging — claude.js uses its own Supabase client
`claude.js` creates its own Supabase client (not importing `supabase.js`) to avoid circular dependencies. Usage is logged fire-and-forget after each `client.messages.create()` call using `response.usage` fields: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`.

### Onboarding — tenant_id must be visible to vendor for Render deployment
When approving a client, the vendor needs to set `TENANT_ID=<uuid>` in the new Render service's env vars. The `tenant_id` comes from the `clients` table (auto-generated `DEFAULT gen_random_uuid()`). It's shown in the session detail modal (read-only, copyable) under "הגדרות טכניות". `GET /vendor/onboarding` selects `clients(tenant_id)` to make it available.

### Onboarding — Green API instance/token are required before approve
`approveOnboarding()` in `admin.js` validates that `green_api_instance` and `green_api_token` are filled on `_currentSession` before POSTing. If missing, shows an alert. `saveTechFields()` updates `_currentSession` in-memory after saving so the validation reflects the latest saved state.

### clients.tenant_id links to api_usage for cost display
`GET /vendor/clients` joins current-month `api_usage` by `tenant_id` and returns `month_calls` + `month_cost` per client. The `tenant_id` in each client row matches the `TENANT_ID` env var of that client's Render deployment. New clients get a UUID auto-generated by Postgres `DEFAULT gen_random_uuid()`.

### Removing a tab — delete nav button AND page content
When removing a tab/page from dashboard.html or admin.html, you must delete **both** the nav button in the sidebar and the `<div id="page-*">` content block in `.main`. Removing only the nav button leaves orphaned HTML that renders always-visible (it falls outside the tab-switching `display:none` system and outside `.main`, so it shows on every page with no way to hide it).

### Orphaned HTML outside .main renders always-visible
Any HTML accidentally left outside the `<div class="main">` wrapper in dashboard.html is not controlled by the `showTab()` visibility system. It renders on top of every tab. Verified by tracing div depth with a Python script — depth must stay ≥1 (inside `.main`) for all page content.

### CSS variable migration — alias approach, not bulk rename
When migrating from old CSS variable names (`--primary`) to a new token system (`--color-brand`), the safe approach is to keep old names as aliases in each file's `:root` block:
```css
--primary: var(--color-brand);
```
This makes `tokens.css` the single source of truth without touching hundreds of `var()` call sites. Bulk renaming 248+ occurrences is high-risk and provides the same end result.

### showToast() uses textContent — SVG strings won't render
Both `app.js` and `admin.js` toast functions use `t.textContent = msg`. SVG markup passed as a string won't render — it shows as raw HTML text. Remove emoji from toast messages; don't try to add SVG icons to toasts without switching to `innerHTML` (which requires XSS caution).

### Design system: tokens.css is single source of truth
`public/tokens.css` defines all design values. The `:root` blocks in `dashboard.html` and `admin.html` are thin alias layers pointing to tokens. To change a color, spacing, or radius: edit `tokens.css` only — never touch the HTML `:root` blocks directly. Old variable names (`--primary`, `--bg`, etc.) remain valid everywhere for backwards compatibility.

### Business hours format — is_open not closed
Settings schema uses `{ is_open: bool, open: 'HH:MM', close: 'HH:MM' }` per day. The onboarding form initially used `{ closed: bool }` — wrong. Any code reading/writing business hours must use `is_open`. Default when no saved value: `is_open: true` (open), `open: '10:00'`, `close: '22:00'`.

### GET routes must explicitly list every column they return
Supabase `.select('col1,col2,...')` returns only the named columns. When new columns are added to a table, every GET route that clients depend on for prefill/display must be updated to include them. Forgetting this means the new fields are saved (PATCH works) but never returned to the client (GET silently omits them), so prefill and re-editing show stale/empty data.

### Login API requires both username and password
`POST /api/auth/login` expects `{ username, password }`. Sending only `password` returns "שם משתמש או סיסמא שגויים". Valid usernames: `admin`, `manager`, `vendor`.

### input[type=time] reverses in RTL pages — always add dir="ltr"
In `dir="rtl"` pages, `input[type=time]` renders MM:HH instead of HH:MM. Fix: add `dir="ltr"` to every time input. Applies to any numeric/formatted input that has inherent LTR order (time, phone, numbers with separators).

### Delivery zones schema — 5 fields, not 2
Full zone object: `{ city, area, fee, min_order, eta_minutes }`. Old onboarding code used `{ city, price }` — wrong field name (`price` vs `fee`) and missing 3 fields. Always match the settings page schema exactly.

### Multi-tenant — every DB query must include .eq('tenant_id', tenantId)
After adding `tenant_id` to a table, any query that omits the filter will silently return rows from all tenants (Supabase doesn't enforce RLS by default in service-role mode). Pattern: all service functions accept `tenantId = DEFAULT_TENANT_ID` as a parameter. Never hardcode `DEFAULT_TENANT_ID` inside a query — always pass it down from the route/handler.

### Multi-tenant settings/menu cache — Map keyed by tenantId, not a global object
`settings.js` and `menu-service.js` use `Map<tenantId, {data, time}>`. Calling `_clearCache(tenantId)` or `invalidateCache(tenantId)` clears only that tenant's cache. Never call `_clearCache()` without a tenantId unless you want to flush all tenants (e.g., on global schema change).

### getAdminUser must live in supabase.js, not admin-handler.js
`index.js` calls `getAdminUser(phone, tenantId)` before deciding which handler to invoke. If it lived in `admin-handler.js`, index.js would have to import from a handler file — wrong layering. Moved to `supabase.js` which is the correct DB-access layer.

### Webhook routing — paymentRouter runs before per-tenant handler, calls next() safely
`app.use('/webhook', paymentRouter)` is registered before `app.post('/webhook/:tenantId', ...)`. For `POST /webhook/<uuid>`, paymentRouter finds no matching route and calls `next()` automatically (Express Router default). The per-tenant handler then fires. This is correct — but never add a catch-all route inside paymentRouter or it will swallow tenant webhooks.

### Onboarding audit — always stamp updated_at + updated_by on every PATCH
`onboarding_sessions` has `updated_at TIMESTAMPTZ` and `updated_by TEXT`. Set `updated_by: 'client'` in the public PATCH and `updated_by: 'vendor'` in all vendor PATCHes and the approve POST. These were added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` through the Management API (2026-05-25).

### Supabase mock — select() must return object with .eq(), not a bare Promise
When `settings.js` chains `.select().eq('tenant_id', tenantId)`, the Jest mock must mirror this chain:
```js
select: () => ({ eq: async () => ({ data: rows, error: null }) })
```
If `select()` returns a bare `async` function (resolves immediately), calling `.eq()` on the resolved value throws `TypeError: .eq is not a function`. Same applies to `upsert()` if it chains `.eq()`.

### Cardcom client onboarding flow
1. Client ticks "אשראי (Cardcom)" in onboarding form → sees link to `cardcom.co.il` and note that Jasell will receive the credentials.
2. Client signs up on Cardcom site.
3. Cardcom rep sends Terminal Number + Secret (ApiName) to vendor/Jasell.
4. Vendor enters them in Step 2 of the onboarding wizard (`cardcom_terminal`, `cardcom_username`).
5. Approve seeds these into the tenant's `settings` table — bot uses them for all Cardcom calls.
Env var name: `CARDCOM_USERNAME` = ApiName (not a human username). Don't confuse with dashboard login.

### Bot isolation — three layers prevent data leakage between concurrent conversations
No cross-customer data leakage is possible because the system is fully stateless at the handler level:
1. **Tenant isolation:** each tenant has its own webhook URL (`/webhook/:tenantId`); Green API is configured to that URL on approval. All DB queries filter by `.eq('tenant_id', tenantId)`.
2. **Admin vs customer routing:** `getAdminUser(phone, tenantId)` checks `admin_users` filtered by tenant. If found → `admin-handler.js`. Sessions use different keys: admin = `admin:052xxx`, customer = `052xxx` — cannot collide in DB (UNIQUE on `tenant_id,phone`).
3. **Stateless handlers:** `ai-handler.js` and `admin-handler.js` have zero module-level mutable state. All conversation state is loaded fresh from DB per message (`getSession`) and written back atomically (`updateSession` UPSERT). Concurrent calls from different phones load independent rows and never share memory.

The only race condition possible is the same customer sending two messages within ~500ms: both load the same session history, both call Claude, last write wins (one message lost from history). This causes a bad UX for that customer but is not a data leak.

### No vendor WhatsApp bot — vendor interacts via web only
There is no interactive WhatsApp bot for the platform vendor. Vendor interaction is exclusively through `/admin` (admin.html + admin.js). `vendor-alerts.js` sends one-way alerts TO the vendor's phone, but the vendor cannot send commands back via WhatsApp. Do not implement vendor bot logic in the webhook handler.

### Admin phone in admin_users loses customer bot access
If a business owner adds their own phone to `admin_users`, they will always be routed to the admin bot — they cannot order pizza as a customer through the same number. The routing decision at `getAdminUser()` is binary with no override. This is by design but worth knowing when onboarding admins.

### Jest 30 mock factory — variables must be prefixed with `mock`
`jest.mock()` factories are hoisted before variable declarations. Jest 30 enforces that any outer-scope variable referenced inside a factory must be prefixed with `mock` (case-insensitive: `mockFoo`, `MockBar`, `MOCK_BAZ`). Non-prefixed variables used directly inside `jest.fn(async () => myVar)` will throw `Invalid variable access` at compile time — even if the access is inside a nested function. Variables accessed several levels deep (inside regular arrow functions, not wrapped in `jest.fn()`) are allowed. When in doubt, prefix all mutable test-state variables with `mock`.

### timingSafeEqual throws RangeError on different-length inputs
`crypto.timingSafeEqual(a, b)` throws if `a.length !== b.length`. In auth.js `verify()`, a tampered token with a different-length signature would crash the server instead of returning `null`. Fixed by wrapping in try-catch. Always guard `timingSafeEqual` calls — any attacker-controlled input can have arbitrary length.

### Express app — require.main === module to prevent port conflict in tests
`index.js` called `app.listen()` unconditionally. When multiple test files `require('../src/index')`, each starts a server → `EADDRINUSE: address already in use :::3000`. Fix: guard the listen call with `if (require.main === module) app.listen(...)`. The app is still exported as `module.exports = app` and works with supertest without a bound port.

### supertest integration tests — install as devDependency
`npm install --save-dev supertest` is required for HTTP-level tests against the Express app. supertest calls `app.listen(0)` on an ephemeral port internally — no port conflicts as long as `app.listen()` is not called in module scope.

### Supabase mock — update().eq() must support both await and .select().single() chaining
Some routes do `await .update().eq()` (simple), others do `.update().eq().select().single()` (returns updated row). The mock must support both. Solution: make `eq()` in update-mode return a thenable builder:
```js
const result = { error: null, data: updatedRow };
return Object.assign(Promise.resolve(result), {
  select: () => ({ single: async () => result }),
});
```
Assigning properties to a Promise object makes it both awaitable and chainable.

### Supabase mock — add .neq() to select chain
Some GET routes filter with `.neq('status', 'approved')`. If the mock's builder object doesn't have `.neq()`, the route crashes with `TypeError: .neq is not a function`. Add `neq: () => b` to any mock builder used for tables that use this filter (e.g., `onboarding_sessions`).

### Supabase mock — greenapi must export formatPhone and toChatId
`index.js` imports `{ formatPhone }` from `greenapi.js` to normalize incoming WhatsApp phone numbers. Any test that requires `index.js` must mock `formatPhone` in the greenapi mock, or the webhook handler crashes with `TypeError: formatPhone is not a function`. Minimal mock: `formatPhone: (raw) => raw.replace(/[^0-9]/g, '')`.

### setInterval in index.js keeps Jest open — use --forceExit
`index.js` starts `setInterval(pollPendingPayments, 2 * 60 * 1000)` at module scope. This timer keeps the Node.js event loop alive after tests finish, causing Jest to hang. Run with `npm test -- --forceExit` to terminate cleanly. The interval is only an issue in tests — in production it runs forever as intended.

### Every new setInterval function must be mocked in all test files that require index.js
When adding a new function to `setInterval` in `index.js` (e.g. `pruneOldSessions`), every test file that `require('../src/index')` must include it in the supabase mock or Jest throws `TypeError: The "callback" argument must be of type function. Received undefined`. Affected test files: `webhook-routing.test.js`, `payment-webhook.test.js`, `audit-trail.test.js`, `onboarding.test.js`. Always add `newFunction: jest.fn(async () => {})` to all four mocks simultaneously.

### tenant_id in payment paths — use pending.tenant_id as primary source
`confirmPending()` in `payment.js` and the polling loop in `index.js` both call `saveOrder()` and `sendMessage()`. Use the real column `pending.tenant_id` as the primary source (set by `savePendingPayment()`, indexed). Fallback chain: `pending.tenant_id || orderData.tenant_id || process.env.TENANT_ID`. Pass the same tenantId to `sendMessage()` so the confirmation WhatsApp goes through the correct Green API instance. Omitting tenantId from `sendMessage()` silently routes all confirmation messages through the default tenant's Green API.

### GDPR erasure — delete session, anonymize orders (don't hard-delete)
`DELETE /api/customers/:phone` deletes the session row (conversation history) and anonymizes order rows: `phone='deleted'`, `customer_name='[deleted]'`, `address='[deleted]'`, `notes=null`. Hard-deleting orders would break accounting and order-number sequences. The anonymization pattern satisfies GDPR right-to-erasure while keeping business records intact. Only `requireAdmin` — never expose this to manager role or public.

### Privacy policy link — first bot message only, uses italic WhatsApp formatting
In `ai-handler.js`, when `history.length === 0` (first message in a new session), append `\n\n_מדיניות הפרטיות: ${botUrl}/privacy.html_` to the reply. WhatsApp renders `_text_` as italic. The `botUrl` comes from `settings.get('bot_url', tid)` with fallback to `process.env.PUBLIC_URL`. Do not send the notice on every message — only on session start.

### pending_payments.tenant_id is now a real column, not just inside order_data JSON
Previously `tenant_id` was only stored inside the `order_data` JSONB field. As of 2026-05-26 it's a proper column with DEFAULT and index. `savePendingPayment()` in supabase.js writes it from `orderData.tenant_id`. Always pass `tenant_id` as a real column — don't rely on `order_data->>'tenant_id'` for filtering.

### bcrypt for tenant_users — existing plaintext users need manual reset
`tenant_users.password` is now bcrypt-hashed on creation. Any user created before 2026-05-26 has a plaintext password in the DB — `bcrypt.compare()` will always fail for them. If such users exist, reset their password via a direct DB UPDATE with a new hash. There are no pre-existing users in this deployment.

### Rate limiting uses express-rate-limit (in-memory store)
`loginLimiter` and `onboardingLimiter` use the default in-memory store. On Render, each deploy resets all counters. This is acceptable — the window is short (15min / 1hr). Do not add a Redis store unless the service scales to multiple instances.

### Green API webhook — verified via instanceId, not HMAC
Green API doesn't support HMAC signing. Verification is done by comparing `body.instanceData.idInstance` against the tenant's configured `green_api_instance` setting. Default tenant checks synchronously against `GREEN_API_INSTANCE_ID` env var. Per-tenant routes check async after the 200 ack. An attacker who knows both the tenant UUID and the instanceId could still forge requests — acceptable risk for current scale.

### _tenantCreds() now throws instead of falling back to default instance
Before 2026-05-26, `greenapi.js` `_tenantCreds()` silently fell back to the default instance if a tenant's Green API credentials were missing. Now it throws `Error: Missing Green API credentials for tenant X`. This means messages to/from a misconfigured tenant will fail loudly instead of leaking through the default bot — correct behavior. If provisioning is incomplete, fix the tenant settings rather than relying on fallback.

### pruneOldSessions() — 90-day TTL, runs daily via setInterval
`supabase.js` exports `pruneOldSessions()` which deletes all sessions with `updated_at < now() - 90 days`. Called from `setInterval` in `index.js` every 24h. Logs count of deleted rows. Adjust the cutoff if business/legal requirements change.

### Render plan — Starter ($7/mo), no cold starts
Service upgraded from Free to Starter on 2026-05-26. Free tier slept after 15 min inactivity causing 30-60s cold starts. Starter stays always-on. Do not downgrade to Free.

### pg package removed — do not re-add
`pg` was listed as a dependency but never worked (IPv6 blocks it everywhere). Removed 2026-05-26. If direct DB access is ever needed, use the Supabase Management API or SQL editor — never `pg` directly.

### settings.set() already invalidates cache — no extra _clearCache() needed
`settings.set()` does `_getCache(tenantId).time = 0` after every DB write. This causes `loadAll()` to reload from DB on the next `get()` call (since `Date.now() - 0 > CACHE_TTL`). Any call to `settings._clearCache()` immediately after `settings.set()` is redundant. The only difference: `_clearCache()` also sets `data = {}`, removing the fallback on reload error. For most cases `settings.set()` is sufficient — only call `_clearCache()` explicitly if you need to also eliminate the stale-data fallback.

### Green API instance change — 4 steps required
When switching a tenant's Green API instance: (1) update `GREEN_API_INSTANCE_ID` + `GREEN_API_TOKEN` env vars and sync to Render via `node scripts/sync-render-env.js` + trigger redeploy; (2) set the new instance's webhook URL via `POST /waInstance{id}/setSettings/{token}` with `{"webhookUrl":"https://www.jasell.com/webhook","incomingWebhook":"yes"}`; (3) verify instance is `authorized` via `GET /waInstance{id}/getStateInstance/{token}` — if `notAuthorized`, scan QR in Green API console; (4) update `bot_url` in settings table if it points to an old URL.

### orders_status_check constraint must include all custom statuses
The `orders` table has a `CHECK` constraint `orders_status_check` listing allowed status values. When adding a new status (e.g. `ready`), update the constraint via Management API:
```bash
curl ... -d '{"query": "ALTER TABLE orders DROP CONSTRAINT orders_status_check; ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['"'"'new'"'"'::text, '"'"'preparing'"'"'::text, '"'"'ready'"'"'::text, '"'"'out_for_delivery'"'"'::text, '"'"'delivered'"'"'::text, '"'"'done'"'"'::text, '"'"'cancelled'"'"'::text]))"}'
```
Forgetting this causes `Failed to update order: new row for relation "orders" violates check constraint` on PATCH /orders/:id/status.

### SSE (EventSource) cannot send Authorization headers — use ?token= query param
`EventSource` in browsers doesn't support custom headers. The `/api/sse` endpoint accepts the JWT via `?token=` query param. `requireKitchenOrAdmin` middleware copies `req.query.token` → `req.headers.authorization` before calling `requireAuth`. All other endpoints use standard `Authorization: Bearer` header.

### page-kitchen (and any new page) must be inside .main div
All `page-*` divs must be children of `<div class="main">`. If a `</div>` is accidentally placed before a new page div (e.g. an extra closing tag after page-settings), the page lands outside `.main` and renders at the bottom of the document body, overlapping or below the sidebar. Always verify nesting depth after adding a page. Use a Python script to trace div depth if in doubt.

### app.js uses api() not apiFetch() — kitchen.js uses apiFetch()
`app.js` (dashboard) defines `async function api(method, path, body)` which calls `/api${path}` with the global `token` variable. `kitchen.js` (standalone kitchen SPA) defines `apiFetch(path, opts)`. Do not mix them — code copied from kitchen.js into app.js must be rewritten to use `api()`.

### showTab() must sync both sidebar and mobile bottom-nav active states
`showTab(name)` must call `classList.remove/add('active')` on both `#tab-${name}` (sidebar) and `#mobile-tab-${name}` (bottom nav). When adding a new tab, add the button to BOTH the `<nav>` inside `<aside>` AND the `<nav class="mobile-bottom-nav">`. Visibility (display:none/flex) for role-gated tabs must also be set in both places in app.js.

### Tenant isolation audit (2026-06-29) — 26 issues found and fixed
Full audit of all Supabase queries, sendMessage calls, and settings access. Root causes:
- Legacy code written before multi-tenant was added — queries had no `.eq('tenant_id', ...)`
- `getOrders()` in `supabase.js` had no tenantId param — callers assumed it was scoped
- `sendMessage()` calls in dashboard-api.js forgotten without tenantId — always sent via DEFAULT instance
- `settings.loadAll()` called without tenantId — read DEFAULT tenant settings for all tenants
- `notifyStatusChange()` had no tenantId param — couriers from wrong tenant got notifications
- `push_subscriptions` had no `tenant_id` column — all browsers got notified on every order
- `product_additions` has no `tenant_id` — must filter via `product_id IN (tenant_products_ids)`

Fixed pattern: every function now accepts `tenantId = DEFAULT_TENANT_ID`, every query scoped, every sendMessage/settings call passes tenantId. See "Tenant Isolation Rules" section above.

### Tenant isolation — admin bot had cross-tenant queries too
`admin-handler.js` `dispatchActions()` had all DB queries without `.eq('tenant_id', tenantId)`:
`SET_AVAILABLE`, `ORDER_STATUS`, `CANCEL_ORDER`, `DISPUTE`, `UPDATE_PRICE`, `LIST_ORDERS`, `CONFIRM_PAYMENT` — all could touch data of other tenants. Fixed 2026-06-29 — each case now filters by `tenantId`.

For SET_AVAILABLE on toppings: first fetch `products.id` for the tenant, then filter `product_additions` by `product_id IN [...]`. This is the correct pattern since `product_additions` has no `tenant_id` column.

### Customer bot system prompt must include live state — not hardcoded values
Both bots hardcoded "פיצה דליבריס" instead of `allSettings.business_name`. For multi-tenant, every bot must read ALL dynamic values from `allSettings`. The "מצב נוכחי" section in the customer prompt is rebuilt on every message with the current tenant's settings (hours, open/closed, payment methods). Never hardcode business names, hours, or payment info in the prompt string.

### Customer bot: business hours were missing from system prompt entirely
`business_hours` was never included in `buildSystemPrompt()`. The bot had no way to answer "מאיזה שעה אתם פתוחים?" correctly — it would answer from training data. Fix: added "מצב נוכחי" section with today's hours, current time, delivery status. Instruction added: "ענה על שאלות שעות/זמינות לפי סקשן זה בלבד — אל תמציא מידע."

### Settings cache invalidation is immediate — no TTL wait needed
`settings.set()` always calls `_getCache(tenantId).time = 0`. After any settings change (dashboard PATCH or admin bot SET action), the next customer message reloads fresh from DB. The 60s cache TTL only applies when no change occurred. Testing showed 0-second delay between admin toggling `is_open=false` and the customer bot seeing it on the next message.

### Mid-conversation availability change: prompt instruction alone is insufficient
Adding "if a topping in history isn't in current menu, tell customer" to the prompt was NOT enough — Claude continued the conversation flow without proactively scanning. Fix: code-level check in ai-handler.js before every Claude call queries `product_additions` for `is_available=false` items matching tenant's products, checks if any appear in customer's messages, and injects explicit `⚠️ התראת מלאי` into the system prompt. This forces Claude to address it on the very next response.

### Simulating mid-conversation DB changes requires going through the app API
Direct SQL UPDATE via Supabase Management API does NOT call `invalidateCache()`. The in-memory menu cache stays warm (up to 60s). Always simulate admin actions via the app's API endpoints (PATCH /api/products/:id/additions/:addId) or via the admin bot webhook, which call `invalidateCache(tenantId)`.

### Privacy notice sent alone when Claude returns only an ACTION block
When `history.length === 0` and Claude's response was only an ACTION block (e.g. `<!--ACTION:RESET-->`), `cleanText` was empty and only `\n\n_מדיניות הפרטיות_` was sent. Fix: added `if (cleanText)` guard + fallback greeting with business name and menu URL when `cleanText` is empty on first message. Privacy notice is now always appended to non-empty text, never sent alone.

### Admin bot — empty prompt section causes hallucinated suggestions
When a settings section showed "לא מוגדרות (פתוח תמיד)" for unset hours, Claude interpreted this as an invitation to volunteer help configuring them — even when not asked. Fix: removed explanatory strings for empty/unset values; sections only appear when they have actual data. Also added "ענה רק על מה שנשאלת — אל תציע עזרה שלא ביקשו" to admin rules.

### Testing the admin bot or customer bot via curl — use instanceId in payload
To send a simulated WhatsApp message directly to the webhook (bypassing Green API):
```bash
curl -X POST "https://www.jasell.com/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "typeWebhook": "incomingMessageReceived",
    "instanceData": { "idInstance": 7105619659 },
    "senderData": { "sender": "<phone>@c.us", "senderName": "Test" },
    "messageData": { "typeMessage": "textMessage", "textMessageData": { "textMessage": "<msg>" } }
  }'
```
The `idInstance` must match `GREEN_API_INSTANCE_ID` (default tenant) or the tenant's `green_api_instance` setting, otherwise the instanceId verification added 2026-05-26 will drop the message silently. To trigger the admin bot, use a phone that exists in `admin_users` for the target tenant.

### Order edit window simplified to status-only (2026-06-30)
Removed `edit_mode` / `edit_time_limit` settings entirely (they existed only briefly). The customer self-service cancel/edit condition is now exactly one rule: editable while `status ∈ {'new', 'scheduled'}`, locked the moment it becomes `'preparing'`. Only remaining setting is `allow_order_edits` (master on/off). See **Order Edit/Cancel Window** section above.

### Scheduled orders skip 'new' entirely — must include 'scheduled' in any customer-facing status check
`saveOrder()` sets `status: isScheduled ? 'scheduled' : 'new'`. `processScheduledOrders()` (runs every minute in `index.js`) transitions `'scheduled' → 'preparing'` directly when within `prep_lead_time` minutes of the requested time — it never passes through `'new'`. Any code gating customer-facing behavior on `order.status === 'new'` (e.g. "can I still cancel?") must also check `'scheduled'`, or customers with scheduled orders lose that capability from the moment they order. Found via live webhook test: a `'scheduled'` test order did not cancel on "בטל" until this was fixed.

### System prompt text must be kept in sync with actual enforcement logic
`prompts.js` had a hardcoded line telling Claude "cancellation window: 15 minutes from order" — this was *describing* behavior, not enforcing it (the real enforcement is the deterministic `status` check in `ai-handler.js`, which runs before Claude is even called for cancel requests). When the actual rule changed to status-based with no time limit, this prompt text became stale and would have caused Claude to tell customers wrong information if asked directly "how long do I have to cancel?". Any time enforcement logic changes in `ai-handler.js`, grep `prompts.js` for matching language describing the same rule.

### Shared working directory between concurrent Claude sessions — commits can get swept together
This project folder can have multiple Claude Code sessions working in it simultaneously (e.g. one in a chat, one via a scheduled task). They share the same working tree on disk, not separate git worktrees. If one session edits files but doesn't commit, and another session runs `git add -A && git commit`, the first session's uncommitted changes get bundled into the second session's commit under an unrelated message. Symptom: `git diff` shows nothing for a change you just made — it's already committed under someone else's commit hash. Check `git log -S"<unique string from your edit>"` to find which commit actually contains it. Not a bug to "fix" — just be aware when verifying whether your own changes are pushed.

### Live webhook testing pattern — insert real test orders, simulate via curl, verify, clean up
To verify order-status-dependent bot behavior end-to-end: (1) INSERT test orders directly via Supabase Management API with distinct phone numbers and target statuses, (2) POST simulated `incomingMessageReceived` webhooks to the local preview server for each phone, (3) wait ~3s for async processing (handler runs after `res.sendStatus(200)`), (4) SELECT the orders back to confirm expected status, (5) DELETE the test orders and matching `sessions` rows afterward. Remember: the local server only picks up code changes between restarts (plain `node`, not `nodemon` in `.claude/launch.json`) — restart `preview_start` after editing handler code before testing.
