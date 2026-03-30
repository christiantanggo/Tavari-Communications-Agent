import crypto from "crypto";
import jwt from "jsonwebtoken";
import { supabaseClient } from "../config/database.js";
import { sendEmail } from "./notifications.js";
import { getFrontendPublicBaseUrl } from "../config/public-urls.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const AFFILIATE_JWT_EXPIRES = process.env.AFFILIATE_JWT_EXPIRES_IN || "90d";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PORTAL_TOKEN_BYTES = 32;
const PORTAL_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

async function allocateAffiliateCode() {
  for (let i = 0; i < 24; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    const { data } = await supabaseClient.from("affiliate_partners").select("id").eq("affiliate_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Could not allocate affiliate code");
}

/**
 * Create a one-time portal login token; returns { rawToken, expiresAt }.
 */
export async function createPortalLoginToken(partnerId) {
  const raw = crypto.randomBytes(PORTAL_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_MS).toISOString();
  const { error } = await supabaseClient.from("affiliate_portal_tokens").insert({
    partner_id: partnerId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { rawToken: raw, expiresAt };
}

export function issueAffiliateSessionJwt(partnerId) {
  return jwt.sign({ scope: "affiliate", affiliatePartnerId: partnerId }, JWT_SECRET, {
    expiresIn: AFFILIATE_JWT_EXPIRES,
  });
}

/**
 * Validate one-time token, mark used, return partner id.
 */
export async function consumePortalLoginToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const { data: row, error } = await supabaseClient
    .from("affiliate_portal_tokens")
    .select("id, partner_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!row) return { ok: false, reason: "invalid_or_used" };
  if (new Date(row.expires_at) < new Date()) return { ok: false, reason: "expired" };

  if (row.used_at) {
    const usedMs = new Date(row.used_at).getTime();
    const replayWindowMs = 5 * 60 * 1000;
    if (Date.now() - usedMs < replayWindowMs) {
      return { ok: true, partnerId: row.partner_id };
    }
    return { ok: false, reason: "invalid_or_used" };
  }

  await supabaseClient.from("affiliate_portal_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);

  return { ok: true, partnerId: row.partner_id };
}

export async function sendPartnerApprovalEmail({ toEmail, name, rawPortalToken, affiliateCode }) {
  const base = getFrontendPublicBaseUrl();
  const portalUrl = `${base}/affiliate/portal?t=${encodeURIComponent(rawPortalToken)}`;
  const trackingBase = `${base}/affiliate/go/${encodeURIComponent(affiliateCode)}`;
  const landingBase = `${base}/r/${encodeURIComponent(affiliateCode)}`;
  const joinPhoneBase = `${base}/join/phone-agent/${encodeURIComponent(affiliateCode)}`;
  const safeName = escapeHtml(name);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #1d4ed8;">You're approved — welcome to the Tavari partner program</h2>
      <p>Hi ${safeName},</p>
      <p>Your partner application has been approved. Use the button below to open your partner dashboard (link expires in 14 days; you can request a new link anytime from the same page).</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(portalUrl)}" style="background: #2563eb; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 8px; display: inline-block;">Open partner dashboard</a>
      </p>
      <p style="font-size: 14px; color: #374151;"><strong>Your partner code:</strong> <code style="background:#f3f4f6;padding:2px 8px;border-radius:4px;">${escapeHtml(affiliateCode)}</code></p>
      <p style="font-size: 14px; color: #374151;"><strong>Your tracking link</strong> (short link; records a click, then opens your customer-facing referral page with product links):</p>
      <p style="font-size: 13px; word-break: break-all; background:#f9fafb;padding:12px;border-radius:8px;"><a href="${escapeHtml(trackingBase)}">${escapeHtml(trackingBase)}</a></p>
      <p style="font-size: 14px; color: #374151; margin-top: 16px;"><strong>Your partner landing page</strong> (share this too—same attribution; product buttons include your code automatically):</p>
      <p style="font-size: 13px; word-break: break-all; background:#f9fafb;padding:12px;border-radius:8px;"><a href="${escapeHtml(landingBase)}">${escapeHtml(landingBase)}</a></p>
      <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">If the button does not work, paste this URL into your browser:<br/>${escapeHtml(portalUrl)}</p>
    </div>
  `;

  const text = `Hi ${name},

Your Tavari partner application was approved.

Open your partner dashboard (one-time link, 14 days):
${portalUrl}

Your partner code: ${affiliateCode}

Your tracking link (records a click, then opens your landing page):
${trackingBase}

AI Phone full page (demo + signup + pay on one page):
${joinPhoneBase}

Short hub (/r/…):
${landingBase}

`;

  await sendEmail(toEmail, "You're approved — Tavari partner program", text, html, "Tavari Partners", null);
}

export async function sendPartnerMagicLinkEmail({ toEmail, name, rawPortalToken }) {
  const base = getFrontendPublicBaseUrl();
  const portalUrl = `${base}/affiliate/portal?t=${encodeURIComponent(rawPortalToken)}`;
  const safeName = escapeHtml(name || "there");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #1d4ed8;">Your Tavari partner dashboard link</h2>
      <p>Hi ${safeName},</p>
      <p>Click below to sign in to your partner dashboard. This link expires in 14 days and can only be used once.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(portalUrl)}" style="background: #2563eb; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 8px; display: inline-block;">Open partner dashboard</a>
      </p>
      <p style="color: #6b7280; font-size: 13px;">${escapeHtml(portalUrl)}</p>
    </div>
  `;

  const text = `Hi ${name || "there"},

Sign in to your Tavari partner dashboard:
${portalUrl}
`;

  await sendEmail(toEmail, "Partner dashboard sign-in link", text, html, "Tavari Partners", null);
}

export async function onApplicationApproved(application) {
  const appId = application.id;
  const email = (application.email || "").trim().toLowerCase();
  const displayName = (application.name || "").trim() || "Partner";

  const { data: existing } = await supabaseClient.from("affiliate_partners").select("*").eq("application_id", appId).maybeSingle();

  let partner = existing;
  if (!partner) {
    const code = await allocateAffiliateCode();
    const { data: inserted, error: insErr } = await supabaseClient
      .from("affiliate_partners")
      .insert({
        application_id: appId,
        affiliate_code: code,
        email,
        display_name: displayName,
        active: true,
      })
      .select()
      .single();
    if (insErr) throw insErr;
    partner = inserted;
  } else {
    const { data: updated, error: upErr } = await supabaseClient
      .from("affiliate_partners")
      .update({
        active: true,
        email,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id)
      .select()
      .single();
    if (upErr) throw upErr;
    partner = updated;
  }

  const { rawToken } = await createPortalLoginToken(partner.id);
  await sendPartnerApprovalEmail({
    toEmail: application.email,
    name: displayName,
    rawPortalToken: rawToken,
    affiliateCode: partner.affiliate_code,
  });

  return partner;
}

/**
 * Send the same "you're approved" email again with a fresh one-time portal link (admin support).
 */
export async function resendPartnerApprovalEmail(applicationId) {
  const { data: app, error: appErr } = await supabaseClient
    .from("affiliate_applications")
    .select("id, status, email, name")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr) throw appErr;
  if (!app) {
    const err = new Error("Application not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (app.status !== "approved") {
    const err = new Error("Application is not approved");
    err.code = "NOT_APPROVED";
    throw err;
  }

  const { data: partner, error: pErr } = await supabaseClient
    .from("affiliate_partners")
    .select("id, email, display_name, affiliate_code, active")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!partner) {
    const err = new Error("No partner record for this application; approve it once to create the partner.");
    err.code = "NO_PARTNER";
    throw err;
  }
  if (!partner.active) {
    const err = new Error("Partner account is inactive");
    err.code = "INACTIVE";
    throw err;
  }

  const { rawToken } = await createPortalLoginToken(partner.id);
  await sendPartnerApprovalEmail({
    toEmail: partner.email,
    name: partner.display_name,
    rawPortalToken: rawToken,
    affiliateCode: partner.affiliate_code,
  });

  return { partnerId: partner.id };
}

export async function onApplicationRejected(applicationId) {
  const { data: partner } = await supabaseClient.from("affiliate_partners").select("id").eq("application_id", applicationId).maybeSingle();
  if (!partner) return;
  await supabaseClient
    .from("affiliate_partners")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", partner.id);
}

export async function logAffiliateClickByCode(affiliateCode) {
  const code = String(affiliateCode || "").trim().toUpperCase();
  if (!code || code.length > 16) return { ok: false, reason: "invalid_code" };

  const { data: partner, error } = await supabaseClient
    .from("affiliate_partners")
    .select("id, active")
    .eq("affiliate_code", code)
    .maybeSingle();

  if (error) throw error;
  if (!partner || !partner.active) return { ok: false, reason: "not_found" };

  await supabaseClient.from("affiliate_events").insert({
    partner_id: partner.id,
    event_type: "click",
    metadata: {},
  });

  return { ok: true, partnerId: partner.id, code };
}

export async function requestPartnerMagicLink(emailRaw) {
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  const { data: partner, error } = await supabaseClient
    .from("affiliate_partners")
    .select("id, email, display_name, active")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  if (!partner || !partner.active) {
    return { ok: true, silent: true };
  }

  const { rawToken } = await createPortalLoginToken(partner.id);
  await sendPartnerMagicLinkEmail({
    toEmail: partner.email,
    name: partner.display_name,
    rawPortalToken: rawToken,
  });

  return { ok: true };
}

const AFFILIATE_CODE_RE = /^[A-Z0-9]{4,16}$/;

export function normalizeAffiliateCode(raw) {
  const code = String(raw || "")
    .trim()
    .toUpperCase();
  if (!AFFILIATE_CODE_RE.test(code)) return null;
  return code;
}

/**
 * First subscription payment from Checkout — ledger row + refund hold + module rates.
 */
export async function recordAffiliateStripeCheckoutCompleted(session, businessId) {
  let code = normalizeAffiliateCode(session.metadata?.affiliate_code);
  if (!code && session.subscription && typeof session.subscription === "object") {
    code = normalizeAffiliateCode(session.subscription.metadata?.affiliate_code);
  }
  if (!code) return { recorded: false, reason: "no_code" };

  const { data: partner, error: pErr } = await supabaseClient
    .from("affiliate_partners")
    .select("id, commission_rate_percent")
    .eq("affiliate_code", code)
    .eq("active", true)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!partner) return { recorded: false, reason: "invalid_partner" };

  const { recordAffiliateEarningStripeFirstSubscription } = await import("./affiliateEarnings.js");
  return recordAffiliateEarningStripeFirstSubscription(session, businessId, partner);
}

/**
 * Recurring subscription charge (not the initial checkout invoice).
 */
export async function recordAffiliateStripeSubscriptionRenewal(invoice, subscription, businessId) {
  const code = normalizeAffiliateCode(subscription?.metadata?.affiliate_code);
  if (!code) return { recorded: false, reason: "no_code" };

  const { data: partner, error: pErr } = await supabaseClient
    .from("affiliate_partners")
    .select("id, commission_rate_percent")
    .eq("affiliate_code", code)
    .eq("active", true)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!partner) return { recorded: false, reason: "invalid_partner" };

  const { recordAffiliateEarningStripeRenewal } = await import("./affiliateEarnings.js");
  return recordAffiliateEarningStripeRenewal(invoice, subscription, businessId, partner);
}

export async function listPartnerEvents(partnerId, { limit = 100, eventType = null } = {}) {
  let q = supabaseClient
    .from("affiliate_events")
    .select("id, event_type, amount_cents, currency, metadata, created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 100, 500));

  if (eventType) {
    q = q.eq("event_type", eventType);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
