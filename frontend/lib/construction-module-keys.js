/**
 * Must stay in sync with `config/construction-dashboard.js` (BUILTIN_CONSTRUCTION_MODULE_KEYS +
 * optional CONSTRUCTION_MODULE_KEYS env on the server).
 *
 * Client-side exclusion keeps the main dashboard / sidebar correct when the API response
 * still includes construction modules (e.g. backend not redeployed yet).
 */
const BUILTIN = new Set([
  'delivery-dispatch',
  'movie-review',
  'orbix-network',
  'emergency-dispatch',
  'emergency-network',
]);

function envExtraKeys() {
  const raw =
    typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CONSTRUCTION_MODULE_KEYS
      ? String(process.env.NEXT_PUBLIC_CONSTRUCTION_MODULE_KEYS).trim()
      : '';
  if (!raw) return new Set();
  return new Set(raw.split(',').map((k) => k.trim()).filter(Boolean));
}

const EXTRA = envExtraKeys();

/**
 * @param {string} key
 */
export function isConstructionModuleKey(key) {
  const k = String(key || '').trim();
  if (!k) return false;
  if (BUILTIN.has(k)) return true;
  if (EXTRA.has(k)) return true;
  return false;
}

/**
 * @param {Array<{ key?: string }>} modules
 */
export function excludeConstructionModulesFromList(modules) {
  if (!Array.isArray(modules)) return [];
  return modules.filter((m) => m?.key && !isConstructionModuleKey(m.key));
}
