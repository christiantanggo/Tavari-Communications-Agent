-- Recurring affiliate commission: unlimited, capped by calendar months from subscription start, or capped by renewal count.

ALTER TABLE affiliate_global_settings
  ADD COLUMN IF NOT EXISTS recurring_limit_mode TEXT NOT NULL DEFAULT 'unlimited'
    CHECK (recurring_limit_mode IN ('unlimited', 'months', 'transactions')),
  ADD COLUMN IF NOT EXISTS recurring_limit_months INTEGER,
  ADD COLUMN IF NOT EXISTS recurring_limit_transactions INTEGER;

COMMENT ON COLUMN affiliate_global_settings.recurring_limit_mode IS 'unlimited | months | transactions';
COMMENT ON COLUMN affiliate_global_settings.recurring_limit_months IS 'When mode=months: calendar months from subscription start_date during which renewal commissions accrue.';
COMMENT ON COLUMN affiliate_global_settings.recurring_limit_transactions IS 'When mode=transactions: max renewal commission rows per subscription (excluding first_sale).';

ALTER TABLE affiliate_module_settings
  ADD COLUMN IF NOT EXISTS recurring_limit_mode TEXT
    CHECK (recurring_limit_mode IS NULL OR recurring_limit_mode IN ('unlimited', 'months', 'transactions')),
  ADD COLUMN IF NOT EXISTS recurring_limit_months INTEGER,
  ADD COLUMN IF NOT EXISTS recurring_limit_transactions INTEGER;

COMMENT ON COLUMN affiliate_module_settings.recurring_limit_mode IS 'NULL = inherit global.';
