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

# Deploy (auto on push)
git push origin main
```

---

## Folder Structure

```
pizza-bot/
├── src/
│   ├── index.js                  # Express server, webhook entry point, toppings-poll handler
│   ├── bot/
│   │   ├── handler.js            # Thin re-export of ai-handler
│   │   ├── ai-handler.js         # Core loop: stale-session guard, Claude call, ACTION dispatch
│   │   ├── prompts.js            # System prompt builder — waiter flow, deal-breakers first
│   │   └── menu.js               # Legacy static menu helpers (mostly unused)
│   ├── services/
│   │   ├── claude.js             # Anthropic SDK wrapper, prompt caching
│   │   ├── greenapi.js           # sendMessage, sendToppingsPoll (interactive poll)
│   │   ├── supabase.js           # All DB functions (sessions, orders, pending_payments)
│   │   ├── cardcom.js            # Cardcom JSON API v11 (createPaymentPage, verifyPayment)
│   │   ├── settings.js           # Live settings from DB with 60s cache; isOpen() uses Asia/Jerusalem TZ
│   │   ├── menu-service.js       # Live products from DB with 60s cache
│   │   └── status-notifier.js    # WhatsApp notification on order status change
│   ├── routes/
│   │   ├── dashboard-api.js      # All /api/* endpoints incl. GET /api/public-menu (no auth)
│   │   ├── payment.js            # POST /webhook/payment (Cardcom) + success/failed pages
│   │   ├── admin.js              # Legacy /admin/orders (backwards compat)
│   │   └── business-bot.js       # POST /webhook/business (owner bot — not yet active)
│   └── middleware/
│       └── auth.js               # HMAC-SHA256 token sign/verify, requireAuth, requireAdmin
├── public/
│   ├── index.html                # Dashboard login page
│   ├── dashboard.html            # Dashboard SPA (Heebo+Poppins, brand colors, dark mode)
│   ├── app.js                    # All dashboard JS: orders, products, customers, settings
│   └── menu.html                 # Public customer menu — photos, toppings, WhatsApp CTA
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
      1. Check isOpen() — uses Asia/Jerusalem TZ, not UTC
      2. Stale-session guard — reset if age > 3h or has old-flow markers
      3. Check 15-min edit window (last order 'new' within 15 min)
      4. buildSystemPrompt() — loads live menu + settings from Supabase
      5. callClaude(systemPrompt, history, userMessage)
         Model: claude-opus-4-7 · History capped at 40 messages
         System prompt cached (cache_control: ephemeral)
      6. Parse ACTION block from Claude response (regex)
      7. Strip ACTION, send clean text to customer via Green API
      8. Dispatch action:
         SHOW_TOPPINGS   → sendToppingsPoll() — WhatsApp multi-select poll
         SAVE_ORDER      → saveOrder() → confirm with order number (cash)
         CREATE_PAYMENT  → createPaymentPage() → send Cardcom URL (credit)
         RESET           → clear conversation_history
```

### Bot Conversation Flow (Waiter Mode)

The bot behaves like a restaurant waiter — deal-breakers asked **before** taking the order:

```
1. Greeting + deal-breakers in one shot:
   "משלוח 🛵 (30₪) או איסוף עצמי 🏍️? מזומן 💵 או אשראי 💳?"

2. Confirm logistics, get address if delivery (Tel Aviv only)
   → Pickup: tell customer address (pickup_address setting)

3. Take the order in free text
   → If customer asks for menu → send /menu.html URL (no interactive list)

4. Toppings (pizza only):
   IRON RULE: if current message contains any topping word/name → skip SHOW_TOPPINGS
   Only send SHOW_TOPPINGS poll if zero topping context exists anywhere in conversation

5. Collect name (if not known from returning-customer profile)

6. Show summary + ask for confirmation (1 = yes / 2 = cancel)

7. Process: SAVE_ORDER (cash) or CREATE_PAYMENT (credit)
```

### ACTION Protocol

Claude embeds invisible commands (stripped before sending to customer):

| Action | Trigger | Result |
|--------|---------|--------|
| `<!--ACTION:SHOW_TOPPINGS-->` | Pizza ordered, no toppings mentioned | WhatsApp multi-select poll |
| `<!--ACTION:SAVE_ORDER:{json}-->` | Customer confirms, cash payment | Order saved, customer gets order number |
| `<!--ACTION:CREATE_PAYMENT:{json}-->` | Customer confirms, credit payment | Cardcom link created and sent |
| `<!--ACTION:RESET-->` | Customer cancels ("בטל") | conversation_history cleared |

> `SHOW_MENU` was removed. Menu requests now receive the `/menu.html` URL as plain text.

### Cardcom Payment Flow

```
1. Claude emits CREATE_PAYMENT with order JSON
2. ai-handler → cardcom.js POST /api/v11/LowProfile/Create
   { TerminalNumber: 1000, ApiName: "CardTest1994", Amount: X, ... }
3. Cardcom returns { LowProfileId, Url }
4. pending_payments row saved (30min expiry), payment URL sent to customer
5. Customer pays → Cardcom POSTs to /webhook/payment (IndicatorUrl)
6. payment.js → verifyPayment(LowProfileId) → saveOrder() → notify customer
7. pending_payment deleted
```

### Public Menu Page (`/menu.html`)

- No auth required — served as static HTML
- Data from `GET /api/public-menu` (no auth endpoint in dashboard-api.js)
- Returns: categories (excl. `is_topping_addon`), products with `additions`, business info
- Features: sticky category tabs, product cards with image/description/price,
  toppings accordion, "הזמן" button pre-fills WhatsApp message, sticky CTA
- `products.description` column added — editable from dashboard product modal

### Dashboard

Brand: `#5e17eb` violet · `#ff66c4` pink · `#eeede9` bg · Poppins font

- **No emojis anywhere** — all icons are inline SVG (stroke-based, Feather-style). SVG constants defined in `const SVG = {...}` at top of `app.js`. Category emojis are the only exception (user-defined per category).
- **Settings page:** 6 sections with SVG line icons, iOS-style toggle switches
- **Dark mode:** `[data-theme=dark]` on `<html>`, toggled by sun/moon SVG button
- **Notification bell:** badge count of `status==='new'` orders
- **Orders:** stats cards, period picker, filters (status/payment/date range/search), edit modal
  - Edit modal: change items, qty, address, destination_type, courier_notes
  - VAT shown as 18% (`total * 18 / 118`)
  - **Cancel modal** (`POST /api/orders/:id/cancel-refund`): red ✕ button on every non-cancelled/done row. Modal has:
    - Who cancelled — radio: `יוזמת העסק` / `בקשת הלקוח` (saved to `orders.cancelled_by`)
    - Reason textarea (internal by default, saved to `orders.cancel_reason`)
    - "Send to customer" iOS toggle (on by default) — note appended to WhatsApp message if on
    - Live WhatsApp preview — updates on every keystroke, shows exactly what customer receives
    - Backend tries Cardcom `CancelDeal.aspx` if `cardcom_deal_number` is stored; falls back to manual-refund alert with Cardcom link
  - **Receipt popup:** separate `window.open()` popup. Includes close button + auto-closes via `window.onafterprint`
  - **Mobile:** renders as swipeable cards (`renderOrderCard`), not table. Re-renders on resize via debounced `window.resize` listener.
- **Products:** expandable rows with additions, image thumbnails, description field
- **Customers:** stats, returning-only filter, broadcast (max 50)
- **Auth:** admin (full) · manager (orders only) · HMAC-SHA256 tokens, 24h expiry

### Mobile Layout

- **Breakpoint:** `768px`
- **Navigation:** burger menu (hamburger → X animation) slides sidebar in from right. Overlay closes it. Bottom nav removed.
- **Z-index stack:** mobile-header `41` > sidebar `40` > overlay `39` > content
- **Orders:** card layout via `renderOrderCard()` when `window.innerWidth <= 768`
- **Filters:** column layout, date inputs grouped in `.date-range-row` with מ:/עד: labels
- **Modals:** bottom sheets (`border-radius: 20px 20px 0 0`)
- **Rule: every desktop UI change must include a mobile update in the same commit**

### Settings & Menu — Always Live

Both load from Supabase with 60s in-memory cache. `invalidateCache()` called after updates.

Settings keys: `is_open`, `delivery_enabled`, `pickup_enabled`, `payment_cash`, `payment_credit`,
`payment_bit`, `payment_paybox`, `payment_other`, `delivery_price`, `delivery_cities`,
`min_order_delivery`, `business_hours`, `business_name`, `business_address`, `bot_url`,
`pickup_address`, `allow_order_edits`, `edit_time_limit`, `edit_from_confirmation`

---

## Database Schema

```sql
categories         -- menu categories: emoji, name_he, name_en, is_topping_addon, has_toppings, sort_order
products           -- menu items: name_he, name_en, price, description, image_url, category_id FK, is_available, sort_order
product_additions  -- per-product toppings/additions, FK → products CASCADE
settings           -- key/value JSONB config
sessions           -- per-phone: conversation_history (40 msg cap), pending_order, updated_at
pending_payments   -- holds order JSON while customer is on Cardcom (30min expiry)
orders             -- final orders, order_number sequence from 1000, destination_type, courier_notes,
                   --   cardcom_deal_number, refund_status, cancelled_by, cancel_reason
customers          -- VIEW over orders (name, phone, last_address, order_count, total_spent)
```

**Order status flow:** `new → preparing → out_for_delivery → delivered → done` (auto after 1h) | `cancelled`

---

## What's Built vs. Missing

### ✅ Built and working
- Customer bot: waiter-mode flow, deal-breakers first, Claude AI, Hebrew/English
- Public menu page `/menu.html` with photos, descriptions, toppings, WhatsApp order buttons
- Cardcom credit payment (JSON API v11, terminal 1000)
- Cash payment (direct save)
- Cardcom webhook → order confirmation
- 15-minute edit/cancel window
- Status notifications via WhatsApp on order status change
- Dashboard: login, orders (edit modal, stats, filters), products (descriptions), customers, settings, dark mode
- iOS-style toggle switches, SVG line icons throughout (no emojis)
- Business hours per day (open/close time + enabled toggle)
- Delivery zones settings
- Auto-complete delivered → done after 1 hour
- Stale-session guard (resets old-flow sessions on new deploy)
- isOpen() uses Israel timezone (Asia/Jerusalem) — not UTC
- Health check `/health`, env var backup/restore scripts, render-guard hook
- Mobile: burger menu with X animation, order cards layout, responsive filters
- Cancel + refund flow: cancel modal with who-cancelled, reason, send-toggle, live preview, optional Cardcom auto-refund
- Receipt popup: close button + auto-close after print (`window.onafterprint`)

### ❌ Still missing / needs work
| Item | Notes |
|------|-------|
| Business owner bot | Code written, needs `GREEN_API_BUSINESS_INSTANCE_ID` env var + second Green API instance |
| Cardcom production | Using test terminal 1000. Need real terminal for live payments |
| ~~jasell.com DNS~~ | ✅ Connected — www.jasell.com live, @ → 301 redirect to www |
| No test suite | Zero automated tests |
| `JWT_SECRET` | Should be a strong random string in production |
| Bit / Paybox payment | Settings toggles exist but no actual integration |

---

## Operational Rules

1. **Backup before any infra change:**
   ```bash
   node scripts/backup-render-env.js
   ```
   The `render-guard.sh` PreToolUse hook blocks destructive Render API calls automatically.

2. **Schema changes:** Edit `supabase/schema.sql` first (use `ADD COLUMN IF NOT EXISTS`), then run via psql.

3. **Cache invalidation:** Call `invalidateCache()` (menu-service) and `settings.set()` auto-invalidates settings cache after any product/setting update via the dashboard API.

4. **Always update CLAUDE.md** when architecture, env vars, or hard-won lessons change.

5. **After every JS change to `app.js`:** run `node --check public/app.js` before committing. A syntax error (e.g. missing backtick in a template literal) crashes the entire dashboard silently.

6. **Every desktop UI change must include a mobile update** — check `@media (max-width: 768px)` CSS and the `window.innerWidth <= 768` JS branches in the same commit.

---

## Known Issues & Lessons Learned

### isOpen() used UTC instead of Israel time — bot said "closed" when open
`new Date().getHours()` returns UTC on Render servers. Israel is UTC+3 (IDT) / UTC+2 (IST).
Fixed by converting to `Asia/Jerusalem` timezone before comparing against business_hours:
```js
const nowIL = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
const now   = new Date(nowIL);
```
Also added a console log line per check to make debugging easy in Render logs.

### Toppings poll fired when toppings were already in the order message
Claude interpreted "ציין תוספות בשיחה" as "in previous history only" — not the current message.
Example: `"פיצה עם חצי זיתים חצי בצל"` triggered SHOW_TOPPINGS.
Fixed with an explicit iron rule in prompts.js: any topping keyword/name in the **current message** → skip SHOW_TOPPINGS unconditionally.
Detection words: `"עם", "בלי", "ללא", "חצי", "על הכל", "זיתים", "בצל", "תירס", "פטריות", "בולגרית", "קלמטה"...`

### Stale sessions surviving a deploy caused mixed old/new flow
A session with 28 messages from the old poll-flow (SHOW_MENU, "בחרתי: X — Y₪") survived a deploy. The new waiter-mode system prompt + old history created contradictions.
Fixed with a stale-session guard in `ai-handler.js`:
- Reset if session age > 3 hours
- Reset if history contains old-flow markers (`SHOW_MENU`, `בחרתי: X — Y₪`)

### SHOW_MENU (interactive WhatsApp list) was removed entirely
The new waiter flow sends `/menu.html` URL as plain text when menu is requested.
`SHOW_MENU` action and `sendMenuList()` import were removed from ai-handler + index.js.
Category-poll flow (sendCategoryPoll, resolveCategoryVote) was also removed.
Only `SHOW_TOPPINGS` poll remains.

### CARDCOM_TERMINAL ≠ CompanyId
`040617649` is the Cardcom **CompanyId**. The **TerminalNumber** for the test account is `1000`.
Must use JSON API v11 (`/api/v11/LowProfile/Create`) with `ApiName`, not the old `.aspx` endpoint with `UserName`.

### ANTHROPIC_API_KEY lost after Render service recreation
When service was deleted and recreated (Rust→Node.js fix), the API key wasn't restored.
Bot ran silently returning "שגיאה זמנית" to every customer.
Prevention: always run `backup-render-env.js` before infra changes. The render-guard hook enforces this.

### Render service was created as Rust type
`render.yaml` specifies `env: node` but doesn't fix an already-created Rust service.
Fix was delete + recreate. render-guard prevents future blind deletions.

### Green API webhook was wrong URL + incomingWebhook disabled
Was pointing to `https://www.jasell.com/webhook/whatsapp` with `incomingWebhook: no`.
All messages silently dropped. Fix:
```bash
curl -X POST "https://api.green-api.com/waInstance7105619659/setSettings/TOKEN" \
  -d '{"webhookUrl":"https://pizzabot-jasell.onrender.com/webhook","incomingWebhook":"yes","pollMessageWebhook":"yes"}'
```

### Supabase service role JWT ≠ database password
Service role key is a JWT for REST API. DB password (`mUprot-tefno8-zikgak`) is separate — found in Supabase Dashboard → Settings → Database.

### Cardcom webhook path
`IndicatorUrl` must be `PUBLIC_URL/webhook/payment`. Route is mounted at both `/webhook` and `/payment` in index.js.

### Poll webhook fires on every vote change
Green API sends `pollUpdateMessage` on every selection change, not just on submit.
Filter: only process when `✅ confirm` button is voted. Intermediate votes (items selected but no confirm yet) are ignored silently.

### Missing backtick in template literal crashed entire dashboard
A template literal in `imgThumb()` was missing its closing backtick. The JS file parsed but silently failed — the entire `app.js` refused to run, leaving the dashboard body completely empty (all tabs are `display:none` by default and JS never showed them).
Prevention: run `node --check public/app.js` before every push. Now in Operational Rules.

### Emojis replaced with SVG icons throughout dashboard
All UI emojis (📊 🛵 💵 💳 🖨️ etc.) replaced with inline SVG. Icon constants live in `const SVG = {...}` at top of `app.js`. SVG strings generated via helper `const S = (d, w=14) => \`<svg...>\``.
Exception: category emojis (user-defined per category in DB) are intentional and kept.
Receipt (printOrderReceipt) uses plain text — SVG doesn't print reliably in popup windows.

### box-sizing: border-box already set globally
`*, *::before, *::after { box-sizing: border-box }` is in the global CSS reset. Adding it again in mobile overrides is redundant (harmless but unnecessary).

### Mobile burger menu z-index stack
When adding an overlay above content, the mobile header must be above the overlay (z-index 41 > 39) so the burger button remains clickable when the drawer is open.

### Cardcom auto-refund requires `cardcom_deal_number` — not yet populated
`CancelDeal.aspx` needs the deal number returned by Cardcom after a successful payment. The test-terminal webhook (`IndicatorUrl`) doesn't reliably return `InternalDealNumber` in the current flow, so `cardcom_deal_number` on orders is always null.
Result: all cancellations fall through to the "manual refund" path — an alert shows the Cardcom dashboard link.
Fix when moving to production: extract and save `InternalDealNumber` from the Cardcom verify-payment response (`payment.js`) into the `orders` row.

### Receipt popup in `window.open()` — SVG doesn't print, use plain text
The print receipt function opens a new popup window with raw HTML. SVG icons do not render reliably in print dialogs (they appear blank on some browsers/OSes).
Rule: receipt content must use plain-text characters (₪, →, etc.), never SVG.
`window.onafterprint` + a close button are both needed — `onafterprint` fires automatically after the dialog closes, but the user can also dismiss without printing.

### Cancel modal — "who cancelled" must be persisted, not just sent in message
`cancelled_by` column stores `'business'` or `'customer'`. The WhatsApp message wording changes accordingly:
- `'business'` → "הזמנה בוטלה על ידי העסק"
- `'customer'` → "הזמנה בוטלה לפי בקשתך"
The `send_to_customer` toggle only controls whether the *reason* is appended to the message — the cancellation message itself is always sent.
