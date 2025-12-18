-- Create pricing_packages table for managing packages/plans
CREATE TABLE IF NOT EXISTS pricing_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  monthly_price DECIMAL(10,2) NOT NULL,
  minutes_included INTEGER NOT NULL DEFAULT 0,
  overage_price_per_minute DECIMAL(10,4) DEFAULT 0,
  sms_included INTEGER DEFAULT 0,
  sms_overage_price DECIMAL(10,4) DEFAULT 0,
  emails_included INTEGER DEFAULT 0,
  emails_overage_price DECIMAL(10,4) DEFAULT 0,
  max_faqs INTEGER DEFAULT 5,
  stripe_product_id VARCHAR(255),
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT TRUE, -- Whether this package is available for new signups
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Add package_id to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES pricing_packages(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pricing_packages_is_active ON pricing_packages(is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_packages_is_public ON pricing_packages(is_public);
CREATE INDEX IF NOT EXISTS idx_businesses_package_id ON businesses(package_id);

-- Insert default packages (migrating from hardcoded tiers)
INSERT INTO pricing_packages (name, description, monthly_price, minutes_included, overage_price_per_minute, max_faqs, is_active, is_public)
VALUES
  ('Starter', '250 minutes/month - Perfect for small restaurants', 79.00, 250, 0.30, 5, true, true),
  ('Core', '500 minutes/month - Best seller for restaurants', 129.00, 500, 0.25, 10, true, true),
  ('Pro', '750 minutes/month - For busy restaurants', 179.00, 750, 0.20, 20, true, true)
ON CONFLICT DO NOTHING;

-- Migrate existing businesses to packages based on plan_tier
UPDATE businesses
SET package_id = (
  SELECT id FROM pricing_packages 
  WHERE LOWER(name) = LOWER(businesses.plan_tier) 
  LIMIT 1
)
WHERE package_id IS NULL AND plan_tier IS NOT NULL;

