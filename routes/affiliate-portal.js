import express from "express";
import { authenticateAffiliatePortal } from "../middleware/affiliatePortalAuth.js";
import {
  consumePortalLoginToken,
  issueAffiliateSessionJwt,
  logAffiliateClickByCode,
  normalizeAffiliateCode,
  requestPartnerMagicLink,
} from "../services/affiliateProgram.js";
import { supabaseClient } from "../config/database.js";
import { getFrontendPublicBaseUrl } from "../config/public-urls.js";

const router = express.Router();
router.use(express.json());

router.post("/exchange", async (req, res) => {
  try {
    const raw = String(req.body?.token || "").trim();
    if (!raw || raw.length > 200) {
      return res.status(400).json({ error: "Invalid token" });
    }

    const result = await consumePortalLoginToken(raw);
    if (!result.ok) {
      return res.status(400).json({ error: "Invalid, expired, or already used link" });
    }

    const { data: partner, error } = await supabaseClient
      .from("affiliate_partners")
      .select("id, affiliate_code, display_name, email, commission_rate_percent, active")
      .eq("id", result.partnerId)
      .single();

    if (error) throw error;
    if (!partner?.active) {
      return res.status(403).json({ error: "Partner account is inactive" });
    }

    const accessToken = issueAffiliateSessionJwt(partner.id);
    res.json({
      accessToken,
      partner: {
        id: partner.id,
        affiliate_code: partner.affiliate_code,
        display_name: partner.display_name,
        email: partner.email,
        commission_rate_percent: partner.commission_rate_percent,
      },
    });
  } catch (e) {
    console.error("[affiliate-portal] exchange:", e);
    res.status(500).json({ error: "Could not sign you in" });
  }
});

/**
 * Public JSON for partner landing pages (no auth). Active partners only.
 */
router.get("/public-partner/:code", async (req, res) => {
  try {
    const code = normalizeAffiliateCode(req.params.code);
    if (!code) {
      return res.status(400).json({ error: "Invalid code" });
    }

    const { data: partner, error } = await supabaseClient
      .from("affiliate_partners")
      .select("affiliate_code, display_name")
      .eq("affiliate_code", code)
      .eq("active", true)
      .maybeSingle();

    if (error) throw error;
    if (!partner) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({
      affiliate_code: partner.affiliate_code,
      display_name: partner.display_name || partner.affiliate_code,
    });
  } catch (e) {
    console.error("[affiliate-portal] public-partner:", e);
    res.status(500).json({ error: "Failed to load partner" });
  }
});

router.post("/request-link", async (req, res) => {
  try {
    const email = req.body?.email;
    await requestPartnerMagicLink(email);
    res.json({
      success: true,
      message: "If we found an active partner account for that email, we sent a sign-in link.",
    });
  } catch (e) {
    console.error("[affiliate-portal] request-link:", e);
    res.status(500).json({ error: "Could not process request" });
  }
});

router.get("/me", authenticateAffiliatePortal, async (req, res) => {
  try {
    const { promoteAccruingAffiliateEarnings, sumPartnerCommissionByStatus, listPartnerEarnings } = await import(
      "../services/affiliateEarnings.js"
    );
    const {
      getAffiliateGlobalSettings,
      resolveCommissionRules,
      AFFILIATE_MODULE_PHONE,
      AFFILIATE_MODULE_DELIVERY,
    } = await import("../services/affiliateCommissionSettings.js");

    await promoteAccruingAffiliateEarnings();

    const { data: partner, error: pErr } = await supabaseClient
      .from("affiliate_partners")
      .select(
        "id, affiliate_code, display_name, email, commission_rate_percent, active, created_at, delivery_attributed_paid_count",
      )
      .eq("id", req.affiliatePartnerId)
      .single();

    if (pErr) throw pErr;
    if (!partner?.active) {
      return res.status(403).json({ error: "Account inactive" });
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

    const [programPhone, programDelivery, effectivePhone, effectiveDelivery] = await Promise.all([
      resolveCommissionRules(AFFILIATE_MODULE_PHONE, { partnerCommissionOverride: null }),
      resolveCommissionRules(AFFILIATE_MODULE_DELIVERY, { partnerCommissionOverride: null }),
      resolveCommissionRules(AFFILIATE_MODULE_PHONE, {
        partnerCommissionOverride: partner.commission_rate_percent,
      }),
      resolveCommissionRules(AFFILIATE_MODULE_DELIVERY, {
        partnerCommissionOverride: partner.commission_rate_percent,
      }),
    ]);

    let purchases = [];
    try {
      const rows = await listPartnerEarnings(partner.id, { limit: 50 });
      purchases = (rows || []).map((r) => ({
        id: r.id,
        created_at: r.created_at || r.payment_received_at,
        amount_cents: r.gross_amount_cents,
        commission_cents: r.commission_cents,
        currency: r.currency,
        status: r.status,
        refund_hold_until: r.refund_hold_until,
        module_key: r.module_key,
        earning_type: r.earning_type,
        source: r.metadata?.source || null,
        stripe_checkout_session_id: r.stripe_checkout_session_id || r.metadata?.stripe_checkout_session_id || null,
        stripe_invoice_id: r.stripe_invoice_id || r.metadata?.stripe_invoice_id || null,
      }));
    } catch (_) {
      purchases = [];
    }

    const base = getFrontendPublicBaseUrl();
    res.json({
      partner,
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
      commission_policy: {
        payout_minimum_cents: Number(globalSettings.payout_minimum_cents),
        refund_hold_days_default: Number(globalSettings.refund_hold_days),
        delivery_paid_checkouts_attributed: partner.delivery_attributed_paid_count || 0,
        /** Tavari-set % on gross when present; actual payouts use this instead of program % below. */
        partner_commission_override_percent:
          partner.commission_rate_percent != null && !Number.isNaN(Number(partner.commission_rate_percent))
            ? Number(partner.commission_rate_percent)
            : null,
        /** Percentages used for your ledger (after any partner override). */
        effective_by_module: [
          {
            module_key: AFFILIATE_MODULE_PHONE,
            first_sale_commission_percent: effectivePhone.first_sale_commission_percent,
            recurring_commission_percent: effectivePhone.recurring_commission_percent,
          },
          {
            module_key: AFFILIATE_MODULE_DELIVERY,
            first_sale_commission_percent: effectiveDelivery.first_sale_commission_percent,
            recurring_commission_percent: effectiveDelivery.recurring_commission_percent,
          },
        ],
        /** Same global/module rules as Admin → Affiliate program → Commission & payout (program defaults). */
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
            delivery_min_paid_sales_before_payout:
              programDelivery.delivery_min_paid_sales_before_payout,
            recurring_limit_mode: programDelivery.recurring_limit_mode,
            recurring_limit_months: programDelivery.recurring_limit_months,
            recurring_limit_transactions: programDelivery.recurring_limit_transactions,
          },
        ],
      },
      tracking_link: `${base}/affiliate/go/${partner.affiliate_code}`,
      landing_page_url: `${base}/r/${partner.affiliate_code}`,
      join_urls: {
        phone_agent: `${base}/join/phone-agent/${partner.affiliate_code}`,
      },
      purchases,
    });
  } catch (e) {
    console.error("[affiliate-portal] me:", e);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.post("/track/click", async (req, res) => {
  try {
    const code = req.body?.affiliate_code || req.body?.code;
    const result = await logAffiliateClickByCode(code);
    if (!result.ok) {
      return res.status(400).json({ error: "Invalid or inactive partner code" });
    }
    res.json({ success: true });
  } catch (e) {
    console.error("[affiliate-portal] track click:", e);
    res.status(500).json({ error: "Failed to record click" });
  }
});

export default router;
