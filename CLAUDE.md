# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**פיצה דליבריס (Jasell)** — a WhatsApp pizza ordering bot with a web management dashboard.

- **Customer bot:** AI-powered WhatsApp conversation (Claude) acts as a waiter → deal-breakers first (delivery/payment) → takes order → Cardcom payment → confirms
- **Public menu page:** `/menu.html` — mobile-first customer-facing menu with photos, toppings, WhatsApp CTA
- **Dashboard:** Web SPA for the business owner — orders, products, customers, settings, stats
- **Business bot:** Separate WhatsApp number for owner commands (not yet active)

**Stack:** Node.js + Express · Supabase (PostgreSQL) · Render (hosting) · Green API (WhatsApp) · Anthropic Claude `claude-opus-4-7` · Cardcom (Israeli payment processor)

**Live:**
- Dashboard + bot: `https://www.jasell.com` (jasell.com → 301 → www)
- Public menu: `https://www.jasell.com/menu.html`
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

# Green API — customer WhatsApp bot
GREEN_API_INSTANCE_ID=7105619659
GREEN_API_TOKEN=ba8c5d2471a3458fb65bff54f108023965e01a7afb644344aa
GREEN_API_BASE_URL=https://api.green-api.com

# Supabase
SUPABASE_URL=https://umoftdmutxhrbknowbyh.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtb2Z0ZG11dHhocmJrbm93YnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODc1NDUyMSwiZXhwIjoyMDk0MzMwNTIxfQ.N0hk2fdeRJQC0yGWehAuSRqFv4Oluu-N19zzcorm_wk

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

# Dashboard auth
ADMIN_SECRET=jasell-admin-2026
DASHBOARD_ADMIN_PASSWORD=admin2026
DASHBOARD_MANAGER_PASSWORD=manager2026
JWT_SECRET=pizzabot-jwt-secret-2026-change-in-prod
```

**Supabase DB credentials (psql only — different from service key):**
```
Host:     db.umoftdmutxhrbknowbyh.supabase.co:5432
User:     postgres
Password: mUprot-tefno8-zikgak
Database: postgres
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

# psql schema migration (safe to re-run in full)
export PATH="/usr/local/opt/libpq/bin:$PATH"
PGPASSWORD="mUprot-tefno8-zikgak" psql \
  "postgresql://postgres@db.umoftdmutxhrbknowbyh.supabase.co:5432/postgres" \
  -f supabase/schema.sql

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

# Syntax check before every push
node --check public/app.js

# Deploy (auto on push)
git push origin main
```

---

## Folder Structure

```
pizza-bot/
├── src/
│   ├── index.js                  # Express server, webhook entry point, toppings-poll handler, pending-payment polling
│   ├── bot/
│   │   ├── handler.js            # Thin re-export of ai-handler
│   │   ├── ai-handler.js         # Core loop: dispute handler, stale-session guard, Claude call, ACTION dispatch
│   │   ├── prompts.js            # System prompt builder — waiter flow, deal-breakers, delivery zones
│   │   └── menu.js               # Legacy static menu helpers (mostly unused)
│   ├── services/
│   │   ├── claude.js             # Anthropic SDK wrapper, prompt caching
│   │   ├── greenapi.js           # sendMessage, sendToppingsPoll (interactive poll)
│   │   ├── supabase.js           # All DB functions (sessions, orders, pending_payments)
│   │   ├── cardcom.js            # Cardcom JSON API v11 — createPaymentPage; verifyPayment is a no-op (endpoint doesn't exist)
│   │   ├── push-notifier.js      # Web Push (VAPID) — saveSubscription, notifyNewOrder
│   │   ├── settings.js           # Live settings from DB with 60s cache; isOpen() uses Asia/Jerusalem TZ
│   │   ├── menu-service.js       # Live products from DB with 60s cache
│   │   └── status-notifier.js    # WhatsApp notification on order status change
│   ├── routes/
│   │   ├── dashboard-api.js      # All /api/* endpoints incl. public-menu, push, cancel-refund, item-dispute
│   │   ├── payment.js            # POST /webhook/payment + GET /payment/success (embeds rv= in URL)
│   │   ├── admin.js              # Legacy /admin/orders (backwards compat)
│   │   └── business-bot.js       # POST /webhook/business (owner bot — not yet active)
│   └── middleware/
│       └── auth.js               # HMAC-SHA256 token sign/verify, requireAuth, requireAdmin
├── public/
│   ├── index.html                # Dashboard login page
│   ├── dashboard.html            # Dashboard SPA (Heebo+Poppins, brand colors, dark mode, Chart.js)
│   ├── app.js                    # All dashboard JS: orders (expandable rows), products, customers, settings, charts
│   ├── menu.html                 # Public customer menu — photos, toppings, WhatsApp CTA
│   └── sw.js                     # Service Worker for push notifications
├── supabase/
│   └── schema.sql                # Full DB schema, safe to re-run (IF NOT EXISTS everywhere)
├── scripts/
│   ├── backup-render-env.js      # Pull env vars from Render → .env.production
│   ├── sync-render-env.js        # Push .env.production → Render
│   └── render-guard.sh           # PreToolUse hook — blocks destructive Render calls
├── .claude/
│   └── settings.json             # Claude Code hook: render-guard on Bash PreToolUse
├── .env.production               # Gitignored — real credentials backup
└── CLAUDE.md                     # This file
```

---

## Architecture

### Customer Message Flow

```
Customer sends WhatsApp message
  → Green API webhook POST /webhook
  → index.js extracts text:
      textMessage | listResponseMessage | buttonsResponseMessage | pollUpdateMessage
  → pollUpdateMessage: toppings-only poll (✅ confirm → "בחרתי: X, Y" text → handleMessage)
  → ai-handler.js handleMessage(phone, text)
      0. Check pending_dispute in session → handleDisputeResponse() if present
      1. Check isOpen() — uses Asia/Jerusalem TZ, not UTC
      2. Stale-session guard — reset if age > 3h or has old-flow markers
      3. Check 15-min edit window (last order 'new' within 15 min)
      4. buildSystemPrompt() — loads live menu + delivery_zones + settings from Supabase
      5. callClaude(systemPrompt, history, userMessage)
         Model: claude-opus-4-7 · History capped at 40 messages
         System prompt cached (cache_control: ephemeral)
      6. Parse ACTION block from Claude response (regex)
      7. Strip ACTION, send clean text to customer via Green API
      8. Dispatch action:
         SHOW_TOPPINGS   → sendToppingsPoll() — WhatsApp multi-select poll (per-product or global)
         SAVE_ORDER      → saveOrder() → confirm with order number (cash)
         CREATE_PAYMENT  → createPaymentPage() → send Cardcom URL (credit)
         RESET           → clear conversation_history
```

### Bot Conversation Flow (Waiter Mode)

```
1. Greeting + deal-breakers in one shot:
   "משלוח 🛵 (Xש"ח) או איסוף עצמי? מזומן או אשראי?"
   (delivery price and allowed cities come from delivery_zones setting)

2. Confirm logistics, get address if delivery
   → Allowed cities read from delivery_zones → prompt lists them dynamically
   → City not in list → offer pickup

3. Take the order in free text (cart management throughout)
   → "הסר X" / "עוד אחד" / "שנה X ל-Y" → Claude manages cart in conversation
   → "תפריט" → send /menu.html URL

4. Toppings (pizza only):
   IRON RULE: any topping word in current message → skip SHOW_TOPPINGS completely

5. Collect name (if not known from profile)

6. Summary → confirm (1) or edit freely | cancel (2)

7. SAVE_ORDER (cash) or CREATE_PAYMENT (credit)
```

### Dispute Flow (Missing Item)

```
Business owner (dashboard):
  1. Clicks ⚠️ on order row → dispute modal
  2. Checks items and/or toppings that ran out (multi-select checkboxes)
  3. Preview shows exact WhatsApp message
  4. Sends → POST /api/orders/:id/item-dispute
     → order.dispute_status = 'pending'
     → session.pending_dispute = { order_id, items[], refund } stored
     → WhatsApp sent to customer with options 1/2/3

Customer replies (bot intercepts before isOpen check):
  1 → cancel order (+ refund note if credit)
  2 → remove missing items/toppings, recalculate total, send update
  3 → ask "what do you want instead?" → awaiting_replacement flag
       → customer writes replacement → Claude handles it naturally
```

### Cancel + Refund Flow

```
Business owner clicks ✕ on order row → cancel modal:
  - Who cancelled: יוזמת העסק | בקשת הלקוח (radio)
  - Reason textarea (internal note, saved to cancel_reason)
  - "Send to customer" toggle — controls whether reason appears in WhatsApp
  - Live editable preview of the exact WhatsApp message
  - ↺ Reset button regenerates preview from fields

POST /api/orders/:id/cancel-refund:
  - Updates order: status=cancelled, cancelled_by, cancel_reason, refund_status
  - Tries Cardcom CancelDeal.aspx if cardcom_deal_number is stored (auto-refund)
  - Falls back: manual-refund notice + Cardcom link
  - Sends WhatsApp to customer (custom_message if preview was edited)
```

### Cardcom Payment Flow

```
1. Claude emits CREATE_PAYMENT → ai-handler.js → cardcom.js
   POST /api/v11/LowProfile/Create
   SuccessRedirectUrl includes ?rv=PB-XXXX (ReturnValue embedded by us)
2. Cardcom returns { LowProfileId, Url } → pending_payments saved, URL sent to customer
3a. Customer pays → lands on /payment/success?rv=PB-XXXX
    → payment.js reads rv → finds pending → saves order → notifies customer
3b. Cardcom POSTs to /webhook/payment (IndicatorUrl) — may not fire in test mode
3c. Fallback: index.js polls every 2 min — confirms any pending older than 5 min
NOTE: GetLowProfileIndicatorData endpoint does NOT exist on Cardcom servers (verified 2026-05).
      verifyPayment() in cardcom.js returns success:true immediately (no-op).
```

### Push Notifications

```
Dashboard (public/sw.js + app.js):
  - Service Worker registered on load
  - Bell-with-slash icon: grey=off, green=on
  - togglePushSubscription() → requestPermission → subscribe → POST /api/push-subscribe

Server (push-notifier.js):
  - push_subscriptions table (endpoint, p256dh, auth)
  - notifyNewOrder() called from saveOrder() — fire-and-forget
  - Expired subscriptions (404/410) auto-cleaned

VAPID keys stored in Render env + .env.production
```

### Expandable Order Rows

Orders are rendered as div-based rows (not `<table>`), each with a clickable summary and an inline expanded panel:

```
Summary (always visible — click to toggle):
  #num | customer + date | address | delivery badge | paid badge | total | status badge | chevron

Expanded panel (click opens):
  Left:  customer name/phone, address, courier notes, status selector
  Right: items list (qty, toppings, line total), financial summary (VAT 18%),
         payment info, action buttons (edit, print, dispute, cancel)

toggleOrderExpand(id) → expandedOrders Set → filterOrders() re-renders
event.stopPropagation() on all inner controls prevents row collapse
```

### Public Menu Page (`/menu.html`)

- No auth — static HTML, data from `GET /api/public-menu`
- Sticky category tabs (auto-highlight on scroll), product cards with image/description/price
- Toppings accordion per product, "הזמן" button pre-fills WhatsApp message
- Supabase Storage bucket `menu-images` for image uploads (POST /api/upload-image)

### Dashboard

Brand: `#5e17eb` violet · `#ff66c4` pink · `#eeede9` bg · Poppins font

- **SVG icons only** — `const SVG = {...}` at top of `app.js`, helper `const S = (d,w=14) => \`<svg...>\``
- **Stats page:** separate tab with 7 Chart.js charts (bar, line, doughnut, horizontal bar)
- **Orders:** expandable rows, export CSV (UTF-8 BOM for Hebrew), receipt popup
- **Products:** upload image to Supabase Storage or paste URL, description field, toppings per-product
- **Settings:** 6 sections, iOS toggles, delivery zones (city + fee + ETA), hours per day
- **Mobile:** burger menu, order cards, responsive filters (breakpoint 768px)

### Settings — Always Live (60s cache)

Key settings: `is_open`, `delivery_enabled`, `pickup_enabled`, `payment_cash`, `payment_credit`,
`delivery_price`, `delivery_cities`, `delivery_zones` (array with city/fee/eta/min_order),
`business_hours`, `pickup_address`, `business_name`, `bot_url`

**`delivery_zones` vs `delivery_cities`:** The bot reads `delivery_zones` first (new format with per-city fees),
falls back to `delivery_cities` (legacy array). `saveZones()` in app.js syncs both automatically.

---

## Database Schema

```sql
categories         -- emoji, name_he, name_en, is_topping_addon, has_toppings, sort_order
products           -- name_he, name_en, price, description, image_url, category_id FK, is_available, sort_order
product_additions  -- per-product toppings, FK → products CASCADE
settings           -- key/value JSONB config
sessions           -- per-phone: conversation_history, pending_order, pending_dispute, customer_profile
pending_payments   -- Cardcom pending (30min expiry): phone, cardcom_code, return_value, order_data
push_subscriptions -- Web Push: endpoint, p256dh, auth, user_agent
orders             -- order_number (seq from 1000), items JSONB, status, payment_method, payment_status
                   -- cardcom_code, cardcom_deal_number (null until prod terminal)
                   -- refund_status, cancelled_by, cancel_reason
                   -- dispute_status, dispute_item
customers          -- VIEW over orders (name, phone, last_address, order_count, total_spent)
```

**Order status:** `new → preparing → out_for_delivery → delivered → done` (auto 1h) | `cancelled`

**Dispute status:** `pending` → `resolved` (resolution: `cancelled` | `removed` | `replaced` | `continued`)

---

## What's Built

### ✅ Working
- Waiter-mode bot: deal-breakers first, cart management, delivery zones from DB
- Credit payment: Cardcom v11, success-redirect confirm (rv= in URL), 5-min polling fallback
- Cash payment: direct save
- Dispute flow: business marks missing items/toppings → bot handles customer 1/2/3 response
- Cancel + refund: who-cancelled, reason, send-toggle, editable WhatsApp preview, optional Cardcom refund
- Dashboard: expandable order rows with full details + actions inline
- Stats page: 7 Chart.js charts (orders/day bar, revenue line, hourly heatmap, 3 doughnuts, products bar)
- Push notifications: Service Worker + VAPID, auto-fires on new order
- Image upload to Supabase Storage (menu-images bucket)
- Export orders CSV (UTF-8 BOM, currently-filtered orders)
- Receipt popup: close button + auto-close on print
- Mobile: burger menu, order cards, responsive modals
- Public menu `/menu.html` with photos, descriptions, toppings

### ❌ Missing / needs work
| Item | Notes |
|------|-------|
| Business owner bot | Code written, needs `GREEN_API_BUSINESS_INSTANCE_ID` + second Green API instance |
| Cardcom production | Test terminal 1000 only. Auto-refund needs `cardcom_deal_number` from prod webhook |
| Cardcom auto-refund | `CancelDeal.aspx` needs `InternalDealNumber` — not stored yet (no prod terminal) |
| No test suite | Zero automated tests |
| Bit / Paybox | Settings toggles only, no real integration |

---

## Operational Rules

1. **Backup before any infra change:** `node scripts/backup-render-env.js`
2. **Schema changes:** Edit `supabase/schema.sql` first (`ADD COLUMN IF NOT EXISTS`), then psql.
3. **Always run** `node --check public/app.js` before committing — a broken backtick silently empties the whole dashboard.
4. **Every desktop UI change must include mobile** — check `window.innerWidth <= 768` branches.
5. **delivery_zones** is the authoritative source. `saveZones()` syncs `delivery_cities` automatically. The bot reads `delivery_zones` first.
6. **Always update CLAUDE.md** when architecture, env vars, or hard-won lessons change.

---

## Known Issues & Lessons Learned

### Cardcom GetLowProfileIndicatorData endpoint does not exist
Verified 2026-05: `POST /api/v11/LowProfile/GetLowProfileIndicatorData` returns 404 on Cardcom servers. No v11 JSON verification endpoint was found. `verifyPayment()` in cardcom.js is now a no-op returning `success:true`. Confirmation relies on: (1) success-redirect with `?rv=` embedded, (2) IndicatorUrl webhook POST, (3) 5-min polling fallback.

### Cardcom success redirect doesn't pass params automatically
Test terminal doesn't append `LowProfileCode` or `ReturnValue` to the success URL. Fix: embed `ReturnValue` ourselves in `SuccessRedirectUrl: .../payment/success?rv=PB-XXXX` at creation time. `payment.js` reads `req.query.rv`.

### delivery_zones ignored — bot used hardcoded "תל אביב only"
`prompts.js` read `delivery_price` (single) and had "תל אביב בלבד" hardcoded. It never read `delivery_zones`. Fix: `prompts.js` now reads `delivery_zones`, builds dynamic allowed-cities list and per-city fee table. `saveZones()` syncs `delivery_cities`. Log line added: `[prompts] delivery zones loaded: X, Y (N zones)`.

### isOpen() used UTC instead of Israel time
`new Date().getHours()` returns UTC on Render. Fix: `new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })`.

### Toppings poll fired even when toppings were in the message
Claude interpreted "ציין תוספות בשיחה" as history-only, not current message. Fix: iron rule in prompts.js — any topping keyword in the *current* message → skip SHOW_TOPPINGS.

### Stale sessions surviving deploys
Old-flow sessions (SHOW_MENU, "בחרתי: X — Y₪") mixed with new waiter-mode prompt caused contradictions. Fix: stale-session guard in `ai-handler.js` resets sessions > 3h old or containing old markers.

### page-stats placed outside .main div — invisible
Inserted `<div id="page-stats">` after the closing `</div>` of `.main`. All page divs must be inside `.main`. The `display:none` default + JS toggling only works inside the layout wrapper.

### Cancel button not showing on orders
The only order in DB had `status: 'done'`. The button is hidden for `['cancelled','done']` — correct behaviour. Button shows on `new`, `preparing`, `out_for_delivery`, `delivered`.

### Green API monthly quota exceeded
Test instance limited to 3 whitelisted numbers. Customers outside the whitelist get HTTP 466. Fix: upgrade Green API plan to Business at console.green-api.com.

### CARDCOM_TERMINAL ≠ CompanyId
`040617649` is CompanyId, not TerminalNumber. Test terminal = `1000`.

### ANTHROPIC_API_KEY lost after Render service recreation
Always run `backup-render-env.js` before infra changes. render-guard hook enforces this.

### Supabase service role JWT ≠ database password
Service key is for REST/PostgREST. DB password (`mUprot-tefno8-zikgak`) is separate.

### Poll webhook fires on every vote change
Filter: only process `pollUpdateMessage` when `✅ confirm` is voted. Intermediate votes silently ignored.

### Missing backtick crashes entire dashboard silently
Template literal missing backtick: JS parses, `app.js` loads, but all tabs stay `display:none` forever. Run `node --check public/app.js` before every push.

### SVG doesn't print in popup windows
`printOrder()` uses a `window.open()` popup. SVG elements render blank in print dialogs on some browsers. Use plain-text characters (₪, →, etc.) in receipt HTML, never SVG.

### Cancel modal — reason send-toggle only controls the note
`send_to_customer` toggle controls whether the *reason* text appears in the WhatsApp message. The cancellation message itself is always sent regardless. `cancelled_by` persisted in DB (`'business'` | `'customer'`) changes the message wording.

### Editable preview in cancel modal — auto-sync stops on manual edit
`_previewEdited` flag. Once user edits the preview textarea, auto-sync from fields stops. `↺ אפס` button clears the flag and regenerates. `confirmCancelRefund()` sends `cancelPreview.value` as `custom_message` — backend uses it verbatim if present.

### Dispute modal — old single-item format kept for backwards compat
API accepts both `disputes[]` (new) and `item_name` + `item_price` (old). Handler normalises to array. `handleDisputeResponse()` in `ai-handler.js` supports both `dispute.items[]` and legacy `dispute.item_name`.
