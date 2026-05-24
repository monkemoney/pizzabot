-- ============================================================
-- Pizza Bot — Full Schema  (safe to re-run: IF NOT EXISTS + IF COLUMN NOT EXISTS)
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/umoftdmutxhrbknowbyh/sql
-- ============================================================

-- ── Categories ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_he         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  emoji           TEXT DEFAULT '🍽️',
  sort_order      INTEGER DEFAULT 0,
  has_toppings    BOOLEAN DEFAULT false,
  is_topping_addon BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_topping_addon BOOLEAN DEFAULT false;

INSERT INTO categories (id, name_he, name_en, emoji, sort_order, has_toppings, is_topping_addon) VALUES
  ('11111111-cafe-cafe-cafe-000000000001', 'פיצות',         'Pizzas',         '🍕', 1,  true,  false),
  ('11111111-cafe-cafe-cafe-000000000002', 'פסטות',         'Pastas',         '🍝', 2,  false, false),
  ('11111111-cafe-cafe-cafe-000000000003', 'מנות נוספות',   'More Items',     '🥗', 3,  false, false),
  ('11111111-cafe-cafe-cafe-000000000004', 'משהו לשתות',    'Drinks',         '🥤', 4,  false, false),
  ('22222222-cafe-cafe-cafe-000000000001', 'תוספות לפיצה', 'Pizza Toppings', '🧀', 99, false, true)
ON CONFLICT (id) DO NOTHING;

-- ── Products ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_he      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  price        NUMERIC(8,2) NOT NULL,
  category     TEXT DEFAULT 'main',
  category_id  UUID REFERENCES categories(id),
  is_available BOOLEAN DEFAULT true,
  sort_order   INTEGER DEFAULT 0,
  image_url    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;

-- ── Product additions (תוספות per product) ────────────────
CREATE TABLE IF NOT EXISTS product_additions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name_he      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  price        NUMERIC(8,2) NOT NULL,
  is_available BOOLEAN DEFAULT true,
  image_url    TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_additions_product ON product_additions(product_id);

-- ── Push notification subscriptions ───────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seed products (skip if already exist) ─────────────────
INSERT INTO products (id, name_he, name_en, price, category, sort_order) VALUES
  ('11111111-0001-0001-0001-000000000001', 'פיצה משפחתית',    'Family Pizza',            58,   'main',   1),
  ('11111111-0001-0001-0001-000000000002', 'פיצה זוגית',      'Couple Pizza',            50,   'main',   2),
  ('11111111-0001-0001-0001-000000000003', 'פסטה אלפרדו',     'Pasta Alfredo',           42.9, 'main',   3),
  ('11111111-0001-0001-0001-000000000004', 'פוקצ''ה',         'Focaccia',                19.9, 'main',   4),
  ('11111111-0001-0001-0001-000000000005', 'פסטה בולונז',     'Pasta Bolognese',         39.9, 'main',   5),
  ('11111111-0001-0001-0001-000000000006', 'סלט יווני',       'Greek Salad',             32.9, 'main',   6),
  ('11111111-0001-0001-0001-000000000007', 'סלט טבולה',       'Tabbouleh Salad',         50,   'main',   7),
  ('11111111-0001-0001-0001-000000000008', 'פיצה נפוליטנה',   'Neapolitan Pizza',        70,   'main',   10),
  ('11111111-0001-0001-0001-000000000009', 'פיצה ארבע גבינות','Four Cheese Pizza',       68,   'main',   11),
  ('11111111-0001-0001-0001-000000000010', 'פיצה איטליה',     'Italia Pizza',            89,   'main',   12),
  ('11111111-0001-0001-0001-000000000011', 'קולה',            'Cola',                    17,   'drinks', 1),
  ('11111111-0001-0001-0001-000000000012', 'זירו',            'Zero',                    17,   'drinks', 2),
  ('11111111-0001-0001-0001-000000000013', 'ספרייט',          'Sprite',                  17,   'drinks', 3),
  ('11111111-0001-0001-0001-000000000014', 'ענבים',           'Grape',                   17,   'drinks', 4),
  ('11111111-0001-0001-0001-000000000015', 'מים בטעם אפרסק',  'Peach Flavored Water',    17,   'drinks', 5),
  ('11111111-0001-0001-0001-000000000016', 'שוואפס אבטיח',    'Schweppes Watermelon',    17,   'drinks', 6)
ON CONFLICT (id) DO NOTHING;

-- ── Seed additions for the two pizza types ────────────────
INSERT INTO product_additions (product_id, name_he, name_en, price, sort_order) VALUES
  ('11111111-0001-0001-0001-000000000001', 'בולגרית',     'Bulgarian Cheese', 16, 1),
  ('11111111-0001-0001-0001-000000000001', 'גבינה נוספת', 'Extra Cheese',      7, 2),
  ('11111111-0001-0001-0001-000000000001', 'בצל',         'Onion',             3, 3),
  ('11111111-0001-0001-0001-000000000001', 'זיתים',       'Olives',           15, 4),
  ('11111111-0001-0001-0001-000000000002', 'בולגרית',     'Bulgarian Cheese', 16, 1),
  ('11111111-0001-0001-0001-000000000002', 'גבינה נוספת', 'Extra Cheese',      7, 2),
  ('11111111-0001-0001-0001-000000000002', 'בצל',         'Onion',             3, 3),
  ('11111111-0001-0001-0001-000000000002', 'זיתים',       'Olives',           15, 4)
ON CONFLICT DO NOTHING;

-- ── Settings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('delivery_cities',    '["תל אביב"]'),
  ('delivery_price',     '30'),
  ('min_order_delivery', '0'),
  ('delivery_enabled',   'true'),
  ('pickup_enabled',     'true'),
  ('payment_cash',       'true'),
  ('payment_credit',     'true'),
  ('is_open',            'true'),
  ('business_hours', '{
    "sun": {"open":"10:00","close":"23:00"},
    "mon": {"open":"10:00","close":"23:00"},
    "tue": {"open":"10:00","close":"23:00"},
    "wed": {"open":"10:00","close":"23:00"},
    "thu": {"open":"10:00","close":"23:00"},
    "fri": {"open":"10:00","close":"22:00"},
    "sat": {"open":"20:00","close":"23:30"}
  }')
ON CONFLICT DO NOTHING;

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
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS customer_profile     JSONB DEFAULT '{}'::jsonb;

-- ── Pending payments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT NOT NULL,
  cardcom_code TEXT UNIQUE,
  return_value TEXT UNIQUE,
  order_data   JSONB NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_cardcom ON pending_payments(cardcom_code);
CREATE INDEX IF NOT EXISTS idx_pending_return  ON pending_payments(return_value);

-- ── Orders ────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1000 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    INTEGER UNIQUE DEFAULT nextval('order_number_seq'),
  phone           TEXT NOT NULL,
  customer_name   TEXT,
  customer_phone  TEXT,
  items           JSONB NOT NULL,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('pickup','delivery')),
  address         TEXT,
  notes           TEXT,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash','credit')),
  payment_status  TEXT DEFAULT 'paid',
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

CREATE INDEX IF NOT EXISTS idx_orders_phone      ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_number     ON orders(order_number);

-- ── Customers view ────────────────────────────────────────
CREATE OR REPLACE VIEW customers AS
SELECT
  phone,
  MAX(customer_name)  AS name,
  MAX(customer_phone) AS customer_phone,
  COUNT(*)            AS order_count,
  SUM(total_price)    AS total_spent,
  MAX(address)        AS last_address,
  MAX(created_at)     AS last_order_at
FROM orders
WHERE status NOT IN ('cancelled')
GROUP BY phone;

-- ── Refund / dispute columns ──────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cardcom_deal_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status       TEXT;  -- null | pending | refunded | manual
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by        TEXT;  -- 'customer' | 'business'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason       TEXT;

-- ── Item dispute columns ───────────────────────────────────────────────────────
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pending_dispute   JSONB;  -- {order_id,order_number,item_name,item_price,created_at}
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS dispute_status    TEXT;   -- null | 'pending' | 'resolved'
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS dispute_item      TEXT;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS dispute_resolution TEXT;  -- 'cancelled' | 'removed_item' | 'continued'

-- ── Admin users (WhatsApp bot managers) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL UNIQUE,   -- international format, e.g. 972501234567
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'manager'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
