import { supabaseClient } from "../config/database.js";

/**
 * @param {string} partnerId
 * @param {string} action
 * @param {Record<string, unknown>} [details]
 * @param {string | null} [ip]
 */
export async function logSalesPortalAudit(partnerId, action, details = {}, ip = null) {
  const { error } = await supabaseClient.from("sales_portal_audit").insert({
    partner_id: partnerId,
    action,
    details: details || {},
    ip: ip || null,
  });
  if (error) {
    console.error("[sales-portal-audit] insert failed:", error.message);
  }
}
