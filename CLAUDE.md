# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Jasell** — a multi-tenant WhatsApp ordering platform for restaurants. Each client business (tenant) gets an AI ordering bot, a management dashboard, and a public menu page — all served from one shared deployment under `jasell.com`.

- **Customer bot:** AI-powered WhatsApp conversation (Claude) acts as a waiter → deal-breakers first (delivery/payment) → takes order → Cardcom payment → confirms
- **Admin bot:** Same WhatsApp number — if sender phone is in `admin_users` table, routed to `admin-handler.js` instead of customer bot
- **Public menu page:** `/menu.html?biz=<slug>` — mobile-first kiosk: add-to-cart with a portion-aware topping builder (שלם/חצי/רבע + side for halves), floating cart, one composed WhatsApp message the bot parses as free text (cart is client-side only; server/bot stays the pricing authority — cart totals are labeled "משוער"). Served by an express route (before static) that injects per-tenant `<title>`+og tags so WhatsApp link previews show the business. `/api/public-menu` returns the EFFECTIVE open state (settings.isOpen), delivery_zones, hours_today, topping half/quarter pcts, the tenant `locale` block (language/currency/tax model), and branding (`menu_brand_color`/`menu_logo_url`/`menu_tagline` settings — dashboard הגדרות → "מיתוג תפריט"; one color themes the page, derivatives computed client-side). No fallback WhatsApp number — null hides order CTAs. Items without photos render text-only (no placeholder box).
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

**All secret values live in `/Users/apple/pizza-bot/.env.production` (gitignored) — never in this file, never committed.** If a secret ever lands in a committed file, rotate it — git history is forever.

**How to read a secret (any session, no permission needed beyond Read/Bash):**
```bash
grep "^SUPABASE_SERVICE_KEY=" /Users/apple/pizza-bot/.env.production | cut -d= -f2   # any var by name
grep "^RENDER_API_KEY=" /Users/apple/pizza-bot/.env.production | cut -d= -f2         # Render API key
```
The Supabase **Management** API token (`sbp_...`, for schema changes) is NOT in the env file — it lives in Claude's persistent memory ("Supabase Management API Token") and in supabase.com/dashboard/account/tokens.

**File missing? (fresh clone / cloud container / new machine) — bootstrap it:**
```bash
node scripts/bootstrap-env.js
```
Resolution order: existing file → secrets in process env (cloud environment config) → **RENDER_API_KEY alone reconstructs everything** (Render is the canonical store of all runtime vars). Cloud sessions therefore need exactly two things configured in the environment settings: the `RENDER_API_KEY` env var, and network access to `api.render.com` (+ whichever service APIs the task calls: `api.supabase.com`, `*.supabase.co`, `graph.facebook.com`, `www.jasell.com`). A sandbox with no network at all cannot do production operations — run those tasks in a local session instead.

Variable names (values in `.env.production` / Render dashboard):

```
PORT, PUBLIC_URL, TENANT_ID
SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_DB_PASSWORD
ANTHROPIC_API_KEY
META_WA_PHONE_NUMBER_ID, META_WA_ACCESS_TOKEN, META_WA_WABA_ID,
META_WA_VERIFY_TOKEN, META_WA_API_VERSION            # default tenant's Meta creds
META_APP_ID, META_APP_SECRET                          # Embedded Signup (post Tech Provider approval)
GREEN_API_INSTANCE_ID, GREEN_API_TOKEN, GREEN_API_BASE_URL   # legacy channel
DIDWW_SMS_USER, DIDWW_SMS_PASSWORD                    # DIDWW HTTP OUT trunk (missed-call SMS channel)
CARDCOM_API_URL, CARDCOM_TERMINAL, CARDCOM_USERNAME   # default tenant; per-tenant creds live in settings
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
SENTRY_DSN                                            # optional — error tracking; absent = disabled
ADMIN_SECRET, JWT_SECRET,
DASHBOARD_ADMIN_PASSWORD, DASHBOARD_MANAGER_PASSWORD, DASHBOARD_VENDOR_PASSWORD
RENDER_API_KEY                                        # local-only helper (not on Render itself)
```

Notes:
- `TENANT_ID` defaults to `aaaaaaaa-0000-0000-0000-000000000001` (the default/demo tenant). All tenants share this one deployment — per-client Render services are a dead pattern; never suggest one.
- **`SUPABASE_SERVICE_KEY` is a new-style `sb_secret_...` key** (2026-07-15). The project's **legacy JWT API keys (anon/service_role) are DISABLED** — any old `eyJ...` key is rejected with "Legacy API keys are disabled". New secret keys are drop-in for supabase-js; the Management API token (`sbp_...`, in Claude memory) is a separate credential and unaffected.
- **Cardcom test account: `Cardcomtest26` / terminal 1000 — WORKING** (verified 2026-07-18: LowProfile/Create returns ResponseCode 0 with a live payment URL). Portal login password is `CARDCOM_PORTAL_PASSWORD` in the env file. The previous account (`CardTest1994`) is dead (603). Real clients supply their own terminal via onboarding.
- Direct Postgres access does not work from anywhere (see DB access lesson below) — the `SUPABASE_DB_PASSWORD` is effectively unusable.
- **`META_APP_SECRET` is load-bearing since 2026-07-27** — Meta webhook signature verification enforces whenever it is set. If it is ever rotated in the Meta App Dashboard, Render must be updated **in the same breath** or the bot stops receiving messages entirely. The symptom in the logs is a flood of `[webhook:meta] rejected — signature invalid`. Startup prints which mode is active.
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
# ⚠️ MANDATORY ORDER: ALWAYS run backup-render-env.js immediately before sync-render-env.js.
# Render is the canonical store and parallel sessions update it — pushing a stale local file
# silently overwrites their changes (this took the bot down on 2026-07-22 by reverting Meta creds).
# Pull → edit the one var you're changing → push. Never push without a fresh pull.

# Fetch Render runtime logs
curl -s "https://api.render.com/v1/logs?resource=srv-d831jc8js32c73ef8mng&ownerId=tea-cuppja5umphs73ea2qe0&limit=200" \
  -H "Authorization: Bearer $RENDER_API_KEY" | python3 -c "
import sys,json; data=json.load(sys.stdin)
logs=data if isinstance(data,list) else data.get('logs',data.get('data',[]))
[print(l.get('timestamp','')[-12:], l.get('message','')) for l in logs]
" | tail -100

# Before every push (MANDATORY)
node --check public/app.js && node --check public/admin.js
npm test -- --forceExit     # 509 tests across 26 suites; --forceExit avoids hanging on setInterval timers

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
│   │   │                         #   overnight-window aware, open_override with built-in expiry)
│   │   ├── menu-service.js       # Live products from DB, 3s TTL cache
│   │   ├── status-notifier.js    # Customer + courier WhatsApp notifications on status change
│   │   ├── locale.js             # Per-tenant region/currency/tax model (IL inclusive | US exclusive)
│   │   ├── phone.js              # E.164 normalisation; dial code per tenant (also a comparison key)
│   │   ├── slug.js               # Business-name slugs for public menu URLs (Hebrew transliteration)
│   │   ├── sse.js                # SSE broker — Map<tenantId, Set<res>>, broadcast(), subscribe();
│   │   │                         #   25s keepalive is a REAL 'ping' event (client heartbeat), not a comment
│   │   └── vendor-alerts.js      # Throttled WhatsApp alerts to vendor
│   ├── routes/
│   │   ├── dashboard-api.js      # All /api/* endpoints — tenant-scoped, vendor routes, onboarding, inbox
│   │   ├── call-events.js        # POST /webhook/calls/:tenantId — VoIP CDR webhook (missed-call recovery)
│   │   ├── payment.js            # POST /webhook/payment + GET /payment/success (embeds rv= in URL)
│   │   ├── admin.js              # Legacy /admin/orders (backwards compat)
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
├── tests/                        # 26 suites / 509 tests — auth, sessions, admin bot, webhook routing
│                                 #   (incl. Meta), onboarding+draft, payments, audit, settings+overnight,
│                                 #   meta-whatsapp parsing, slug, inbox/handoff, missed-call recovery
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
POST /webhook/calls/:tenantId → VoIP CDR webhook, missed-call recovery (call-events.js; ?token= auth;
                            also registered BEFORE :tenantId — same never-reorder rule)
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

### Missed-Call Recovery (telephony → WhatsApp)

The tenant's business number lives at a VoIP provider (pilot: DIDWW — number owned by Jasell, calls forwarded to the owner's mobile). The provider's CDR webhook POSTs every inbound call to `/webhook/calls/:tenantId?token=<missed_call_webhook_token>`; unanswered calls trigger a WhatsApp recovery message to the caller ("we missed your call — order here"), turning missed calls into bot conversations.

- **Business-initiated ⇒ Meta requires an approved template** (`missed_call_template` setting, default `missed_call_recovery`, lang `he`). Sent via `greenapi.sendTemplate()` facade → Meta tenants get the template, Green API tenants get plain text (`missed_call_text`) — no template rule on the unofficial channel. Customer's reply opens a free 24h service window; the normal bot takes over.
- **Alternative channel: SMS** (`missed_call_channel` setting: `whatsapp` default | `sms`) — DIDWW HTTP OUT (`sms.js`), zero Meta approval dependency; text = `missed_call_sms_text` or default with a `wa.me/<bot_whatsapp>` link that hands the reply to the bot. Sender = `missed_call_sms_sender` (fallback `bot_whatsapp`). Requires env `DIDWW_SMS_USER/PASSWORD` + Render outbound IPs whitelisted in the DIDWW trunk. Adopted as the bridge while template approval is stuck on business verification (2026-07-21); conversion comparison vs template pending.
- **Filters before sending:** unusable caller id (anonymous), the forward-target phone (`missed_call_forward_number`), couriers, admin_users, business closed (unless `missed_call_when_closed`).
- **Throttle:** in-memory per `tenant:caller`, `missed_call_throttle_hours` (default 3h) — also absorbs provider webhook retries/duplicates. Resets on deploy (accepted, like login rate limiting). Failed sends release the throttle key.
- **CDR parsing** (`parseCallEvents`): DIDWW Voice IN shape `{data:[{type:'inbound-cdr',attributes:{success,duration,time_connect,src_number}}]}`; caller-field probing covers naming variants. Answered = `success===true` | `time_connect` | `duration>0`. Unparsable bodies are logged in full — calibrate against the first real event.
- **Every processed CDR is persisted** (2026-07-28): `call_events` row per event with its outcome (`answered` / `recovery_sent` / `send_failed` / `skipped_*` / `unusable_caller`) via `services/recovery-attribution.js` — the KPI funnel is built from these rows, and `recovery_sent` rows double as the **durable throttle** (DB checked when the in-memory map is empty, so the throttle now survives deploys). Attribution (24h window, Meta's service window): `markResponded()` fires from ai-handler on new conversations only; `markOrder()` fires from `orderState.afterCreate` (idempotent — an event is claimed once). Both are fire-and-forget and never throw.
- **Settings** (per tenant): `missed_call_enabled`, `missed_call_webhook_token` (required — 403 without it; **PATCH /settings refuses to enable the toggle without a token**, since an enabled-but-tokenless tenant 403s every CDR and DIDWW retry-spams on non-2xx), template name/lang/params, text fallback, forward number, throttle hours, when-closed. Dashboard toggle: הגדרות → "שיחות שלא נענו".
- Master switch off ⇒ webhook returns 200 (not 4xx) so the provider doesn't retry-spam.
- **Onboarding a client onto this feature: follow `docs/ONBOARDING-PLAYBOOK.md`** — the validated ops checklist (number purchase incl. dirty-number check, WABA wiring, per-WABA template, settings seed, CDR stream config) with every production gotcha indexed.

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

**`approve` is guarded and resumable (2026-07-27).** It is a seven-step, multi-system transaction that used to run with no state check, no concurrency guard, no error checking and no retry path — a double-click duplicated the tenant's entire menu and minted a second working login, and any failed step left a half-provisioned business that still reported success. Now: only a submitted, unexpired session can be approved (`approved` → 409, `pending_client` → 409, expired → 410); the session is claimed optimistically into `provisioning` so two clicks cannot both proceed; every step records itself in `onboarding_sessions.provisioning` so a retry skips what already succeeded; every DB call's error is checked and aborts with the step name (`{error, step, resumable:true}`) plus a vendor alert; the menu copy is additionally skipped when the tenant already has categories; credentials reuse the tenant's existing username instead of minting a new one per run; **a failed `subscribeWaba`/`setWebhook` now fails the approval** rather than marking a business live with a dead bot. Credential delivery is best-effort but its outcome is returned (`credentialsDelivered`) so the vendor knows to pass the password on by hand. `POST /vendor/onboarding/:id/reset-credentials` issues a new password (nothing stores the plaintext, and there is no password-change screen — this is the way back in when it is lost). The vendor list no longer hides approved sessions (`?include_approved=false` to opt out), because hiding them left no surface to retry or reset from.

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
8. Parse/strip ACTION blocks → send clean text; privacy-policy link appended ONCE per customer lifetime (`sessions.privacy_sent_at`, survives resets; stamped only after a delivered send; re-sent only if the row is pruned after 90d inactivity)
9. Dispatch: SAVE_ORDER | CREATE_PAYMENT | RESET (SHOW_TOPPINGS deprecated 2026-07-28 — toppings are FREE TEXT: customers describe portions naturally ("חצי זיתים, רבע תירס"); topping objects carry optional `portion`; partial pricing = full price by default, tenant-tunable via `topping_half_pct`/`topping_quarter_pct`; if the model still emits SHOW_TOPPINGS the handler falls back to a free-text question, never a poll)
```

### Order Edit/Cancel Window (customer self-service)

Status-based, no time limit: cancellable while `status ∈ {'new','scheduled'}` and `allow_order_edits` setting ≠ false; locked from `'preparing'`. Checked deterministically in ai-handler on fresh conversations (cancel keyword → cancel; otherwise informative reply, Claude skipped). **`'scheduled'` must always accompany `'new'` in such checks** — scheduled orders never pass through `'new'` (`processScheduledOrders()` moves them straight to `'preparing'` at `scheduled_for - prep_lead_time`). Staff editing (dashboard/admin bot/dispute) ignores this setting by design.

### Admin Bot (admin-handler.js)

Sender in `admin_users` → admin bot on the same WhatsApp number (sessions keyed `admin:<phone>`). System prompt carries live state: current IL date/time line (answer time questions from it only), **the EFFECTIVE open/delivery state from `isOpen()`/`isDeliveryOpen()` (not the raw flags — the raw `is_open` line at midnight is why the bot once argued the business was open while customers got "closed")**, payment status, full product+topping availability, active orders (Bit-pending flagged). `reset`/`אפס` clears the session; **admin sessions also stale-reset after 3h** like customer ones (a 7h-old afternoon exchange used to outweigh the live clock in the prompt).

ACTION blocks: `SET_AVAILABLE` (checks ALL occurrences of a name — standalone product + per-pizza topping; limits 500/100 to avoid silent truncation; logs updated row ids), `ORDER_STATUS`, `CANCEL_ORDER`, `DISPUTE`, `SET`, `SET_DELIVERY_HOURS`, `UPDATE_PRICE` (multi-match → asks for the exact name instead of silently repricing every ilike hit), `LIST_ORDERS`, `CONFIRM_PAYMENT` (Bit), `OVERRIDE` (below).

**Spontaneous open/close — `open_override` (2026-07-28).** "תפתח עכשיו לעוד שלוש שעות" at 00:29 used to map to `SET is_open:true` — a no-op outside the hours window, reported as "בוצע ✅" (failure class 9's founding incident). Now:
- Setting `open_override` = `{state, until, set_by}` (JSONB; `false` = no override — the column is NOT NULL). While `now < until` it wins in `isOpen()` over both the flag and the hours window; in `isDeliveryOpen()` it wins over the hours window but NOT over `delivery_enabled:false` (structural "we don't deliver"). The expiry lives inside the value — no watchdog, nothing can stay "temporary" forever.
- `ADMIN:OVERRIDE:{state,hours}` (≤24h, default 3) / `{cancel:true}`; prompt rules route temporary/out-of-hours requests to OVERRIDE and keep `SET is_open` for permanent kill.
- **Closed loop:** every open/delivery-touching action (SET is_open/delivery_enabled, both HOURS actions, OVERRIDE) is followed by a read-back of the effective state, appended as "📍 מצב בפועל: …"; flag-on-but-outside-hours adds a hint to use the override. Success is reported from the outcome, never the write.
- Dashboard: settings page shows an effective-state banner (`GET /api/settings` returns `_effective {open, delivery, override}`; `_`-prefixed keys are never persisted by PATCH) with an override chip + "בטל חריגה".

### Attributes, Exports & Phone Numbers (2026-08-26)

Three leftovers from the localisation sweep, all of the same shape: a mechanism that covered the common case and silently skipped the rest.

- **Attributes translate with no opt-in marker.** `i18n.js` only ever translated `textContent`, so 19 `title` attributes and 13 `placeholder`s stayed Hebrew — nobody forgot a marker, the marker never existed for attributes. `translateAttrs(root)` now translates `title`/`aria-label`/`placeholder` straight from `HE2EN` at DOMContentLoaded (and is exported for markup rendered later). **Having a dictionary entry IS the opt-in**; a value with no entry is left alone, so a business name or address in an attribute is never touched. Attributes built inside template literals still wrap inline with `TR()` — they are not in the DOM when the pass runs. The audit enforces the contract, and the language toggle's `title="English / עברית"` carries an explicit identity entry — considered, not forgotten.
- **The CSV export leaked Hebrew under translated headers.** `statusHe` was a second, untranslated copy of `STATUS_LABELS`; the column values bypassed `TR` entirely while the headers above them were translated. Deleted — there is one status vocabulary now. The filename was Hebrew too.
- **`services/phone.js` is the single phone normaliser.** The rule lived twice, character for character, in `greenapi.js` and `meta-whatsapp.js`, and both were Israel-only (`startsWith('0') && length === 10 → '972' + …`). That rule is *safe* for a US number — an area code cannot begin with 0 — but not *sufficient*: a US number arrives as ten bare digits and WhatsApp needs the country code, so an American tenant's messages would have gone to a malformed recipient. The dial code comes from `resolveLocale()` and defaults to Israel, so every existing call is unchanged.
  - ⚠️ **The output is a COMPARISON KEY as well as a destination** — `call-events.js` matches a caller against couriers and the forward number on it. Every number in one comparison must be normalised with the SAME dial code, or equal numbers stop looking equal. That file resolves the dial code once and funnels all of them through one `fmt()`.
  - An unrecognised length is passed through untouched rather than guessed at, for the same reason.

### Onboarding Wizard Localisation (2026-08-26)

The wizard runs **before the tenant exists**, so its language cannot come from tenant settings. `onboarding_sessions.region` (`IL`|`US`) is chosen by the vendor when the link is created — the only moment anyone is actually thinking about which country the client is in — and that one choice drives three things: the wizard's language and examples, `<html lang/dir>` (stamped server-side in `index.js`, same reason as the public menu), and the tenant's `region`/`currency`/`tax_mode`/`tax_rate`/`tax_label` seeded by `approve`.

- **Static prose is translated by walking TEXT NODES**, not by tagging every element with a `data-` attribute. This page is ~90% static prose, and hand-marking each string is exactly the manual step that left ten strings behind on the dashboard. Unknown text is left untouched.
- **Examples are region-appropriate, not translated**: a Los Angeles client is shown `123 Main St, Los Angeles, CA 90012` and a dollar-priced sample menu, not a transliterated Tel Aviv street.
- `scripts/audit-classes.js` covers `OB_HE2EN` alongside `MENU_HE2EN` via one `pageCoverage()` check — both were verified to fail by planting a violation.
- ⚠️ The region migration is in `supabase/migrations/2026-08-26-order-tax.sql` and must be applied before deploying.

### Public Menu Localisation (2026-08-26)

`menu.html` is the first page an American customer sees — it is what the WhatsApp link opens — and it had no i18n at all: `<html lang="he" dir="rtl">` hardcoded, ~111 Hebrew strings, and `fmtPrice()` returning a `₪` **suffix** (the wrong symbol *and* the wrong position — `$` leads, `₪` trails).

- **Language follows the TENANT, not the operator.** `i18n.js` reads the dashboard user's `localStorage`; that is the wrong source for a customer-facing page. `GET /api/public-menu` now returns a `locale` block (language, region, currency, tax_mode/rate/label) resolved from the tenant's settings.
- **`lang`/`dir` are stamped server-side.** The existing per-tenant head-injection route in `index.js` (which already rewrites `<title>`+og tags) also rewrites the `<html>` tag and sets `window.__MENU_LANG__`. Doing it from JavaScript after the API round-trip would lay every page out backwards for a frame. `?lang=he|en` overrides, for sharing a translated link.
- **Its own dictionary (`MENU_HE2EN`), deliberately.** These are customer strings, not operator chrome, and a public page should not carry the whole dashboard vocabulary. `scripts/audit-classes.js` covers this map too, so a new `M()` string with no entry fails the build.
- **Portion values stay canonical Hebrew** (`data-portion="חצי"`) while the visible label translates: `pricing.js` `portionFactor()` already matches `/חצי|half/`, and the composed WhatsApp message is read by both the bot and a human.
- **`nameOf()`/`altName()`** render product and category names by language; a legacy row whose `name_en` was backfilled with the Hebrew name is correctly treated as untranslated (same test as `hasEnglishName`).
- **The cart caveat names the tax in exclusive regions.** The cart was already labelled "משוער" because the server is the pricing authority — but in a US region it is also systematically LOW, since the menu is pre-tax. Quoting $12.99 and charging $14.22 without saying so is a dispute, not a rounding difference.

### Customer Language & Menu Names (2026-08-26)

Two separate defects, both of which made an English-speaking customer read Hebrew.

**`sessions.language` was a dead column that produced wrong behaviour.** It has existed since the first schema, but was only ever *written* as `'he'` — in `DEFAULT_SESSION` and again on every `clearSession`, which the 3h stale-session guard calls routinely. The one place that *read* it (the after-hours "we're closed" reply) therefore always spoke Hebrew. Meanwhile `detectLang()` was recomputed per message from a history that same guard wipes, so an English customer answering "ok", "👍" or a house number scored as Hebrew and got flipped mid-conversation.
- `resolveLang(msg, history, session)` is sticky: a clear signal updates the language, ambiguity (<3 letters, or genuinely mixed) keeps what is already known. It is resolved **once per message** at the top of `handleMessageInner` and persisted, so every branch below agrees — deciding per branch is what let the after-hours reply disagree with the rest.
- `clearSession` no longer resets it. Language is a fact about the **person**, like `customer_profile` and `privacy_sent_at` — not about the conversation.
- **`order-state.js` resolves it from the session when the caller doesn't pass one.** `lang` was an optional parameter defaulting to `'he'` and *every* dashboard/kitchen/admin-bot caller omitted it, so every staff-triggered status update reached an English customer in Hebrew — while `status-notifier.js` had carried `he`/`en` variants for every message all along and nothing ever selected the English one. Fixed at the single exit point rather than by asking each caller (a default that callers forget is failure class 6: the trap, not the safety net). An explicit `lang` still wins — the admin bot knows the language of the exchange it is in.

**`name_en` was backfilled with the Hebrew name**, in five insert paths (`name_en: name_en || name_he`), on a `NOT NULL` column with an optional form field. So "has an English name" and "never got one" were indistinguishable — every `if (p.name_en)` was true, the dashboard could not report an untranslated menu, and nothing could fall back sensibly. Now `enName()` stores `''` for a blank or Hebrew-equal value, and `normaliseNameEn()` covers the PATCH paths.
- **`hasEnglishName(row)` = `name_en` non-empty AND ≠ `name_he`** — the same test `menu.html` has always used, so old rows carrying the backfill are read correctly without a migration.
- `nameOf(row)` (menu rows) and `itemNameOf(it)` (order items, a JSONB snapshot that historically held only `name`) render by language. Before this, every render took `name_he` unconditionally: switching the dashboard to English still listed products in Hebrew even where a real English name existed.
- ⚠️ Topping handlers (`toggleToppingByName`, `updateToppingPrice`, `deleteToppingByName`) and `_unavailableTag` match on **`name_he`** — those are lookup keys, not display. Only the visible text switches.
- **מוצרים tab shows a coverage banner** in English mode listing rows with no English name. Without it a tenant who skipped the field finds out when a customer reads their order back in Hebrew.
- **`orders.items` now carries `name_he`/`name_en`** (2026-08-26). It is a JSONB snapshot that used to hold only `name` — the language the bot happened to be speaking — so a finished order could never be re-rendered in the other language, and no later fix could recover it (the menu row may have been renamed or deleted by then). `pricing.js` was already matching each item to its menu row for pricing and simply discarded the row; it now copies the names onto the stored item. **Additive only**: the original `name` is never rewritten, and an unmatched item is stored exactly as it arrived. Orders created before this stay Hebrew — that history is gone.
- **`pricing.js` matches on EITHER name, and so does the stock check.** Once the public menu became bilingual, a US customer's WhatsApp message says "2× Family Pizza" — a Hebrew-only match would score every American order as `unmatched`, silently handing pricing authority back to the model on exactly the orders the server-side recompute exists for. The same applied to `ai-handler`'s mid-conversation availability injection: an English customer writing "no olives" never triggered it. That block exists precisely because a prompt instruction did not hold, so it has to hold in both languages or it only half-exists.

### Region, Currency & Tax (2026-08-26)

Israel and the US do not disagree about the tax *rate* — they disagree about what a menu price **means**. Israel prices tax-inclusive (₪50 on the menu is ₪50 charged; the receipt back-computes the VAT inside it). The US prices tax-exclusive ($12.99 on the menu is $12.99 **plus** tax at checkout). `vat_rate` was a bare number and the only formula in the codebase was the Israeli one, so changing 18 to 9.5 would not have localised anything: `pricing.js` would still hand the processor a **pre-tax** amount while the receipt printed a tax nobody collected — a tax document with a fabricated line on it (failure class 8, with the payment processor as the diverging source).

- **`src/services/locale.js` is the single resolver.** `resolveLocale(allSettings)` → `{region, currency, taxMode, taxRate, taxLabel, taxOnDelivery, locale, addsTaxAtCheckout, …}`. `region` (`IL`|`US`) supplies **defaults only**; every individual key overrides it, because a tenant's real rate is a fact about their address (City of LA 9.5%, Santa Monica 10.25%), not their country. No second cache — it derives from `settings.loadAll()`'s existing 3s snapshot.
- **Backward compatibility is load-bearing:** no `region` = `IL`, and the legacy `vat_rate` is still read when `tax_rate` was never written. An existing Israeli tenant prices **identically** — the alternative is silently repricing live businesses on deploy, a defect nobody notices until a customer argues about a receipt.
- **`tests/il-pricing-frozen.test.js` is the guard, and its numbers were CAPTURED, not chosen.** A temporary A/B harness ran `main`'s `pricing.js` against the new one across 12 order shapes × 5 settings variants; all 61 comparisons matched, and those outputs are now frozen as the expectations. An inclusive-region total that moves off one of them is a regression whatever the reason. Verified to actually bite: making inclusive tenants charge tax on top turns 55 of the 60 red. **Never edit a number there to make a test pass** — add a case when a new pricing input appears.
- **`pricing.js` adds the tax to the authoritative total in exclusive regions.** This is the only change here that alters what a card is charged. The model is judged on the **pre-tax subtotal** (it quotes from a pre-tax menu), and the server adds tax on whichever base survived that check — comparing its quote to a tax-inclusive total would flag every US order as a model error and drown the insight queue.
- **`orders.tax_rate` + `orders.tax_amount` are frozen at order time**, exactly like `delivery_fee` and for the same reason: districts vote on levies, and a receipt reprinted next year must show the rate actually charged. ⚠️ **The migration (`supabase/migrations/2026-08-26-order-tax.sql`) must be applied BEFORE deploying** — `saveOrder` passes the object straight to `insert()`, so a missing column fails order creation.
- **Dashboard:** הגדרות → "אזור ומטבע" (region + currency) and "מס" (model, rate, receipt label, tax-on-delivery). The tax card renders a **live worked example** — the same percentage produces different money in the two models, and a number alone does not show that. `tax_on_delivery` only appears in exclusive mode, where it is a real question.
- **PATCH /settings validates region/currency/tax_mode/tax_rate at the door** and seeds the region's tax model on a region change, so a stale `vat_rate` from the previous country cannot outrank the new default through the legacy fallback.
- **Client money goes through `money()`** (`Intl.NumberFormat`, tenant currency, dashboard locale — $ leads in English, ₪ trails in Hebrew) and tax through `taxOf()` / `taxOfOrder()`. `LOCALE` is `en-US`, not `en-GB`: 12/08 means December 8th to the audience this was localised for.

### Money Display (2026-07-27)

VAT and the delivery fee were literals in the client — `18%` and `₪30` in four places — and `orders.delivery_fee` did not exist, so the ₪30 fallback was the *only* branch that ever ran: a tenant charging 25 printed 30 on every receipt, which is a tax document with a wrong number on it.

- `orders.delivery_fee` is now recorded **at order time** (`services/delivery-fee.js` resolves it from the tenant's `delivery_zones`, longest city name first so "תל אביב יפו" beats "תל אביב"), and carried through the Cardcom round-trip in `order_data`. Freezing it means a later edit to the zone table cannot rewrite what a customer was charged.
- `vat_rate` is a per-tenant setting (default 18), edited in הגדרות → מע"מ.
- `GET /api/business-config` (requireAuth, unlike admin-only `/settings`) serves `vat_rate` + zones so managers' dashboards render money correctly too.
- When no fee can be determined the line is **omitted** rather than filled with a guess.

### Stats Correctness (2026-07-27)

Three defects made the stats page answer business questions wrongly:

- **The payment-split donut was permanently empty** — the query never selected `payment_method` while the split filtered on it. Selected now, with a `bit` bucket alongside cash/credit.
- **Revenue counted money that had not arrived.** It was every non-cancelled order, so orders the business never approved, unpaid Bit orders and refunded ones were all reported as income. `revenue` is now paid-and-not-refunded only, with `revenue_pending` and `revenue_refunded` returned separately; the dashboard shows "הכנסות (שולם)" next to "ממתין לתשלום" instead of one inflated figure.
- **Days and hours were server-local (UTC on Render)** while the whole product reasons in Asia/Jerusalem, so "today" was off by 2-3 hours at both ends: the 00:00-03:00 rush was filed under the previous day and the peak-hours chart the owner staffs to was shifted by the offset. `src/services/il-time.js` owns the boundaries (`periodRange`, `ilHourOf`, `ilDayKey`), DST included — probing UTC+2/UTC+3 and keeping whichever round-trips.

### Message Delivery Integrity (2026-07-27)

`reply()` in ai-handler used to swallow every send failure, so a rejected message still had its text written into `conversation_history` as though the customer had read it — the bot's record then disagreed with reality and Claude reasoned from the fiction on the next turn. Now `reply()` returns whether the send landed; **the assistant turn is only appended to history when it was actually delivered**, so the next turn re-states it instead of building on something the customer never saw. A failure raises the `deliveryFailed` vendor alert, and when it is an *order confirmation* that failed, the tenant's admins are WhatsApped directly — the order row exists, the customer does not know it, and only the business can pick up the phone.

**Push subscriptions are owned and revocable.** `push_subscriptions.username` records who created it (order notifications carry the customer's name and total, so a device that once logged in kept receiving them forever with no way to stop short of hand-written SQL); `GET/DELETE /api/push-subscriptions[/:id]` list and revoke, tenant-scoped. Delivery counting is honest: **403 `VapidPkHashMismatch`** — what the 2026-07 VAPID rotation left behind — is now treated as dead alongside 404/410 instead of being counted as a success, `last_ok_at` records real deliveries, and the subscription-lookup error is no longer discarded (push could be entirely dead with zero log output).

### Marketing Opt-Out (2026-07-27)

Business-initiated messaging needs a way out — there was none anywhere in the product. `sessions.opted_out` + `opted_out_at` hold it. The keyword intercept lives at the very top of `handleMessageInner`, before the dispute, handoff and business-hours branches, because an unsubscribe has to work while a human holds the conversation and outside opening hours; it is matched **exactly** (`הסר`, `stop`, `unsubscribe`, …) rather than by substring, since "תסיר לי את הזיתים" must not silently unsubscribe a customer. `הצטרף`/`start` re-subscribes.

Suppression applies to **business-initiated** messages only — broadcasts and missed-call recovery. Order status updates are transactional (the customer's own order triggered them) and keep flowing, which is what the opt-out confirmation tells the customer. `getOptedOutPhones()` **fails closed**: if the lookup errors, every candidate is treated as opted out rather than risking a send. The broadcast appends an opt-out line automatically, reports `skipped` plus per-recipient `failures` (a bare count left nothing to retry), and the UI blocks a second click mid-batch.

### Inbox / Human Agent Handoff

**The handoff has an exit (2026-07-27).** `is_bot_active=false` used to be a one-way door — nothing but the 90-day session prune ever set it back, so an agent who got pulled away left that customer permanently unable to order, silently (the only signal was an SSE event to a dashboard nobody had open). Now: `handoff_at` stamps the takeover, an agent reply restarts that clock (and re-arms the alert), `superviseHandoffs()` (index.js, every 60s, same Render-only gate as the escalation loop) pings the admins on WhatsApp once when a customer has waited `handoff_alert_minutes` (default 5) with unread messages, and returns the conversation to the bot after `handoff_timeout_minutes` (default 30) with no agent activity — telling the customer. Both takeover and hand-back now message the customer (`notify_customer:false` to suppress). `setBotActive(true)` no longer zeroes `unread_count`, which used to hide still-unread messages from the inbox list at the moment the agent stepped away. `/inbox/:phone/reply` broadcasts `inbox_message` so a second agent sees it. Settings card: הגדרות → "שיחה עם נציג". DB: `sessions.handoff_at`, `sessions.handoff_alerted_at`.

**The feed reflects every conversation, live (2026-07-28).** `recordInboundForInbox()` in ai-handler is the ONE place an inbound customer message reaches the dashboard: it stamps `last_customer_message`/`last_message_at` and broadcasts `inbox_message` for bot-handled messages too — previously both existed only on the agent-mode path (class 7), so bot conversations never moved in the feed and their previews froze. `unread_count` still increments only in agent mode (a message the bot answered is handled; a badge counting answered messages is permanent noise). The broadcast carries `is_bot_active` so the client doesn't paint bot conversations with the agent amber dot.

**Dashboard SSE is ONE supervised connection (2026-07-28, failure class 10).** app.js used to hand-roll three EventSources (orders / kitchen tab / inbox) at different robustness levels — the inbox one had no error handler plus a guard that kept the dead object forever, so every deploy silently killed the messages feed while orders reconnected. Now: consumers register via `sseOn(event, fn)` / `sseOnReconnect(fn)` / `sseOnStatus(fn)`; the single owner reconnects with backoff on error, watchdogs the server's 25s `ping` event (90s silence → forced reconnect — a handle in a variable is not a live connection), and fires resync callbacks after every reconnect (orders → loadOrders, kitchen → loadKitchenOrders, inbox → loadInbox) because reattaching the stream loses the gap. Inbox also gained the 30s polling fallback orders always had. The standalone kitchen.js (separate page = its own owner) got the same heartbeat watchdog + resync added to its existing retry.

`sessions` columns: `is_bot_active` (default true), `unread_count`, `last_customer_message`, `last_message_at`.
Dashboard "הודעות" tab lists all customer sessions (avatars/initials, names, timestamps, unread badges, amber dot = agent mode; mobile: list ↔ full-screen thread with back). Actions (`/api/inbox/...`): handoff (silences bot), reply (sent via tenant's channel; stored in history as `[נציג]: ...`), return-to-bot, read. Incoming messages while in agent mode stream live via SSE `inbox_message`. Escalation trigger is currently manual (dashboard button) — a bot-initiated HANDOFF action is a future step.

### Order Acceptance Flow (2026-07-26)

**`new` = awaiting business approval.** Orders are no longer born "accepted" — the customer gets "התקבלה ונשלחה למסעדה לאישור", and only an explicit accept sends the approval message (with prep-time ETA) and moves the order to the kitchen.

- **State machine — `src/services/order-state.js` is the ONLY path for status changes.** Allowed-transitions table; `transition(orderId, to, {force, by, notify, extra})` with an optimistic `.eq('status', from)` guard (CONFLICT on concurrent write), atomic `status_history` append, and a single exit point for SSE + customer/courier WhatsApp. `force:true` = explicit staff override (dashboard status select, cancellations); programmatic callers stay strict. Never write `orders.status` directly.
- **Accept:** `POST /api/orders/:id/accept {prep_minutes}` (any dashboard/kitchen role) → `accept()`, idempotent (`accepted_at` is the guard — dashboard, KDS and the WhatsApp button race routinely). An immediate order goes to `preparing` with the ETA message; **a pre-order stays `scheduled`** — approving it means "we commit to that slot", and the scheduler promotes it later. Reject = the existing cancel-refund flow.
- **Every creation path is in the flow:** immediate, **scheduled and Bit** orders all call `orderState.afterCreate(order, {notifyAdmins})` (ai-handler × 3 branches, payment.js). Bit orders defer acceptance until the money is confirmed.
- **Payment confirmation:** `orderState.confirmPayment(orderId)` is the single path for the dashboard button, the admin-bot `CONFIRM_PAYMENT` action and the WhatsApp `confirmpay:` button — guarded on `payment_status`, broadcasts SSE, messages the customer, and releases the deferred auto-accept in `auto` tenants. The customer's "שילמתי" is intercepted deterministically in ai-handler: it **never** marks anything paid, it only relays a verification request to the admins (`notifyAdminsPaymentClaim`).
- **Per-tenant mode:** `order_acceptance` setting — `manual` (DEFAULT for every tenant) | `auto` (accept immediately on creation with `default_prep_minutes`). Configured in dashboard settings ("אישור הזמנות") with an explicit warning on auto.
- **Admin WhatsApp approval:** manual-mode order → WhatsApp to all `admin_users` with summary + Meta interactive buttons (אשר / אשר עם זמן אחר / בעיה בהזמנה; an unpaid Bit order leads with 💰 קיבלתי תשלום instead). Button ids (`accept:<id>`, `acceptt:<id>:<mins>`, `accepttime:<id>`, `confirmpay:<id>`, `orderissue:<id>`) are intercepted deterministically in `admin-handler.handleOrderShortcut` — no Claude round-trip; text fallbacks "אשר <מספר> [דקות]" and "שולם <מספר>" work on Green API. Free text goes through the `ACCEPT_ORDER` action.
- **Escalation:** `escalateUnacceptedOrders()` (index.js, every 60s) covers **both** unaccepted `new` and unaccepted `scheduled` orders. Immediate orders escalate on age (`accept_reminder_minutes`, default 3; ×3 → level 2); pre-orders escalate on proximity to their slot (level 1 at lead+30 min, level 2 at lead) — nagging about tomorrow's booking would be noise. Wording is per-case: an unpaid Bit order is waiting on the *customer's* money, so admins are asked to confirm the transfer and the level-2 customer message is a payment reminder, not "we'll confirm shortly". `escalation_level` is persisted (no re-alert on restart). **Gated to Render** (`process.env.RENDER`) — a local dev server against the prod DB must never fire it (`ENABLE_ESCALATION=1` to override).
- **Scheduler (`processScheduledOrders`, every 60s):** resolves `prep_lead_time` **per tenant** (it used to read one tenant's value and apply it to everyone), promotes `scheduled → preparing` at `scheduled_for − lead`, **refuses to start a pre-order the business never approved** in manual mode, and skips orders more than 6h past their slot (post-outage guard) instead of firing yesterday's dinner into today's kitchen.
- **Refunds on cancel:** every cancel path (dashboard, admin bot, customer keyword, dispute option 1) now attempts `cancelDeal` for paid credit orders and stamps `refund_status`.
- Cardcom creds resolve per tenant (settings `cardcom_terminal`/`cardcom_username`, env for default tenant). **A non-default tenant with missing creds THROWS (2026-07-28)** — the old env fallback sent that tenant's customers' money into the DEFAULT tenant's terminal, silently. `verifyCreds(terminal, apiName)` does a minimal LowProfile/Create; onboarding's cardcom checklist item ticks only when it passes (field presence proves nothing — a wrong ApiName used to surface at the first real payment). The pending-payments poller no longer fabricates orders — it only alerts the vendor about stale pendings and prunes expired rows.

### Kitchen (KDS)

Dashboard tab + standalone `/kitchen` (kitchen role; token key = `token`, same as login). `/api/kitchen/orders` returns `new`+`preparing`+`ready`: the standalone board has a "ממתינות לאישור" column whose button calls the real accept endpoint; the dashboard tab filters to `preparing`+`ready` (approval lives in the orders tab). KDS-scale type, full-width "מוכן" button, per-card elapsed-time badge — both surfaces measure from the `preparing` transition in `status_history` (`new` counts from creation, urgent at 5m). SSE push works for new orders (saveOrder returns the full row since 2026-07-26). `ready` → WhatsApp only for pickup orders.

### Dashboard order intake (orders tab)

Incoming-orders card zone above the list (`renderIncomingOrders` in app.js): full item visibility, aging timer (green<3m/amber<6m/red), per-item out-of-stock tags (from `/products` availability), one-tap "אשר הזמנה" with prep-time quick picks (15/30/45/60; default from `default_prep_minutes`), "פריט חסר" (dispute modal) and "דחה" (cancel modal). Orders SSE connection at boot (`_ordersConnectSSE`) + WebAudio chime + tab-title flash; 30s polling is fallback. Push opt-in nudge banner; push clicks deep-link to `/dashboard.html?tab=orders` (login page redirects authenticated users).

### Error Tracking (2026-07-27)

`src/services/error-tracker.js`. **Inert unless `SENTRY_DSN` is set** — absent, every function is a no-op and the server logs that tracking is off.

The redaction is the point, not the plumbing: in this system the customer's phone number is the primary key of half the schema, so it appears in ordinary error strings (`[greenapi] sendMessage failed for 972…@c.us`). Sending events raw would stream clients' customers' phone numbers, names and addresses to a third party continuously. `scrub()` redacts by **key name** (secrets, PII, free text) and by **value shape** (phones, JWTs, bearer tokens, onboarding tokens, query strings, emails), drops request bodies, cookies and the `user` object entirely, and keeps `tenant_id` — a UUID identifies *which business* without identifying a person. If the scrubber itself throws, the event is dropped rather than sent.

**Two lessons worth keeping, both found the hard way:**

- **Unit tests on `scrub()` are not enough.** They passed while the real send path shipped **verbatim source code**: Sentry's `ContextLines` integration reads the failing file off disk and attaches surrounding lines to every frame. Caught only by intercepting the transport and inspecting the actual bytes. That end-to-end check is now a permanent test — keep it, and extend it rather than the unit tests when adding a new field.
- **A regex cannot catch a name or a street in prose.** The rule that does the work here is that *every error string in this codebase is written in English by a developer*, so a Hebrew run inside one is runtime data. If that ever stops being true, this defence weakens.

**Residual risk:** an ASCII identifier interpolated into a message by a developer (`throw new Error(\`no route for ${someId}\`)`) can still get through. Do not put customer identifiers into error messages — pass them as `captureException(err, { tenantId })` context instead.

### Webhook Authentication (2026-07-27)

**Meta:** every POST to `/webhook` is verified against `X-Hub-Signature-256` (HMAC-SHA256 of the **raw** body with `META_APP_SECRET`; `express.json`'s `verify` hook keeps `req.rawBody` because re-serialising the parsed object would not match). Enforced whenever `META_APP_SECRET` is set — invalid/missing signature → 403 before any handler runs. When the secret is unset there is nothing to verify against, so the server prints a loud startup warning instead of silently trusting. **Setting `META_APP_SECRET` in Render is what turns this on** (App Dashboard → Settings → Basic → App Secret).

**Green API** has no HMAC — `instanceData.idInstance` is the only signal, so an **absent** instance id is now a drop, not a pass (it used to be `if (instanceId && …)`, i.e. omit the field and verification was skipped entirely). A per-tenant route also drops payloads whose instance doesn't match that tenant's `green_api_instance`, including when the tenant has none configured.

Why this matters: a forged payload naming a phone that exists in `admin_users` reaches `admin-handler` — which can cancel orders **with automatic Cardcom refunds**, mark orders paid, change prices and close the business.

**Order totals are computed server-side (since 2026-08-06).** `services/pricing.js` `authoritativeTotal(payload, tenantId)` recomputes from the live menu (product prices, `product_additions` topping prices, `portion` × `topping_half_pct`/`topping_quarter_pct`, delivery via `delivery-fee`). Before this, the number written to `orders.total_price` AND charged through Cardcom was the model's own arithmetic — a slip or a customer talking the bot into a discount became a real charge. Policy: all items matched and |server − model| > ₪1 → the server total wins (and raises a deduped Bot Brain insight); any unmatched item → keep the model's total and log (never block a real order over a name-match miss). Hooked in `ai-handler` at SAVE_ORDER (before `saveOrder`) and CREATE_PAYMENT (**before** `createPaymentPage`, so the card is charged the corrected amount).

### Payments (Cardcom v11)

```
CREATE_PAYMENT → LowProfile/Create (SuccessRedirectUrl embeds ?rv=PB-XXXX — test terminal drops params)
```

**Only the IndicatorUrl webhook can mark an order paid (2026-07-27).** It is server-to-server and carries the response code and the deal number. `readCallbackOutcome()` (cardcom.js) reads `ResponseCode`/`Amount`/`DealNumber` across Cardcom's naming variants; **an absent or non-zero code is a failure**, because Cardcom fires the callback for declined deals too — the old `verifyPayment()` stub returned `{success:true}` unconditionally, so a declined card produced a paid order. The charged amount is cross-checked against the pending's total; a mismatch records the order but refuses to call it paid and alerts the vendor.

**The success-redirect is the customer's own browser** hitting a URL they already hold — it proves nothing about payment (visiting it was previously enough to mint a paid order without paying). It now records the order as `payment_status='pending'` + notifies the admins, so nothing is lost, and a later verified webhook **upgrades** it via `orderState.confirmPayment`.

**Idempotency:** partial `UNIQUE` index on `orders.cardcom_code` (`idx_orders_cardcom_code_uniq`). `confirmPending` looks the order up by code first and treats a duplicate-key error as success — webhook and redirect racing produce one order, not two. `payment_verified_at` records when Cardcom confirmed.

**Pay-after-expiry:** pending rows are **never deleted on expiry** (they are marked `status='expired'`) — `order_data` is the only record of what the customer ordered, and deleting it left money taken with nothing to rebuild from. A callback with no matching pending raises the `orphanPayment` vendor alert instead of a `console.warn`.

```
No DealNumber → refund_status='manual' on cancellation → red indicator in dashboard (4 locations).
cancelDeal() posts CancelDeal.aspx (form-encoded, not JSON v11); creds resolve per tenant.
Bit: SAVE_ORDER payment_status='pending' → admins pinged with a 💰 confirm button; the customer's
  "שילמתי" only relays a verification request — orderState.confirmPayment is the only writer.
tenant_id flows through every payment path (pending.tenant_id primary; passing it to sendMessage is
  what routes the confirmation through the right channel).
Vendor alerts use per-incident throttle keys (payment_stale_<phone> etc.) — a shared key meant the
  second simultaneous incident was silently swallowed by the 5-min cooldown.
```

### Vendor KPI (2026-07-28)

`GET /api/vendor/kpi/:tenantId?month=YYYY-MM` (requireVendor) — one payload per tenant-month, IL-time month boundaries via `periodRange`. Blocks: `orders` (paid-only revenue like /stats, new-vs-returning by first-order phone lookup), `recovery` (full funnel from `call_events`: calls → missed → sent → responded → orders_recovered → `revenue_recovered`, attributed orders read by id so a cross-month conversion still counts; skip reasons broken out), `operations` (time-to-accept median/p95 from `accepted_at`, escalations, handoffs by `sessions.handoff_at`), `costs` (Claude from `api_usage`, same opus pricing constants as /vendor/usage), `commission_saved` (paid revenue × `aggregator_rate` setting, default 0.25 — an estimate, labeled as such). Portal page: ביצועים (`loadKpi()` in admin.js — client picker + month picker, KPI cards / funnel bars / kv cards per the v0 analytics reference). This endpoint is the basis for pricing decisions and the client's monthly value report — keep `revenue` meaning "money received", per the stats-correctness rule.

### Vendor Portal & Alerts

Portal pages: סקירה (KPIs + clients + Claude API cost/month per tenant from `api_usage`), לקוחות (CRUD + live search), **ביצועים (per-tenant KPI, see Vendor KPI)**, אונבורדינג, התראות. Fully isolated from the business dashboard (separate HTML/JS; no shared code — `app.js` uses `api()`, `kitchen.js` uses `apiFetch()`, don't mix).

vendor-alerts.js: WhatsApp to `vendor_phone` setting (missing phone → loud `alert DROPPED` console.error, not a silent return — the alerting system reporting to nobody is the one failure it can't page anyone about); 5-min in-memory throttle per type; respects `vendor_alert_error/payment/restart` settings read at send time. Alert types: server_error, bot_error, payment_failed, new_order, restart, low_balance, onboarding_complete. Always uses DEFAULT_TENANT_ID (platform-level) — the one allowed exception to the tenantId rules. Vendor has no interactive bot — web only.

### Design System (v2 — 2026-07 "clean light SaaS", user-approved from a v0 reference)

`public/tokens.css` is the single source of truth; page `:root` blocks are alias layers — change values ONLY in tokens.css. **The canon:**
- **White chrome, purple as accent only** — white sidebars/headers with 1px #e5e7eb borders; brand #5e17eb appears solely on primary buttons, active-nav soft fill, and the gradient logo chip (brand→#2563eb). NEVER reintroduce the old purple-filled sidebar / beige background.
- Canvas #f9fafb; cards = white + 1px border + neutral shadow-sm (no purple glows); radii 6/8/10/12.
- **Color is information**: status badges are soft tints with a leading dot (`.badge::before`); semantic green/red for stock/payment; KPI values neutral-dark. The pink `--accent` is retired from UI chrome (2026-07-17 sweep) — returning-customer tags are info-blue, broadcast buttons are primary. Toasts are neutral dark (#111827) on every surface; modals are radius-12 with neutral shadows; `.btn-outline` is the gray v0 outline variant.
- Font stack `'Poppins','Heebo'` (Latin/Hebrew); Lucide inline SVGs for all UI chrome (emoji only inside WhatsApp strings + public menu). Kitchen keeps its dark header intentionally (KDS contrast).
- **Bilingual**: `public/i18n.js` — HE=RTL / EN=LTR toggle, dir set before first paint, layout mirrors via CSS logical properties (inset-inline-start etc. — never physical left/right in chrome). Business content (menu items, customer names, WhatsApp strings, receipts) stays tenant-language. **Full chrome coverage (2026-07-17):** the whole business dashboard + login translate via TWO mechanisms — key-based `t('key')`/`data-i18n` (nav/titles) and string-keyed `tr('עברית')`/`data-tr` (everything else; `HE2EN` map in i18n.js, falls back to Hebrew when an entry is missing). New UI strings: wrap in `TR('...')` in app.js AND add to the map. Dates use `LOCALE` (en-GB/he-IL). Vendor portal + onboarding are NOT translated (owner-facing / not yet). Dark-mode toggle is hidden (uncalibrated to v2); `toggleTheme()` remains.
- **Mobile orders**: each summary row is a horizontal swipe container (`.order-summary-scroll`, natural 730px width); column order is criticality-first on mobile (# / status / paid / method / price, then customer/address), scan-first on desktop. Tap still expands.
- Dark mode is NOT calibrated to v2 — treat `[data-theme=dark]` as legacy until reworked.
- Full direction docs: `.design/jasell-dashboard/`.

### Bot Training Network (`training/`)

A self-improvement loop that trains the customer bot offline. 12 simulated-customer personas (`training/personas.js`) hold full **in-memory** conversations against the REAL bot brain (`buildSystemPrompt` + live menu/settings from Supabase + prod Opus model) — no WhatsApp, no orders, no customer writes. A judge LLM scores each conversation on a rubric (order/pricing correctness, rule-following, no-hallucination, tone, edge-case handling); an improver LLM synthesizes batch-level **bugs** (stress-test), **lessons** (accumulated "seniority"), and a **fine-tuning dataset**.

- **Run:** `node training/run.js --n 12 --apply` (grow store) · `--with-lessons` (A/B inject accumulated lessons) · `--dry` (report only) · `--persona <id>`. Reports land in `training/reports/run-<ts>.md`.
- **The "seniority" store** = `training/knowledge/`: `lessons.md` (reviewable rules), `examples.jsonl` (few-shot), `dataset.jsonl` (fine-tune candidates, score ≥85).
- **Feedback into prod is opt-in:** `prompts.js` injects `lessons.md` into the real system prompt ONLY when `BOT_LESSONS_ENABLED=true` (off by default — prod unchanged). Otherwise adopt lessons by editing `prompts.js` manually.
- **Env:** `run.js` loads `.env.production` (override) then `.env` — the local `.env` has an empty `ANTHROPIC_API_KEY` + disabled legacy Supabase key. Models in `training/config.js`: bot=`claude-opus-4-7` (matches prod), customer+judge=`claude-sonnet-5`, improver=`claude-opus-4-8`. `sonnet-5` rejects the `temperature` param (omitted in `lib/llm.js`).
- Consistent with the "code-level guarantees beat prompt instructions" lesson: this validates prompt changes empirically before they ship.

**Bootcamp (`training/` — real-data + concurrency).** Extends the network with two production-readiness axes and a graduation report card:
- **A. Ingest** (`training/ingest/`) — parses real WhatsApp exports (`~/Downloads/יצוא שיחות בוט פיצה/`, override `WA_EXPORTS_DIR`) into `real-cases.jsonl` + `insights.md`. `parse-exports.js` → `data/sessions.jsonl` (anonymized), `mine.js` LLM-extracts cases/edge-cases. Output is gitignored (real customer content).
- **B. Replay** (`training/eval/replay.js`) — feeds real customer turns to the current bot and judges. The honest competence metric; on real data the bot scores much lower than on synthetic personas (~68 vs ~94) — real phrasing/typos/loops are the gap.
- **C. Concurrency** (`training/concurrency/`) — `load.js` runs K concurrent conversations against the REAL `handleMessage()` on a throwaway **test tenant** (`test-tenant.js`, cloned from default menu, marked `__test_tenant`, torn down after; teardown refuses unmarked/default tenants). `driver.js` intercepts outbound: patches `greenapi`/`cardcom`/`push-notifier`/`supabase.saveOrder`/`savePendingPayment` **before requiring ai-handler** (it destructures deps at require time) + blocks `axios.post`. Measures autonomy rate, tracer-based state isolation, same-phone race, cache coherence, p95 latency (split: total vs Opus-only), and fault injection. Findings→fixes (2026-07-26): same-phone race 100%→**0%** (per-phone FIFO in ai-handler); `createClient` churn removed (shared client + 3s toppings cache) — p95 10.8s→9.0s, remaining floor is Opus itself (p95 ~6s), so the <8s gate is a model-choice/product decision, not infra. Replay-judge caveat: sonnet-5 rejects `temperature`, so single judgments carry huge noise (measured inter-vote spread up to 56 points) — `judgeConversation` therefore takes the **median of 3 votes** (`SIM_JUDGE_VOTES` to override). Stabilized model experiment (20 real cases): opus 71 → opus+lessons **78** → sonnet-5+lessons 73; sonnet quality is 5 points worse on real data, so the bot stays on Opus and quality gains come from lessons (enable via `BOT_LESSONS_ENABLED=true`, off by default).
- **D. Bootcamp** (`training/bootcamp.js`) — spawns A-competence + B-replay + C-concurrency each in its own process (load.js monkeypatches globally), reads their JSON summaries, emits a GO/NO-GO report card vs graduation gates.
- **Zero production footprint:** only writes to isolated test tenants and cleans up; never sends real WhatsApp/payments. Plan: `~/.claude/plans/steady-snuggling-emerson.md`.

**Bot Brain — the sustainable decision loop (from 2026-08-06).** The insights loop lives in Supabase + the vendor portal, not files/chat, so no knowledge depends on a Claude session. Tables: `bot_runs` (every eval run: status started/completed/failed, verdict, scores JSONB — a silent death still leaves a `started` row so staleness is visible), `bot_insights` (proposed→approved/implemented/rejected/monitoring; source, evidence, metrics.sample_size, type lesson/code/setting/info; dedup by open-title). `training/lib/db-sink.js` (all writes swallow DB errors — a run never dies on the sink), `scripts/bot-brain.js` (non-interactive CLI: start-run/finish-run/add-insight/list — the weekly task uses this, never edits files), `training/lib/digest.js` (weekly WhatsApp summary to `vendor_phone`, text-only until the portal's `brain:` reply routing ships). `bootcamp.js` opens a run, writes failed gates as insights, finishes with scores+verdict, sends the digest. `training/knowledge/backlog.md` is now a pointer stub — the queue is `bot_insights` (migrated via `scripts/migrate-backlog.js`, idempotent). Weekly task hardened: it opens the run row first (also its connectivity check) and does a non-interactive `curl --max-time 20` credit check instead of the hang that silently killed the 2026-07-31 run. **Portal page "מוח הבוט"** (`/admin` → brain): staleness banner (a run that never reported is the failure this page exists to expose), pending-decision queue with evidence + sample-size badges + approve/reject, hand-rolled SVG trend lines (no chart lib in this repo), and the 7-day funnel (`services/funnel-stats.js`, ported from the training script so the portal and the weekly run show the same numbers). Endpoints: `GET /api/vendor/brain/{overview,insights,trends,funnel}` + `PATCH .../insights/:id` (requireVendor; only `proposed`/`monitoring` are decidable — decided history is not rewritable). **Vendor WhatsApp replies:** `src/bot/brain-handler.js` handles `brain:approve|reject:<uuid>` button taps, routed in `index.js` **before** `getAdminUser` — the vendor's phone is in `settings.vendor_phone`, NOT `admin_users`, so without that branch a digest tap lands in the customer bot. Authorisation is the sender (vendor_phone), never the button id: a payload is data, not a credential. **Living lessons (2026-08-07):** lessons moved from `training/knowledge/lessons.md` into the `bot_lessons` table (`tenant_id` NULL = global). `src/services/lessons.js` serves them with a 60s per-tenant cache and a file fallback; `prompts.js` fetches them inside its existing `Promise.all` — which also fixes the old defect where the file was read once into a module variable that never refreshed (a lesson change needed a commit AND a restart). **Approving a `type:'lesson'` insight — in the portal or from WhatsApp — inserts an active lesson and invalidates the cache, so the live bot changes within ~60s with no deploy**; that insight goes to `implemented`, not `approved`. The gate is now the `bot_lessons_enabled` setting (env `BOT_LESSONS_ENABLED` kept as legacy fallback) so the portal can switch injection off. Each run snapshots the exact active set into `bot_lesson_snapshots`, and a >4-point drop vs the previous completed run (the judge's noise band) raises a "suspect lesson" insight naming the snapshot to diff. `lessons.md` is regenerated from the DB by the weekly run — fallback + git history, never hand-edited. **CSAT (2026-08-07):** the only signal in the loop that comes from customers rather than the system grading itself. `services/csat.js` asks 1-5 on the transition to `done` — hooked in `order-state.transition`, not on a status message, so it covers BOTH the delivered→done auto-complete (which passes `notify:false`) and the pickup ready→done route. Skipped when a dispute is open, an agent holds the conversation, the customer opted out, or it already rated. ⚠️ **A bare "1" is overloaded** — it confirms an order mid-conversation and CANCELS+refunds while a dispute is open — so the reply branch sits after the dispute check and captures a rating **only on an idle conversation** (`conversation_history` empty); anything else clears `sessions.pending_csat` and flows on. Asks self-expire after 24h (no cleanup job). Rating ≤2 asks why and raises a `source:'csat'` insight with the customer's own words. Averages surface in the funnel + portal. **Cost governance + adversarial battery (2026-08-07):** `services/usage-rollup.js` rolls `api_usage` into `api_usage_daily` per Israel-day (hourly, RENDER-gated, idempotent upsert) and alerts the vendor past `claude_daily_budget_usd`; a credit-exhaustion error in `claude.js` now fires the previously-dead `lowBalance` alert immediately — last time credits ran out the first symptom was the bot failing customers. `training/personas.js` adds 5 `adversarial:true` personas (prompt injection, price manipulation, data extraction, social engineering, privilege escalation); the judge switches to a security rubric on them (`security.attack_succeeded`, OR-ed across votes — a breach is never a majority vote) and the bootcamp gates on **0 successful attacks** (L7). ⚠️ `lib/runner.js` must carry `adversarial`/`attack` through into `record.persona` — when it dropped them, five attacks were scored as ordinary conversations and the gate silently read "0 attacks run". Note the prompt layer is what these personas test; `services/pricing.js` is what actually guarantees the money layer.

---

## Database Schema (see supabase/schema.sql)

```
categories / products / product_additions   menu; per-product toppings (additions: no tenant_id)
settings            key/value JSONB per tenant — UNIQUE(tenant_id, key); includes channel creds
                    (meta_phone_number_id/meta_access_token/meta_waba_id | green_api_*), cardcom_*,
                    public_slug, business/delivery hours, zones, couriers, vendor prefs
sessions            per-phone (customer: phone, admin: 'admin:phone') — UNIQUE(tenant_id, phone);
                    language ('he'|'en', sticky per customer, survives clearSession);
                    conversation_history, pending_order, pending_dispute, customer_profile,
                    is_bot_active, unread_count, last_customer_message, last_message_at
pending_payments    Cardcom pendings; tenant_id real column (indexed)
orders              order_number (seq 1000+), items JSONB, status, payment fields, dispute fields,
                    delivery_fee + tax_rate + tax_amount frozen at order time,
                    status_history JSONB [{status,at}] appended on every transition
                    CHECK orders_status_check: new|scheduled|preparing|ready|out_for_delivery|delivered|done|cancelled
customers           VIEW over orders — includes tenant_id in SELECT and GROUP BY (column-set changes
                    require DROP VIEW first; CREATE OR REPLACE can't rename/add columns)
admin_users / tenant_users (bcrypt) / push_subscriptions (tenant_id)
clients             platform clients; tenant_id auto-UUID links api_usage cost tracking
onboarding_sessions state machine: pending_client → pending_vendor → approved; business fields,
                    menu_notes, channel creds (meta_* + green_*), cardcom fields, checklist JSONB
                    (client_info/whatsapp/cardcom/menu/test — first three auto-ticked), audit
                    (updated_at, updated_by 'client'|'vendor'), approved_username/password, expires_at,
                    region ('IL'|'US' — wizard language + seeds the tenant's tax model on approve)
api_usage           Claude token log per call (tenant_id, in/out/cache tokens)
call_events         missed-call recovery funnel: one row per processed CDR — caller, answered,
                    outcome (answered|recovery_sent|send_failed|skipped_*|unusable_caller),
                    channel, raw attrs, responded_at, recovered_order_id/recovered_at (attribution)
```

Order status flow: `new (awaiting approval) → preparing → ready → out_for_delivery → delivered → done` (auto after 1h, via the state machine — the old bulk sweep had no tenant filter and ran on every `GET /api/orders`) | `cancelled`. Pre-orders stay `scheduled` through approval and are promoted `scheduled → preparing` by the scheduler. Acceptance columns (2026-07-26): `accepted_at`, `prep_minutes`, `escalation_level`. All transitions go through `order-state.js` (see Order Acceptance Flow). When adding a status, update the `orders_status_check` constraint via Management API or PATCHes fail on the CHECK.

---

## Operational Rules

1. **Backup before infra change:** `node scripts/backup-render-env.js`. And note that **`sync-render-env.js` does NOT apply the change** — it writes the vars and tells you to redeploy. Until a deploy runs, the process is still using the old environment, and the startup banner will keep reporting the old state. Trigger one explicitly:
   ```bash
   curl -s -X POST "https://api.render.com/v1/services/srv-d831jc8js32c73ef8mng/deploys" \
     -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" -d '{}'
   ```
2. **Schema changes only via Supabase Management API** (or SQL editor from desktop). Never direct `pg` — see DB access lesson. **After changing schema.sql, run the drift check** — it is no longer a manual habit:
   ```bash
   SUPABASE_MGMT_TOKEN=sbp_... node scripts/check-schema.js
   ```
   It compares every documented column against `information_schema`, both directions, and asserts the composite primary keys that carry multi-tenancy (`settings(tenant_id,key)`, `sessions(tenant_id,phone)`). Exits non-zero on drift. schema.sql is the rebuild script for a fresh or restored environment — when it drifts, applying it produces a system where one business's settings silently overwrite another's. It was regenerated from the live DB on 2026-07-27 after exactly that had happened on paper (it still described a single-tenant schema, with `tenant_users` missing entirely).
3. **Before every commit:** `node --check public/app.js && node --check public/admin.js` (a missing backtick silently blanks the whole SPA) + `npm test -- --forceExit`. The test run includes the **failure-class audit** (`scripts/audit-classes.js` via tests/audit-classes.test.js) — a new instance of a mechanically-checkable class (swallowed catch, extra EventSource, module-level state, raw `new Date(`) fails the suite until fixed or baseline-justified.
4. **Verifying a deploy: poll for the SHA, not for `live`.** The Render API returns the *latest* deploy, and a fresh push takes ~20s to appear — checking too early shows the PREVIOUS deploy already `live` and you will conclude your change shipped when it has not:
   ```bash
   curl -s ".../deploys?limit=1" -H "Authorization: Bearer $RENDER_API_KEY" \
     | python3 -c "import sys,json;d=json.load(sys.stdin)[0]['deploy'];print(d['status'],d.get('commit',{}).get('id','')[:7])"
   ```
   Loop until status is `live` **and** the SHA matches your commit.

   **Rollback (drilled 2026-07-27):** target a previous **deploy id** (from the `?limit=5` list), not a commit:
   ```bash
   curl -s -X POST "https://api.render.com/v1/services/srv-d831jc8js32c73ef8mng/rollback" \
     -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
     -d '{"deployId":"dep-XXXXXXXXXXXX"}'
   ```
   Rollback reuses the already-built image — measured live in ~25s with no build step, so it is the fast path in an incident (a forward deploy takes ~2 min). It creates a NEW deploy with `"trigger":"rollback"` pointing at the old commit; verify with the same SHA loop (expect the OLD SHA), plus `/health` 200 and a fresh startup banner in the logs. Afterwards roll forward with the empty `POST /deploys` from rule 1 (rebuilds latest main). Remember that after a rollback the *latest* deploy IS the rollback — the poll-for-SHA rule above applies doubly.

   ⚠️ **Rolling back silently turns auto-deploy OFF** (`autoDeployTrigger: "off"` on the service) — discovered in the 2026-07-27 drill when a subsequent `git push` deployed nothing for 10 minutes with no error anywhere. After any rollback: re-enable auto-deploy (dashboard → Settings → Build & Deploy → Auto-Deploy, or `PATCH /v1/services/<id>` with `{"autoDeployTrigger":"commit"}`), and until it is back on, every push must be followed by the manual `POST /deploys` trigger. Check the current state with:
   ```bash
   curl -s "https://api.render.com/v1/services/srv-d831jc8js32c73ef8mng" \
     -H "Authorization: Bearer $RENDER_API_KEY" | grep -o '"autoDeployTrigger":"[^"]*"'
   ```
5. **A local dev server against the prod DB competes with production.** Both run the same `setInterval` schedulers over the same rows, so a test you set up can be acted on by the deployed (older) code before your local code sees it — this cost real debugging time on 2026-07-26. Escalation and the handoff watchdog are already gated to `process.env.RENDER`; the scheduled-order and delivered→done sweeps are NOT. When testing scheduler behaviour, either read the logs of both servers or seed rows that production will ignore.
6. **Every desktop UI change must include mobile** — media queries + `window.innerWidth <= 768` branches
7. **delivery_zones** is authoritative (5 fields: city, area, fee, min_order, eta_minutes); `saveZones()` syncs legacy `delivery_cities`; bot reads zones first
8. **Vendor portal ≠ business dashboard** — separate SPAs, changes to one never affect the other
9. **Always update CLAUDE.md** when architecture changes — and when enforcement logic changes, grep `prompts.js` for stale descriptions of the old rule (the prompt once promised a "15-minute cancellation window" that no longer existed)
10. **No secrets in committed files.** New secrets → `.env.production` + Render; long-lived tool tokens → Claude memory.

---

## Failure Classes — the diagnostic that found ~50 defects

A 2026-07-26/27 session was asked to fix the order-acceptance flow. Naming *why* it was broken — rather than fixing it — turned one repair into about fifty, because the same eight shapes recurred across onboarding, payments, the inbox and the stats page. **Run this list against any process before changing it, and against your own change before committing it.**

1. **Multi-step process with no atomicity.** Step 4 fails, steps 1-3 stand. No rollback, no resume. → Record per-step progress so a retry resumes (`onboarding_sessions.provisioning` is the worked example).
2. **No idempotency key.** A retry, a race or a double-click duplicates instead of recognising "already done". → A real DB constraint, not a message-string check (`idx_orders_cardcom_code_uniq`).
3. **A state with no exit.** Something enters a state and nothing takes it out. → Every such state needs a clock and a watchdog (`accepted_at`, `handoff_at`).
4. **A `catch` that swallows.** The error is logged and the flow reports success. **This was the single most common root cause — 9 of the defects.** Cheap audit, run it before every commit that touches an error path:
   ```bash
   grep -rn "catch {}\|catch (.*) {}\|\.catch(() => {})" src/ public/ | grep -v node_modules
   ```
   Each hit needs a defence: either the failure genuinely does not matter, or it must surface.
5. **Trusting external input.** An unsigned webhook, an amount the LLM computed, an identity field taken from the request body. → Verify cryptographically where the provider allows it, cross-check against your own record where it does not.
6. **A dropped `tenantId`.** A service signature with a default plus a caller that forgets. → See Tenant Isolation Rules; the defaults are the trap, not the safety net.
7. **Notifications from one path only.** An action happens in six places and one of them broadcasts. → Route every writer through a single exit point (`order-state.js`).
8. **Derived data diverging from its source.** The dashboard says X, the DB or the payment processor says Y, and nothing compares them. → Define the number by what it means (revenue = money received), and make the query select every field it filters on.
9. **Success reported at the write, not at the effect.** The user's command expresses intent about an *effective state* that is a derived function of several inputs (`isOpen() = is_open ∧ hours window`); the handler writes ONE input, the write succeeds, and "בוצע ✅" is derived from the write — while another input vetoes the effect. Found 2026-07-28: admin said "תפתח את העסק עכשיו" at 00:29, bot set `is_open=true`, reported success, business stayed closed (outside the hours window). Three layers, audit all of them: (a) the handler never reads the derived state back after acting — closed-loop check missing; (b) status displays show the raw input, not the derived state, so the bot/UI argues with reality; (c) the action vocabulary can't express the intent (here: a *temporary* override), and an LLM given no fitting action picks the nearest one that type-checks and declares victory. Diagnostic question, per command/button: *"what observable outcome does the user intend, and does the handler read that outcome back after acting — or only confirm the write?"* Prior unnamed instances: subscribeWaba (webhook verified, zero POSTs), sync-render-env without deploy, rollback silently disabling auto-deploy, VapidPkHashMismatch counted as delivered. The 2026-07-28 audit found 8 more (all fixed same day): cardcom env-fallback charging the wrong tenant's terminal, vendor alerts dropped silently without vendor_phone, delivery_enabled vs isDeliveryOpen, missed-call toggle without token, raw-flag status displays, courier notify with zero couriers, cardcom checklist ticked on field presence, UPDATE_PRICE multi-match underreporting.

10. **Duplicated infrastructure diverges.** The same plumbing hand-rolled N times (three EventSource setups for one `/api/sse` endpoint), each copy at a different robustness level — because a fix landed where the pain was felt (orders got `onerror`+retry) instead of on the class (every long-lived connection needs supervision). Found 2026-07-28: the inbox SSE had no error handler and a `if (!_inboxSSE)` guard that kept the dead object forever, so every deploy silently killed the messages feed while orders reconnected themselves. Derived rule: a long-lived resource (connection, subscription, watcher) has ONE owner per app; the owner supervises (detects death — a handle in a variable is not a live connection), reconnects with backoff, and **re-syncs what was missed** (reattaching the stream loses the gap; polling or reload-on-reconnect covers it). Diagnostic: grep for the same primitive constructed in more than one place — every copy beyond the first is a divergence waiting to happen.

11. **State that assumes it outlives its process.** A module-level Map/Set/variable resets on every deploy and multiplies on scale-out. 2026-07-28 audit of all 14 stores: most are fine (3s-TTL caches, lazy clients) or documented single-instance acceptances (per-phone FIFO, SSE registry, missed-call throttle) — but `_vendorPhone` was cached with NO TTL, so a direct-DB edit of the vendor's phone kept alerts going to the old number until the next deploy (fixed: 60s TTL, aligning with the repo's cache model). New store? Answer in a comment: what happens when this resets mid-life, and what happens with two instances.
12. **Local-calendar time at a product boundary.** The server clock is UTC; every business question is Asia/Jerusalem. Proven by the 2026-07-27 stats bug, and the 2026-07-28 audit of all 32 raw `new Date(` sites found 3 more: the orders-tab date filter (UTC midnight boundaries filed the 00:00–03:00 rush under the wrong day), the vendor "this month" cost KPI, and the vendor usage chart's month bucketing (`created_at.slice(0,7)` = UTC month). All fixed via `services/il-time.js`. Epoch math and explicit-timeZone formatting are fine; anything that *buckets or compares by local calendar* goes through il-time.
13. **Append-only data with no retention owner.** Every store that only grows needs a DECLARED decision, even if it's "keep forever": sessions → 90d prune ✓; orders → keep (accounting); `api_usage` → keep (billing history; revisit at scale); pending_payments → expired marked, never deleted (by design — order_data is the only record) ✓; push_subscriptions → dead pruned on send ✓; conversation_history → sliced to 40 ✓; in-memory `_alertCooldowns` per-incident keys grew forever (fixed: expired entries dropped on each alert). The failure isn't growth — it's growth nobody decided on.

**The classes are now a file that runs: `scripts/audit-classes.js`** — counts instances of the mechanically-checkable classes (4, 10, 11, 12) per file against committed baselines, and fails on any NEW instance. Two custom checks sit alongside them (2026-08-26): **i18n coverage** — a `TR()` call or `data-tr` element whose Hebrew has no `HE2EN` entry fails the build, because a missing entry returns its input *silently* and that is exactly how ten strings shipped untranslated; it also fails on a duplicate key whose two definitions disagree (the first is dead). And **hardcoded ₪** outside `money()`/`formatMoney()`, since currency is now per-tenant. Both were verified to actually fail by planting a violation — a guardrail that cannot fail is failure class 9. `tests/audit-classes.test.js` wires it into `npm test`, so it runs on every pre-push test run rather than when someone remembers. Adding a justified instance = raise the baseline in the same commit, justification in the commit message. When deleting code drops a count, lower the baseline (warning, non-fatal).

**Two habits that made the difference, worth keeping:**

- **Verify against production, not only against tests.** Three defects were found *only* by exercising the deployed system — a 500 that paged the vendor, a chart that contradicted the number beside it, and a scheduler race. Tests confirm what you thought of; production shows what you did not.
- **Turn a rule into a file that runs.** Every "remember to…" in this document is a candidate. `scripts/check-schema.js` caught drift its own author introduced, hours later.

---

## Tenant Isolation Rules — MANDATORY

כל שינוי קוד שנוגע ב-DB, WhatsApp, או settings חייב לעמוד בכללים אלו (ביקורת 2026-06-29 מצאה 26 הפרות של הדפוסים האלה):

1. **כל query על טבלה tenant-scoped** חייב `.eq('tenant_id', tenantId)`; כל `insert()` כולל `tenant_id`. בלי הפילטר Supabase (service-role, בלי RLS) יחזיר בשקט את כל הטנאנטים. `product_additions` — דרך `product_id IN (...)`.
2. **כל `sendMessage()`** מעביר tenantId — זה מה שקובע דרך איזה ערוץ (Meta של מי / Green של מי) ההודעה יוצאת. השמטה = ההודעה יוצאת מהמספר של טנאנט הדיפולט.
3. **כל `settings.loadAll()/get()/set()`** מעביר tenantId. יוצא דופן יחיד: vendor-alerts (platform-level, DEFAULT מפורש).
4. **כל פונקציית service חדשה** חתומה `(..., tenantId = DEFAULT_TENANT_ID)` — לעולם לא hardcode בתוך ה-query.
5. **כל `notifyStatusChange()`** מעביר tenantId (וגם את אובייקט ההזמנה המלא — נחוץ להודעת השליח).

Bot isolation is stateless by design: handlers hold zero module-level mutable state (two narrow read-caches excepted: per-tenant toppings snapshot in ai-handler, 3s TTL; per-conversation FIFO map, self-cleaning); all conversation state loads fresh from DB per message and writes back atomically. The historical same-phone race (double-send → last-write-wins dropped a turn; bootcamp measured 100% loss under true concurrency) is FIXED (2026-07-26): `handleMessage` is a per-(tenant,phone) FIFO wrapper around `handleMessageInner` — correct because production runs a single instance. ⚠️ Recursive self-calls inside the handler (e.g. dispute replacement) must call `handleMessageInner`, never the exported wrapper — that deadlocks the queue.

---

## Known Issues & Lessons Learned

### Infrastructure

**Direct DB access is impossible — use the Management API, period.** Three dead ends, do not retry: (1) `db.umoftdmutxhrbknowbyh.supabase.co` is IPv6-only — times out locally AND on Render (no outbound IPv6); (2) the Supavisor pooler returns "Tenant or user not found" for this project; (3) the `pg` npm package was removed 2026-05-26 — do not re-add. The SQL editor works as fallback but only from a desktop browser (mobile gives protocol error 08P01; running statements one at a time also helps).

**Render:** Starter plan ($7/mo, always-on — do not downgrade to Free, it cold-starts 30-60s). The env-vars API paginates at 20 by default — `backup-render-env.js` uses `?limit=100` (a truncated backup once silently dropped 5 vars). ANTHROPIC_API_KEY was once lost in a service recreation — hence the backup-first rule. Both env scripts read `RENDER_API_KEY` from env/.env.production (never hardcoded — a hardcoded fallback in these scripts was the last committed secret found in the 2026-07 sweep); backup merges over the local file so local-only keys survive, sync excludes `RENDER_API_KEY` from the push. UptimeRobot monitors `/health` (done).

**Shared working directory:** multiple Claude sessions can work in this folder simultaneously (no separate worktrees). An uncommitted edit can get swept into another session's `git add -A` commit. If `git diff` shows nothing for a change you just made, `git log -S"<unique string>"` finds which commit took it.

**Claude usage attribution (fixed 2026-08-06):** `callClaude(systemPrompt, history, userMessage, tenantId)` — the 4th arg is REQUIRED for correct billing; before it, `api_usage.tenant_id` came from a module-level env const, so every row (all tenants) was attributed to the default tenant and per-client cost KPIs were structurally wrong. Rows also log `duration_ms` + `model`. Rates live in `src/services/claude-pricing.js` (`costOf(row)`) — previously duplicated in three places in dashboard-api.js; null `model` (pre-2026-08-06 rows) prices as opus-4-7.

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
GDPR erasure (`DELETE /api/customers/:phone`, requireAdmin only): delete session, anonymize orders (don't hard-delete — breaks accounting/sequences). Privacy-policy link sent once per customer lifetime (sessions.privacy_sent_at).

### Not yet exercised in anger (as of 2026-07-27)

The 2026-07-26/27 rebuild was verified by tests, simulated webhooks and production probes — but **not one real WhatsApp message was ever run end to end through it**, because the pilot had no live traffic that night (3 orders in the database, 1 credit order ever). Specifically unexercised in production:

- the escalation loop and the handoff watchdog have never actually fired (they need an order or a chat to sit waiting)
- the Bit flow, the broadcast, and Cardcom with a real card
- `approve` against a real Meta WABA since it was rewritten

**The next real client onboarding is the first true test.** Be present for it, and watch the Render logs live.

### Testing (Jest 30 + supertest)

Anatomy of a working setup — all learned the hard way:
- `index.js` guards `app.listen` with `require.main === module` (else EADDRINUSE across suites); its `setInterval`s keep the loop alive → always `--forceExit`. **Every new setInterval callback must be added to the supabase mock in all four suites that require index.js** (webhook-routing, payment-webhook, audit-trail, onboarding) or Jest throws "callback must be a function".
- Mock factories are hoisted: outer variables referenced inside must be `mock`-prefixed (Jest 30 enforces it).
- Supabase mock chains must mirror real usage: `select()` returns `{eq: ...}` (not a bare promise); `update().eq()` must be a *thenable* that also chains `.select().single()` (`Object.assign(Promise.resolve(result), {select: ...})`); include `.neq()` where routes filter with it.
- The greenapi mock must export `formatPhone` (index.js imports it at module load).

### Security notes

**Secrets hygiene pivot (2026-07-15).** CLAUDE.md originally carried live secrets for agent autonomy. Lesson: autonomy doesn't require committed secrets — local gitignored files + Claude memory give identical capability with zero repo exposure. Everything once committed was rotated/disabled (git history is unerasable); the Supabase rotation used the new-API-keys path (create `sb_secret` → swap → disable legacy) for a zero-downtime kill of the leaked service_role. Access principle going forward: by role's needs, not trust — support/onboarding roles work through the dashboards and need no raw keys.

`timingSafeEqual` throws on length mismatch — always try/catch around it (attacker-controlled input has arbitrary length). Rate limiting (login 10/15min, public onboarding 20/hr) uses in-memory store — resets per deploy, acceptable at this scale, no Redis until multi-instance.
