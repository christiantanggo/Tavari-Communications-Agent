-- =============================================================================
-- Sales reps (portal + admin management)
-- =============================================================================
-- Run once on Supabase (SQL editor or migration runner).
--
-- What this does:
-- 1. Allows affiliate_partners rows without an affiliate application (admin-created sales reps).
-- 2. Adds is_sales_rep: when true, the partner may sign in at /sales/login (magic link) and use
--    /api/sales/* (same partner code as affiliates for customer signup attribution).
-- 3. Creates sales_portal_audit for server-side audit rows (onboard, checkout, invite, etc.).
--
-- After this runs: use Admin → Sales reps to create reps and email sign-in links.
-- =============================================================================

ALTER TABLE affiliate_partners
  ALTER COLUMN application_id DROP NOT NULL;

ALTER TABLE affiliate_partners
  ADD COLUMN IF NOT EXISTS is_sales_rep BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN affiliate_partners.is_sales_rep IS 'When true, may use /sales magic-link login and sales portal APIs (separate JWT scope from affiliate portal).';

CREATE TABLE IF NOT EXISTS sales_portal_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_portal_audit_partner_id ON sales_portal_audit(partner_id);
CREATE INDEX IF NOT EXISTS idx_sales_portal_audit_created_at ON sales_portal_audit(created_at DESC);

ALTER TABLE sales_portal_audit ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE sales_portal_audit IS 'Audit log for sales portal actions; backend uses service role to insert.';
