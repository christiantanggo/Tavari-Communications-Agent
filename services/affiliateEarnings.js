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
export async function recordAffiliateEarningStripeFirstSubscription(session, businessId, partnerRow, options = {}) {
  const attributionSource = options.attributionSource || "stripe_metadata";
  const moduleKey = String(session.metadata?.tavari_module_key || AFFILIATE_MODULE_PHONE).trim() || AFFILIATE_MODULE_PHONE;
  const rules = await resolveCommissionRules(moduleKey);

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
      attribution_source: attributionSource,
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
      attribution_source: attributionSource,
    },
  });

  if (evErr) {
    console.error("[affiliateEarnings] affiliate_events insert failed (ledger row exists):", evErr);
  }

  await promoteAccruingAffiliateEarnings();
  return { recorded: true };
}

export async function recordAffiliateEarningStripeRenewal(invoice, subscription, businessId, partnerRow, options = {}) {
  const attributionSource = options.attributionSource || "stripe_metadata";
  if (!invoice || invoice.billing_reason !== "subscription_cycle") {
    return { recorded: false, reason: "not_renewal" };
  }

  const moduleKey =
    String(subscription?.metadata?.tavari_module_key || AFFILIATE_MODULE_PHONE).trim() || AFFILIATE_MODULE_PHONE;
  const rules = await resolveCommissionRules(moduleKey);

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
  const subId = subscription?.id || null;

  const { error: earnErr } = await supabaseClient.from("affiliate_earnings").insert({
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
      attribution_source: attributionSource,
    },
  });

  if (earnErr) {
    console.error("[affiliateEarnings] affiliate_earnings renewal insert failed:", earnErr);
    return { recorded: false, reason: "db_error", error: earnErr.message };
  }

  const { error: evErr } = await supabaseClient.from("affiliate_events").insert({
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
      attribution_source: attributionSource,
    },
  });

  if (evErr) {
    console.error("[affiliateEarnings] affiliate_events renewal insert failed (ledger row exists):", evErr);
  }

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
    .select("id, delivery_attributed_paid_count")
    .eq("affiliate_code", code)
    .eq("active", true)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!partner) return { recorded: false, reason: "invalid_partner" };

  const rules = await resolveCommissionRules(AFFILIATE_MODULE_DELIVERY);

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
  extraMetadata = {},
  moduleKey = AFFILIATE_MODULE_PHONE,
  options = {},
) {
  const mod = String(moduleKey || AFFILIATE_MODULE_PHONE).trim() || AFFILIATE_MODULE_PHONE;
  const rules = await resolveCommissionRules(mod);
  const nowIso = new Date().toISOString();
  const holdUntil = addDays(nowIso, rules.refund_hold_days);
  const gross = Math.round(Number(amountCents) || 0);
  const pct = rules.first_sale_commission_percent;
  const commission = Math.round((gross * pct) / 100);
  const businessId =
    options.businessId != null && String(options.businessId).trim() !== ""
      ? String(options.businessId).trim()
      : null;

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
      business_id: businessId,
      metadata: { source: "manual", ...extraMetadata },
    })
    .select("id")
    .single();

  if (insErr) throw insErr;

  await promoteAccruingAffiliateEarnings();
  return inserted?.id || null;
}

const ADMIN_NOTE_MAX = 2000;

/**
 * Admin corrective sale: affiliate_earnings (manual) + affiliate_events (conversion), linked for auditing.
 */
export async function recordManualAffiliateConversionLedger({
  partnerId,
  grossAmountCents,
  moduleKey = AFFILIATE_MODULE_PHONE,
  businessId = null,
  note = null,
  metadataExtra = {},
  eventMetadataExtra = {},
}) {
  const gross = Math.round(Number(grossAmountCents) || 0);
  if (gross <= 0) {
    const err = new Error("gross_amount_cents must be a positive integer");
    err.code = "INVALID_AMOUNT";
    throw err;
  }

  const noteTrim = note != null ? String(note).trim().slice(0, ADMIN_NOTE_MAX) : "";
  const extraMeta = {
    ...metadataExtra,
    ...(noteTrim ? { admin_note: noteTrim } : {}),
  };

  const mod = String(moduleKey || AFFILIATE_MODULE_PHONE).trim() || AFFILIATE_MODULE_PHONE;

  const earningId = await createManualAffiliateEarning(
    partnerId,
    gross,
    { source: "manual_admin", ...extraMeta },
    mod,
    { businessId },
  );

  const { data: row, error: insErr } = await supabaseClient
    .from("affiliate_events")
    .insert({
      partner_id: partnerId,
      event_type: "conversion",
      amount_cents: gross,
      metadata: {
        ...eventMetadataExtra,
        source: "manual_admin",
        module_key: mod,
        affiliate_earning_id: earningId,
        ...(businessId ? { business_id: businessId } : {}),
        ...(noteTrim ? { admin_note: noteTrim.slice(0, 500) } : {}),
      },
    })
    .select()
    .single();

  if (insErr) {
    await supabaseClient.from("affiliate_earnings").delete().eq("id", earningId);
    throw insErr;
  }

  const { data: er } = await supabaseClient
    .from("affiliate_earnings")
    .select("metadata")
    .eq("id", earningId)
    .maybeSingle();
  const prevMeta = er && typeof er.metadata === "object" ? er.metadata : {};
  await supabaseClient
    .from("affiliate_earnings")
    .update({
      metadata: { ...prevMeta, affiliate_event_id: row.id },
    })
    .eq("id", earningId);

  return { earningId, event: row };
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

async function getStripeOptional() {
  try {
    const { getStripeInstance } = await import("./stripe.js");
    return getStripeInstance();
  } catch {
    return null;
  }
}

/**
 * Create affiliate_earnings from paid subscription invoices in DB (idempotent).
 * Skips rows already keyed by stripe_invoice_id or stripe_charge_id (e.g. prior checkout attribution).
 * Use when a business is linked to a partner after payments already occurred.
 */
export async function backfillPhoneAgentAffiliateEarningsFromInvoices(businessId, partnerRow) {
  const moduleKey = AFFILIATE_MODULE_PHONE;
  const rules = await resolveCommissionRules(moduleKey);
  const stripe = await getStripeOptional();

  const { data: invoices, error: invErr } = await supabaseClient
    .from("invoices")
    .select("id, stripe_invoice_id, amount, currency, invoice_type, paid_at")
    .eq("business_id", businessId)
    .eq("status", "paid")
    .in("invoice_type", ["subscription_setup", "subscription_recurring"])
    .not("stripe_invoice_id", "is", null)
    .order("paid_at", { ascending: true });

  if (invErr) throw invErr;

  let inserted = 0;
  let skipped = 0;

  for (const inv of invoices || []) {
    const stripeInvoiceId = String(inv.stripe_invoice_id || "").trim();
    if (!stripeInvoiceId) {
      skipped += 1;
      continue;
    }

    const { data: dupInv } = await supabaseClient
      .from("affiliate_earnings")
      .select("id")
      .eq("stripe_invoice_id", stripeInvoiceId)
      .maybeSingle();
    if (dupInv) {
      skipped += 1;
      continue;
    }

    let chargeId = null;
    let grossCents = Math.round((Number(inv.amount) || 0) * 100);
    if (stripe) {
      try {
        const si = await stripe.invoices.retrieve(stripeInvoiceId);
        chargeId = typeof si.charge === "string" ? si.charge : si.charge?.id || null;
        if (si.amount_paid != null) grossCents = Math.round(si.amount_paid);
      } catch (e) {
        console.warn("[affiliateEarnings] backfill: could not retrieve Stripe invoice", stripeInvoiceId, e?.message || e);
      }
    }

    if (chargeId) {
      const { data: dupCh } = await supabaseClient
        .from("affiliate_earnings")
        .select("id")
        .eq("stripe_charge_id", chargeId)
        .maybeSingle();
      if (dupCh) {
        skipped += 1;
        continue;
      }
    }

    const isSetup = inv.invoice_type === "subscription_setup";
    const isRecurring = inv.invoice_type === "subscription_recurring";
    if (!isSetup && !isRecurring) {
      skipped += 1;
      continue;
    }
    if (isRecurring && !rules.recurring_enabled) {
      skipped += 1;
      continue;
    }

    const earningType = isSetup ? "first_sale" : "recurring";
    const pct = isSetup ? rules.first_sale_commission_percent : rules.recurring_commission_percent;
    const commission = Math.round((grossCents * pct) / 100);
    const paidAt = inv.paid_at ? new Date(inv.paid_at).toISOString() : new Date().toISOString();
    const holdUntil = addDays(paidAt, rules.refund_hold_days);
    const currency = String(inv.currency || "cad").toUpperCase();

    const { error: earnErr } = await supabaseClient.from("affiliate_earnings").insert({
      partner_id: partnerRow.id,
      module_key: moduleKey,
      earning_type: earningType,
      gross_amount_cents: grossCents,
      commission_cents: commission,
      currency,
      status: "accruing",
      payment_received_at: paidAt,
      refund_hold_until: holdUntil,
      volume_gate_required: false,
      stripe_invoice_id: stripeInvoiceId,
      stripe_charge_id: chargeId,
      business_id: businessId,
      metadata: {
        source: "backfill_invoices",
        attribution_source: "business_referral_assignment",
        local_invoice_id: inv.id,
      },
    });

    if (earnErr) {
      console.error("[affiliateEarnings] backfill insert failed:", earnErr);
      skipped += 1;
      continue;
    }

    const { error: evErr } = await supabaseClient.from("affiliate_events").insert({
      partner_id: partnerRow.id,
      event_type: "conversion",
      amount_cents: grossCents,
      currency,
      metadata: {
        stripe_invoice_id: stripeInvoiceId,
        business_id: businessId,
        source: "backfill_invoices",
        ledger: "affiliate_earnings",
        attribution_source: "business_referral_assignment",
      },
    });
    if (evErr) {
      console.error("[affiliateEarnings] backfill affiliate_events insert failed:", evErr);
    }

    inserted += 1;
  }

  await promoteAccruingAffiliateEarnings();
  return { inserted, skipped };
}
