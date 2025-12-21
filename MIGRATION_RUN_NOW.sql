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

