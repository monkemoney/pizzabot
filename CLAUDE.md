# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

WhatsApp pizza ordering bot for **פיצה דליבריס** (Pizza Deliveries). Customers order via WhatsApp; the business manages orders via a web dashboard.

**Stack:** Node.js + Express · Supabase (PostgreSQL) · Render (hosting) · Green API (WhatsApp) · Anthropic Claude (AI brain) · Cardcom (payments)

**Live URLs:**
- Bot webhook: `https://pizzabot-jasell.onrender.com/webhook`
- Dashboard: `https://pizzabot-jasell.onrender.com/`
- Render service ID: `srv-d831jc8js32c73ef8mng`

---

## Commands

```bash
npm start          # production
npm run dev        # nodemon watch mode

# Run the schema against Supabase (needs psql)
export PATH="/usr/local/opt/libpq/bin:$PATH"
PGPASSWORD="<db_pass>" psql "postgresql://postgres@db.umoftdmutxhrbknowbyh.supabase.co:5432/postgres" -f supabase/schema.sql

# Deploy to Render (auto-deploys on git push to main)
git push origin main

# Sync all env vars to Render (run before deleting/recreating a service)
# Use the Render API: PUT /v1/services/{id}/env-vars with all keys
```

No test suite exists yet.

---

## Architecture

### Message Flow (Customer Bot)

```
WhatsApp message
  → Green API webhook POST /webhook
  → index.js: extract text from textMessage | listResponseMessage | buttonsResponseMessage
  → ai-handler.js: handleMessage()
      1. Check is_open (settings service, 60s cache)
      2. Check 15-min edit window for recent orders
      3. buildSystemPrompt() — live menu + settings from Supabase (60s cache each)
      4. callClaude() — claude-opus-4-7, conversation_history stored in sessions table
      5. Parse ACTION block from Claude response
      6. Strip ACTION block, send clean text to customer via Green API
      7. Execute action (SAVE_ORDER | CREATE_PAYMENT | SHOW_MENU | RESET)
```

### ACTION Protocol

Claude embeds structured commands inside HTML comments that are never shown to customers:

| Action | Trigger | Effect |
|--------|---------|--------|
| `<!--ACTION:SHOW_MENU-->` | Greeting / "תפריט" request | Sends Green API interactive list message |
| `<!--ACTION:SAVE_ORDER:{json}-->` | Cash payment confirmed | Saves order to DB, sends confirmation |
| `<!--ACTION:CREATE_PAYMENT:{json}-->` | Credit payment confirmed | Creates Cardcom payment link, stores pending_payment |
| `<!--ACTION:RESET-->` | Cancel | Clears conversation_history |

### Cardcom Payment Flow

```
CREATE_PAYMENT action
  → cardcom.js: POST /api/v11/LowProfile/Create
      TerminalNumber: 1000  ← TEST terminal (NOT CompanyId 040617649)
      ApiName: CardTest1994
  → Save to pending_payments table (keyed by LowProfileId + ReturnValue)
  → Send payment URL to customer
  → Customer pays on Cardcom page
  → Cardcom: POST /webhook/payment (IndicatorUrl)
  → payment.js: verify via /api/v11/LowProfile/GetLowProfileIndicatorData
  → saveOrder() → notify customer with order number
```

**Critical:** `CARDCOM_TERMINAL=1000` is the terminal number. `040617649` is the CompanyId (completely different field — do not confuse).

### Dashboard Auth

No JWT library — uses HMAC-SHA256 tokens built in `src/middleware/auth.js`. Two roles: `admin` (full access) and `manager` (orders only). Passwords set via env vars `DASHBOARD_ADMIN_PASSWORD` / `DASHBOARD_MANAGER_PASSWORD`.

### Settings & Menu — Live from DB

- `src/services/settings.js` — key/value from `settings` table, **60s in-memory cache**
- `src/services/menu-service.js` — `products` + `product_additions` tables, **60s cache**
- Call `invalidateCache()` after any product/setting update so the bot sees changes within 60s
- System prompt is rebuilt on every message from live settings+menu

### Supabase Schema Key Points

- `products` — main menu items only (`category='main'`)
- `product_additions` — per-product toppings (FK to products, CASCADE delete)
- `settings` — key/value JSONB store (delivery_cities, delivery_price, business_hours, is_open, payment_cash, payment_credit, etc.)
- `sessions` — per-phone conversation_history (JSONB array, capped at 40 messages)
- `pending_payments` — order data held while customer is on Cardcom page (30min expiry)
- `orders` — sequential `order_number` from `order_number_seq` (starts at 1000)
- `customers` — a VIEW over orders (not a table)
- Status flow: `new → preparing → out_for_delivery → delivered → done` (auto after 1h) | `cancelled`

---

## Infrastructure

### Green API (WhatsApp)
- Instance: `7105619659`
- Webhook URL **must** be `https://pizzabot-jasell.onrender.com/webhook` with `incomingWebhook: yes`
- To verify/fix webhook settings:
  ```bash
  curl https://api.green-api.com/waInstance7105619659/getSettings/{TOKEN}
  curl -X POST https://api.green-api.com/waInstance7105619659/setSettings/{TOKEN} \
    -d '{"webhookUrl":"https://pizzabot-jasell.onrender.com/webhook","incomingWebhook":"yes"}'
  ```
- Connected phone: +1 (470) 746-4602

### Render
- **BEFORE deleting/recreating the service**, dump current env vars:
  ```bash
  curl -H "Authorization: Bearer {RENDER_API_KEY}" \
    https://api.render.com/v1/services/{SERVICE_ID}/env-vars
  ```
- All 15 env vars must be restored after recreation — especially `ANTHROPIC_API_KEY` which is easy to miss.

### Supabase
- Project ref: `umoftdmutxhrbknowbyh`
- DB host: `db.umoftdmutxhrbknowbyh.supabase.co:5432`, user: `postgres`
- Run schema changes with psql (service role JWT ≠ DB password — they are different credentials)

---

## Business Bot (Owner WhatsApp)

`src/routes/business-bot.js` — mounted at `/webhook/business`, only active when `GREEN_API_BUSINESS_INSTANCE_ID` is set. Requires a separate Green API instance. Commands parsed by Claude and executed as DB updates (price, availability, open/close).

---

## Files to Know

| File | Role |
|------|------|
| `src/bot/prompts.js` | System prompt — edit this to change bot personality/rules |
| `src/bot/ai-handler.js` | Core message loop, ACTION dispatch, 15-min edit window |
| `src/services/cardcom.js` | Cardcom JSON API v11 integration |
| `src/routes/payment.js` | Cardcom IndicatorUrl webhook + success/failed pages |
| `src/routes/dashboard-api.js` | All dashboard REST endpoints |
| `public/app.js` | Dashboard SPA (vanilla JS, no build step) |
| `supabase/schema.sql` | Full DB schema — safe to re-run (IF NOT EXISTS + ALTER IF NOT EXISTS) |
