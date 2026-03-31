-- After removing global commission % from the app: (1) copy legacy global % into module rows where still NULL,
-- (2) recompute affiliate_earnings.commission_cents from gross × current module % (same rules as the Node engine).
--
-- Run in Supabase SQL editor or your migration runner after affiliate_copy_global_commission_to_modules.sql (this repeats step 1 safely).

-- 1) Fill module % from affiliate_global_settings where columns are still NULL
UPDATE affiliate_module_settings AS m
SET
  first_sale_commission_percent = COALESCE(m.first_sale_commission_percent, g.first_sale_commission_percent),
  recurring_commission_percent = COALESCE(m.recurring_commission_percent, g.recurring_commission_percent),
  updated_at = now()
FROM affiliate_global_settings AS g
WHERE g.id = 1
  AND (m.first_sale_commission_percent IS NULL OR m.recurring_commission_percent IS NULL);

-- 2) Recalculate commission on ledger rows (excludes reversed)
--    recurring → recurring_commission_percent; first_sale, manual, delivery_payment → first_sale_commission_percent
UPDATE affiliate_earnings AS ae
SET commission_cents = GREATEST(
  0,
  ROUND(
    COALESCE(ae.gross_amount_cents, 0)::numeric
    * (
      CASE
        WHEN ae.earning_type = 'recurring' THEN COALESCE(ams.recurring_commission_percent, 0)
        ELSE COALESCE(ams.first_sale_commission_percent, 0)
      END
    ) / 100.0
  )
)::integer
FROM affiliate_module_settings AS ams
WHERE ams.module_key = ae.module_key
  AND ae.status IN ('accruing', 'eligible', 'paid');
