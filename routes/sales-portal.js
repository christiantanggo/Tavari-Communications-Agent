import express from "express";
import { authenticateSalesPortal } from "../middleware/salesPortalAuth.js";
import {
  consumePortalLoginTokenForSalesRep,
  issueSalesSessionJwt,
  requestSalesMagicLink,
} from "../services/affiliateProgram.js";
import { supabaseClient } from "../config/database.js";
import { signupBusinessAndOwner } from "../services/customerSignupService.js";
import { logSalesPortalAudit } from "../services/salesPortalAudit.js";
import { PricingPackage } from "../models/PricingPackage.js";
import { Business } from "../models/Business.js";
import { User } from "../models/User.js";
import { getFrontendPublicBaseUrl } from "../config/public-urls.js";
import { issuePasswordResetCodeAndEmail } from "../services/passwordResetInvite.js";
import { formatPhoneNumberE164, validatePhoneNumber } from "../utils/phoneFormatter.js";
import {
  normalizeSalesOnboardModuleKey,
  normalizeSalesOnboardModuleKeys,
  SALES_ONBOARD_MODULE_OPTIONS,
} from "../config/sales-onboard-modules.js";
import {
  createSalesCheckoutSession,
  trySendOnboardPaymentEmail,
  resolvePrimarySalesPackageId,
  redeemSalesCheckoutInvite,
} from "../services/salesCheckoutInvite.js";

/**
 * Sales dashboard "Paid" — businesses row + ledger + invoices + v2 subscriptions + billing cycle.
 */
function salesPaymentComplete(
  businessRow,
  ledgerPaidBusinessIds,
  invoicePaidBusinessIds,
  subscriptionActiveBusinessIds,
) {
  if (businessRow?.package_id || businessRow?.stripe_subscription_id) return true;
  const st = String(businessRow?.stripe_subscription_status || "").toLowerCase();
  if (st === "active" || st === "trialing" || st === "past_due") return true;
  const id = String(businessRow?.id || "");
  if (ledgerPaidBusinessIds?.has(id)) return true;
  if (invoicePaidBusinessIds?.has(id)) return true;
  if (subscriptionActiveBusinessIds?.has(id)) return true;
  const tier = String(businessRow?.plan_tier || "").trim();
  const minutes = businessRow?.usage_limit_minutes;
  if (tier && minutes != null && minutes !== "") return true;
  const nbd = businessRow?.next_billing_date;
  if (nbd != null && String(nbd).trim() !== "") return true;
  // Checkout can leave package_id / subscription_id null while Stripe customer + plan tier were written.
  const cust = String(businessRow?.stripe_customer_id || "").trim();
  if (cust && tier) return true;
  return false;
}

/** Setup complete: wizard flag, billing cycle started, or phone/VAPI provisioned. */
function salesSetupComplete(b) {
  if (b?.onboarding_complete) return true;
  const nbd = b?.next_billing_date;
  if (nbd != null && String(nbd).trim() !== "") return true;
  const phoneSignals = [b?.vapi_phone_number, b?.voximplant_number, b?.telnyx_number].some(
    (x) => x != null && String(x).trim() !== "",
  );
  if (phoneSignals) return true;
  if (b?.vapi_assistant_id != null && String(b.vapi_assistant_id).trim() !== "") return true;
  if (b?.public_phone_number != null && String(b.public_phone_number).trim() !== "") return true;
  const cust = String(b?.stripe_customer_id || "").trim();
  const pt = String(b?.plan_tier || "").trim();
  if (cust && pt) return true;
  return false;
}

/**
 * affiliate_earnings: a row for this business_id (not reversed) means a payment was recorded in the commission ledger.
 * Intentionally NOT filtered by partner_id — the customer may be assigned to your rep while the earning row
 * exists under another partner id or the column is the only link to "money moved".
 */
async function loadPaidBusinessIdsFromAffiliateEarnings(linkedIds) {
  const out = new Set();
  if (!linkedIds?.length) return out;
  const { data, error } = await supabaseClient
    .from("affiliate_earnings")
    .select("business_id")
    .in("business_id", linkedIds)
    .neq("status", "reversed");
  if (error || !data?.length) return out;
  for (const r of data) {
    if (r.business_id) out.add(String(r.business_id));
  }
  return out;
}

/** external_purchases: paid external checkout (e.g. ClickBank) tied to business_id. */
async function loadPaidBusinessIdsFromExternalPurchases(linkedIds) {
  const out = new Set();
  if (!linkedIds?.length) return out;
  const { data, error } = await supabaseClient
    .from("external_purchases")
    .select("business_id")
    .in("business_id", linkedIds)
    .eq("status", "active");
  if (error || !data?.length) return out;
  for (const r of data) {
    if (r.business_id) out.add(String(r.business_id));
  }
  return out;
}

const router = express.Router();
router.use(express.json());

/** Public: customer opens email link → JSON with Stripe URL (no auth). */
router.post("/checkout-invite/redeem", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({ error: "Token required" });
    }
    const result = await redeemSalesCheckoutInvite(token, clientIp(req));
    if (result.error) {
      const status = result.status && Number.isFinite(result.status) ? result.status : 400;
      return res.status(status).json({ error: result.error, code: result.code });
    }
    if (result.alreadyPaid) {
      return res.json({ alreadyPaid: true, message: result.message });
    }
    if (result.skipPayment) {
      return res.json({
        skipPayment: true,
        message: result.message,
        packageId: result.packageId,
        packageName: result.packageName,
      });
    }
    res.json({
      url: result.url,
      sessionId: result.sessionId,
      packageId: result.packageId,
      packageName: result.packageName,
    });
  } catch (e) {
    console.error("[sales-portal] checkout-invite redeem:", e);
    res.status(500).json({ error: "Could not start payment" });
  }
});

function clientIp(req) {
  const raw = req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress || "unknown";
  return typeof raw === "string" ? raw.split(",")[0].trim() : "unknown";
}

/** Optional phone: empty OK; if present but not E.164-valid, omit (do not fail signup). */
function sanitizeOnboardPhone(raw) {
  const t = raw == null ? "" : String(raw).trim();
  if (!t) {
    return { phone: undefined, public_phone_number: undefined, skippedInvalid: false };
  }
  const e164 = formatPhoneNumberE164(t);
  if (e164 && validatePhoneNumber(e164)) {
    return { phone: e164, public_phone_number: e164, skippedInvalid: false };
  }
  return { phone: undefined, public_phone_number: undefined, skippedInvalid: true, raw: t };
}

function isTermsAttestedTrue(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function formatCatalogPackage(p) {
  const onSale = PricingPackage.isSaleActive(p) && PricingPackage.isSaleAvailable(p);
  const raw =
    onSale && p.sale_price != null && String(p.sale_price).trim() !== ""
      ? Number(p.sale_price)
      : Number(p.monthly_price);
  const displayPrice = Number.isFinite(raw) ? raw : null;
  const priceLabel = displayPrice != null ? `$${displayPrice.toFixed(2)}/mo` : "See checkout";
  return {
    id: p.id,
    name: p.name,
    module_key: p.module_key,
    price_label: priceLabel,
    is_on_sale: onSale,
  };
}

const PACKAGE_ID_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For each selected module: if active plans exist, ensure a valid package id (or auto-pick when only one).
 */
async function validateAndNormalizePackageByModule(moduleKeys, raw) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const out = {};

  for (const mk of moduleKeys) {
    let pkgs;
    try {
      pkgs = await PricingPackage.findAll({
        moduleKey: mk,
        includeInactive: false,
        includePrivate: true,
      });
    } catch {
      return { error: `Could not load pricing plans for ${mk}.` };
    }

    const idRaw = input[mk];
    let id = idRaw != null && String(idRaw).trim() ? String(idRaw).trim() : "";

    if (!pkgs.length) {
      continue;
    }

    if (pkgs.length === 1 && !id) {
      out[mk] = pkgs[0].id;
      continue;
    }

    if (!id || !PACKAGE_ID_UUID.test(id)) {
      return {
        error: `Select a pricing plan for each selected service (missing or invalid plan for ${mk}).`,
        code: "PACKAGE_REQUIRED",
      };
    }

    const pkg = await PricingPackage.findById(id);
    if (!pkg || String(pkg.module_key) !== String(mk) || !pkg.is_active) {
      return { error: `Invalid or inactive plan for ${mk}.`, code: "INVALID_PACKAGE" };
    }
    out[mk] = id;
  }

  return { value: out };
}

async function buildSalesServiceCatalog() {
  const { resolveCommissionRules } = await import("../services/affiliateCommissionSettings.js");

  return Promise.all(
    SALES_ONBOARD_MODULE_OPTIONS.map(async (opt) => {
      const [pkgs, rules] = await Promise.all([
        PricingPackage.findAll({
          moduleKey: opt.key,
          includeInactive: false,
          includePrivate: true,
        }),
        resolveCommissionRules(opt.key),
      ]);

      const displayPrices = (pkgs || [])
        .map((p) => {
          const onSale = PricingPackage.isSaleActive(p) && PricingPackage.isSaleAvailable(p);
          const raw =
            onSale && p.sale_price != null && String(p.sale_price).trim() !== ""
              ? Number(p.sale_price)
              : Number(p.monthly_price);
          return Number.isFinite(raw) ? raw : null;
        })
        .filter((n) => n != null);

      const customer_from_price_per_month =
        displayPrices.length > 0 ? Math.min(...displayPrices) : null;

      let customer_price_summary;
      if (customer_from_price_per_month != null) {
        customer_price_summary = `From $${customer_from_price_per_month.toFixed(2)}/mo`;
      } else if ((pkgs || []).length > 0) {
        customer_price_summary = "See plans at checkout";
      } else {
        customer_price_summary = "No published plan yet — use checkout";
      }

      return {
        key: opt.key,
        label: opt.label,
        customer_from_price_per_month,
        customer_price_summary,
        packages: (pkgs || []).map(formatCatalogPackage),
        first_sale_commission_percent: rules.first_sale_commission_percent,
        recurring_commission_percent: rules.recurring_commission_percent,
        recurring_commission_enabled: rules.recurring_enabled,
        recurring_limit_mode: rules.recurring_limit_mode,
        recurring_limit_months: rules.recurring_limit_months,
        recurring_limit_transactions: rules.recurring_limit_transactions,
      };
    }),
  );
}

async function loadSalesPartner(partnerId) {
  const { data: partner, error } = await supabaseClient
    .from("affiliate_partners")
    .select("id, affiliate_code, display_name, email, active, is_sales_rep, created_at")
    .eq("id", partnerId)
    .maybeSingle();
  if (error) throw error;
  if (!partner?.active || !partner.is_sales_rep) return null;
  return partner;
}

router.post("/exchange", async (req, res) => {
  try {
    const raw = String(req.body?.token || "").trim();
    if (!raw || raw.length > 200) {
      return res.status(400).json({ error: "Invalid token" });
    }

    const result = await consumePortalLoginTokenForSalesRep(raw);
    if (!result.ok) {
      if (result.reason === "not_sales_rep") {
        return res.status(403).json({
          error: "This sign-in link is not for a sales-enabled account. Use the partner dashboard link from your email instead.",
        });
      }
      return res.status(400).json({ error: "Invalid, expired, or already used link" });
    }

    const partner = await loadSalesPartner(result.partnerId);
    if (!partner) {
      return res.status(403).json({ error: "This account is not enabled for the sales portal" });
    }

    const accessToken = issueSalesSessionJwt(partner.id);
    await logSalesPortalAudit(partner.id, "sales_exchange", {}, clientIp(req));

    res.json({
      accessToken,
      partner: {
        id: partner.id,
        affiliate_code: partner.affiliate_code,
        display_name: partner.display_name,
        email: partner.email,
      },
    });
  } catch (e) {
    console.error("[sales-portal] exchange:", e);
    res.status(500).json({ error: "Could not sign you in" });
  }
});

router.post("/request-link", async (req, res) => {
  try {
    await requestSalesMagicLink(req.body?.email);
    res.json({
      success: true,
      message: "If we found an active sales account for that email, we sent a sign-in link.",
    });
  } catch (e) {
    console.error("[sales-portal] request-link:", e);
    res.status(500).json({ error: "Could not process request" });
  }
});

router.get("/me", authenticateSalesPortal, async (req, res) => {
  try {
    const partnerGate = await loadSalesPartner(req.salesPartnerId);
    if (!partnerGate) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const { promoteAccruingAffiliateEarnings, sumPartnerCommissionByStatus, listPartnerEarnings } = await import(
      "../services/affiliateEarnings.js",
    );
    const {
      getAffiliateGlobalSettings,
      resolveCommissionRules,
      AFFILIATE_MODULE_PHONE,
      AFFILIATE_MODULE_DELIVERY,
      AFFILIATE_MODULE_REVIEWS,
    } = await import("../services/affiliateCommissionSettings.js");

    await promoteAccruingAffiliateEarnings();

    const { data: partner, error: pErr } = await supabaseClient
      .from("affiliate_partners")
      .select(
        "id, affiliate_code, display_name, email, active, is_sales_rep, created_at, delivery_attributed_paid_count",
      )
      .eq("id", partnerGate.id)
      .single();

    if (pErr) throw pErr;
    if (!partner?.active || !partner.is_sales_rep) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const { data: events, error: eErr } = await supabaseClient
      .from("affiliate_events")
      .select("event_type, amount_cents")
      .eq("partner_id", partner.id);

    if (eErr) throw eErr;

    const clicks = (events || []).filter((e) => e.event_type === "click").length;
    const leads = (events || []).filter((e) => e.event_type === "lead").length;
    const conversions = (events || []).filter((e) => e.event_type === "conversion");
    const conversionCount = conversions.length;
    const revenueCents = conversions.reduce((sum, e) => sum + (Number(e.amount_cents) || 0), 0);

    const earningsSummary = await sumPartnerCommissionByStatus(partner.id);
    const globalSettings = await getAffiliateGlobalSettings();

    const { count: ledgerSalesCount, error: cErr } = await supabaseClient
      .from("affiliate_earnings")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partner.id)
      .neq("status", "reversed");

    if (cErr) throw cErr;

    const { data: grossRows, error: gErr } = await supabaseClient
      .from("affiliate_earnings")
      .select("gross_amount_cents")
      .eq("partner_id", partner.id)
      .neq("status", "reversed");

    if (gErr) throw gErr;
    const grossSalesCents = (grossRows || []).reduce((s, r) => s + (Number(r.gross_amount_cents) || 0), 0);

    const [programPhone, programDelivery, programReviews] = await Promise.all([
      resolveCommissionRules(AFFILIATE_MODULE_PHONE),
      resolveCommissionRules(AFFILIATE_MODULE_DELIVERY),
      resolveCommissionRules(AFFILIATE_MODULE_REVIEWS),
    ]);

    let purchases = [];
    try {
      const rows = await listPartnerEarnings(partner.id, { limit: 50 });
      purchases = (rows || []).map((r) => ({
        id: r.id,
        business_id: r.business_id || null,
        created_at: r.payment_received_at || r.created_at || r.eligible_at || null,
        payment_received_at: r.payment_received_at || null,
        amount_cents: r.gross_amount_cents,
        commission_cents: r.commission_cents,
        currency: r.currency,
        status: r.status,
        refund_hold_until: r.refund_hold_until,
        module_key: r.module_key,
        earning_type: r.earning_type,
        source: r.metadata?.source || null,
        attribution_source: r.metadata?.attribution_source || null,
        stripe_checkout_session_id: r.stripe_checkout_session_id || r.metadata?.stripe_checkout_session_id || null,
        stripe_invoice_id: r.stripe_invoice_id || r.metadata?.stripe_invoice_id || null,
      }));
    } catch (_) {
      purchases = [];
    }

    const { data: linked, error: lbErr } = await supabaseClient
      .from("businesses")
      .select(
        [
          "id",
          "name",
          "email",
          "created_at",
          "package_id",
          "onboarding_complete",
          "stripe_customer_id",
          "stripe_subscription_id",
          "stripe_subscription_status",
          "plan_tier",
          "usage_limit_minutes",
          "vapi_phone_number",
          "voximplant_number",
          "telnyx_number",
          "vapi_assistant_id",
          "next_billing_date",
          "public_phone_number",
          "referred_by_partner_id",
          "sales_onboard_primary_module",
          "sales_onboard_modules",
          "sales_onboard_package_by_module",
        ].join(", "),
      )
      .eq("referred_by_partner_id", partner.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (lbErr) throw lbErr;

    const linkedIds = (linked || []).map((b) => b.id).filter(Boolean);
    const invoicePaidBusinessIds = new Set();
    const subscriptionActiveBusinessIds = new Set();
    const [earnPaidIds, extPurchPaidIds, invRes, subRes] = await Promise.all([
      loadPaidBusinessIdsFromAffiliateEarnings(linkedIds),
      loadPaidBusinessIdsFromExternalPurchases(linkedIds),
      linkedIds.length
        ? supabaseClient
            .from("invoices")
            .select("business_id")
            .in("business_id", linkedIds)
            .or("status.eq.paid,paid_at.not.is.null")
        : Promise.resolve({ data: [], error: null }),
      linkedIds.length
        ? supabaseClient
            .from("subscriptions")
            .select("business_id")
            .in("business_id", linkedIds)
            .in("status", ["active", "past_due"])
        : Promise.resolve({ data: [], error: null }),
    ]);
    const ledgerPaidBusinessIds = new Set([...earnPaidIds, ...extPurchPaidIds]);
    if (!invRes.error && invRes.data?.length) {
      for (const r of invRes.data) {
        if (r.business_id) invoicePaidBusinessIds.add(String(r.business_id));
      }
    }
    if (!subRes.error && subRes.data?.length) {
      for (const r of subRes.data) {
        if (r.business_id) subscriptionActiveBusinessIds.add(String(r.business_id));
      }
    }

    let earnAll = [];
    let invDetailAll = [];
    if (linkedIds.length) {
      const [er, ir] = await Promise.all([
        supabaseClient
          .from("affiliate_earnings")
          .select("business_id, partner_id, gross_amount_cents, commission_cents")
          .in("business_id", linkedIds)
          .neq("status", "reversed"),
        supabaseClient
          .from("invoices")
          .select("business_id, stripe_invoice_id, amount, invoice_type, status")
          .in("business_id", linkedIds)
          .eq("status", "paid"),
      ]);
      if (!er.error) earnAll = er.data || [];
      if (!ir.error) invDetailAll = ir.data || [];
    }

    const sales_service_catalog = await buildSalesServiceCatalog();

    const base = getFrontendPublicBaseUrl();
    const commission_policy = {
      payout_minimum_cents: Number(globalSettings.payout_minimum_cents) || 0,
      refund_hold_days_default: Number(globalSettings.refund_hold_days),
      delivery_paid_checkouts_attributed: partner.delivery_attributed_paid_count || 0,
      by_module: [
        {
          module_key: AFFILIATE_MODULE_PHONE,
          first_sale_commission_percent: programPhone.first_sale_commission_percent,
          recurring_commission_percent: programPhone.recurring_commission_percent,
          recurring_enabled: programPhone.recurring_enabled,
          payout_minimum_cents: programPhone.payout_minimum_cents,
          refund_hold_days: programPhone.refund_hold_days,
          recurring_limit_mode: programPhone.recurring_limit_mode,
          recurring_limit_months: programPhone.recurring_limit_months,
          recurring_limit_transactions: programPhone.recurring_limit_transactions,
        },
        {
          module_key: AFFILIATE_MODULE_DELIVERY,
          first_sale_commission_percent: programDelivery.first_sale_commission_percent,
          recurring_commission_percent: programDelivery.recurring_commission_percent,
          recurring_enabled: programDelivery.recurring_enabled,
          payout_minimum_cents: programDelivery.payout_minimum_cents,
          refund_hold_days: programDelivery.refund_hold_days,
          delivery_min_paid_sales_before_payout: programDelivery.delivery_min_paid_sales_before_payout,
          recurring_limit_mode: programDelivery.recurring_limit_mode,
          recurring_limit_months: programDelivery.recurring_limit_months,
          recurring_limit_transactions: programDelivery.recurring_limit_transactions,
        },
        {
          module_key: AFFILIATE_MODULE_REVIEWS,
          first_sale_commission_percent: programReviews.first_sale_commission_percent,
          recurring_commission_percent: programReviews.recurring_commission_percent,
          recurring_enabled: programReviews.recurring_enabled,
          payout_minimum_cents: programReviews.payout_minimum_cents,
          refund_hold_days: programReviews.refund_hold_days,
          recurring_limit_mode: programReviews.recurring_limit_mode,
          recurring_limit_months: programReviews.recurring_limit_months,
          recurring_limit_transactions: programReviews.recurring_limit_transactions,
        },
      ],
    };

    res.json({
      partner: {
        id: partner.id,
        affiliate_code: partner.affiliate_code,
        display_name: partner.display_name,
        email: partner.email,
        created_at: partner.created_at,
      },
      linked_businesses: (linked || []).map((b) => ({
        ...b,
        sales_payment_complete: salesPaymentComplete(
          b,
          ledgerPaidBusinessIds,
          invoicePaidBusinessIds,
          subscriptionActiveBusinessIds,
        ),
        sales_setup_complete: salesSetupComplete(b),
        primary_sales_package_id: resolvePrimarySalesPackageId(b),
      })),
      sales_service_catalog,
      join_urls: {
        phone_agent: `${base}/join/phone-agent/${partner.affiliate_code}`,
        review_reply: `${base}/join/reviews/${partner.affiliate_code}`,
        delivery_dispatch: `${base}/deliverydispatch?partner=${encodeURIComponent(partner.affiliate_code)}`,
      },
      short_hub_url: `${base}/r/${partner.affiliate_code}`,
      stats: {
        clicks,
        leads,
        conversions: conversionCount,
        revenue_cents: revenueCents,
        attributed_sales: ledgerSalesCount || 0,
        gross_sales_cents: grossSalesCents,
      },
      earnings_summary: {
        commission_accruing_cents: earningsSummary.accruing,
        commission_eligible_cents: earningsSummary.eligible,
        commission_paid_cents: earningsSummary.paid,
      },
      purchases,
      commission_policy,
      earnings_customer_context: (linked || []).map((b) => {
        const bid = String(b.id);
        const paidComplete = salesPaymentComplete(
          b,
          ledgerPaidBusinessIds,
          invoicePaidBusinessIds,
          subscriptionActiveBusinessIds,
        );
        const mine = earnAll.filter(
          (e) => String(e.business_id) === bid && String(e.partner_id) === String(partner.id),
        );
        const others = earnAll.filter(
          (e) => String(e.business_id) === bid && String(e.partner_id) !== String(partner.id),
        );
        const subInvs = invDetailAll.filter(
          (i) =>
            String(i.business_id) === bid &&
            (i.invoice_type === "subscription_setup" || i.invoice_type === "subscription_recurring"),
        );
        const yourCommission = mine.reduce((s, e) => s + (Number(e.commission_cents) || 0), 0);
        const yourGross = mine.reduce((s, e) => s + (Number(e.gross_amount_cents) || 0), 0);
        const otherGross = others.reduce((s, e) => s + (Number(e.gross_amount_cents) || 0), 0);
        const hasSetupMissingStripe = subInvs.some(
          (i) =>
            i.invoice_type === "subscription_setup" &&
            (!i.stripe_invoice_id || String(i.stripe_invoice_id).trim() === ""),
        );
        let mismatch_code = null;
        let mismatch_detail = null;
        if (paidComplete && yourCommission === 0 && mine.length === 0) {
          if (others.length > 0) {
            mismatch_code = "CREDITED_OTHER_PARTNER";
            mismatch_detail = `Commission exists for this account under another partner (about $${(otherGross / 100).toFixed(2)} CAD gross on their ledger rows). Ask an admin to move or correct attribution.`;
          } else if (hasSetupMissingStripe) {
            mismatch_code = "MISSING_STRIPE_INVOICE_LINK";
            mismatch_detail =
              "Paid setup invoice is in Tavari but Stripe invoice ID was missing (common on older webhooks). Pull from invoices again after deploy, or ask an admin to attach the Stripe invoice id to the billing row.";
          } else if (subInvs.length === 0) {
            mismatch_code = "PAID_WITHOUT_SUBSCRIPTION_INVOICE";
            mismatch_detail =
              "Paid is inferred from Stripe subscription or plan fields, not a subscription_setup / subscription_recurring invoice in Tavari — there may be nothing for Pull to import yet.";
          } else {
            mismatch_code = "NO_ROW_FOR_YOU";
            mismatch_detail =
              "No commission row for your partner id yet. Pull from invoices should add rows when billing data allows.";
          }
        }
        return {
          business_id: b.id,
          name: b.name || null,
          email: b.email || null,
          sales_payment_complete: paidComplete,
          your_commission_cents: yourCommission,
          your_gross_cents: yourGross,
          your_ledger_row_count: mine.length,
          other_partner_ledger_rows: others.length,
          paid_subscription_invoice_count: subInvs.length,
          has_setup_invoice_missing_stripe: hasSetupMissingStripe,
          mismatch_code,
          mismatch_detail,
        };
      }),
    });
  } catch (e) {
    console.error("[sales-portal] me:", e);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

/**
 * Backfill affiliate_earnings from paid subscription invoices for every customer linked to this rep.
 * Idempotent; use when checkout attributed elsewhere or assignment happened after payment.
 */
router.post("/me/sync-commission-from-invoices", authenticateSalesPortal, async (req, res) => {
  try {
    const partnerGate = await loadSalesPartner(req.salesPartnerId);
    if (!partnerGate) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const { data: linked, error: lbErr } = await supabaseClient
      .from("businesses")
      .select("id")
      .eq("referred_by_partner_id", partnerGate.id)
      .is("deleted_at", null)
      .limit(200);

    if (lbErr) throw lbErr;

    const { backfillPhoneAgentAffiliateEarningsFromInvoices } = await import("../services/affiliateEarnings.js");
    const partnerRow = { id: partnerGate.id };
    let inserted = 0;
    let skipped = 0;
    let insertedFromStripe = 0;
    let insertedFromLocal = 0;
    const by_business = [];

    for (const b of linked || []) {
      const r = await backfillPhoneAgentAffiliateEarningsFromInvoices(b.id, partnerRow);
      inserted += r.inserted || 0;
      skipped += r.skipped || 0;
      insertedFromStripe += r.inserted_from_stripe_invoice || 0;
      insertedFromLocal += r.inserted_from_local_invoice || 0;
      if ((r.inserted || 0) > 0) {
        by_business.push({
          business_id: b.id,
          inserted: r.inserted,
          from_stripe_invoice: r.inserted_from_stripe_invoice || 0,
          from_local_invoice: r.inserted_from_local_invoice || 0,
        });
      }
    }

    await logSalesPortalAudit(
      partnerGate.id,
      "sync_commission_from_invoices",
      { inserted, skipped, accounts: (linked || []).length, insertedFromStripe, insertedFromLocal },
      clientIp(req),
    );

    res.json({
      ok: true,
      inserted,
      skipped,
      inserted_from_stripe_invoice: insertedFromStripe,
      inserted_from_local_invoice: insertedFromLocal,
      accounts_scanned: (linked || []).length,
      by_business,
    });
  } catch (e) {
    console.error("[sales-portal] sync-commission-from-invoices:", e);
    res.status(500).json({ error: "Could not sync commission ledger" });
  }
});

router.post("/onboard-customer", authenticateSalesPortal, async (req, res) => {
  try {
    const partner = await loadSalesPartner(req.salesPartnerId);
    if (!partner) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const {
      business_name: businessName,
      owner_email: ownerEmail,
      password,
      first_name,
      last_name,
      phone,
      public_phone_number,
      address,
      timezone,
      contact_email,
      terms_attested,
    } = req.body || {};

    if (!isTermsAttestedTrue(terms_attested)) {
      console.warn("[sales-portal] onboard-customer 400: TERMS_NOT_ATTESTED", {
        terms_attested,
        type: typeof terms_attested,
      });
      return res.status(400).json({
        error: "You must confirm that the customer agreed to the Terms of Service and Privacy Policy",
        code: "TERMS_NOT_ATTESTED",
      });
    }

    const email = String(ownerEmail || "")
      .trim()
      .toLowerCase();
    const nameTrim = String(businessName || "").trim();
    const pwd = password != null ? String(password) : "";
    if (!email || !nameTrim || !pwd) {
      console.warn("[sales-portal] onboard-customer 400: missing required fields");
      return res.status(400).json({ error: "Business name, owner email, and initial password are required" });
    }
    if (pwd.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    let moduleKeys = normalizeSalesOnboardModuleKeys(req.body?.module_keys ?? req.body?.moduleKeys);
    if (!moduleKeys.length) {
      const single = normalizeSalesOnboardModuleKey(req.body?.primary_module_key);
      if (single) moduleKeys = [single];
    }
    if (!moduleKeys.length) {
      return res.status(400).json({
        error: "Select at least one product or service for this customer.",
        code: "MODULES_REQUIRED",
      });
    }

    const pkgNorm = await validateAndNormalizePackageByModule(moduleKeys, req.body?.package_by_module);
    if (pkgNorm.error) {
      return res.status(400).json({
        error: pkgNorm.error,
        code: pkgNorm.code || "PACKAGE_VALIDATION",
      });
    }

    const phoneSan = sanitizeOnboardPhone(phone ?? public_phone_number);

    const ip = clientIp(req);
    let result;
    try {
      result = await signupBusinessAndOwner({
        email,
        password: pwd,
        name: nameTrim,
        phone: phoneSan.phone,
        public_phone_number: phoneSan.public_phone_number,
        address,
        first_name,
        last_name,
        timezone: timezone || "America/New_York",
        contact_email: contact_email || email,
        terms_accepted: true,
        termsAcceptedIp: ip,
        referred_by_partner_id: partner.id,
        sales_onboard_modules: moduleKeys,
        sales_onboard_primary_module: moduleKeys[0],
        sales_onboard_package_by_module: pkgNorm.value,
      });
    } catch (err) {
      if (err.code === "ACCOUNT_EXISTS") {
        return res.status(400).json({ error: err.message, code: "ACCOUNT_EXISTS" });
      }
      if (err.code === "TERMS_NOT_ACCEPTED" || err.code === "VALIDATION") {
        return res.status(400).json({ error: err.message });
      }
      if (err.code === "INVALID_PHONE") {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    await logSalesPortalAudit(
      partner.id,
      "onboard_customer",
      {
        business_id: result.business.id,
        owner_email: email,
        terms_attested: true,
        ...(phoneSan.skippedInvalid ? { phone_omitted_invalid: phoneSan.raw } : {}),
      },
      ip,
    );

    try {
      await supabaseClient.from("affiliate_events").insert({
        partner_id: partner.id,
        event_type: "lead",
        metadata: {
          source: "sales_portal_onboard",
          business_id: result.business.id,
          intended_modules: moduleKeys,
          package_by_module: pkgNorm.value,
        },
      });
    } catch (evErr) {
      console.warn("[sales-portal] affiliate_events lead:", evErr?.message);
    }

    trySendOnboardPaymentEmail({
      businessId: result.business.id,
      partnerId: partner.id,
      ownerEmail: result.user.email,
      clientIp: ip,
    }).catch((err) => console.error("[sales-portal] onboard payment email:", err?.message || err));

    res.status(201).json({
      success: true,
      business: {
        id: result.business.id,
        name: result.business.name,
        email: result.business.email,
        sales_onboard_primary_module: result.business.sales_onboard_primary_module || moduleKeys[0],
        sales_onboard_modules: result.business.sales_onboard_modules || moduleKeys,
        sales_onboard_package_by_module:
          result.business.sales_onboard_package_by_module || pkgNorm.value,
      },
      user: {
        id: result.user.id,
        email: result.user.email,
      },
      ...(phoneSan.skippedInvalid
        ? {
            warning:
              "Phone was not saved — use international format (e.g. +1 555 123 4567) or leave blank.",
          }
        : {}),
    });
  } catch (e) {
    console.error("[sales-portal] onboard-customer:", e);
    res.status(500).json({ error: "Failed to create customer account" });
  }
});

/**
 * Set which product/service this customer is using (or intends to). Same field as sales onboarding.
 * Clears when primary_module_key is null, "", or omitted with clear: true.
 */
router.patch("/customers/:businessId/primary-module", authenticateSalesPortal, async (req, res) => {
  try {
    const partner = await loadSalesPartner(req.salesPartnerId);
    if (!partner) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const businessId = String(req.params.businessId || "").trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(businessId)) {
      return res.status(400).json({ error: "Invalid business id" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    if (String(business.referred_by_partner_id || "") !== String(partner.id)) {
      return res.status(403).json({ error: "This customer is not assigned to you" });
    }

    const raw = req.body?.primary_module_key;
    const clear =
      req.body?.clear === true || raw === null || (typeof raw === "string" && raw.trim() === "");

    let moduleValue = null;
    if (!clear) {
      const k = normalizeSalesOnboardModuleKey(raw);
      if (!k) {
        return res.status(400).json({ error: "Select a valid product or service, or clear the field." });
      }
      moduleValue = k;
    }

    try {
      await Business.update(businessId, {
        sales_onboard_primary_module: moduleValue,
        sales_onboard_modules: moduleValue ? [moduleValue] : null,
      });
    } catch (upErr) {
      if (!isMissingSalesOnboardColumn(upErr)) throw upErr;
      try {
        await Business.update(businessId, { sales_onboard_primary_module: moduleValue });
      } catch (up2) {
        if (isMissingSalesOnboardColumn(up2)) {
          return res.status(503).json({
            error:
              "Database is missing sales onboard columns. Run migrations/add_businesses_sales_onboard_primary_module.sql and add_businesses_sales_onboard_modules.sql",
          });
        }
        throw up2;
      }
    }

    await logSalesPortalAudit(
      partner.id,
      "set_customer_primary_module",
      { business_id: businessId, sales_onboard_primary_module: moduleValue },
      clientIp(req),
    );

    res.json({
      success: true,
      business_id: businessId,
      sales_onboard_primary_module: moduleValue,
      sales_onboard_modules: moduleValue ? [moduleValue] : null,
    });
  } catch (e) {
    console.error("[sales-portal] patch primary-module:", e);
    res.status(500).json({ error: "Failed to update service" });
  }
});

/**
 * Replace full list of services for a customer (checkboxes). Empty array clears.
 */
router.patch("/customers/:businessId/modules", authenticateSalesPortal, async (req, res) => {
  try {
    const partner = await loadSalesPartner(req.salesPartnerId);
    if (!partner) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const businessId = String(req.params.businessId || "").trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(businessId)) {
      return res.status(400).json({ error: "Invalid business id" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    if (String(business.referred_by_partner_id || "") !== String(partner.id)) {
      return res.status(403).json({ error: "This customer is not assigned to you" });
    }

    const normalized = normalizeSalesOnboardModuleKeys(req.body?.module_keys ?? req.body?.moduleKeys);
    const primary = normalized.length ? normalized[0] : null;

    const pkgNorm = await validateAndNormalizePackageByModule(
      normalized,
      req.body?.package_by_module ?? {},
    );
    if (pkgNorm.error) {
      return res.status(400).json({
        error: pkgNorm.error,
        code: pkgNorm.code || "PACKAGE_VALIDATION",
      });
    }

    const patch = {
      sales_onboard_modules: normalized.length ? normalized : null,
      sales_onboard_primary_module: primary,
      sales_onboard_package_by_module: pkgNorm.value,
    };

    try {
      await Business.update(businessId, patch);
    } catch (upErr) {
      if (!isMissingSalesOnboardColumn(upErr)) throw upErr;
      try {
        const noPkg = { ...patch };
        delete noPkg.sales_onboard_package_by_module;
        await Business.update(businessId, noPkg);
      } catch (up2) {
        if (!isMissingSalesOnboardColumn(up2)) throw up2;
        try {
          await Business.update(businessId, {
            sales_onboard_primary_module: primary,
          });
        } catch (up3) {
          if (isMissingSalesOnboardColumn(up3)) {
            return res.status(503).json({
              error:
                "Database is missing sales onboard columns. Run migrations for sales_onboard_* on businesses.",
            });
          }
          throw up3;
        }
      }
    }

    await logSalesPortalAudit(
      partner.id,
      "set_customer_modules",
      {
        business_id: businessId,
        sales_onboard_modules: normalized,
        sales_onboard_package_by_module: pkgNorm.value,
      },
      clientIp(req),
    );

    res.json({
      success: true,
      business_id: businessId,
      sales_onboard_modules: normalized.length ? normalized : null,
      sales_onboard_primary_module: primary,
      sales_onboard_package_by_module: pkgNorm.value,
    });
  } catch (e) {
    console.error("[sales-portal] patch modules:", e);
    res.status(500).json({ error: "Failed to update services" });
  }
});

function isMissingSalesOnboardColumn(err) {
  const msg = (err?.message || "").toLowerCase();
  return (
    err?.code === "42703" ||
    msg.includes("sales_onboard_primary_module") ||
    msg.includes("sales_onboard_modules") ||
    msg.includes("sales_onboard_package_by_module")
  );
}

router.post("/checkout", authenticateSalesPortal, async (req, res) => {
  try {
    const partner = await loadSalesPartner(req.salesPartnerId);
    if (!partner) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const businessId = String(req.body?.business_id || "").trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!businessId || !uuidRegex.test(businessId)) {
      return res.status(400).json({ error: "Valid business_id is required" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    if (String(business.referred_by_partner_id || "") !== String(partner.id)) {
      return res.status(403).json({ error: "This customer is not assigned to you" });
    }

    let packageId = req.body?.packageId != null ? String(req.body.packageId).trim() : "";
    if (req.body?.use_saved_package === true || req.body?.use_saved_package === "true") {
      packageId = resolvePrimarySalesPackageId(business) || "";
    }
    if (!packageId || !uuidRegex.test(packageId)) {
      return res.status(400).json({
        error:
          "Valid packageId is required, or set use_saved_package with a saved plan on the customer record.",
      });
    }

    const result = await createSalesCheckoutSession({
      businessId,
      packageId,
      partner,
      clientIp: clientIp(req),
      auditAction: "create_checkout",
    });

    if (result.skipPayment) {
      return res.json({
        success: true,
        skipPayment: true,
        message: result.message,
        packageId: result.packageId,
        packageName: result.packageName,
      });
    }

    res.json({
      url: result.url,
      sessionId: result.sessionId,
      packageId: result.packageId,
      packageName: result.packageName,
    });
  } catch (e) {
    console.error("[sales-portal] checkout:", e);
    const status = typeof e.statusCode === "number" ? e.statusCode : 500;
    res.status(status).json({ error: e.message || "Failed to create checkout session" });
  }
});

router.post("/send-payment-email", authenticateSalesPortal, async (req, res) => {
  try {
    const partner = await loadSalesPartner(req.salesPartnerId);
    if (!partner) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const businessId = String(req.body?.business_id || "").trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(businessId)) {
      return res.status(400).json({ error: "Valid business_id is required" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    if (String(business.referred_by_partner_id || "") !== String(partner.id)) {
      return res.status(403).json({ error: "This customer is not assigned to you" });
    }

    const users = await User.findByBusinessId(businessId);
    const owner = (users || []).find((u) => u.role === "owner") || (users || [])[0];
    const ownerEmail = owner?.email || business.email;

    const out = await trySendOnboardPaymentEmail({
      businessId,
      partnerId: partner.id,
      ownerEmail,
      clientIp: clientIp(req),
    });

    if (!out.sent) {
      return res.status(400).json({
        error:
          out.reason === "no_stripe"
            ? "Stripe is not configured — use manual checkout or assign package in admin."
            : out.reason === "no_package"
              ? "No saved plan for this customer — set services and plans first, or pick a package from checkout."
              : "Could not send payment email.",
        code: out.reason || "SEND_FAILED",
      });
    }

    res.json({ success: true, message: "Payment link emailed to the account owner." });
  } catch (e) {
    console.error("[sales-portal] send-payment-email:", e);
    res.status(500).json({ error: "Failed to send email" });
  }
});

router.post("/send-invite", authenticateSalesPortal, async (req, res) => {
  try {
    const partner = await loadSalesPartner(req.salesPartnerId);
    if (!partner) {
      return res.status(403).json({ error: "Sales portal access disabled" });
    }

    const businessId = String(req.body?.business_id || "").trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!businessId || !uuidRegex.test(businessId)) {
      return res.status(400).json({ error: "Valid business_id is required" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    if (String(business.referred_by_partner_id || "") !== String(partner.id)) {
      return res.status(403).json({ error: "This customer is not assigned to you" });
    }

    const users = await User.findByBusinessId(businessId);
    const owner = (users || []).find((u) => u.role === "owner") || (users || [])[0];
    if (!owner?.email) {
      return res.status(400).json({ error: "No owner user found for this business" });
    }

    await issuePasswordResetCodeAndEmail(owner.email);
    await logSalesPortalAudit(partner.id, "send_invite_reset_email", { business_id: businessId }, clientIp(req));

    res.json({
      success: true,
      message: "If that account exists, we emailed a password reset code to the owner.",
    });
  } catch (e) {
    console.error("[sales-portal] send-invite:", e);
    res.status(500).json({ error: "Failed to send invite email" });
  }
});

export default router;
