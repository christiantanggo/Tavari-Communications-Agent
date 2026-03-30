-- Global + per-module affiliate commission rules, earnings ledger, refund holds, delivery volume gate.

CREATE TABLE IF NOT EXISTS affiliate_global_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  first_sale_commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
  recurring_commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  payout_minimum_cents INTEGER NOT NULL DEFAULT 5000,
  refund_hold_days INTEGER NOT NULL DEFAULT 14,
  delivery_min_paid_sales_before_payout INTEGER NOT NULL DEFAULT 5,
  recurring_limit_mode TEXT NOT NULL DEFAULT 'unlimited'
    CHECK (recurring_limit_mode IN ('unlimited', 'months', 'transactions')),
  recurring_limit_months INTEGER,
  recurring_limit_transactions INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO affiliate_global_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE affiliate_global_settings IS 'Singleton (id=1). Defaults for all modules unless overridden in affiliate_module_settings.';

CREATE TABLE IF NOT EXISTS affiliate_module_settings (
  module_key TEXT PRIMARY KEY,
  first_sale_commission_percent NUMERIC(5, 2),
  recurring_commission_percent NUMERIC(5, 2),
  recurring_commission_enabled BOOLEAN NOT NULL DEFAULT true,
  payout_minimum_cents INTEGER,
  refund_hold_days INTEGER,
  delivery_min_paid_sales_before_payout INTEGER,
  recurring_limit_mode TEXT
    CHECK (recurring_limit_mode IS NULL OR recurring_limit_mode IN ('unlimited', 'months', 'transactions')),
  recurring_limit_months INTEGER,
  recurring_limit_transactions INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO affiliate_module_settings (module_key, first_sale_commission_percent, recurring_commission_percent, recurring_commission_enabled, delivery_min_paid_sales_before_payout)
VALUES
  ('phone-agent', NULL, NULL, true, NULL),
  ('delivery-dispatch', NULL, NULL, true, NULL)
ON CONFLICT (module_key) DO NOTHING;

COMMENT ON COLUMN affiliate_module_settings.first_sale_commission_percent IS 'NULL = use global default.';
COMMENT ON COLUMN affiliate_module_settings.delivery_min_paid_sales_before_payout IS 'For delivery-dispatch: partner must have this many attributed paid delivery checkouts before delivery commissions become eligible.';

ALTER TABLE affiliate_partners
  ADD COLUMN IF NOT EXISTS delivery_attributed_paid_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN affiliate_partners.delivery_attributed_paid_count IS 'Incremented when a paid delivery checkout is attributed to this partner (anti-fraud volume gate).';

CREATE TABLE IF NOT EXISTS affiliate_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL DEFAULT 'phone-agent',
  earning_type TEXT NOT NULL CHECK (earning_type IN ('first_sale', 'recurring', 'delivery_payment', 'manual')),
  gross_amount_cents INTEGER,
  commission_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CAD',
  status TEXT NOT NULL DEFAULT 'accruing' CHECK (status IN ('accruing', 'eligible', 'paid', 'reversed')),
  payment_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refund_hold_until TIMESTAMPTZ NOT NULL,
  volume_gate_required BOOLEAN NOT NULL DEFAULT false,
  volume_met_at TIMESTAMPTZ,
  eligible_at TIMESTAMPTZ,
  stripe_checkout_session_id TEXT,
  stripe_invoice_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  business_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_earnings_unique_checkout
  ON affiliate_earnings (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_earnings_unique_invoice
  ON affiliate_earnings (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_partner_status
  ON affiliate_earnings (partner_id, status, created_at DESC);

ALTER TABLE affiliate_earnings ENABLE ROW LEVEL SECURITY;
