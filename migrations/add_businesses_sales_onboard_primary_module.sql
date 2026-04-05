-- Primary product / module interest captured when a sales rep onboards a customer.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS sales_onboard_primary_module TEXT;

COMMENT ON COLUMN businesses.sales_onboard_primary_module IS 'Module key for intended product at sales onboarding (e.g. phone-agent, delivery-dispatch).';
