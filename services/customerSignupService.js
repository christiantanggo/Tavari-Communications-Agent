import { Business } from "../models/Business.js";
import { User } from "../models/User.js";
import { hashPassword, generateToken } from "../utils/auth.js";
import { supabaseClient } from "../config/database.js";
import { formatPhoneNumberE164, validatePhoneNumber } from "../utils/phoneFormatter.js";

const TERMS_VERSION = "2025-12-27";

function isMissingColumnError(error) {
  const msg = (error?.message || "").toLowerCase();
  return msg.includes("column") || msg.includes("does not exist") || error?.code === "42703";
}

const SALES_ONBOARD_OPTIONAL_COLS = [
  "sales_onboard_package_by_module",
  "sales_onboard_modules",
  "sales_onboard_primary_module",
];

async function updateBusinessWithSalesOnboardColumns(businessId, fullPatch) {
  const patch = { ...fullPatch };
  for (;;) {
    try {
      await Business.update(businessId, patch);
      return;
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;
      let stripped = false;
      for (const col of SALES_ONBOARD_OPTIONAL_COLS) {
        if (Object.prototype.hasOwnProperty.call(patch, col)) {
          delete patch[col];
          stripped = true;
          console.warn(
            `[customerSignupService] Retrying business update without ${col} (run sales onboard migrations).`,
          );
          break;
        }
      }
      if (!stripped) throw e;
    }
  }
}

/**
 * Shared customer signup: business + owner user + session token.
 * @param {object} opts
 * @param {string} opts.email
 * @param {string} opts.password
 * @param {string} opts.name - business name
 * @param {string} [opts.phone]
 * @param {string} [opts.public_phone_number]
 * @param {string} [opts.address]
 * @param {string} [opts.first_name]
 * @param {string} [opts.last_name]
 * @param {string} [opts.timezone]
 * @param {string} [opts.contact_email]
 * @param {boolean} opts.terms_accepted
 * @param {string} [opts.termsAcceptedIp]
 * @param {string | null} [opts.referred_by_partner_id]
 * @param {string | null} [opts.sales_onboard_primary_module] - first module_key (sales portal; legacy)
 * @param {string[] | null} [opts.sales_onboard_modules] - ordered module keys (sales portal)
 * @param {Record<string, string> | null} [opts.sales_onboard_package_by_module] - module_key -> package UUID (sales portal)
 */
export async function signupBusinessAndOwner(opts) {
  const {
    email: emailRaw,
    password,
    name,
    phone,
    public_phone_number,
    address,
    first_name,
    last_name,
    timezone,
    contact_email,
    terms_accepted,
    termsAcceptedIp,
    referred_by_partner_id,
    sales_onboard_primary_module,
    sales_onboard_modules,
    sales_onboard_package_by_module,
  } = opts;

  const moduleKeys =
    Array.isArray(sales_onboard_modules) && sales_onboard_modules.length > 0
      ? sales_onboard_modules
      : sales_onboard_primary_module
        ? [sales_onboard_primary_module]
        : [];
  const primaryFromList = moduleKeys[0] || null;

  const email = String(emailRaw || "")
    .trim()
    .toLowerCase();

  if (!email || !password || !name) {
    const e = new Error("Email, password, and business name are required");
    e.code = "VALIDATION";
    throw e;
  }
  if (!terms_accepted) {
    const e = new Error("You must agree to the Terms of Service and Privacy Policy to create an account");
    e.code = "TERMS_NOT_ACCEPTED";
    throw e;
  }

  let formattedPhone = public_phone_number || phone;
  if (formattedPhone) {
    const e164 = formatPhoneNumberE164(formattedPhone);
    if (!e164 || !validatePhoneNumber(e164)) {
      const e = new Error("Invalid phone number format. Please include country code (e.g., +1 for US/Canada)");
      e.code = "INVALID_PHONE";
      throw e;
    }
    formattedPhone = e164;
  }

  const existingBusiness = await Business.findByEmail(email);
  let business;

  if (existingBusiness) {
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      const e = new Error("An account with this email already exists. Please log in instead.");
      e.code = "ACCOUNT_EXISTS";
      throw e;
    }
    const bizPatch = {
      name,
      email: contact_email || email,
      phone: formattedPhone,
      address: address || "",
      timezone: timezone || "America/New_York",
      public_phone_number: formattedPhone,
    };
    if (referred_by_partner_id && !existingBusiness.referred_by_partner_id) {
      bizPatch.referred_by_partner_id = referred_by_partner_id;
    }
    if (primaryFromList) {
      bizPatch.sales_onboard_primary_module = primaryFromList;
    }
    if (moduleKeys.length > 0) {
      bizPatch.sales_onboard_modules = moduleKeys;
    }
    if (
      sales_onboard_package_by_module != null &&
      typeof sales_onboard_package_by_module === "object" &&
      !Array.isArray(sales_onboard_package_by_module)
    ) {
      bizPatch.sales_onboard_package_by_module = sales_onboard_package_by_module;
    }
    await updateBusinessWithSalesOnboardColumns(existingBusiness.id, bizPatch);
    business = await Business.findById(existingBusiness.id);
  } else {
    const insertPayload = {
      name,
      email: contact_email || email,
      phone: formattedPhone,
      address: address || "",
      timezone: timezone || "America/New_York",
      public_phone_number: formattedPhone,
    };
    if (referred_by_partner_id) {
      insertPayload.referred_by_partner_id = referred_by_partner_id;
    }
    if (primaryFromList) {
      insertPayload.sales_onboard_primary_module = primaryFromList;
    }
    if (moduleKeys.length > 0) {
      insertPayload.sales_onboard_modules = moduleKeys;
    }
    if (
      sales_onboard_package_by_module != null &&
      typeof sales_onboard_package_by_module === "object" &&
      !Array.isArray(sales_onboard_package_by_module)
    ) {
      insertPayload.sales_onboard_package_by_module = sales_onboard_package_by_module;
    }
    let tryPayload = { ...insertPayload };
    let { data: created, error } = await supabaseClient.from("businesses").insert(tryPayload).select().single();
    while (error && isMissingColumnError(error)) {
      let stripped = false;
      for (const col of SALES_ONBOARD_OPTIONAL_COLS) {
        if (Object.prototype.hasOwnProperty.call(tryPayload, col)) {
          delete tryPayload[col];
          stripped = true;
          ({ data: created, error } = await supabaseClient.from("businesses").insert(tryPayload).select().single());
          console.warn(
            `[customerSignupService] Retrying insert without ${col} (run sales onboard migrations).`,
          );
          break;
        }
      }
      if (!stripped) break;
    }
    if (error) throw error;
    business = created;
  }

  try {
    const { data: demoEmail } = await supabaseClient
      .from("demo_emails")
      .select("id")
      .eq("email", email)
      .eq("signed_up", false)
      .single();

    if (demoEmail) {
      await supabaseClient
        .from("demo_emails")
        .update({
          signed_up: true,
          signed_up_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", demoEmail.id);
    }
  } catch (demoError) {
    console.log(`[customerSignupService] demo_emails note:`, demoError?.message || demoError);
  }

  const password_hash = await hashPassword(password);
  const now = new Date().toISOString();
  const user = await User.create({
    business_id: business.id,
    email,
    password_hash,
    first_name,
    last_name,
    role: "owner",
    terms_accepted_at: now,
    privacy_accepted_at: now,
    terms_version: TERMS_VERSION,
    terms_accepted_ip: termsAcceptedIp || "unknown",
  });

  const token = generateToken({
    userId: user.id,
    businessId: business.id,
    email: user.email,
  });

  return { user, business, token };
}
