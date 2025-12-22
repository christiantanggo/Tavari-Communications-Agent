-- Check what columns exist in the contacts table
-- Run this first to see the current structure

-- Show all columns in contacts table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'contacts'
ORDER BY ordinal_position;

-- Count contacts
SELECT COUNT(*) as total_contacts FROM contacts;

-- Check if consent columns exist
SELECT 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'sms_consent'
  ) THEN 'EXISTS' ELSE 'MISSING' END as sms_consent_status,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'sms_consent_timestamp'
  ) THEN 'EXISTS' ELSE 'MISSING' END as sms_consent_timestamp_status;

