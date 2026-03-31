-- Partner commission_rate_percent: NULL = use per-module program rates (first vs recurring from affiliate_module_settings).
-- A non-null value overrides BOTH first-sale and recurring percentages with that single number (legacy custom deal).
ALTER TABLE affiliate_partners
  ALTER COLUMN commission_rate_percent DROP NOT NULL;

ALTER TABLE affiliate_partners
  ALTER COLUMN commission_rate_percent SET DEFAULT NULL;

COMMENT ON COLUMN affiliate_partners.commission_rate_percent IS
  'Optional single % override on gross for both first sale and renewals. NULL = use affiliate_module_settings + global defaults per module.';
