# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**פיצה דליבריס** — a WhatsApp pizza ordering bot with a web management dashboard.

- **Customer bot:** AI-powered WhatsApp conversation (Claude) → takes orders → Cardcom payment → confirms order
- **Dashboard:** Web UI for the business owner to manage orders, products, settings, customers
- **Business bot:** Separate WhatsApp number for the owner to update prices/availability/hours by chat

**Stack:** Node.js + Express · Supabase (PostgreSQL) · Render (hosting) · Green API (WhatsApp) · Anthropic Claude `claude-opus-4-7` · Cardcom (Israeli payment processor)

**Live:**
- Dashboard + bot: `https://pizzabot-jasell.onrender.com`
- Webhook: `https://pizzabot-jasell.onrender.com/webhook`
- GitHub: `git@github.com:monkemoney/pizzabot.git`
- Render service ID: `srv-d831jc8js32c73ef8mng`

---

## Environment Variables (All 15 — production values)

```env
PORT=3000
PUBLIC_URL=https://pizzabot-jasell.onrender.com

# Green API — customer WhatsApp bot
GREEN_API_INSTANCE_ID=7105619659
GREEN_API_TOKEN=ba8c5d2471a3458fb65bff54f108023965e01a7afb644344aa
GREEN_API_BASE_URL=https://api.green-api.com

# Supabase
SUPABASE_URL=https://umoftdmutxhrbknowbyh.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtb2Z0ZG11dHhocmJrbm93YnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODc1NDUyMSwiZXhwIjoyMDk0MzMwNTIxfQ.N0hk2fdeRJQC0yGWehAuSRqFv4Oluu-N19zzcorm_wk

# Anthropic  (real value in .env.production — never commit the key)
ANTHROPIC_API_KEY=sk-ant-api03-...  # get from .env.production or Render dashboard

# Cardcom payments — TEST account
CARDCOM_API_URL=https://secure.cardcom.solutions
CARDCOM_TERMINAL=1000          # ← TERMINAL NUMBER (NOT CompanyId 040617649 — those are different)
CARDCOM_USERNAME=CardTest1994  # ApiName for JSON API v11

# Dashboard auth
ADMIN_SECRET=jasell-admin-2026
DASHBOARD_ADMIN_PASSWORD=admin2026
DASHBOARD_MANAGER_PASSWORD=manager2026
JWT_SECRET=pizzabot-jwt-secret-2026-change-in-prod
```

**Supabase DB credentials (for psql — different from service key):**
```
Host: db.umoftdmutxhrbknowbyh.supabase.co:5432
User: postgres
Password: mUprot-tefno8-zikgak
Database: postgres
```

**Cardcom test login:** `https://secure.cardcom.solutions/LogInNew.aspx`
- Username: `CardTest1994` / Password: `Terminaltest2026`
- Terminal `1000` = test terminal · CompanyId `040617649` = unrelated identifier

**Green API:** Connected to WhatsApp +1 (470) 746-4602

---

## Commands

```bash
npm start        # production
npm run dev      # nodemon watch

# psql schema migration
export PATH="/usr/local/opt/libpq/bin:$PATH"
PGPASSWORD="mUprot-tefno8-zikgak" psql \
  "postgresql://postgres@db.umoftdmutxhrbknowbyh.supabase.co:5432/postgres" \
  -f supabase/schema.sql

# Env var backup/restore (ALWAYS before infra changes)
node scripts/backup-render-env.js   # pulls from Render → .env.production
node scripts/sync-render-env.js     # pushes .env.production → Render

# Deploy (auto on push)
git push origin main
```

---

## Folder Structure

```
pizza-bot/
├── src/
│   ├── index.js                  # Express server, webhook entry point
│   ├── bot/
│   │   ├── handler.js            # Thin re-export of ai-handler
│   │   ├── ai-handler.js         # Core loop: Claude call, ACTION dispatch, 15-min edit window
│   │   ├── prompts.js            # System prompt builder (reads live menu + settings from DB)
│   │   └── menu.js               # Static menu text helpers (legacy, mostly unused)
│   ├── services/
│   │   ├── claude.js             # Anthropic SDK wrapper, prompt caching
│   │   ├── greenapi.js           # sendMessage, sendListMessage, sendMenuList, sendButtons
│   │   ├── supabase.js           # All DB functions (sessions, orders, pending_payments)
│   │   ├── cardcom.js            # Cardcom JSON API v11 (createPaymentPage, verifyPayment)
│   │   ├── settings.js           # Live settings from DB with 60s in-memory cache
│   │   ├── menu-service.js       # Live products from DB with 60s cache
│   │   └── status-notifier.js    # WhatsApp notification on order status change
│   ├── routes/
│   │   ├── dashboard-api.js      # All /api/* REST endpoints for the dashboard
│   │   ├── payment.js            # POST /webhook/payment (Cardcom) + success/failed pages
│   │   ├── admin.js              # Legacy /admin/orders (kept for backwards compat)
│   │   └── business-bot.js       # POST /webhook/business (owner WhatsApp bot)
│   └── middleware/
│       └── auth.js               # HMAC-SHA256 token sign/verify, requireAuth, requireAdmin
├── public/
│   ├── index.html                # Dashboard login page
│   ├── dashboard.html            # Dashboard SPA shell (Tailwind CDN, no build step)
│   └── app.js                    # All dashboard JS: orders, products, customers, settings
├── supabase/
│   └── schema.sql                # Full DB schema, safe to re-run
├── scripts/
│   ├── backup-render-env.js      # Pull env vars from Render → .env.production
│   ├── sync-render-env.js        # Push .env.production → Render (restore after service recreation)
│   └── render-guard.sh           # PreToolUse hook — blocks destructive Render API calls without backup
├── .claude/
│   └── settings.json             # Claude Code hook: render-guard on all Bash PreToolUse
├── .env.production               # Gitignored — real credentials backup
└── CLAUDE.md                     # This file
```

---

## Architecture

### Customer Message Flow

```
Customer sends WhatsApp message
  → Green API webhook POST /webhook
  → index.js extracts text from:
      textMessage | listResponseMessage | buttonsResponseMessage
  → ai-handler.js handleMessage(phone, text)
      1. Check is_open (settings, 60s cache) → reply closed if needed
      2. Check 15-min edit window (last order 'new' status within 15min)
      3. buildSystemPrompt() — loads live menu + settings from Supabase
      4. callClaude(systemPrompt, conversation_history, userMessage)
         Model: claude-opus-4-7 · History capped at 40 messages
         System prompt cached (cache_control: ephemeral)
      5. Parse ACTION block from Claude response (regex)
      6. Strip ACTION, send clean text to customer via Green API
      7. Dispatch action:
         SHOW_MENU       → sendMenuList() — WhatsApp interactive list
         SAVE_ORDER      → saveOrder() → confirm with order number (cash)
         CREATE_PAYMENT  → createPaymentPage() → send Cardcom URL (credit)
         RESET           → clear conversation_history
```

### ACTION Protocol

Claude embeds invisible commands in HTML comments (stripped before sending to customer):

| Action | When Claude uses it | Result |
|--------|-------------------|--------|
| `<!--ACTION:SHOW_MENU-->` | On first greeting, or when customer asks for menu | Green API interactive list with all products |
| `<!--ACTION:SAVE_ORDER:{json}-->` | Customer confirms cash order | Order saved to DB, customer gets order number |
| `<!--ACTION:CREATE_PAYMENT:{json}-->` | Customer confirms credit order | Cardcom payment link created and sent |
| `<!--ACTION:RESET-->` | Customer cancels | conversation_history cleared |

### Cardcom Payment Flow

```
1. Customer confirms credit order
2. ai-handler.js → cardcom.js POST /api/v11/LowProfile/Create
   { TerminalNumber: 1000, ApiName: "CardTest1994", Amount: X, ... }
3. Cardcom returns { LowProfileId, Url }
4. pending_payments row saved (30min expiry)
5. Payment URL sent to customer
6. Customer pays on Cardcom page
7. Cardcom POSTs to /webhook/payment (IndicatorUrl)
8. payment.js → verifyPayment(LowProfileId) → Cardcom confirms
9. saveOrder() called → order_number assigned
10. Customer notified with order number
11. pending_payment deleted
```

### Dashboard Auth

Custom HMAC-SHA256 tokens in `src/middleware/auth.js` — no JWT library needed. Roles:
- `admin` → full access (orders, products, customers, settings, stats)
- `manager` → orders tab only

Dashboard login: `https://pizzabot-jasell.onrender.com/` · `admin`/`admin2026` · `manager`/`manager2026`

### Settings & Menu — Always Live

Both load from Supabase with a 60-second in-memory cache:
- `settings.js` — key/value JSONB (`is_open`, `delivery_price`, `business_hours`, etc.)
- `menu-service.js` — `products` + `product_additions` tables

`invalidateCache()` must be called after any product/setting update (done automatically in dashboard API routes).

---

## Database Schema

```sql
products           -- menu items (category='main' only)
product_additions  -- per-product toppings, FK → products CASCADE
settings           -- key/value JSONB config
sessions           -- per-phone state: conversation_history (40 msg cap), pending_order
pending_payments   -- holds order JSON while customer is on Cardcom (30min expiry)
orders             -- final orders, order_number from sequence starting at 1000
customers          -- VIEW over orders (not a real table)
```

**Order status flow:** `new → preparing → out_for_delivery → delivered → done` (auto after 1h) | `cancelled`

Settings keys: `is_open`, `delivery_enabled`, `pickup_enabled`, `payment_cash`, `payment_credit`, `delivery_price`, `delivery_cities`, `min_order_delivery`, `business_hours`

---

## Product Spec

### 1. Customer Bot (WhatsApp)
- Natural Hebrew/English AI conversation
- Order flow: greeting → interactive menu → item selection → toppings → delivery/pickup → address → name → payment method → summary → confirm → payment link (credit) or direct confirmation (cash)
- 15-minute edit window: customer can cancel by sending "בטל" within 15 min of placing
- Status updates pushed to customer when order status changes: preparing / out_for_delivery / delivered / cancelled

### 2. Business Owner Bot (WhatsApp — separate number)
- Commands: update price, mark item unavailable/available, open/close orders, set payment methods, set delivery options
- Mounted at `/webhook/business` — only active when `GREEN_API_BUSINESS_INSTANCE_ID` env var is set
- Requires a second Green API instance (not yet configured)

### 3. Dashboard
**Login:** admin (full) / manager (orders only)

**Orders page (default):**
- Stats (admin): date picker, order count, revenue, avg delivery time, paid/pending, top 3 products, conversations started, not converted
- Orders table: order number, date/time, customer name, phone, address, delivery type, payment method, paid/pending badge, total, status dropdown, detail modal
- Status dropdown triggers WhatsApp notification to customer on change
- Auto-refresh every 30s

**Products page:**
- Expandable rows (click to expand additions/toppings)
- Columns: name (he/en), price, image thumbnail, additions count, available toggle, edit/delete
- Additions sub-table: name, price, image, available toggle, edit/delete, + add button
- Add/edit modals with image URL field

**Customers page:**
- Table: name, phone, last address, order count, total spent, last order date
- Filter: returning customers only (2+ orders)
- Checkbox select → broadcast WhatsApp message (max 50, with warning)

**Settings page:**
- Toggles: is_open, delivery_enabled, pickup_enabled, payment_cash, payment_credit
- Delivery price + min order amount
- Delivery cities (comma-separated)
- Business hours: per-day time pickers (sun–sat)

---

## What's Built vs. Missing

### ✅ Built and working
- Customer bot: full order flow, Claude AI, Hebrew/English, interactive menu list
- Cardcom credit payment (JSON API v11, terminal 1000)
- Cash payment (direct save)
- Cardcom webhook → order confirmation
- 15-minute edit/cancel window
- Status notifications via WhatsApp
- Dashboard: login, orders, products, customers, settings, stats
- Products with expandable toppings/additions
- Business hours in settings UI
- Auto-complete delivered → done after 1 hour
- Health check on Render (/health)
- Env var backup/restore scripts + render-guard hook

### ❌ Still missing / needs work
| Item | Notes |
|------|-------|
| Business owner bot | Code written, but no second Green API instance configured (`GREEN_API_BUSINESS_INSTANCE_ID` not set) |
| Cardcom production | Currently using test terminal 1000. Real terminal needed for live payments |
| jasell.com DNS | Domain not yet pointed to Render (CNAME `www` → `pizzabot-jasell.onrender.com`, ALIAS `@` → same) |
| No test suite | Zero automated tests |
| `JWT_SECRET` | Should be changed to a strong random string in production |

---

## Operational Rules

1. **Backup before any infra change.** Before touching the Render service (delete, recreate, major env var changes):
   ```bash
   node scripts/backup-render-env.js
   ```
   The `render-guard.sh` PreToolUse hook enforces this automatically — it will block Bash commands targeting the Render DELETE API if `.env.production` is missing or older than 24h.

2. **One task at a time.** Finish and push before starting the next thing.

3. **Always push `CLAUDE.md` updates.** When anything critical changes (new env var, architecture change, bug discovered), update this file and push.

4. **Schema changes:** Edit `supabase/schema.sql` first, then run via psql. The file uses `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` so it's always safe to re-run in full.

---

## Known Issues & Lessons Learned

### CARDCOM_TERMINAL ≠ CompanyId
`040617649` is the Cardcom **CompanyId** (visible in the account dashboard URL). The actual **TerminalNumber** for the test account is `1000`. These are completely different fields. The old Low Profile `.aspx` API also doesn't work — must use the JSON API v11 (`/api/v11/LowProfile/Create` with `ApiName` not `UserName`).

### ANTHROPIC_API_KEY was lost after service recreation
When the Render service was deleted and recreated (to fix Rust vs. Node.js environment mismatch), the `ANTHROPIC_API_KEY` was not included in the env var restore. The bot ran but returned "שגיאה זמנית" to every customer. Always use `scripts/backup-render-env.js` before any service-level changes.

### Render service was created as Rust, not Node.js
The original service was configured as a Rust service. `render.yaml` in the repo specifies `env: node` but this doesn't retroactively change an existing service's runtime. The fix was to delete and recreate the service. The `render-guard` hook prevents future blind deletions.

### Green API webhook was pointed at jasell.com (unconnected domain)
The webhook was configured to `https://www.jasell.com/webhook/whatsapp` with `incomingWebhook: no`. This silently dropped all incoming messages. Fix:
```bash
curl -X POST "https://api.green-api.com/waInstance7105619659/setSettings/{TOKEN}" \
  -d '{"webhookUrl":"https://pizzabot-jasell.onrender.com/webhook","incomingWebhook":"yes"}'
```

### Service role JWT ≠ database password
Supabase's service role key is a JWT for the REST/PostgREST API. It cannot be used as a PostgreSQL password. The DB password (`mUprot-tefno8-zikgak`) is separate and found in Supabase Dashboard → Settings → Database.

### Cardcom webhook path
The `IndicatorUrl` (webhook Cardcom calls after payment) must be `PUBLIC_URL/webhook/payment` — not `/payment/webhook`. The payment route is mounted at both `/webhook` and `/payment` in `index.js`.
