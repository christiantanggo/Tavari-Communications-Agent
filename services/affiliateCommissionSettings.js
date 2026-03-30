import { supabaseClient } from "../config/database.js";

export const AFFILIATE_MODULE_PHONE = "phone-agent";
export const AFFILIATE_MODULE_DELIVERY = "delivery-dispatch";

const GLOBAL_FALLBACK = {
  first_sale_commission_percent: 15,
  recurring_commission_percent: 10,
  payout_minimum_cents: 5000,
  refund_hold_days: 14,
  delivery_min_paid_sales_before_payout: 5,
  recurring_limit_mode: "unlimited",
  recurring_limit_months: null,
  recurring_limit_transactions: null,
};

export async function getAffiliateGlobalSettings() {
  const { data, error } = await supabaseClient.from("affiliate_global_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) {
    return { ...GLOBAL_FALLBACK, id: 1 };
  }
  return {
    ...GLOBAL_FALLBACK,
    ...data,
    recurring_limit_mode:
      data.recurring_limit_mode !== undefined && data.recurring_limit_mode !== null
        ? data.recurring_limit_mode
        : GLOBAL_FALLBACK.recurring_limit_mode,
    recurring_limit_months:
      data.recurring_limit_months !== undefined ? data.recurring_limit_months : GLOBAL_FALLBACK.recurring_limit_months,
    recurring_limit_transactions:
      data.recurring_limit_transactions !== undefined
        ? data.recurring_limit_transactions
        : GLOBAL_FALLBACK.recurring_limit_transactions,
  };
}

export async function getAffiliateModuleSettings(moduleKey) {
  const key = String(moduleKey || "").trim() || AFFILIATE_MODULE_PHONE;
  const { data, error } = await supabaseClient.from("affiliate_module_settings").select("*").eq("module_key", key).maybeSingle();
  if (error || !data) {
    return { module_key: key, recurring_commission_enabled: true };
  }
  return data;
}

/**
 * Effective percentages and rules for a module + optional partner override (% on gross).
 */
export async function resolveCommissionRules(moduleKey, { partnerCommissionOverride = null } = {}) {
  const global = await getAffiliateGlobalSettings();
  const mod = await getAffiliateModuleSettings(moduleKey);

  const firstBase =
    mod.first_sale_commission_percent != null
      ? Number(mod.first_sale_commission_percent)
      : Number(global.first_sale_commission_percent);
  const recBase =
    mod.recurring_commission_percent != null
      ? Number(mod.recurring_commission_percent)
      : Number(global.recurring_commission_percent);

  const partnerOverride =
    partnerCommissionOverride != null && !Number.isNaN(Number(partnerCommissionOverride))
      ? Number(partnerCommissionOverride)
      : null;

  const firstPct = partnerOverride != null ? partnerOverride : firstBase;
  const recPct = partnerOverride != null ? partnerOverride : recBase;

  const payoutMin =
    mod.payout_minimum_cents != null ? mod.payout_minimum_cents : global.payout_minimum_cents;
  const refundDays = mod.refund_hold_days != null ? mod.refund_hold_days : global.refund_hold_days;
  const deliveryMinSales =
    mod.delivery_min_paid_sales_before_payout != null
      ? mod.delivery_min_paid_sales_before_payout
      : global.delivery_min_paid_sales_before_payout;

  const limitModeRaw =
    mod.recurring_limit_mode != null && String(mod.recurring_limit_mode).trim() !== ""
      ? mod.recurring_limit_mode
      : global.recurring_limit_mode;
  const limitMode = ["unlimited", "months", "transactions"].includes(String(limitModeRaw))
    ? String(limitModeRaw)
    : "unlimited";

  const limitMonthsRaw =
    mod.recurring_limit_months != null ? mod.recurring_limit_months : global.recurring_limit_months;
  const limitTxRaw =
    mod.recurring_limit_transactions != null
      ? mod.recurring_limit_transactions
      : global.recurring_limit_transactions;

  const recurring_limit_months =
    limitMonthsRaw != null && !Number.isNaN(Number(limitMonthsRaw))
      ? Math.max(1, Math.floor(Number(limitMonthsRaw)))
      : null;
  const recurring_limit_transactions =
    limitTxRaw != null && !Number.isNaN(Number(limitTxRaw))
      ? Math.max(1, Math.floor(Number(limitTxRaw)))
      : null;

  return {
    module_key: mod.module_key || moduleKey,
    first_sale_commission_percent: firstPct,
    recurring_commission_percent: recPct,
    recurring_enabled: mod.recurring_commission_enabled !== false,
    payout_minimum_cents: Number(payoutMin),
    refund_hold_days: Math.max(0, Number(refundDays)),
    delivery_min_paid_sales_before_payout: Math.max(0, Math.floor(Number(deliveryMinSales))),
    recurring_limit_mode: limitMode,
    recurring_limit_months,
    recurring_limit_transactions,
  };
}
