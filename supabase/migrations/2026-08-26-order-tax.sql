-- Freeze the tax charged on each order, for the same reason delivery_fee is
-- frozen: a receipt reprinted after the rate changes must show the rate the
-- customer was actually charged. Districts vote on levies; rates move.
--
-- Apply via the Supabase Management API (see CLAUDE.md → Commands) BEFORE
-- deploying the code that writes these columns — orders.insert() passes the
-- object straight through, so a missing column fails order creation.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_rate   NUMERIC(5,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2);

COMMENT ON COLUMN orders.tax_rate   IS 'Tax rate applied, frozen at order time';
COMMENT ON COLUMN orders.tax_amount IS 'Tax charged (exclusive regions) or contained in the price (inclusive regions)';
