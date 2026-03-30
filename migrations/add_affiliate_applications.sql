-- Partner / affiliate applications from the public form (also emailed by the API).
CREATE TABLE IF NOT EXISTS affiliate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  website_or_channel TEXT,
  audience TEXT NOT NULL,
  promote_plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_created_at
  ON affiliate_applications (created_at DESC);

-- Only if `status` exists (skip when this file was re-run after an older table without `status`).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_applications'
      AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_affiliate_applications_status
      ON affiliate_applications (status);
  END IF;
END $$;

COMMENT ON TABLE affiliate_applications IS 'Public partner program applications; staff reads via service role / admin API.';

ALTER TABLE affiliate_applications ENABLE ROW LEVEL SECURITY;
