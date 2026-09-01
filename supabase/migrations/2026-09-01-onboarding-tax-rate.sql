-- The tax rate is chosen when the region is, by the person who can look it up.
--
-- `region` already rides on the onboarding session because the wizard runs
-- before the tenant exists. The rate has to travel the same way, and for a
-- sharper reason: approve() currently seeds settings.tax_rate from the region
-- default — 9.5 for US — which writes a guess into the settings table where it
-- reads as a decision somebody made. No source supports 9.5 for Los Angeles;
-- published figures disagree (9.75, 10.25) and seventeen district rates apply
-- within the city alone. Charging a rate nobody verified is the one failure in
-- this area that costs the customer money rather than clarity.
--
-- It belongs to the VENDOR's link-creation step, not the client wizard: a
-- restaurant owner does not know their combined district rate, and the vendor
-- is already at CDTFA's address lookup deciding which country this client is
-- in. That is the same moment, and the code already says so at the region
-- selector: "the only moment the vendor is actually thinking about which
-- country the client is in."
--
-- NULL means "not stated". For an IL session that is correct and always will
-- be — the Israeli rate is national and the region default is the authority.
-- For a US session approve() refuses rather than inventing one.
--
-- NUMERIC(6,3) matches orders.tax_rate: US jurisdictions publish three
-- decimals, and a rate that cannot survive the trip into the order it is
-- frozen onto is not worth storing.

ALTER TABLE onboarding_sessions ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6,3);

COMMENT ON COLUMN onboarding_sessions.tax_rate IS
  'Explicit tax rate for this tenant, set by the vendor with the region. NULL = not stated; approve() refuses a US session without one.';
