-- URGENT: Run this in Supabase SQL Editor NOW to fix the missing columns error
-- Go to: Supabase Dashboard → SQL Editor → New Query → Paste this → Run

-- Add missing columns to sms_campaign_recipients table
ALTER TABLE sms_campaign_recipients
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Add opted_out columns to contacts table (for SMS opt-out functionality)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMP;

-- Create index for opted_out status (for faster queries)
CREATE INDEX IF NOT EXISTS idx_contacts_opted_out ON contacts(business_id, opted_out) WHERE opted_out = TRUE;

-- Add scheduled_send_at and error_message columns to sms_campaign_recipients
-- These columns are used for queuing messages blocked by quiet hours
ALTER TABLE sms_campaign_recipients
ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add indexes for efficient querying of queued recipients
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_scheduled_send_at 
ON sms_campaign_recipients(scheduled_send_at) 
WHERE scheduled_send_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_status_scheduled 
ON sms_campaign_recipients(status, scheduled_send_at) 
WHERE status = 'queued';

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sms_campaign_recipients' 
ORDER BY ordinal_position;

-- Verify opted_out columns were added to contacts
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'contacts' 
  AND column_name IN ('opted_out', 'opted_out_at')
ORDER BY column_name;

-- Verify scheduled_send_at column was added to sms_campaign_recipients
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sms_campaign_recipients' 
  AND column_name IN ('scheduled_send_at', 'error_message')
ORDER BY column_name;

