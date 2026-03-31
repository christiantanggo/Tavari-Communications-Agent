import { supabaseClient } from "../config/database.js";

export const AFFILIATE_MODULE_PHONE = "phone-agent";
export const AFFILIATE_MODULE_DELIVERY = "delivery-dispatch";

/** Non–commission defaults only. Commission % are never global — only affiliate_module_settings. */
const GLOBAL_FALLBACK = {
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
    return { id: 1, ...GLOBAL_FALLBACK };
  }
  return {
    id: data.id,
    payout_minimum_cents:
      data.payout_minimum_cents != null ? Number(data.payout_minimum_cents) : GLOBAL_FALLBACK.payout_minimum_cents,
    refund_hold_days: data.refund_hold_days != null ? Number(data.refund_hold_days) : GLOBAL_FALLBACK.refund_hold_days,
    delivery_min_paid_sales_before_payout:
      data.delivery_min_paid_sales_before_payout != null
        ? Number(data.delivery_min_paid_sales_before_payout)
        : GLOBAL_FALLBACK.delivery_min_paid_sales_before_payout,
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
    updated_at: data.updated_at,
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

function percentFromModuleColumn(val) {
  if (val == null || val === "") return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Effective percentages and rules for a module.
 * First / renewal % come only from affiliate_module_settings (NULL = 0%). No global commission %.
 */
export async function resolveCommissionRules(moduleKey) {
  const global = await getAffiliateGlobalSettings();
  const mod = await getAffiliateModuleSettings(moduleKey);

  const firstPct = percentFromModuleColumn(mod.first_sale_commission_percent);
  const recPct = percentFromModuleColumn(mod.recurring_commission_percent);

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

/**
 * Human-readable audit for affiliate portal /me: which % and policy fields apply and why.
 * @param {object} mod — row from affiliate_module_settings (or stub with only module_key)
 * @param {object} rules — return value of resolveCommissionRules
 * @param {object} global — return value of getAffiliateGlobalSettings
 */
export function explainAffiliateCommissionSelectionForLog(mod, rules, global) {
  const firstRaw = mod?.first_sale_commission_percent;
  const recRaw = mod?.recurring_commission_percent;
  const firstWhy =
    firstRaw == null || firstRaw === ""
      ? "affiliate_module_settings.first_sale_commission_percent is NULL/empty → engine uses 0% (no global commission fallback)"
      : `affiliate_module_settings.first_sale_commission_percent=${firstRaw} → effective ${rules.first_sale_commission_percent}%`;
  const recWhy =
    recRaw == null || recRaw === ""
      ? "affiliate_module_settings.recurring_commission_percent is NULL/empty → engine uses 0%"
      : `affiliate_module_settings.recurring_commission_percent=${recRaw} → effective ${rules.recurring_commission_percent}%`;

  const payoutSource =
    mod?.payout_minimum_cents != null ? "affiliate_module_settings.payout_minimum_cents" : "affiliate_global_settings.payout_minimum_cents";
  const holdSource =
    mod?.refund_hold_days != null ? "affiliate_module_settings.refund_hold_days" : "affiliate_global_settings.refund_hold_days";
  const deliveryGateSource =
    mod?.delivery_min_paid_sales_before_payout != null
      ? "affiliate_module_settings.delivery_min_paid_sales_before_payout"
      : "affiliate_global_settings.delivery_min_paid_sales_before_payout";
  const limitModeSource =
    mod?.recurring_limit_mode != null && String(mod.recurring_limit_mode).trim() !== ""
      ? "affiliate_module_settings.recurring_limit_mode"
      : "affiliate_global_settings.recurring_limit_mode";

  return {
    module_key: rules.module_key,
    commission: {
      first_sale_effective_percent: rules.first_sale_commission_percent,
      recurring_effective_percent: rules.recurring_commission_percent,
      first_sale_db_raw: firstRaw ?? null,
      recurring_db_raw: recRaw ?? null,
      first_sale_why: firstWhy,
      recurring_why: recWhy,
    },
    recurring_commission_enabled: rules.recurring_enabled,
    other_policy: {
      payout_minimum_cents_effective: rules.payout_minimum_cents,
      payout_minimum_why: `${payoutSource} (global row has ${global.payout_minimum_cents})`,
      refund_hold_days_effective: rules.refund_hold_days,
      refund_hold_why: `${holdSource} (global row has ${global.refund_hold_days})`,
      delivery_min_paid_sales_effective: rules.delivery_min_paid_sales_before_payout,
      delivery_min_paid_sales_why: `${deliveryGateSource}`,
      recurring_limit_mode_effective: rules.recurring_limit_mode,
      recurring_limit_why: `${limitModeSource}`,
    },
  };
}
