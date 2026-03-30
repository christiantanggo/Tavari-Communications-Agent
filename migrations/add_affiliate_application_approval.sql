-- Adds approval workflow columns to `affiliate_applications`.
-- Run this if the table already exists without `status` (older deploys), or after `add_affiliate_applications.sql` without the approval columns.
-- Each ALTER is separate so a failing FK does not block adding `status`.

ALTER TABLE affiliate_applications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE affiliate_applications
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE affiliate_applications
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_applications_status_check'
  ) THEN
    ALTER TABLE affiliate_applications
      ADD CONSTRAINT affiliate_applications_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_status
  ON affiliate_applications (status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_applications'
      AND column_name = 'status'
  ) THEN
    COMMENT ON COLUMN affiliate_applications.status IS 'pending | approved | rejected';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_applications'
      AND column_name = 'reviewed_at'
  ) THEN
    COMMENT ON COLUMN affiliate_applications.reviewed_at IS 'When status last moved off pending (or set by staff).';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_applications'
      AND column_name = 'reviewed_by_admin_id'
  ) THEN
    COMMENT ON COLUMN affiliate_applications.reviewed_by_admin_id IS 'Admin who approved or rejected.';
  END IF;
END $$;
