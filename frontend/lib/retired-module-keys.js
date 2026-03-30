/** Keep in sync with `config/retired-module-keys.js` (backend). */
export const RETIRED_MODULE_KEYS = ['dad-joke-studio', 'kidquiz'];

export function isRetiredModuleKey(key) {
  return RETIRED_MODULE_KEYS.includes(String(key || '').trim());
}
