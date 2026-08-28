-- ═══════════════════════════════════════════════════════════════════════════
-- Jasell — multi-tenant WhatsApp ordering platform
-- Full schema, regenerated from the live database on 2026-07-27.
--
-- This file is DOCUMENTATION AND A REBUILD SCRIPT. Nothing applies it
-- automatically: schema changes go through the Supabase Management API (see
-- CLAUDE.md → Commands). It is written to be safe to re-run.
--
-- It had drifted badly enough to be dangerous: it described a SINGLE-TENANT
-- schema (settings keyed by `key` alone, sessions by `phone` alone, no
-- tenant_id on products/categories/pending_payments, no tenant_users table at
-- all). Applying it to a fresh or restored environment would have produced a
-- system where one business's settings silently overwrite another's. Every
-- statement below now matches what production actually has.
--
-- ⚠️  Every tenant-scoped table carries `tenant_id`, and the code filters on it
--    in EVERY query — Supabase runs with the service role and no RLS, so a
--    missing filter returns other tenants' rows silently.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid, gen_random_bytes

-- Default/demo tenant. Also the fallback in every service signature.
-- aaaaaaaa-0000-0000-0000-000000000001

-- ═══ Menu ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  name_he          TEXT NOT NULL,
  name_en          TEXT NOT NULL,
  emoji            TEXT DEFAULT '🍽️',
  sort_order       INTEGER DEFAULT 0,
  has_toppings     BOOLEAN DEFAULT FALSE,
  is_topping_addon BOOLEAN DEFAULT FALSE,   -- the toppings pseudo-category
  taxable          BOOLEAN DEFAULT TRUE,    -- FALSE exempts from sales tax (CA 80/80 rule)
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);

CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  category_id  UUID REFERENCES categories(id),
  category     TEXT NOT NULL DEFAULT 'main',   -- legacy free-text category
  name_he      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  description  TEXT,
  price        NUMERIC NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,           -- the 86'ing flag
  image_url    TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

-- Per-product toppings. NOTE: no tenant_id — scope via product_id IN (tenant's
-- product ids), which is what every query in the codebase does.
CREATE TABLE IF NOT EXISTS product_additions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name_he      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  price        NUMERIC NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  image_url    TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_additions_product ON product_additions(product_id);

-- ═══ Settings ══════════════════════════════════════════════════════════════
-- Key/value per tenant. The composite PK is load-bearing: the code upserts with
-- onConflict 'tenant_id,key', and a PK on `key` alone would make tenant B's
-- save overwrite tenant A's.

CREATE TABLE IF NOT EXISTS settings (
  tenant_id  UUID NOT NULL DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant_id);

-- ═══ Conversations ═════════════════════════════════════════════════════════
-- One row per (tenant, phone). Admin-bot sessions use phone = 'admin:<phone>'.
-- Composite PK for the same reason as settings (onConflict 'tenant_id,phone').

CREATE TABLE IF NOT EXISTS sessions (
  tenant_id             UUID NOT NULL DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  phone                 TEXT NOT NULL,
  state                 TEXT NOT NULL DEFAULT 'IDLE',
  language              TEXT DEFAULT 'he',
  cart                  JSONB DEFAULT '[]',
  current_item          JSONB DEFAULT '{}',
  data                  JSONB DEFAULT '{}',
  conversation_history  JSONB DEFAULT '[]',   -- last 40 turns
  pending_order         JSONB DEFAULT '{}',
  customer_profile      JSONB DEFAULT '{}',   -- survives clearSession
  pending_dispute       JSONB,
  -- Human-agent handoff
  is_bot_active         BOOLEAN NOT NULL DEFAULT TRUE,
  unread_count          INTEGER NOT NULL DEFAULT 0,
  last_customer_message TEXT,
  last_message_at       TIMESTAMPTZ,
  handoff_at            TIMESTAMPTZ,          -- set on takeover; the watchdog's clock
  handoff_alerted_at    TIMESTAMPTZ,          -- waiting-customer alert sent once
  -- Marketing opt-out (suppresses broadcasts + missed-call recovery only)
  opted_out             BOOLEAN DEFAULT FALSE,
  opted_out_at          TIMESTAMPTZ,
  -- Privacy notice sent once per customer lifetime (re-sent only if the row
  -- is pruned after 90d inactivity). Survives clearSession like customer_profile.
  privacy_sent_at       TIMESTAMPTZ,
  pending_csat          JSONB,                -- open rating ask; self-expires after 24h
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);

-- ═══ Orders ════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1000 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  order_number        INTEGER UNIQUE DEFAULT nextval('order_number_seq'),
  phone               TEXT NOT NULL,            -- conversation phone
  customer_name       TEXT,
  customer_phone      TEXT,                     -- contact phone, may differ
  items               JSONB NOT NULL,
  delivery_method     TEXT NOT NULL CHECK (delivery_method IN ('pickup','delivery')),
  address             TEXT,
  delivery_fee        NUMERIC(10,2),            -- charged fee, frozen at order time
  tax_rate            NUMERIC(5,2),             -- rate applied, frozen at order time
  tax_amount          NUMERIC(10,2),            -- tax charged (exclusive) or contained (inclusive)
  tip_amount          NUMERIC(10,2),            -- tip charged, frozen at order time; never taxed
  tip_pct             NUMERIC(5,2),             -- the ladder % the customer picked; null = named amount
  destination_type    TEXT,
  courier_notes       TEXT,
  notes               TEXT,
  total_price         NUMERIC(10,2),

  -- Payment
  payment_method      TEXT NOT NULL CHECK (payment_method IN ('cash','credit','bit','paybox')),
  payment_status      TEXT DEFAULT 'paid',      -- paid | pending
  payment_verified_at TIMESTAMPTZ,              -- set only by a verified Cardcom callback
  cardcom_code        TEXT,
  cardcom_deal_number TEXT,                     -- only the IndicatorUrl webhook carries it
  refund_status       TEXT,                     -- null | refunded | manual

  -- Lifecycle. Every transition goes through services/order-state.js.
  status              TEXT DEFAULT 'new'
    CHECK (status IN ('new','scheduled','preparing','ready','out_for_delivery','delivered','done','cancelled')),
  status_history      JSONB DEFAULT '[]',       -- [{status, at, by}]
  scheduled_for       TIMESTAMPTZ,              -- pre-orders
  accepted_at         TIMESTAMPTZ,              -- business approval; null = awaiting
  prep_minutes        INTEGER,                  -- ETA promised to the customer
  escalation_level    INTEGER DEFAULT 0,        -- unaccepted-order reminders sent (0-2)
  cancelled_by        TEXT,                     -- customer | business
  cancel_reason       TEXT,

  -- Item disputes ("we ran out of X")
  dispute_status      TEXT,                     -- null | pending | resolved
  dispute_item        TEXT,
  dispute_resolution  TEXT,                     -- replaced | cancelled | removed

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
,
  csat_rating         SMALLINT,                 -- 1-5, asked once on 'done'
  csat_comment        TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_phone          ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number         ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant         ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status  ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders(tenant_id, created_at DESC);

-- The payment idempotency key. Webhook and success-redirect race by design;
-- without this they both insert and the customer gets two identical orders.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_cardcom_code_uniq
  ON orders(cardcom_code) WHERE cardcom_code IS NOT NULL;

-- ═══ Customers (view over orders) ══════════════════════════════════════════
-- Column-set changes require DROP VIEW first — CREATE OR REPLACE cannot add or
-- rename columns.

DROP VIEW IF EXISTS customers;
CREATE VIEW customers AS
SELECT
  tenant_id,
  phone,
  MAX(customer_name)  AS name,
  MAX(customer_phone) AS customer_phone,
  COUNT(*)            AS order_count,
  SUM(total_price)    AS total_spent,
  MAX(address)        AS last_address,
  MAX(created_at)     AS last_order_at
FROM orders
WHERE status <> 'cancelled'
GROUP BY tenant_id, phone;

-- ═══ Payments in flight ════════════════════════════════════════════════════
-- A row means a payment LINK was generated — never that money moved. Rows are
-- marked 'expired' rather than deleted: a customer can pay after the window
-- closes and order_data is the only record of what they ordered.

CREATE TABLE IF NOT EXISTS pending_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  phone        TEXT NOT NULL,
  cardcom_code TEXT UNIQUE,
  return_value TEXT UNIQUE,
  order_data   JSONB NOT NULL,
  status       TEXT DEFAULT 'open',      -- open | expired
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_cardcom        ON pending_payments(cardcom_code);
CREATE INDEX IF NOT EXISTS idx_pending_return         ON pending_payments(return_value);
CREATE INDEX IF NOT EXISTS idx_pending_payments_tenant ON pending_payments(tenant_id);

-- ═══ People ════════════════════════════════════════════════════════════════

-- Phones routed to the admin bot instead of the customer bot.
-- UNIQUE on (tenant_id, phone), NOT on phone alone — one owner can run more
-- than one business on the platform.
CREATE TABLE IF NOT EXISTS admin_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  phone      TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_tenant_phone ON admin_users(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_admin_users_tenant ON admin_users(tenant_id);

-- Dashboard logins, per tenant (bcrypt). Username is globally unique because
-- login resolves a user by username before it knows the tenant.
CREATE TABLE IF NOT EXISTS tenant_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  username   TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,          -- bcrypt hash
  role       TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant   ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_username ON tenant_users(username);

-- Browser push targets. `username` is what makes one revocable: order
-- notifications carry the customer's name and total, so a device that once
-- logged in must not keep receiving them forever.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  username   TEXT,                    -- who subscribed this device
  user_agent TEXT,
  last_ok_at TIMESTAMPTZ,             -- last successful delivery
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ Platform (vendor-facing) ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID DEFAULT gen_random_uuid(),   -- links every tenant-scoped table
  name          TEXT NOT NULL,
  contact_phone TEXT,
  plan          TEXT NOT NULL DEFAULT 'basic',
  status        TEXT NOT NULL DEFAULT 'active',   -- active | inactive | trial
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Client onboarding: pending_client → pending_vendor → provisioning → approved
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID REFERENCES clients(id) ON DELETE CASCADE,
  token                TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status               TEXT NOT NULL DEFAULT 'pending_client',

  -- Region: chosen by the vendor at link creation. Drives the wizard's language
  -- and examples, and seeds settings.region (and with it the tax model) on approve.
  region               TEXT DEFAULT 'IL',

  -- Filled by the client
  business_name        TEXT,
  business_address     TEXT,
  bot_whatsapp         TEXT,
  business_hours       JSONB,
  delivery_zones       JSONB DEFAULT '[]',
  delivery_enabled     BOOLEAN DEFAULT TRUE,
  pickup_enabled       BOOLEAN DEFAULT TRUE,
  pickup_address       TEXT,
  payment_cash         BOOLEAN DEFAULT TRUE,
  payment_credit       BOOLEAN DEFAULT FALSE,
  payment_bit          BOOLEAN DEFAULT FALSE,
  payment_paybox       BOOLEAN DEFAULT FALSE,
  bit_phone            TEXT DEFAULT '',
  admin_phones         JSONB DEFAULT '[]',
  menu_notes           TEXT,

  -- Filled by the vendor
  meta_phone_number_id TEXT,
  meta_access_token    TEXT,
  meta_waba_id         TEXT,
  green_api_instance   TEXT,
  green_api_token      TEXT,
  cardcom_terminal     TEXT,
  cardcom_username     TEXT,

  -- Provisioning
  checklist            JSONB DEFAULT '[{"key":"client_info","done":false,"label":"פרטי עסק מהלקוח"},{"key":"whatsapp","done":false,"label":"חיבור WhatsApp"},{"key":"cardcom","done":false,"label":"Cardcom (אם נבחר אשראי)"},{"key":"menu","done":false,"label":"הגדרת תפריט"},{"key":"test","done":false,"label":"בדיקת בוט"}]'::jsonb,
  provisioning         JSONB DEFAULT '{}',   -- per-step progress; makes approve resumable
  approved_username    TEXT,
  approved_password    TEXT,                 -- legacy; plaintext is never stored
  webhook_url          TEXT,

  expires_at           TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_by           TEXT                  -- 'client' | 'vendor'
);
CREATE INDEX IF NOT EXISTS idx_onboarding_client ON onboarding_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_sessions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_token  ON onboarding_sessions(token);

-- Claude token spend per call, for per-client cost reporting.
CREATE TABLE IF NOT EXISTS api_usage (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL DEFAULT 'aaaaaaaa-0000-0000-0000-000000000001',
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms        INTEGER,                  -- model call latency
  model              TEXT,                     -- null on rows predating model logging
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_usage_tenant  ON api_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);

-- Missed-call recovery funnel: one row per processed CDR, including why a
-- recovery was NOT sent (outcome). recovery_sent rows are also the durable
-- per-caller send throttle, and carry the attribution trail — responded_at
-- when the caller wrote back within 24h, recovered_order_id when an order
-- followed. This table is what makes "₪ recovered from missed calls" a
-- computable number instead of a log line.
-- outcome: answered | recovery_sent | send_failed | unusable_caller |
--          skipped_forward | skipped_courier | skipped_closed |
--          skipped_admin | skipped_opted_out | skipped_throttled
CREATE TABLE IF NOT EXISTS call_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL,
  caller             TEXT,
  answered           BOOLEAN NOT NULL DEFAULT FALSE,
  outcome            TEXT NOT NULL,
  channel            TEXT,
  raw                JSONB,
  responded_at       TIMESTAMPTZ,
  recovered_order_id UUID,
  recovered_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_events_tenant_created ON call_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_events_tenant_caller  ON call_events(tenant_id, caller, created_at DESC);

-- ═══ Bot Brain — insights, runs, decisions (2026-08-06) ═════════════════════
-- The sustainable learning loop's source of truth: every eval run and every
-- proposed/decided improvement lives here (not in files, not in chat).
-- Retention: keep forever — decision history is the point (class-13 reviewed).

CREATE TABLE IF NOT EXISTS bot_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at      TIMESTAMPTZ DEFAULT NOW(),
  kind        TEXT NOT NULL DEFAULT 'weekly',   -- weekly | manual | replay | funnel
  status      TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','failed')),
  verdict     TEXT,                             -- GO | NO-GO | null while running
  scores      JSONB DEFAULT '{}',               -- {synthetic, replay, autonomy_pct, security, ...}
  meta        JSONB DEFAULT '{}',               -- {report_file, digest, error}
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bot_runs_run_at ON bot_runs(run_at DESC);

CREATE TABLE IF NOT EXISTS bot_insights (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  source      TEXT NOT NULL,                    -- bootcamp | mine-live | funnel | csat | system | user | backlog-migration
  title       TEXT NOT NULL,
  evidence    TEXT,
  metrics     JSONB DEFAULT '{}',               -- {sample_size, score_delta, ...}
  proposal    TEXT,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('lesson','code','setting','info')),
  status      TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','implemented','rejected','monitoring')),
  decided_at  TIMESTAMPTZ,
  decided_via TEXT,                             -- portal | whatsapp | migration
  run_id      UUID REFERENCES bot_runs(id),
  tenant_id   UUID,                             -- NULL = platform-wide
  notes       TEXT
);
CREATE INDEX IF NOT EXISTS idx_bot_insights_status ON bot_insights(status);

-- Living lessons: what the bot has learned, editable without a deploy.
-- Approving a lesson-type insight in the portal inserts an active row here and
-- the live system prompt picks it up within the service cache TTL (~60s).
-- tenant_id NULL = applies to every tenant.
CREATE TABLE IF NOT EXISTS bot_lessons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID,                             -- NULL = global
  text              TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  source_insight_id UUID REFERENCES bot_insights(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  applied_at        TIMESTAMPTZ,
  deactivated_at    TIMESTAMPTZ,
  note              TEXT
);
CREATE INDEX IF NOT EXISTS idx_bot_lessons_active ON bot_lessons(active);

-- The exact lesson set each eval run measured — so a score drop can be diffed
-- against the last known-good set instead of guessed at.
CREATE TABLE IF NOT EXISTS bot_lesson_snapshots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID REFERENCES bot_runs(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  lessons    JSONB NOT NULL                           -- [{id, text, active}]
);

-- Customer satisfaction: the only signal in the loop that comes from customers
-- rather than the system grading itself. Asked once, on the transition to
-- 'done'; a rating ≤2 collects a reason and raises an insight.
-- orders.csat_rating SMALLINT, orders.csat_comment TEXT (see orders above)
-- sessions.pending_csat JSONB — {order_id, order_number, asked_at, rating?,
-- awaiting_comment?}; self-expiring after 24h, so no cleanup job is needed.

-- Daily Claude spend per tenant. Rolled up hourly (RENDER-gated job) so the
-- vendor pages stop scanning six months of raw api_usage per page load, and so
-- a budget alarm has something to watch. Idempotent upsert on (day, tenant_id).
CREATE TABLE IF NOT EXISTS api_usage_daily (
  day                DATE NOT NULL,
  tenant_id          UUID NOT NULL,
  calls              INTEGER NOT NULL DEFAULT 0,
  input_tokens       BIGINT NOT NULL DEFAULT 0,
  output_tokens      BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens  BIGINT NOT NULL DEFAULT 0,
  cache_write_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(10,4) NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (day, tenant_id)
);
