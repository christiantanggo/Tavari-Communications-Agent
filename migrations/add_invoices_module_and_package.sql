-- Tie each stored invoice to a product line and pricing package when known (multi-module billing history).

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS module_key TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES pricing_packages(id) ON DELETE SET NULL;

COMMENT ON COLUMN invoices.module_key IS 'Product line for this charge (e.g. phone-agent, reviews, delivery-dispatch).';
COMMENT ON COLUMN invoices.package_id IS 'pricing_packages.id for the plan billed, when known.';

CREATE INDEX IF NOT EXISTS idx_invoices_module_key ON invoices (module_key);
CREATE INDEX IF NOT EXISTS idx_invoices_package_id ON invoices (package_id);
