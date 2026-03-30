import { supabaseClient } from "../config/database.js";
import {
  resolveCommissionRules,
  AFFILIATE_MODULE_PHONE,
  AFFILIATE_MODULE_DELIVERY,
} from "./affiliateCommissionSettings.js";

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString();
}

/** Calendar months from anchor (UTC); used for recurring commission window from subscription start. */
function addUtcCalendarMonths(anchorDate, monthsToAdd) {
  const d = new Date(anchorDate.getTime());
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(
    Date.UTC(
      y,
      mo + Number(monthsToAdd),
      day,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
}

export async function promoteAccruingAffiliateEarnings() {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabaseClient
    .from("affiliate_earnings")
    .select("id, refund_hold_until, volume_gate_required, volume_met_at")
    .eq("status", "accruing")
    .lte("refund_hold_until", nowIso);

  if (error) throw error;
  for (const row of rows || []) {
    if (row.volume_gate_required && !row.volume_met_at) continue;
    await supabaseClient
      .from("affiliate_earnings")
      .update({ status: "eligible", eligible_at: nowIso })
      .eq("id", row.id);
  }
}

/**
 * Phone-agent (or core) subscription: first checkout payment.
 */
export async function recordAffiliateEarningStripeFirstSubscription(session, businessId, partnerRow) {
  const moduleKey = String(session.metadata?.tavari_module_key || AFFILIATE_MODULE_PHONE).trim() || AFFILIATE_MODULE_PHONE;
  const rules = await resolveCommissionRules(moduleKey, {
    partnerCommissionOverride: partnerRow.commission_rate_percent,
  });

  const sessionId = session.id;
  const { data: dup } = await supabaseClient
    .from("affiliate_earnings")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  if (dup) return { recorded: false, reason: "duplicate" };

  const gross = session.amount_total != null ? Math.round(session.amount_total) : 0;
  const commission = Math.round((gross * rules.first_sale_commission_percent) / 100);
  const nowIso = new Date().toISOString();
  const holdUntil = addDays(nowIso, rules.refund_hold_days);

  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  const ch =
    typeof session.payment_intent?.latest_charge === "string"
      ? session.payment_intent.latest_charge
      : session.payment_intent?.latest_charge?.id || null;

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || null;

  const { error: earnErr } = await supabaseClient.from("affiliate_earnings").insert({
    partner_id: partnerRow.id,
    module_key: moduleKey,
    earning_type: "first_sale",
    gross_amount_cents: gross,
    commission_cents: commission,
    currency: String(session.currency || "cad").toUpperCase(),
    status: "accruing",
    payment_received_at: nowIso,
    refund_hold_until: holdUntil,
    volume_gate_required: false,
    stripe_checkout_session_id: sessionId,
    stripe_payment_intent_id: pi,
    stripe_charge_id: ch,
    business_id: businessId,
    metadata: {
      package_id: session.metadata?.package_id || null,
      stripe_subscription_id: subId,
      source: "stripe_checkout",
    },
  });

  if (earnErr) {
    console.error("[affiliateEarnings] affiliate_earnings insert failed:", earnErr);
    return { recorded: false, reason: "db_error", error: earnErr.message };
  }

  const { error: evErr } = await supabaseClient.from("affiliate_events").insert({
    partner_id: partnerRow.id,
    event_type: "conversion",
    amount_cents: gross,
    currency: String(session.currency || "cad").toUpperCase(),
    metadata: {
      stripe_checkout_session_id: sessionId,
      business_id: businessId,
      package_id: session.metadata?.package_id || null,
      stripe_subscription_id: subId,
      source: "stripe_checkout",
      ledger: "affiliate_earnings",
    },
  });

  if (evErr) {
    console.error("[affiliateEarnings] affiliate_events insert failed (ledger row exists):", evErr);
  }

  await promoteAccruingAffiliateEarnings();
  return { recorded: true };
}

export async function recordAffiliateEarningStripeRenewal(invoice, subscription, businessId, partnerRow) {
  if (!invoice || invoice.billing_reason !== "subscription_cycle") {
    return { recorded: false, reason: "not_renewal" };
  }

  const moduleKey =
    String(subscription?.metadata?.tavari_module_key || AFFILIATE_MODULE_PHONE).trim() || AFFILIATE_MODULE_PHONE;
  const rules = await resolveCommissionRules(moduleKey, {
    partnerCommissionOverride: partnerRow.commission_rate_percent,
  });

  if (!rules.recurring_enabled) {
    return { recorded: false, reason: "recurring_disabled" };
  }

  const invoiceId = invoice.id;
  const { data: dup } = await supabaseClient
    .from("affiliate_earnings")
    .select("id")
    .eq("stripe_invoice_id", invoiceId)
    .maybeSingle();

  if (dup) return { recorded: false, reason: "duplicate" };

  const gross = invoice.amount_paid != null ? Math.round(invoice.amount_paid) : 0;
  const commission = Math.round((gross * rules.recurring_commission_percent) / 100);
  const nowIso = new Date().toISOString();
  const holdUntil = addDays(nowIso, rules.refund_hold_days);

  const chId = invoice.charge || null;

  await supabaseClient.from("affiliate_earnings").insert({
    partner_id: partnerRow.id,
    module_key: moduleKey,
    earning_type: "recurring",
    gross_amount_cents: gross,
    commission_cents: commission,
    currency: String(invoice.currency || "cad").toUpperCase(),
    status: "accruing",
    payment_received_at: nowIso,
    refund_hold_until: holdUntil,
    volume_gate_required: false,
    stripe_invoice_id: invoiceId,
    stripe_charge_id: chId,
    business_id: businessId,
    metadata: {
      stripe_subscription_id: subId,
      source: "stripe_subscription_renewal",
    },
  });

  await supabaseClient.from("affiliate_events").insert({
    partner_id: partnerRow.id,
    event_type: "conversion",
    amount_cents: gross,
    currency: String(invoice.currency || "cad").toUpperCase(),
    metadata: {
      stripe_invoice_id: invoiceId,
      business_id: businessId,
      stripe_subscription_id: subscription.id,
      source: "stripe_subscription_renewal",
      ledger: "affiliate_earnings",
    },
  });

  await promoteAccruingAffiliateEarnings();
  return { recorded: true };
}

/**
 * Individual delivery Stripe checkout (payment mode).
 */
export async function recordAffiliateEarningDeliveryCheckout(session, deliveryRequestId, amountPaidCents) {
  const code = String(session.metadata?.affiliate_code || "")
    .trim()
    .toUpperCase();
  if (!code || !/^[A-Z0-9]{4,16}$/.test(code)) {
    return { recorded: false, reason: "no_code" };
  }

  const sessionId = session.id;
  const { data: dup } = await supabaseClient
    .from("affiliate_earnings")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  if (dup) return { recorded: false, reason: "duplicate" };

  const { data: partner, error: pErr } = await supabaseClient
    .from("affiliate_partners")
    .select("id, commission_rate_percent, delivery_attributed_paid_count")
    .eq("affiliate_code", code)
    .eq("active", true)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!partner) return { recorded: false, reason: "invalid_partner" };

  const rules = await resolveCommissionRules(AFFILIATE_MODULE_DELIVERY, {
    partnerCommissionOverride: partner.commission_rate_percent,
  });

  const gross = amountPaidCents != null ? Math.round(amountPaidCents) : Math.round(session.amount_total || 0);
  const commission = Math.round((gross * rules.first_sale_commission_percent) / 100);
  const nowIso = new Date().toISOString();
  const holdUntil = addDays(nowIso, rules.refund_hold_days);
  const threshold = rules.delivery_min_paid_sales_before_payout;
  const volumeGate = threshold > 0;

  const { data: reqRow } = await supabaseClient
    .from("delivery_requests")
    .select("business_id")
    .eq("id", deliveryRequestId)
    .maybeSingle();

  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  const ch =
    typeof session.payment_intent?.latest_charge === "string"
      ? session.payment_intent.latest_charge
      : session.payment_intent?.latest_charge?.id || null;

  const newCount = (partner.delivery_attributed_paid_count || 0) + 1;
  await supabaseClient
    .from("affiliate_partners")
    .update({
      delivery_attributed_paid_count: newCount,
      updated_at: nowIso,
    })
    .eq("id", partner.id);

  let volumeMetAt = null;
  if (!volumeGate || newCount >= threshold) {
    volumeMetAt = nowIso;
  }

  await supabaseClient.from("affiliate_earnings").insert({
    partner_id: partner.id,
    module_key: AFFILIATE_MODULE_DELIVERY,
    earning_type: "delivery_payment",
    gross_amount_cents: gross,
    commission_cents: commission,
    currency: String(session.currency || "cad").toUpperCase(),
    status: "accruing",
    payment_received_at: nowIso,
    refund_hold_until: holdUntil,
    volume_gate_required: volumeGate,
    volume_met_at: volumeMetAt,
    stripe_checkout_session_id: sessionId,
    stripe_payment_intent_id: pi,
    stripe_charge_id: ch,
    business_id: reqRow?.business_id || null,
    metadata: {
      delivery_request_id: deliveryRequestId,
      source: "stripe_delivery_checkout",
    },
  });

  if (volumeGate && newCount >= threshold) {
    await supabaseClient
      .from("affiliate_earnings")
      .update({ volume_met_at: nowIso })
      .eq("partner_id", partner.id)
      .eq("module_key", AFFILIATE_MODULE_DELIVERY)
      .eq("status", "accruing")
      .is("volume_met_at", null);
  }

  await supabaseClient.from("affiliate_events").insert({
    partner_id: partner.id,
    event_type: "conversion",
    amount_cents: gross,
    currency: String(session.currency || "cad").toUpperCase(),
    metadata: {
      stripe_checkout_session_id: sessionId,
      delivery_request_id: deliveryRequestId,
      source: "stripe_delivery_checkout",
      ledger: "affiliate_earnings",
    },
  });

  await promoteAccruingAffiliateEarnings();
  return { recorded: true };
}

export async function reverseAffiliateEarningsForStripeCharge(chargeId) {
  if (!chargeId) return { reversed: 0 };
  const { data, error } = await supabaseClient
    .from("affiliate_earnings")
    .update({ status: "reversed", eligible_at: null })
    .eq("stripe_charge_id", chargeId)
    .in("status", ["accruing", "eligible"])
    .select("id");

  if (error) throw error;
  return { reversed: (data || []).length };
}

export async function reverseAffiliateEarningsForPaymentIntent(paymentIntentId) {
  if (!paymentIntentId) return { reversed: 0 };
  const { data, error } = await supabaseClient
    .from("affiliate_earnings")
    .update({ status: "reversed", eligible_at: null })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .in("status", ["accruing", "eligible"])
    .select("id");

  if (error) throw error;
  return { reversed: (data || []).length };
}

export async function listPartnerEarnings(partnerId, { limit = 100 } = {}) {
  const { data, error } = await supabaseClient
    .from("affiliate_earnings")
    .select(
      "id, module_key, earning_type, gross_amount_cents, commission_cents, currency, status, payment_received_at, refund_hold_until, eligible_at, metadata, created_at, stripe_checkout_session_id, stripe_invoice_id",
    )
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 100, 500));

  if (error) throw error;
  return data || [];
}

export async function createManualAffiliateEarning(
  partnerId,
  amountCents,
  partnerCommissionOverride,
  extraMetadata = {},
  moduleKey = AFFILIATE_MODULE_PHONE,
) {
  const mod = String(moduleKey || AFFILIATE_MODULE_PHONE).trim() || AFFILIATE_MODULE_PHONE;
  const rules = await resolveCommissionRules(mod, {
    partnerCommissionOverride,
  });
  const nowIso = new Date().toISOString();
  const holdUntil = addDays(nowIso, rules.refund_hold_days);
  const gross = Math.round(Number(amountCents) || 0);
  const pct = rules.first_sale_commission_percent;
  const commission = Math.round((gross * pct) / 100);

  const { data: inserted, error: insErr } = await supabaseClient
    .from("affiliate_earnings")
    .insert({
      partner_id: partnerId,
      module_key: mod,
      earning_type: "manual",
      gross_amount_cents: gross,
      commission_cents: commission,
      currency: "CAD",
      status: "accruing",
      payment_received_at: nowIso,
      refund_hold_until: holdUntil,
      volume_gate_required: false,
      metadata: { source: "manual", ...extraMetadata },
    })
    .select("id")
    .single();

  if (insErr) throw insErr;

  await promoteAccruingAffiliateEarnings();
  return inserted?.id || null;
}

export async function sumPartnerCommissionByStatus(partnerId) {
  const { data, error } = await supabaseClient
    .from("affiliate_earnings")
    .select("status, commission_cents")
    .eq("partner_id", partnerId)
    .in("status", ["accruing", "eligible", "paid"]);

  if (error) throw error;
  const sums = { accruing: 0, eligible: 0, paid: 0 };
  for (const row of data || []) {
    const c = Number(row.commission_cents) || 0;
    if (row.status === "accruing") sums.accruing += c;
    else if (row.status === "eligible") sums.eligible += c;
    else if (row.status === "paid") sums.paid += c;
  }
  return sums;
}
