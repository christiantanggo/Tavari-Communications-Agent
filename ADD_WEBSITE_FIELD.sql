-- Add website field to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS website VARCHAR(500);

