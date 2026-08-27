-- Per-address tax rate (C9) and per-category taxability (C10).
--
-- Both exist because a single tenant-wide rate is not enough in the US, for two
-- unrelated reasons:
--
--   * Sales tax is set per jurisdiction. A restaurant in Los Angeles (9.5%)
--     delivering into Santa Monica (10.25%) owes the destination's rate. The
--     delivery_zones table already resolves an address to a row, so the rate
--     rides along on it as a sixth field — no new lookup, no second authority.
--     Stored inside the existing JSONB, so there is nothing to migrate: a zone
--     without the key keeps the tenant's rate, which is every zone today.
--
--   * California's 80/80 rule taxes hot prepared food but often exempts cold
--     food sold to go. That is a property of the ITEM, so it belongs on the
--     category. Defaulting to TRUE means every existing row is taxed exactly as
--     it is now, and only an explicit false exempts anything.
--
-- Apply via the Supabase Management API (see CLAUDE.md → Commands) BEFORE
-- deploying — the categories PATCH passes the column straight through.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS taxable BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN categories.taxable IS
  'FALSE exempts this category from sales tax (CA 80/80 rule). Default TRUE = taxed as before.';

-- delivery_zones is JSONB on settings; the optional per-zone key is documented
-- here rather than migrated:
--   {city, area, fee, min_order, eta_minutes, tax_rate?}
-- tax_rate absent  → the tenant's own rate applies (settings.tax_rate)
-- tax_rate present → overrides the RATE only, never the inclusive/exclusive model
