import jwt from "jsonwebtoken";
import { Business } from "../models/Business.js";
import { PricingPackage } from "../models/PricingPackage.js";
import { StripeService } from "./stripe.js";
import { getFrontendPublicBaseUrl } from "../config/public-urls.js";
import { normalizeAffiliateCode } from "./affiliateProgram.js";
import { buildStripeCheckoutReturnUrls } from "./billingCheckoutReturnUrls.js";
import { logSalesPortalAudit } from "./salesPortalAudit.js";
import { sendEmail } from "./notifications.js";
import { supabaseClient } from "../config/database.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const INVITE_EXPIRES = process.env.SALES_CHECKOUT_INVITE_EXPIRES_IN || "7d";

/** Primary module key for checkout (first in array or legacy column). */
export function primarySalesModuleKey(business) {
  const mods = business?.sales_onboard_modules;
  if (Array.isArray(mods) && mods.length) return String(mods[0]).trim();
  if (business?.sales_onboard_primary_module) return String(business.sales_onboard_primary_module).trim();
  return null;
}

/**
 * Package UUID the rep chose for the primary checkout module (email link & default rep checkout).
 */
export function resolvePrimarySalesPackageId(business) {
  const mk = primarySalesModuleKey(business);
  if (!mk) return null;
  const map = business?.sales_onboard_package_by_module;
  if (!map || typeof map !== "object" || Array.isArray(map)) return null;
  const id = map[mk];
  return id != null && String(id).trim() ? String(id).trim() : null;
}

export function issueSalesCheckoutInviteToken(businessId, packageId, partnerId) {
  return jwt.sign(
    { scope: "sales_checkout_invite", businessId, packageId, partnerId: String(partnerId) },
    JWT_SECRET,
    { expiresIn: INVITE_EXPIRES },
  );
}

export function verifySalesCheckoutInviteToken(raw) {
  if (!raw || typeof raw !== "string" || raw.length > 2000) return null;
  try {
    const p = jwt.verify(raw, JWT_SECRET);
    if (p.scope !== "sales_checkout_invite" || !p.businessId || !p.packageId || p.partnerId == null) {
      return null;
    }
    return {
      businessId: String(p.businessId),
      packageId: String(p.packageId),
      partnerId: String(p.partnerId),
    };
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendSalesPaymentInviteEmail(toEmail, { businessName, paymentPageUrl, packageName }) {
  const subject = "Complete your Tavari subscription";
  const safeName = escapeHtml(businessName || "your business");
  const safePkg = escapeHtml(packageName || "your selected plan");
  const bodyText = `Hello,

Your Tavari account for ${businessName || "your business"} is ready. Your sales representative has already selected this plan for you: ${packageName || "selected plan"}.

Complete payment to activate your subscription (no plan selection needed):
${paymentPageUrl}

This secure link expires in several days. If it stops working, ask your rep to send a new payment link.

Thank you,
The Tavari Team`;

  const bodyHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d9488;">Complete your subscription</h2>
      <p>Hello,</p>
      <p>Your Tavari account for <strong>${safeName}</strong> is ready. Your plan is already set: <strong>${safePkg}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(paymentPageUrl)}" style="background-color: #0d9488; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Pay securely with Stripe</a>
      </p>
      <p style="color: #666; font-size: 14px;">You will not be asked to pick a different plan — only to enter payment details.</p>
      <p style="color: #666; font-size: 14px;">If this link expires, contact your sales representative for a new payment link.</p>
      <p>Thank you,<br>The Tavari Team</p>
    </div>`;

  await sendEmail(String(toEmail).trim(), subject, bodyText, bodyHtml, "Tavari");
}

async function loadPartnerForCheckout(partnerId) {
  const { data, error } = await supabaseClient
    .from("affiliate_partners")
    .select("id, affiliate_code, active, is_sales_rep")
    .eq("id", partnerId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.active || !data.is_sales_rep) return null;
  return data;
}

/**
 * Create Stripe checkout (or skip-payment assign) for a referred business. Used by sales portal and email invite redeem.
 */
export async function createSalesCheckoutSession({
  businessId,
  packageId,
  partner,
  clientIp,
  auditAction = "create_checkout",
}) {
  const business = await Business.findById(businessId);
  if (!business) {
    const e = new Error("Business not found");
    e.statusCode = 404;
    throw e;
  }
  if (String(business.referred_by_partner_id || "") !== String(partner.id)) {
    const e = new Error("This customer is not assigned to you");
    e.statusCode = 403;
    throw e;
  }

  const pkg = await PricingPackage.findById(packageId);
  if (!pkg) {
    const e = new Error("Package not found");
    e.statusCode = 404;
    throw e;
  }

  const isOnSale = PricingPackage.isSaleActive(pkg);
  const saleAvailable = PricingPackage.isSaleAvailable(pkg);
  if (isOnSale && !saleAvailable) {
    const e = new Error("This sale has ended or sold out");
    e.statusCode = 400;
    throw e;
  }

  const priceToCharge = isOnSale && pkg.sale_price ? pkg.sale_price : pkg.monthly_price;
  let salePriceExpiresAt = null;
  if (isOnSale && pkg.sale_duration_months) {
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + pkg.sale_duration_months);
    salePriceExpiresAt = expirationDate.toISOString().split("T")[0];
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    await Business.update(businessId, {
      package_id: packageId,
      plan_tier: pkg.name.toLowerCase(),
      usage_limit_minutes: pkg.minutes_included,
    });
    if (isOnSale) {
      await PricingPackage.incrementSaleCount(packageId);
    }
    await logSalesPortalAudit(partner.id, `${auditAction}_skip_payment`, { business_id: businessId, package_id: packageId }, clientIp);
    return {
      skipPayment: true,
      message: "Stripe is not configured; package assigned locally.",
      packageId,
      packageName: pkg.name,
    };
  }

  const feOrigin = getFrontendPublicBaseUrl().replace(/\/$/, "");
  const code = normalizeAffiliateCode(partner.affiliate_code);
  const pkgModule = String(pkg.module_key || "").trim() || "phone-agent";
  const { successUrl, cancelUrl } = buildStripeCheckoutReturnUrls(feOrigin, packageId, pkgModule, {
    context: "sales_invite",
    salesRepCode: code,
  });

  const checkoutSession = await StripeService.createCheckoutSession(
    businessId,
    packageId,
    priceToCharge,
    pkg.name,
    successUrl,
    cancelUrl,
    isOnSale ? pkg.sale_name : null,
    salePriceExpiresAt,
    code || null,
  );

  await logSalesPortalAudit(
    partner.id,
    auditAction,
    { business_id: businessId, package_id: packageId, stripe_session_id: checkoutSession.sessionId },
    clientIp,
  );

  return {
    url: checkoutSession.url,
    sessionId: checkoutSession.sessionId,
    packageId,
    packageName: pkg.name,
  };
}

/**
 * Public redeem: JWT must match business referral; creates checkout session for the fixed package.
 */
export async function redeemSalesCheckoutInvite(rawToken, clientIp) {
  const payload = verifySalesCheckoutInviteToken(rawToken);
  if (!payload) {
    return { error: "Invalid or expired payment link.", code: "INVALID_TOKEN" };
  }

  const business = await Business.findById(payload.businessId);
  if (!business) {
    return { error: "Account not found.", code: "NOT_FOUND" };
  }
  if (String(business.referred_by_partner_id || "") !== String(payload.partnerId)) {
    return { error: "This payment link is no longer valid.", code: "REFERRAL_MISMATCH" };
  }

  const partner = await loadPartnerForCheckout(payload.partnerId);
  if (!partner) {
    return { error: "This payment link is no longer valid.", code: "PARTNER_INACTIVE" };
  }

  const expectedPkg = resolvePrimarySalesPackageId(business);
  if (expectedPkg && expectedPkg !== payload.packageId) {
    return {
      error: "This link is for an older plan selection. Ask your rep to send a new payment link.",
      code: "PACKAGE_STALE",
    };
  }

  if (business.package_id && String(business.package_id) === String(payload.packageId)) {
    return {
      alreadyPaid: true,
      message: "This plan is already active on your account. Sign in to continue setup.",
    };
  }

  const pkg = await PricingPackage.findById(payload.packageId);
  if (!pkg || !pkg.is_active) {
    return { error: "This plan is no longer available. Ask your rep for an updated link.", code: "PACKAGE_INACTIVE" };
  }

  try {
    const result = await createSalesCheckoutSession({
      businessId: payload.businessId,
      packageId: payload.packageId,
      partner,
      clientIp,
      auditAction: "redeem_checkout_invite",
    });
    return result;
  } catch (e) {
    const status = e.statusCode || 500;
    return { error: e.message || "Could not start checkout", code: "CHECKOUT_FAILED", status };
  }
}

export async function trySendOnboardPaymentEmail({ businessId, partnerId, ownerEmail, clientIp }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("[salesCheckoutInvite] Stripe not configured; skipping payment invite email.");
    return { sent: false, reason: "no_stripe" };
  }

  const business = await Business.findById(businessId);
  if (!business) return { sent: false, reason: "no_business" };

  const packageId = resolvePrimarySalesPackageId(business);
  if (!packageId) {
    console.warn("[salesCheckoutInvite] No primary package on business; skipping payment invite email.");
    return { sent: false, reason: "no_package" };
  }

  const pkg = await PricingPackage.findById(packageId);
  if (!pkg) return { sent: false, reason: "package_missing" };

  const feOrigin = getFrontendPublicBaseUrl().replace(/\/$/, "");
  const token = issueSalesCheckoutInviteToken(businessId, packageId, partnerId);
  const paymentPageUrl = `${feOrigin}/sales/complete-payment?t=${encodeURIComponent(token)}`;

  const to = String(ownerEmail || business.email || "").trim().toLowerCase();
  if (!to) return { sent: false, reason: "no_email" };

  await sendSalesPaymentInviteEmail(to, {
    businessName: business.name,
    paymentPageUrl,
    packageName: pkg.name,
  });

  await logSalesPortalAudit(
    partnerId,
    "send_payment_invite_email",
    { business_id: businessId, package_id: packageId },
    clientIp,
  );

  return { sent: true };
}
