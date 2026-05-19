-- ============================================================
-- PhonePe Digital Marketplace — Supabase Schema
-- Run in Supabase SQL Editor (in order)
-- ============================================================

-- Enable UUID extension (already enabled in Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  category        TEXT,
  thumbnail_url   TEXT,
  storage_path    TEXT,          -- Supabase Storage path e.g. 'ebooks/my-book.pdf'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active product lookups
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);


-- ============================================================
-- ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_order_id   TEXT NOT NULL UNIQUE,        -- PhonePe merchant order ID
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name       TEXT NOT NULL,
  customer_email      TEXT NOT NULL,
  customer_phone      TEXT NOT NULL,
  items               JSONB NOT NULL DEFAULT '[]',  -- Array of { productId, name, quantity, unitPricePaise, linePaise }
  amount_paise        INTEGER NOT NULL,             -- Total in paise (INR × 100)
  payment_state       TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (payment_state IN ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED')),
  transaction_id      TEXT,                         -- PhonePe transactionId
  payment_instrument  JSONB,                        -- PhonePe payment method details
  phonepe_response    JSONB,                        -- Full PhonePe status API response
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_merchant_order_id  ON orders (merchant_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email      ON orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_payment_state       ON orders (payment_state);
CREATE INDEX IF NOT EXISTS idx_orders_user_id             ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at          ON orders (created_at DESC);


-- ============================================================
-- PAYMENT LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_order_id   TEXT NOT NULL,
  event_type          TEXT NOT NULL,    -- e.g. PAYMENT_INITIATED, CALLBACK_RECEIVED, WEBHOOK_RECEIVED
  source              TEXT NOT NULL,    -- e.g. CREATE_API, PHONEPE_CALLBACK, PHONEPE_WEBHOOK
  payload             JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for log lookups per order
CREATE INDEX IF NOT EXISTS idx_payment_logs_merchant_order_id ON payment_logs (merchant_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at        ON payment_logs (created_at DESC);


-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- The backend uses the service role key which bypasses RLS.
-- These policies protect direct client access.
-- ============================================================

ALTER TABLE products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- Products: anyone can read active products
CREATE POLICY "Public can read active products"
  ON products FOR SELECT
  USING (is_active = true);

-- Orders: users can only read their own orders
CREATE POLICY "Users can read own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

-- Payment logs: no direct client access
-- (service role only)


-- ============================================================
-- SUPABASE STORAGE BUCKET (run in Supabase Dashboard or API)
-- ============================================================
-- Create a private bucket named 'products' for storing digital files.
-- Only the service role can generate signed URLs.
--
-- Via Supabase Dashboard:
--   Storage → New Bucket → Name: 'products' → Private (unchecked public)
--
-- Or via SQL:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('products', 'products', false)
-- ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SAMPLE DATA (optional — for testing)
-- ============================================================
INSERT INTO products (name, description, price, category, storage_path, is_active)
VALUES
  ('React Mastery eBook', 'Complete guide to React 18 with hooks and patterns.', 499.00, 'ebooks', 'ebooks/react-mastery.pdf', true),
  ('Node.js Production Starter', 'Production-ready Node.js template with auth.', 799.00, 'templates', 'templates/nodejs-starter.zip', true),
  ('UI Design System', 'Figma + CSS design system for SaaS products.', 1299.00, 'design', 'design/ui-design-system.zip', true)
ON CONFLICT DO NOTHING;
