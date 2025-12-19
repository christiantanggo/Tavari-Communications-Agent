-- Add Helcim payment fields to businesses table
-- Run this migration to add support for Helcim payment processing

ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS helcim_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS helcim_subscription_id VARCHAR(255);

-- Add indexes for Helcim lookups
CREATE INDEX IF NOT EXISTS idx_businesses_helcim_customer_id ON businesses(helcim_customer_id) WHERE helcim_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_helcim_subscription_id ON businesses(helcim_subscription_id) WHERE helcim_subscription_id IS NOT NULL;

-- Note: You can keep stripe_customer_id and stripe_subscription_id for migration purposes
-- or remove them if you're fully migrating to Helcim:
-- ALTER TABLE businesses DROP COLUMN IF EXISTS stripe_customer_id;
-- ALTER TABLE businesses DROP COLUMN IF EXISTS stripe_subscription_id;
