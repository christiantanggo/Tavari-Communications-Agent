/**
 * Products/services a sales rep can record when onboarding a customer (module_key values).
 * Keep in sync with labels in frontend/lib/sales-onboard-modules.js
 */

export const SALES_ONBOARD_MODULE_OPTIONS = [
  { key: "phone-agent", label: "Tavari AI Phone Agent" },
  { key: "delivery-dispatch", label: "Last-mile delivery dispatch" },
  { key: "reviews", label: "Review Reply AI" },
  { key: "emergency-dispatch", label: "Emergency dispatch" },
  { key: "orbix-network", label: "Orbix Network" },
  { key: "movie-review", label: "Movie Review" },
];

export const SALES_ONBOARD_MODULE_KEYS = new Set(SALES_ONBOARD_MODULE_OPTIONS.map((o) => o.key));

export function normalizeSalesOnboardModuleKey(raw) {
  const k = String(raw || "").trim();
  if (!k || !SALES_ONBOARD_MODULE_KEYS.has(k)) return null;
  return k;
}

/** Deduplicate, keep first-seen order; only known module keys. */
export function normalizeSalesOnboardModuleKeys(raw) {
  const list = Array.isArray(raw) ? raw : raw != null && raw !== "" ? [raw] : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const k = normalizeSalesOnboardModuleKey(item);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
