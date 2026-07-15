# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Jasell** — a multi-tenant WhatsApp ordering platform for restaurants. Each client business (tenant) gets an AI ordering bot, a management dashboard, and a public menu page — all served from one shared deployment under `jasell.com`.

- **Customer bot:** AI-powered WhatsApp conversation (Claude) acts as a waiter → deal-breakers first (delivery/payment) → takes order → Cardcom payment → confirms
- **Admin bot:** Same WhatsApp number — if sender phone is in `admin_users` table, routed to `admin-handler.js` instead of customer bot
- **Public menu page:** `/menu.html?biz=<slug>` — mobile-first customer-facing menu with photos, toppings, WhatsApp CTA
- **Business dashboard:** `/dashboard.html` — SPA for admin/manager roles — orders, products, customers, stats, settings, inbox (human agent handoff), kitchen
- **Vendor portal:** `/admin` — separate SPA for the platform owner (vendor role) — client management, onboarding, KPIs, alert settings
- **Courier notifications:** Auto-WhatsApp to courier(s) when order reaches configured status
- **Vendor alerts:** Real-time WhatsApp alerts to vendor on server errors, payment failures, restarts, completed onboarding

**Stack:** Node.js + Express · Supabase (PostgreSQL) · Render (hosting) · **Meta WhatsApp Cloud API (official, primary channel)** · Green API (legacy/fallback channel) · Anthropic Claude `claude-opus-4-7` · Cardcom (Israeli payment processor)

**WhatsApp channel strategy (since 2026-07):** the official Meta Cloud API is the standard for every tenant. The pilot client is onboarded manually (vendor creates WABA + pastes creds); once Meta approves us as Tech Provider, clients self-connect via Embedded Signup. Green API remains only as a fallback for clients who insist on keeping their existing personal number (unofficial — disconnection risk, disclose to client).

**Live:**
- Dashboard + bot: `https://www.jasell.com` (jasell.com → 301 → www)
- Public menu: `https://www.jasell.com/menu.html`
- Vendor portal: `https://www.jasell.com/admin`
- Webhook: `https://www.jasell.com/webhook`
- GitHub: `git@github.com:monkemoney/pizzabot.git`
- Render service ID: `srv-d831jc8js32c73ef8mng` · owner ID: `tea-cuppja5umphs73ea2qe0`
- Fallback URL: `https://pizzabot-jasell.onrender.com` (still works — do NOT change this)

---

## Secrets & Environment Variables

**All secret values live in `.env.production` (gitignored) — never in this file, never committed.** The Supabase Management API token and the Render API key are also kept in Claude's persistent memory. If a secret ever lands in a committed file, rotate it — git history is forever.

Variable names (values in `.env.production` / Render dashboard):

```
PORT, PUBLIC_URL, TENANT_ID
SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_DB_PASSWORD
ANTHROPIC_API_KEY
META_WA_PHONE_NUMBER_ID, META_WA_ACCESS_TOKEN, META_WA_WABA_ID,
META_WA_VERIFY_TOKEN, META_WA_API_VERSION            # default tenant's Meta creds
META_APP_ID, META_APP_SECRET                          # Embedded Signup (post Tech Provider approval)
GREEN_API_INSTANCE_ID, GREEN_API_TOKEN, GREEN_API_BASE_URL   # legacy channel
CARDCOM_API_URL, CARDCOM_TERMINAL, CARDCOM_USERNAME   # default tenant; per-tenant creds live in settings
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
ADMIN_SECRET, JWT_SECRET,
DASHBOARD_ADMIN_PASSWORD, DASHBOARD_MANAGER_PASSWORD, DASHBOARD_VENDOR_PASSWORD
RENDER_API_KEY                                        # local-only helper (not on Render itself)
```

Notes:
- `TENANT_ID` defaults to `aaaaaaaa-0000-0000-0000-000000000001` (the default/demo tenant). All tenants share this one deployment — per-client Render services are a dead pattern; never suggest one.
- **`SUPABASE_SERVICE_KEY` is a new-style `sb_secret_...` key** (2026-07-15). The project's **legacy JWT API keys (anon/service_role) are DISABLED** — any old `eyJ...` key is rejected with "Legacy API keys are disabled". New secret keys are drop-in for supabase-js; the Management API token (`sbp_...`, in Claude memory) is a separate credential and unaffected.
- **Cardcom test account (`CardTest1994` / terminal 1000) is DEAD** — the API returns `603 שם משתמש או סיסמה שגויים` (verified 2026-07-13). `createPaymentPage` fails with 401 until fresh credentials are obtained from Cardcom. Real clients supply their own terminal via onboarding.
- Direct Postgres access does not work from anywhere (see DB access lesson below) — the `SUPABASE_DB_PASSWORD` is effectively unusable.
- **Rotation status (2026-07-15):** everything that was ever exposed in git history is dead — Supabase legacy keys disabled, Render API key rotated+revoked, JWT_SECRET / dashboard passwords / ADMIN_SECRET / META_WA_VERIFY_TOKEN / VAPID keypair all regenerated. Only the legacy Green API token remains on its original value (low priority). Consequences to remember: push subscribers must re-opt-in (new VAPID); Meta's webhook "Verify and save" needs the new verify token if ever re-run.

---

## Commands

```bash
npm start        # production
npm run dev      # nodemon watch

# Load local helper vars (Render key etc.)
export $(grep -E "^RENDER_API_KEY" .env.production)

# Schema changes — ONLY via Supabase Management API (token in Claude memory / account tokens page)
curl -s -X POST "https://api.supabase.com/v1/projects/umoftdmutxhrbknowbyh/database/query" \
  -H "Authorization: Bearer <SUPABASE_MGMT_TOKEN>" -H "Content-Type: application/json" \
  -d '{"query": "<SQL here>"}'
# Returns [] on DDL success, rows array on SELECT. Fallback: Supabase SQL editor (desktop browser only).

# Env var backup/restore (ALWAYS before infra changes)
node scripts/backup-render-env.js   # pulls from Render → .env.production (merges — local-only keys like RENDER_API_KEY survive)
node scripts/sync-render-env.js     # pushes .env.production → Render

# Fetch Render runtime logs
curl -s "https://api.render.com/v1/logs?resource=srv-d831jc8js32c73ef8mng&ownerId=tea-cuppja5umphs73ea2qe0&limit=200" \
  -H "Authorization: Bearer $RENDER_API_KEY" | python3 -c "
import sys,json; data=json.load(sys.stdin)
logs=data if isinstance(data,list) else data.get('logs',data.get('data',[]))
[print(l.get('timestamp','')[-12:], l.get('message','')) for l in logs]
" | tail -100

# Before every push (MANDATORY)
node --check public/app.js && node --check public/admin.js
npm test -- --forceExit     # 99 tests across 9 suites; --forceExit avoids hanging on setInterval timers

# Deploy (auto on push)
git push origin main
```

---

## Folder Structure

```
pizza-bot/
├── src/
│   ├── index.js                  # Express server, webhook entry + Meta/Green routing, schedulers
│   ├── bot/
│   │   ├── handler.js            # Thin re-export of ai-handler
│   │   ├── ai-handler.js         # Customer bot: dispute handler, stale-session guard, availability
│   │   │                         #   injection, human-handoff intercept, Claude, ACTIONs
│   │   ├── admin-handler.js      # Admin bot: Claude with live state, dispatches ADMIN: ACTION blocks
│   │   ├── prompts.js            # Customer system prompt — waiter flow, live-state block, zones
│   │   └── menu.js               # Legacy static menu helpers (mostly unused)
│   ├── services/
│   │   ├── claude.js             # Anthropic SDK wrapper, prompt caching, api_usage logging
│   │   ├── meta-whatsapp.js      # Meta Cloud API senders (per-tenant creds), subscribeWaba, webhook parse
│   │   ├── greenapi.js           # Channel dispatch (Meta-first) + Green API legacy senders
│   │   ├── supabase.js           # All DB functions (sessions, orders, inbox, meta tenant resolution)
│   │   ├── cardcom.js            # Cardcom JSON API v11 — createPaymentPage; verifyPayment is no-op
│   │   ├── push-notifier.js      # Web Push (VAPID)
│   │   ├── settings.js           # Live settings, 3s TTL cache; isOpen()/isDeliveryOpen() (Asia/Jerusalem,
│   │   │                         #   overnight-window aware)
│   │   ├── menu-service.js       # Live products from DB, 3s TTL cache
│   │   ├── status-notifier.js    # Customer + courier WhatsApp notifications on status change
│   │   ├── slug.js               # Business-name slugs for public menu URLs (Hebrew transliteration)
│   │   ├── sse.js                # SSE broker — Map<tenantId, Set<res>>, broadcast(), subscribe()
│   │   └── vendor-alerts.js      # Throttled WhatsApp alerts to vendor
│   ├── routes/
│   │   ├── dashboard-api.js      # All /api/* endpoints — tenant-scoped, vendor routes, onboarding, inbox
│   │   ├── payment.js            # POST /webhook/payment + GET /payment/success (embeds rv= in URL)
│   │   ├── admin.js              # Legacy /admin/orders (backwards compat)
│   │   └── business-bot.js       # POST /webhook/business (not yet active)
│   └── middleware/auth.js        # HMAC-SHA256 sign/verify, requireAuth/Admin/Vendor/KitchenOrAdmin
├── public/
│   ├── index.html                # Login page — routes vendor→/admin, kitchen→/kitchen, others→/dashboard.html
│   ├── dashboard.html + app.js   # Business dashboard SPA (orders/products/customers/stats/settings/inbox/kitchen)
│   ├── admin.html + admin.js     # Vendor portal SPA (vendor role only)
│   ├── kitchen.html + kitchen.js # Standalone kitchen SPA (KDS-scale type, elapsed-time timers)
│   ├── onboarding.html           # Client onboarding — 4-step wizard, draft autosave, "live" page
│   ├── menu.html                 # Public customer menu (?biz=slug)
│   ├── tokens.css                # Design tokens — single source of truth (see Design System)
│   └── sw.js                     # Service Worker — push notifications only (no fetch caching)
├── supabase/schema.sql           # Full DB schema (documentation — NOT auto-applied, see Schema drift)
├── scripts/                      # backup/sync Render env, render-guard
├── tests/                        # 9 suites / 99 tests — auth, session isolation, admin bot, webhook
│                                 #   routing (incl. Meta multi-tenant), onboarding, payments, audit, settings
├── .design/jasell-dashboard/     # Design brief + review (Confident SaaS direction)
├── .env.production               # ALL SECRETS — gitignored
└── CLAUDE.md
```

---

## Architecture

### URL Routing

```
GET  /                    → login page (vendor→/admin, kitchen→/kitchen, admin|manager→/dashboard.html)
GET  /dashboard.html      → business SPA
GET  /admin               → vendor portal
GET  /kitchen             → kitchen SPA
GET  /menu.html?biz=slug  → public menu (no auth; slug resolved via settings public_slug, ?tenant= legacy)
GET  /onboarding/:token   → client onboarding wizard (public); approved → "your business is live" page
GET  /webhook[..]         → Meta webhook verification handshake (hub.challenge)
POST /webhook             → WhatsApp webhook — Meta payloads routed by phone_number_id; Green API → default tenant
POST /webhook/:tenantId   → per-tenant webhook (Green API tenants point here)
POST /webhook/payment     → Cardcom IndicatorUrl (paymentRouter registered BEFORE :tenantId — never reorder;
                            paymentRouter only defines /payment,/success,/failed and falls through via next())
/api/*                    → dashboard-api.js
```

### WhatsApp Channels (Meta-first dispatch)

Sending — `greenapi.js` is the facade every caller uses (`sendMessage(phone, text, tenantId)`):
1. `_metaCreds(tenantId)`: default tenant → env `META_WA_*`; other tenants → settings `meta_phone_number_id` + `meta_access_token`. If present → send via `meta-whatsapp.js` (creds object per call).
2. Otherwise → Green API via `_tenantCreds(tenantId)` (env for default, settings `green_api_instance`/`green_api_token` for others). Missing Green creds **throw** — misconfigured tenants fail loudly rather than leaking through the default instance.

Receiving — one shared Meta webhook for all tenants (`POST /webhook`, payload `object: 'whatsapp_business_account'`):
- payload `metadata.phone_number_id` == env id → default tenant
- otherwise `resolveTenantByMetaPhoneId()` (settings reverse lookup, 60s cache) → tenant; unknown id → dropped with warning
- Green API payloads still arrive on `/webhook` (default) or `/webhook/:tenantId`, verified by `instanceData.idInstance` against the tenant's configured instance (Green API has no HMAC).

Meta specifics:
- Interactive **single-select list** replaces Green API's multi-select poll for toppings (Meta has no poll). `list_reply` is translated to `בחרתי: X` text for the bot.
- `subscribeWaba(wabaId, token)` must be called once per WABA or Meta sends nothing — approve() does it automatically. Symptom of a missing subscription: webhook verified but zero POSTs. Also check the WABA's `subscribed_apps` — Meta's own "WA DevX Webhook Events" test app being subscribed does NOT mean ours is.
- Sandbox numbers can only message verified test recipients (error `#131030`); recipients must complete SMS verification, not just be added.
- Service conversations (customer-initiated, 24h window) are free — nearly all ordering traffic. Business-initiated messages outside the window need approved templates.

### Auth & Tenant Isolation (auth.js)

```
signDashboard(username, role, tenantId) → sign({ username, role, tenant_id, exp: +24h })
requireAuth   → verifies HMAC token, attaches req.user
requireAdmin  → role ∈ {admin, vendor}   (vendor is a superset — lets the portal call business endpoints)
requireVendor → role === 'vendor' strictly
requireKitchenOrAdmin → also accepts ?token= query param (EventSource can't send headers)
```

Login: `tenant_users` table by username first (per-tenant credentials, bcrypt) → else env-var users (`admin`/`manager`/`vendor`) with DEFAULT_TENANT_ID. All order queries scoped `.eq('tenant_id', tid(req))`; mutations guarded by `assertTenant(row, req)` (soft check — passes when row.tenant_id is null, for forward compat).

### Multi-Tenant System

All clients share one deployment, isolated by `tenant_id` in every DB query.
Tenant-scoped tables: `settings`, `sessions`, `categories`, `products`, `admin_users`, `orders`, `pending_payments`, `push_subscriptions`, `tenant_users`. `product_additions` has no tenant_id — filter via `product_id IN (tenant's product ids)`.

Per-tenant service pattern: `settings.js` / `menu-service.js` hold `Map<tenantId, {data, time}>` caches (3s TTL — one coherent snapshot per message; admin/dashboard changes are instant via `invalidateCache`/`settings.set`, the TTL only covers direct-DB edits that bypass invalidation).

### Onboarding & Provisioning

Client-side (`/onboarding/:token`, public): 4-step wizard — business details → delivery+payment → hours+zones → menu (free text `menu_notes`) + admins. Draft autosave on step transitions (`PATCH` with `draft:true` — fields persist, status stays `pending_client`, no vendor alert). Final submit → `pending_vendor` + WhatsApp alert to vendor. After approval the same link shows a "your business is live" page (dashboard link + username, public menu link from slug, 3 first steps — password stays WhatsApp-only).

Vendor-side (portal → אונבורדינג): list with live checklist progress + "לינק"/"וואטסאפ" share buttons. Session modal: step 1 = client info incl. the pasted menu; step 2 = tech fields — **Meta creds first (Phone Number ID / Access Token / WABA ID — the standard), Green API as fallback**, Cardcom. Saving tech fields auto-ticks the whatsapp/cardcom checklist items. Approve enabled when client submitted AND (Meta OR Green creds present).

`POST /vendor/onboarding/:id/approve` provisions everything:
1. Seed settings (business info, channel creds — meta_* and/or green_api_*, Cardcom, bot_url), assign public slug
2. Copy menu from DEFAULT_TENANT_ID (categories → products → additions; interim until menu_notes-based setup)
3. Create `admin_users` from admin_phones; generate dashboard credentials → `tenant_users` (bcrypt)
4. Wire the channel: Meta → `subscribeWaba()`; Green API → `setWebhook(/webhook/<tenantId>)`
5. WhatsApp credentials to first admin phone; mark approved/active

Embedded Signup (post Tech-Provider approval): `POST /api/onboarding/:token/whatsapp-signup` exchanges the popup's code for a business token, subscribes the WABA, stores meta_* on the session. Returns 501 until `META_APP_ID`/`META_APP_SECRET` are set. The client-side popup button is the only missing piece.

### Customer Message Flow (ai-handler.js)

```
0. pending_dispute? → handleDisputeResponse()
1. Human handoff: session.is_bot_active === false → save msg to history + unread_count,
   SSE 'inbox_message' to dashboard, NO Claude call
2. isOpen() — Asia/Jerusalem; overnight windows supported (close < open spills past midnight,
   yesterday's tail checked). Prompt receives the real isOpen() result, not the flag.
3. Stale-session guard — reset if age > 3h or old-flow markers
4. Order edit/cancel window (below)
5. buildSystemPrompt() — live menu + zones + "מצב נוכחי" block (IL time, hours, delivery, payments)
6. Availability injection: current stock status of every topping mentioned in the conversation
   (BOTH directions — out-of-stock AND restocked) appended to the system prompt AND to the current
   user message (not persisted) — stale "ran out" history otherwise overrides the fresh menu
7. callClaude() — history ≤40 msgs, system prompt cached
8. Parse/strip ACTION blocks → send clean text; first message appends privacy-policy link
9. Dispatch: SHOW_TOPPINGS | SAVE_ORDER | CREATE_PAYMENT | RESET
```

### Order Edit/Cancel Window (customer self-service)

Status-based, no time limit: cancellable while `status ∈ {'new','scheduled'}` and `allow_order_edits` setting ≠ false; locked from `'preparing'`. Checked deterministically in ai-handler on fresh conversations (cancel keyword → cancel; otherwise informative reply, Claude skipped). **`'scheduled'` must always accompany `'new'` in such checks** — scheduled orders never pass through `'new'` (`processScheduledOrders()` moves them straight to `'preparing'` at `scheduled_for - prep_lead_time`). Staff editing (dashboard/admin bot/dispute) ignores this setting by design.

### Admin Bot (admin-handler.js)

Sender in `admin_users` → admin bot on the same WhatsApp number (sessions keyed `admin:<phone>`). System prompt carries live state: current IL date/time line (answer time questions from it only), open/delivery/payment status, full product+topping availability, active orders (Bit-pending flagged). `reset`/`אפס` clears the session.

ACTION blocks: `SET_AVAILABLE` (checks ALL occurrences of a name — standalone product + per-pizza topping; limits 500/100 to avoid silent truncation; logs updated row ids), `ORDER_STATUS`, `CANCEL_ORDER`, `DISPUTE`, `SET`, `SET_DELIVERY_HOURS`, `UPDATE_PRICE`, `LIST_ORDERS`, `CONFIRM_PAYMENT` (Bit).

### Inbox / Human Agent Handoff

`sessions` columns: `is_bot_active` (default true), `unread_count`, `last_customer_message`, `last_message_at`.
Dashboard "הודעות" tab lists all customer sessions (avatars/initials, names, timestamps, unread badges, amber dot = agent mode; mobile: list ↔ full-screen thread with back). Actions (`/api/inbox/...`): handoff (silences bot), reply (sent via tenant's channel; stored in history as `[נציג]: ...`), return-to-bot, read. Incoming messages while in agent mode stream live via SSE `inbox_message`. Escalation trigger is currently manual (dashboard button) — a bot-initiated HANDOFF action is a future step.

### Kitchen (KDS)

Dashboard tab + standalone `/kitchen` (kitchen role). Shows `preparing`+`ready` only (`new` stays in dashboard). KDS-scale type (items 1.5rem+, order number 2.2rem), full-width "מוכן" button, per-card elapsed-time badge (green <10m / orange <20m / red — measured from the `preparing` transition in `status_history`, refreshed every minute). SSE push for new orders. `ready` → WhatsApp only for pickup orders.

### Payments (Cardcom v11)

```
CREATE_PAYMENT → LowProfile/Create (SuccessRedirectUrl embeds ?rv=PB-XXXX — test terminal drops params)
Confirmation, first wins: IndicatorUrl webhook (only path carrying DealNumber → enables auto-refund)
  | success-redirect ?rv= | 5-min polling fallback.
GetLowProfileIndicatorData does not exist (404) — verifyPayment() is a no-op; we trust callbacks.
No DealNumber (redirect/poll confirmations) → refund_status='manual' on cancellation → red indicator
  in dashboard (4 locations). cancelDeal() posts CancelDeal.aspx (form-encoded, not JSON v11).
Bit: SAVE_ORDER payment_status='pending' → teal badge + confirm button / admin-bot CONFIRM_PAYMENT.
tenant_id flows through every payment path (pending.tenant_id primary; passing it to sendMessage is
  what routes the confirmation through the right channel).
```

### Vendor Portal & Alerts

Portal pages: סקירה (KPIs + clients + Claude API cost/month per tenant from `api_usage`), לקוחות (CRUD + live search), אונבורדינג, התראות. Fully isolated from the business dashboard (separate HTML/JS; no shared code — `app.js` uses `api()`, `kitchen.js` uses `apiFetch()`, don't mix).

vendor-alerts.js: WhatsApp to `vendor_phone` setting; 5-min in-memory throttle per type; respects `vendor_alert_error/payment/restart` settings read at send time. Alert types: server_error, bot_error, payment_failed, new_order, restart, low_balance, onboarding_complete. Always uses DEFAULT_TENANT_ID (platform-level) — the one allowed exception to the tenantId rules. Vendor has no interactive bot — web only.

### Design System

`public/tokens.css` is the single source of truth (colors, spacing, radius 6/10/14/18 tiers, shadows, type). Page `:root` blocks are alias layers (`--primary: var(--color-brand)`) — change values ONLY in tokens.css. Font stack `'Poppins','Heebo'` — Poppins renders Latin, Hebrew falls to Heebo. Lucide inline SVGs for all UI chrome (emoji only inside WhatsApp message strings and public-menu content). Aesthetic direction: "Confident SaaS" — see `.design/jasell-dashboard/`.

---

## Database Schema (see supabase/schema.sql)

```
categories / products / product_additions   menu; per-product toppings (additions: no tenant_id)
settings            key/value JSONB per tenant — UNIQUE(tenant_id, key); includes channel creds
                    (meta_phone_number_id/meta_access_token/meta_waba_id | green_api_*), cardcom_*,
                    public_slug, business/delivery hours, zones, couriers, vendor prefs
sessions            per-phone (customer: phone, admin: 'admin:phone') — UNIQUE(tenant_id, phone);
                    conversation_history, pending_order, pending_dispute, customer_profile,
                    is_bot_active, unread_count, last_customer_message, last_message_at
pending_payments    Cardcom pendings; tenant_id real column (indexed)
orders              order_number (seq 1000+), items JSONB, status, payment fields, dispute fields,
                    status_history JSONB [{status,at}] appended on every transition
                    CHECK orders_status_check: new|scheduled|preparing|ready|out_for_delivery|delivered|done|cancelled
customers           VIEW over orders — includes tenant_id in SELECT and GROUP BY (column-set changes
                    require DROP VIEW first; CREATE OR REPLACE can't rename/add columns)
admin_users / tenant_users (bcrypt) / push_subscriptions (tenant_id)
clients             platform clients; tenant_id auto-UUID links api_usage cost tracking
onboarding_sessions state machine: pending_client → pending_vendor → approved; business fields,
                    menu_notes, channel creds (meta_* + green_*), cardcom fields, checklist JSONB
                    (client_info/whatsapp/cardcom/menu/test — first three auto-ticked), audit
                    (updated_at, updated_by 'client'|'vendor'), approved_username/password, expires_at
api_usage           Claude token log per call (tenant_id, in/out/cache tokens)
```

Order status flow: `new → preparing → ready → out_for_delivery → delivered → done` (auto after 1h) | `cancelled`; scheduled orders: `scheduled → preparing` directly. When adding a status, update the `orders_status_check` constraint via Management API or PATCHes fail on the CHECK.

---

## Operational Rules

1. **Backup before infra change:** `node scripts/backup-render-env.js`
2. **Schema changes only via Supabase Management API** (or SQL editor from desktop). Never direct `pg` — see DB access lesson. **After adding columns to schema.sql, verify they exist in the real DB** (`information_schema.columns`) — schema.sql is documentation, drift means silent feature failure (9 columns once existed only on paper).
3. **Before every commit:** `node --check public/app.js && node --check public/admin.js` (a missing backtick silently blanks the whole SPA) + `npm test -- --forceExit` (99 tests)
4. **Every desktop UI change must include mobile** — media queries + `window.innerWidth <= 768` branches
5. **delivery_zones** is authoritative (5 fields: city, area, fee, min_order, eta_minutes); `saveZones()` syncs legacy `delivery_cities`; bot reads zones first
6. **Vendor portal ≠ business dashboard** — separate SPAs, changes to one never affect the other
7. **Always update CLAUDE.md** when architecture changes — and when enforcement logic changes, grep `prompts.js` for stale descriptions of the old rule (the prompt once promised a "15-minute cancellation window" that no longer existed)
8. **No secrets in committed files.** New secrets → `.env.production` + Render; long-lived tool tokens → Claude memory.

---

## Tenant Isolation Rules — MANDATORY

כל שינוי קוד שנוגע ב-DB, WhatsApp, או settings חייב לעמוד בכללים אלו (ביקורת 2026-06-29 מצאה 26 הפרות של הדפוסים האלה):

1. **כל query על טבלה tenant-scoped** חייב `.eq('tenant_id', tenantId)`; כל `insert()` כולל `tenant_id`. בלי הפילטר Supabase (service-role, בלי RLS) יחזיר בשקט את כל הטנאנטים. `product_additions` — דרך `product_id IN (...)`.
2. **כל `sendMessage()`** מעביר tenantId — זה מה שקובע דרך איזה ערוץ (Meta של מי / Green של מי) ההודעה יוצאת. השמטה = ההודעה יוצאת מהמספר של טנאנט הדיפולט.
3. **כל `settings.loadAll()/get()/set()`** מעביר tenantId. יוצא דופן יחיד: vendor-alerts (platform-level, DEFAULT מפורש).
4. **כל פונקציית service חדשה** חתומה `(..., tenantId = DEFAULT_TENANT_ID)` — לעולם לא hardcode בתוך ה-query.
5. **כל `notifyStatusChange()`** מעביר tenantId (וגם את אובייקט ההזמנה המלא — נחוץ להודעת השליח).

Bot isolation is stateless by design: handlers hold zero module-level mutable state; all conversation state loads fresh from DB per message and writes back atomically. Only race: same customer double-sending within ~500ms (last write wins — bad UX, not a leak).

---

## Known Issues & Lessons Learned

### Infrastructure

**Direct DB access is impossible — use the Management API, period.** Three dead ends, do not retry: (1) `db.umoftdmutxhrbknowbyh.supabase.co` is IPv6-only — times out locally AND on Render (no outbound IPv6); (2) the Supavisor pooler returns "Tenant or user not found" for this project; (3) the `pg` npm package was removed 2026-05-26 — do not re-add. The SQL editor works as fallback but only from a desktop browser (mobile gives protocol error 08P01; running statements one at a time also helps).

**Render:** Starter plan ($7/mo, always-on — do not downgrade to Free, it cold-starts 30-60s). The env-vars API paginates at 20 by default — `backup-render-env.js` uses `?limit=100` (a truncated backup once silently dropped 5 vars). ANTHROPIC_API_KEY was once lost in a service recreation — hence the backup-first rule. Both env scripts read `RENDER_API_KEY` from env/.env.production (never hardcoded — a hardcoded fallback in these scripts was the last committed secret found in the 2026-07 sweep); backup merges over the local file so local-only keys survive, sync excludes `RENDER_API_KEY` from the push. UptimeRobot monitors `/health` (done).

**Shared working directory:** multiple Claude sessions can work in this folder simultaneously (no separate worktrees). An uncommitted edit can get swept into another session's `git add -A` commit. If `git diff` shows nothing for a change you just made, `git log -S"<unique string>"` finds which commit took it.

**claude.js uses its own Supabase client** (not importing supabase.js) to avoid circular dependencies; api_usage rows are logged fire-and-forget from `response.usage`.

### WhatsApp

**Green API (legacy):** webhook verified by instanceId only (no HMAC) — forgeable by someone knowing tenant UUID + instanceId, accepted risk at current scale. Test instances are whitelisted to 3 numbers (HTTP 466 beyond). Poll webhooks fire on every vote change — only process when the ✅ confirm option is voted. Instance swap requires 4 steps: env+sync+redeploy, setSettings webhookUrl, verify `authorized` state (QR if not), update bot_url setting.

**Meta:** subscription/sandbox/pricing gotchas are documented in Architecture → WhatsApp Channels — all were hit in practice during the 2026-07 migration.

**Simulating incoming messages via curl:** POST the raw webhook body to `/webhook` (or the local preview). Meta shape: `{object:'whatsapp_business_account', entry:[{changes:[{value:{metadata:{phone_number_id}, messages:[{from, type:'text', text:{body}}]}}]}]}` — phone_number_id must resolve to a tenant. Green shape: `{typeWebhook:'incomingMessageReceived', instanceData:{idInstance}, senderData:{sender:'<phone>@c.us'}, messageData:{typeMessage:'textMessage', textMessageData:{textMessage}}}` — idInstance must match or it's dropped silently. Admin bot: use a phone that exists in admin_users for that tenant. Full E2E pattern: INSERT test orders via Management API → POST simulated webhooks → wait ~3s (handler runs after the 200 ack) → SELECT to verify → DELETE test orders + sessions afterwards. The local preview runs plain `node` (no watch) — restart `preview_start` after editing handler code. Direct SQL UPDATEs bypass `invalidateCache()` — simulate admin actions through the API/webhook, not SQL, when cache freshness matters.

### Bots & Prompts

**Code-level guarantees beat prompt instructions.** Two incidents: (1) "tell the customer if a topping ran out mid-conversation" as a prompt rule did nothing — the fix queries the DB before every Claude call and injects explicit stock status; (2) even a system-prompt injection lost to a history full of stale "ran out" messages — attaching the live status to the current user message (not persisted) is what reliably overrides conversation momentum. Same principle: both bots read ALL dynamic values (business name, hours, open state) from settings/live queries — never hardcoded in prompt strings.

**Claude fills silence with helpfulness.** Empty/unset prompt sections ("לא מוגדרות") read as invitations to volunteer configuration help — omit empty sections entirely, and keep "ענה רק על מה שנשאלת". An ACTION-only reply on a first message once sent the privacy notice alone — guard `cleanText` and provide a fallback greeting.

**Session hygiene:** admin `reset`/`אפס` clears stale test history (repeated same-session tests confuse state). Stale customer sessions (>3h) auto-reset. `pruneOldSessions()` deletes 90-day-inactive sessions daily (GDPR).

**Admin phone in admin_users can't order as a customer** — routing is binary at `getAdminUser()` (which lives in supabase.js, the DB layer — index.js needs it before choosing a handler). By design; mention it when onboarding admins.

### Frontend

**RTL:** `input[type=time]` (and any inherently-LTR formatted input) needs `dir="ltr"` or it renders reversed.
**SPA pages:** every `page-*` div must sit inside `.main` — orphaned HTML outside it renders on every tab, always-visible. Removing a tab = delete BOTH nav button AND page div (sidebar + mobile bottom-nav both). `showTab()` syncs active state in both navs.
**Toasts:** `textContent` only — SVG/HTML strings render as raw text.
**Receipts:** print popups can't render SVG — plain-text characters only (₪, →).
**Business hours schema:** `{is_open, open, close}` per day (`is_open`, not `closed`); default open 10:00-22:00.
**GET routes must select every column clients need** — Supabase returns only named columns; a saved-but-not-returned field means prefill silently shows stale data.

### Payments & GDPR

Cardcom: `CARDCOM_TERMINAL` (terminal number like 1000) ≠ CompanyId; `CARDCOM_USERNAME` is the ApiName, not a human login. Client flow: client signs up at cardcom.co.il → rep sends terminal+ApiName to Jasell → vendor enters in onboarding step 2 → seeded to tenant settings.
GDPR erasure (`DELETE /api/customers/:phone`, requireAdmin only): delete session, anonymize orders (don't hard-delete — breaks accounting/sequences). Privacy-policy link on first bot message only.

### Testing (Jest 30 + supertest)

Anatomy of a working setup — all learned the hard way:
- `index.js` guards `app.listen` with `require.main === module` (else EADDRINUSE across suites); its `setInterval`s keep the loop alive → always `--forceExit`. **Every new setInterval callback must be added to the supabase mock in all four suites that require index.js** (webhook-routing, payment-webhook, audit-trail, onboarding) or Jest throws "callback must be a function".
- Mock factories are hoisted: outer variables referenced inside must be `mock`-prefixed (Jest 30 enforces it).
- Supabase mock chains must mirror real usage: `select()` returns `{eq: ...}` (not a bare promise); `update().eq()` must be a *thenable* that also chains `.select().single()` (`Object.assign(Promise.resolve(result), {select: ...})`); include `.neq()` where routes filter with it.
- The greenapi mock must export `formatPhone` (index.js imports it at module load).

### Security notes

**Secrets hygiene pivot (2026-07-15).** CLAUDE.md originally carried live secrets for agent autonomy. Lesson: autonomy doesn't require committed secrets — local gitignored files + Claude memory give identical capability with zero repo exposure. Everything once committed was rotated/disabled (git history is unerasable); the Supabase rotation used the new-API-keys path (create `sb_secret` → swap → disable legacy) for a zero-downtime kill of the leaked service_role. Access principle going forward: by role's needs, not trust — support/onboarding roles work through the dashboards and need no raw keys.

`timingSafeEqual` throws on length mismatch — always try/catch around it (attacker-controlled input has arbitrary length). Rate limiting (login 10/15min, public onboarding 20/hr) uses in-memory store — resets per deploy, acceptable at this scale, no Redis until multi-instance.
