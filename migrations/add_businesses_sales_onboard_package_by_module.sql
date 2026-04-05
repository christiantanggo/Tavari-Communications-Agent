-- Sales portal: which pricing_packages.id the rep chose per module (when multiple plans exist).

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS sales_onboard_package_by_module JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN businesses.sales_onboard_package_by_module IS 'Map module_key -> pricing_packages UUID string; plans chosen in sales portal per product line.';
