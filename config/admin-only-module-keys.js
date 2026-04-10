/**
 * Modules reserved for Tavari staff / internal operations.
 * Hidden from normal customer module lists and marketplace APIs.
 */
export const ADMIN_ONLY_MODULE_KEYS = new Set(['ai-sales-agent']);

export function isAdminOnlyModuleKey(key) {
  return ADMIN_ONLY_MODULE_KEYS.has(String(key || '').trim());
}

export function excludeAdminOnlyModules(modules) {
  if (!Array.isArray(modules)) return [];
  return modules.filter((m) => m && m.key && !isAdminOnlyModuleKey(m.key));
}
