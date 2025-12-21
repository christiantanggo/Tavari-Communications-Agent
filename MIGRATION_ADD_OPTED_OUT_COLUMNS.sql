-- Add opted_out columns to contacts table if they don't exist
-- Run this in Supabase SQL Editor

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMP;

-- Create index for opted_out status (for faster queries)
CREATE INDEX IF NOT EXISTS idx_contacts_opted_out ON contacts(business_id, opted_out) WHERE opted_out = TRUE;

-- Verify the columns were added
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_name = 'contacts' 
  AND column_name IN ('opted_out', 'opted_out_at')
ORDER BY column_name;

