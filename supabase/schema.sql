-- ============================================================
-- Pizza Bot — Full Schema
-- Run this against your Supabase project (SQL editor)
-- ============================================================

-- ── Products ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_he      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  price        NUMERIC(8,2) NOT NULL,
  category     TEXT NOT NULL DEFAULT 'main',  -- 'main' | 'topping'
  is_available BOOLEAN DEFAULT true,
  sort_order   INTEGER DEFAULT 0,
  image_url    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO products (name_he, name_en, price, category, sort_order) VALUES
  ('פיצה משפחתית', 'Family Pizza',    58,   'main',    1),
  ('פיצה זוגית',   'Couple Pizza',    50,   'main',    2),
  ('פסטה אלפרדו',  'Pasta Alfredo',   42.9, 'main',    3),
  ('פוקצ''ה',      'Focaccia',        19.9, 'main',    4),
  ('פסטה בולונז',  'Pasta Bolognese', 39.9, 'main',    5),
  ('סלט יווני',    'Greek Salad',     32.9, 'main',    6),
  ('בולגרית',      'Bulgarian Cheese',16,   'topping', 1),
  ('גבינה נוספת',  'Extra Cheese',     7,   'topping', 2),
  ('בצל',          'Onion',            3,   'topping', 3),
  ('זיתים',        'Olives',          15,   'topping', 4)
ON CONFLICT DO NOTHING;

-- ── Settings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('delivery_cities',       '["תל אביב"]'),
  ('delivery_price',        '30'),
  ('min_order_delivery',    '0'),
  ('delivery_enabled',      'true'),
  ('pickup_enabled',        'true'),
  ('payment_cash',          'true'),
  ('payment_credit',        'true'),
  ('is_open',               'true'),
  ('business_hours', '{
    "sun":  {"open": "10:00", "close": "23:00"},
    "mon":  {"open": "10:00", "close": "23:00"},
    "tue":  {"open": "10:00", "close": "23:00"},
    "wed":  {"open": "10:00", "close": "23:00"},
    "thu":  {"open": "10:00", "close": "23:00"},
    "fri":  {"open": "10:00", "close": "22:00"},
    "sat":  {"open": "20:00", "close": "23:30"}
  }')
ON CONFLICT DO NOTHING;

-- ── Users (dashboard login) ───────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Pending payments ──────────────────────────────────────
-- Stores order data while customer is on Cardcom payment page
CREATE TABLE IF NOT EXISTS pending_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          TEXT NOT NULL,
  cardcom_code   TEXT UNIQUE,
  return_value   TEXT UNIQUE,           -- our reference passed to Cardcom
  order_data     JSONB NOT NULL,        -- full order payload
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_cardcom ON pending_payments (cardcom_code);
CREATE INDEX IF NOT EXISTS idx_pending_return  ON pending_payments (return_value);

-- ── Sessions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  phone                TEXT PRIMARY KEY,
  state                TEXT NOT NULL DEFAULT 'IDLE',
  language             TEXT DEFAULT 'he',
  cart                 JSONB DEFAULT '[]'::jsonb,
  current_item         JSONB DEFAULT '{}'::jsonb,
  data                 JSONB DEFAULT '{}'::jsonb,
  conversation_history JSONB DEFAULT '[]'::jsonb,
  pending_order        JSONB DEFAULT '{}'::jsonb,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pending_order        JSONB DEFAULT '{}'::jsonb;

-- ── Orders ────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1000 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    INTEGER UNIQUE DEFAULT nextval('order_number_seq'),
  phone           TEXT NOT NULL,
  customer_name   TEXT,
  customer_phone  TEXT,
  items           JSONB NOT NULL,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('pickup', 'delivery')),
  address         TEXT,
  notes           TEXT,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'credit')),
  payment_status  TEXT DEFAULT 'paid' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  cardcom_code    TEXT,
  total_price     NUMERIC(10,2),
  status          TEXT DEFAULT 'new'
                  CHECK (status IN ('new','preparing','out_for_delivery','delivered','done','cancelled')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number   INTEGER DEFAULT nextval('order_number_seq');
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cardcom_code   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

-- Make status match new values (update any old enum-style check)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD  CONSTRAINT orders_status_check
  CHECK (status IN ('new','preparing','out_for_delivery','delivered','done','cancelled'));

CREATE INDEX IF NOT EXISTS idx_orders_phone      ON orders (phone);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_number     ON orders (order_number);

-- ── Auto-complete 'delivered' → 'done' after 1 hour ───────
-- This is handled in application code via a scheduled check, not a DB trigger.

-- ── Customers view ────────────────────────────────────────
CREATE OR REPLACE VIEW customers AS
SELECT
  phone,
  MAX(customer_name)         AS name,
  MAX(customer_phone)        AS customer_phone,
  COUNT(*)                   AS order_count,
  SUM(total_price)           AS total_spent,
  MAX(address)               AS last_address,
  MAX(created_at)            AS last_order_at
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY phone;
