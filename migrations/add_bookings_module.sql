CREATE TABLE IF NOT EXISTS booking_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  allowed_durations_minutes JSONB NOT NULL DEFAULT '[30]'::jsonb,
  capacity_per_slot INTEGER NOT NULL DEFAULT 1,
  minimum_notice_minutes INTEGER NOT NULL DEFAULT 60,
  max_days_ahead INTEGER NOT NULL DEFAULT 30,
  duplicate_window_minutes INTEGER NOT NULL DEFAULT 180,
  require_confirmation_for_duplicates BOOLEAN NOT NULL DEFAULT TRUE,
  ask_for_email BOOLEAN NOT NULL DEFAULT TRUE,
  require_reason BOOLEAN NOT NULL DEFAULT FALSE,
  availability_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_confirmation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  customer_confirmation_channels JSONB NOT NULL DEFAULT '["sms"]'::jsonb,
  business_confirmation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  business_confirmation_channels JSONB NOT NULL DEFAULT '["email"]'::jsonb,
  customer_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  customer_reminder_offsets JSONB NOT NULL DEFAULT '[1440]'::jsonb,
  customer_reminder_channels JSONB NOT NULL DEFAULT '["sms"]'::jsonb,
  business_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  business_reminder_offsets JSONB NOT NULL DEFAULT '[60]'::jsonb,
  business_reminder_channels JSONB NOT NULL DEFAULT '["email"]'::jsonb,
  business_notification_email TEXT,
  business_notification_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  source TEXT NOT NULL DEFAULT 'dashboard',
  source_call_id TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  rescheduled_from_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bookings_status_check CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),
  CONSTRAINT bookings_time_check CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS booking_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'blocked',
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'dashboard',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_blocks_type_check CHECK (type IN ('lunch', 'meeting', 'closure', 'vacation', 'emergency', 'blocked')),
  CONSTRAINT booking_blocks_time_check CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS booking_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_notifications_status_check CHECK (status IN ('queued', 'sent', 'failed', 'cancelled')),
  CONSTRAINT booking_notifications_channel_check CHECK (channel IN ('email', 'sms'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_business_start_at
ON bookings (business_id, start_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_business_status
ON bookings (business_id, status)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_booking_blocks_business_start_at
ON booking_blocks (business_id, start_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_booking_notifications_due
ON booking_notifications (status, scheduled_for)
WHERE status = 'queued';
