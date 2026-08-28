-- Tips (C8).
--
-- A tip is money the customer is CHARGED, so it is frozen on the order beside
-- delivery_fee, tax_rate and tax_amount, and for the same reason: a receipt
-- reprinted later must show what this customer actually paid, not what the
-- current settings would produce.
--
-- tip_pct records HOW it was chosen (a ladder button) rather than only the
-- result, because "18%" and "$10.44" are different facts about the same order
-- and only the first survives a change to the basket. NULL means the customer
-- named an amount, or there was no tip at all.
--
-- Apply via the Supabase Management API (see CLAUDE.md → Commands) BEFORE
-- deploying — saveOrder passes the object straight to insert(), so a missing
-- column fails order creation outright.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_pct    NUMERIC(5,2);

COMMENT ON COLUMN orders.tip_amount IS 'Tip charged, frozen at order time. Never taxed.';
COMMENT ON COLUMN orders.tip_pct    IS 'The percentage the customer picked, if they picked one; NULL for a named amount.';
