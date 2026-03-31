-- One-time: before global commission % is ignored by the app, copy them into module rows where still NULL.
UPDATE affiliate_module_settings AS m
SET
  first_sale_commission_percent = COALESCE(m.first_sale_commission_percent, g.first_sale_commission_percent),
  recurring_commission_percent = COALESCE(m.recurring_commission_percent, g.recurring_commission_percent),
  updated_at = now()
FROM affiliate_global_settings AS g
WHERE g.id = 1
  AND (m.first_sale_commission_percent IS NULL OR m.recurring_commission_percent IS NULL);
