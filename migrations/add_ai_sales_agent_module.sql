-- AI Sales Agent (admin / Tavari operations)
-- Internal-first module for automated lead generation, qualification, outreach, follow-up, and reply handling.

CREATE TABLE IF NOT EXISTS ai_sales_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL DEFAULT 'tavari',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sender_email VARCHAR(255) NOT NULL DEFAULT 'noreply@tavarios.ca',
  fallback_persona_name VARCHAR(255) NOT NULL DEFAULT 'Tavari AI',
  reply_to_email VARCHAR(255),
  alert_email VARCHAR(255),
  refresh_after_days INTEGER NOT NULL DEFAULT 14,
  cooldown_days INTEGER NOT NULL DEFAULT 90,
  inbox_daily_cap INTEGER NOT NULL DEFAULT 20,
  domain_daily_cap INTEGER NOT NULL DEFAULT 50,
  auto_pause_on_degraded BOOLEAN NOT NULL DEFAULT FALSE,
  module_configs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_sales_settings_scope_unique UNIQUE (scope)
);

CREATE TABLE IF NOT EXISTS ai_sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL DEFAULT 'tavari',
  business_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255),
  dedupe_key VARCHAR(255) NOT NULL,
  city VARCHAR(120),
  province VARCHAR(120) DEFAULT 'Ontario',
  category VARCHAR(120),
  website TEXT,
  website_host VARCHAR(255),
  verified_email VARCHAR(255),
  normalized_email VARCHAR(255),
  phone VARCHAR(80),
  normalized_phone VARCHAR(80),
  source_provider VARCHAR(80),
  source_url TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  module_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  qualified_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_status VARCHAR(50) NOT NULL DEFAULT 'discovered',
  qualification_priority VARCHAR(20) NOT NULL DEFAULT 'low',
  last_outreach_module_key VARCHAR(100),
  last_outreach_at TIMESTAMPTZ,
  last_engagement_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  refresh_after_at TIMESTAMPTZ,
  outreach_locked BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_sales_leads_dedupe_unique UNIQUE (dedupe_key)
);

CREATE TABLE IF NOT EXISTS ai_sales_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL DEFAULT 'tavari',
  module_key VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  cta_url TEXT,
  sender_display_name VARCHAR(255),
  subject_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  followup_schedule JSONB NOT NULL DEFAULT '[
    {"step":"initial","delay_days":0},
    {"step":"day2","delay_days":1},
    {"step":"day4","delay_days":3},
    {"step":"day7","delay_days":6}
  ]'::jsonb,
  reply_faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_sales_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL DEFAULT 'tavari',
  lead_id UUID NOT NULL REFERENCES ai_sales_leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ai_sales_campaigns(id) ON DELETE SET NULL,
  module_key VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  external_thread_key VARCHAR(255),
  last_message_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_sales_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL DEFAULT 'tavari',
  thread_id UUID NOT NULL REFERENCES ai_sales_threads(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES ai_sales_leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ai_sales_campaigns(id) ON DELETE SET NULL,
  direction VARCHAR(20) NOT NULL,
  sender_email VARCHAR(255),
  recipient_email VARCHAR(255),
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  provider_message_id VARCHAR(255),
  in_reply_to VARCHAR(255),
  message_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  intent VARCHAR(50),
  auto_response_sent BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_sales_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL DEFAULT 'tavari',
  lead_id UUID NOT NULL REFERENCES ai_sales_leads(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES ai_sales_campaigns(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES ai_sales_threads(id) ON DELETE SET NULL,
  step_key VARCHAR(40) NOT NULL,
  variant_index INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  tracking_token UUID NOT NULL DEFAULT gen_random_uuid(),
  click_token UUID NOT NULL DEFAULT gen_random_uuid(),
  provider_message_id VARCHAR(255),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_sales_touchpoints_tracking_token_unique UNIQUE (tracking_token),
  CONSTRAINT ai_sales_touchpoints_click_token_unique UNIQUE (click_token)
);

CREATE TABLE IF NOT EXISTS ai_sales_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL DEFAULT 'tavari',
  run_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_sales_leads_status ON ai_sales_leads(overall_status);
CREATE INDEX IF NOT EXISTS idx_ai_sales_leads_email ON ai_sales_leads(normalized_email);
CREATE INDEX IF NOT EXISTS idx_ai_sales_leads_phone ON ai_sales_leads(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_ai_sales_leads_website_host ON ai_sales_leads(website_host);
CREATE INDEX IF NOT EXISTS idx_ai_sales_leads_cooldown ON ai_sales_leads(cooldown_until);
CREATE INDEX IF NOT EXISTS idx_ai_sales_campaigns_module ON ai_sales_campaigns(module_key, status);
CREATE INDEX IF NOT EXISTS idx_ai_sales_threads_lead ON ai_sales_threads(lead_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_sales_messages_thread ON ai_sales_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_sales_touchpoints_campaign ON ai_sales_touchpoints(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_sales_touchpoints_status ON ai_sales_touchpoints(status, sent_at);
CREATE INDEX IF NOT EXISTS idx_ai_sales_runs_type ON ai_sales_runs(run_type, started_at DESC);

INSERT INTO modules (key, name, description, category, is_active, health_status, version, metadata, created_at, updated_at)
VALUES (
  'ai-sales-agent',
  'AI Sales Agent',
  'Automated outbound sales engine for lead generation, outreach, follow-up, and reply handling.',
  'operations',
  TRUE,
  'healthy',
  '1.0.0',
  jsonb_build_object(
    'admin_only', true,
    'pricing', jsonb_build_object(
      'monthly_price_cents', 0,
      'currency', 'cad'
    )
  ),
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  health_status = EXCLUDED.health_status,
  version = EXCLUDED.version,
  metadata = COALESCE(modules.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = NOW();
