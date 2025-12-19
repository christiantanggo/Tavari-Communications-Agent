-- Create admin_activity_log table for tracking admin actions
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for admin_activity_log
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_admin_user_id ON admin_activity_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_business_id ON admin_activity_log(business_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created_at ON admin_activity_log(created_at);

