-- Clear old Stripe price/product IDs that were created in test mode
-- This allows the system to create new ones in live mode

-- Clear all Stripe IDs from pricing packages
-- The system will automatically create new ones when needed
UPDATE pricing_packages
SET 
  stripe_product_id = NULL,
  stripe_price_id = NULL,
  updated_at = NOW()
WHERE stripe_price_id IS NOT NULL;

-- Optional: If you want to clear customer/subscription IDs from businesses too
-- (Only do this if you're sure you want to start fresh)
-- UPDATE businesses
-- SET 
--   stripe_customer_id = NULL,
--   stripe_subscription_id = NULL,
--   stripe_subscription_status = NULL,
--   updated_at = NOW()
-- WHERE stripe_customer_id IS NOT NULL;

