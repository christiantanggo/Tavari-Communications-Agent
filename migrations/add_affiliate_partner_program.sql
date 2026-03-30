-- First-party affiliate partners (created when an application is approved).
-- Requires affiliate_applications and admin_users.

CREATE TABLE IF NOT EXISTS affiliate_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE REFERENCES affiliate_applications(id) ON DELETE CASCADE,
  affiliate_code TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  commission_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_partners_active ON affiliate_partners (active);
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_email_lower ON affiliate_partners (lower(email));

COMMENT ON TABLE affiliate_partners IS 'Approved affiliates; share link uses affiliate_code.';

CREATE TABLE IF NOT EXISTS affiliate_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_portal_tokens_hash ON affiliate_portal_tokens (token_hash);

COMMENT ON TABLE affiliate_portal_tokens IS 'One-time magic link tokens; exchanged for a JWT session.';

CREATE TABLE IF NOT EXISTS affiliate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('click', 'lead', 'conversion')),
  amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_events_partner_created ON affiliate_events (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_type ON affiliate_events (partner_id, event_type);

COMMENT ON TABLE affiliate_events IS 'Attribution: clicks (tracked link), leads, conversions (revenue optional).';

ALTER TABLE affiliate_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_events ENABLE ROW LEVEL SECURITY;
