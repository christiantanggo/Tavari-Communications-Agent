-- Ensures affiliate commission UI can configure Review Reply (reviews) alongside phone-agent and delivery-dispatch.
-- Safe on existing DBs: ON CONFLICT DO NOTHING.

INSERT INTO affiliate_module_settings (
  module_key,
  first_sale_commission_percent,
  recurring_commission_percent,
  recurring_commission_enabled,
  delivery_min_paid_sales_before_payout
)
VALUES ('reviews', NULL, NULL, true, NULL)
ON CONFLICT (module_key) DO NOTHING;
