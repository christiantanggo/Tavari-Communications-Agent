/**
 * Product-retired module keys: removed from app but may still exist in `modules` / subscriptions.
 * Excluded from customer module lists, sidebar, and marketplace APIs.
 */
export const RETIRED_MODULE_KEYS = new Set(['dad-joke-studio', 'kidquiz']);

export function isRetiredModuleKey(key) {
  return RETIRED_MODULE_KEYS.has(String(key || '').trim());
}

export function excludeRetiredModules(modules) {
  if (!Array.isArray(modules)) return [];
  return modules.filter((m) => m && m.key && !isRetiredModuleKey(m.key));
}
