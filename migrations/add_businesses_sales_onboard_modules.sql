-- Multiple products/services per customer (sales portal). Keeps sales_onboard_primary_module as first selected for legacy readers.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS sales_onboard_modules TEXT[];

COMMENT ON COLUMN businesses.sales_onboard_modules IS 'Module keys the customer uses or intends (sales portal); order preserved; primary is first.';

UPDATE businesses
SET sales_onboard_modules = ARRAY[sales_onboard_primary_module]::text[]
WHERE sales_onboard_primary_module IS NOT NULL
  AND sales_onboard_primary_module <> ''
  AND (sales_onboard_modules IS NULL OR cardinality(sales_onboard_modules) = 0);
