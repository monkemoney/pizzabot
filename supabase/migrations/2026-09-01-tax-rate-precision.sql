-- tax_rate must hold three decimals, because US rates have three.
--
-- CDTFA publishes every California rate to three digits after the decimal
-- ("all have 3 digits after the decimal") — Los Altos Hills is 9.125%,
-- Atherton 9.375%. NUMERIC(5,2) rounds them silently: 9.125 is stored as 9.13,
-- and the receipt then states a rate the jurisdiction never set.
--
-- Nothing caught this because the only rates in the table so far are Israeli
-- (18) and the US default (9.5), both of which happen to fit in two decimals.
-- The moment a rate is resolved per address instead of typed by hand, the
-- third digit arrives and every stored rate is wrong by up to 0.005pp.
--
-- Widening is lossless: an existing 9.50 reads back as 9.500. Precision 6
-- rather than 5 so the clamp ceiling in locale.js (Math.min(100, rate)) still
-- fits as 100.000.
--
-- tip_pct stays at (5,2) deliberately: a tip ladder is whole or half percents
-- a human picked, not a jurisdiction's published rate.
--
-- Safe to apply while serving: widening a numeric type is a metadata-only
-- change here, and no view blocks it — public.customers aggregates orders but
-- never selects tax_rate.

ALTER TABLE orders ALTER COLUMN tax_rate TYPE NUMERIC(6,3);

COMMENT ON COLUMN orders.tax_rate IS
  'Tax rate applied, frozen at order time. NUMERIC(6,3) — US jurisdictions publish three decimals (CDTFA).';
