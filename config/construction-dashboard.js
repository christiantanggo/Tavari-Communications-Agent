/**
 * Modules in "construction" are full modules (same APIs, subscriptions, dashboards) but hidden from
 * normal marketplace / sidebar lists until released. Listed only on Construction Dashboard after PIN unlock.
 *
 * Set CONSTRUCTION_MODULE_KEYS=comma,separated,module_keys (extra keys beyond built-ins)
 * Built-in construction-only: movie-review, orbix-network, emergency-dispatch, emergency-network
 * Optional per-row: modules.metadata.construction_only === true (JSONB)
 *
 * PIN: CONSTRUCTION_DASHBOARD_PIN (default 9874 for dev; set in production)
 * Cookie signing: CONSTRUCTION_UNLOCK_SECRET or falls back to JWT_SECRET
 */
import crypto from 'crypto';

export const CONSTRUCTION_COOKIE_NAME = 'tavari_construction_unlock';

function unlockSecret() {
  return (
    String(process.env.CONSTRUCTION_UNLOCK_SECRET || process.env.JWT_SECRET || 'dev-construction-unlock-change-me').trim() || 'dev-construction-unlock-change-me'
  );
}

export function getExpectedConstructionPin() {
  return String(process.env.CONSTRUCTION_DASHBOARD_PIN ?? '9874').trim();
}

/** @param {string} rawCookieValue */
export function verifyConstructionUnlockCookie(rawCookieValue) {
  if (!rawCookieValue || typeof rawCookieValue !== 'string') return false;
  try {
    const decoded = Buffer.from(rawCookieValue, 'base64url').toString('utf8');
    const j = JSON.parse(decoded);
    if (!j || typeof j.exp !== 'number' || typeof j.sig !== 'string') return false;
    if (Date.now() > j.exp) return false;
    const payload = JSON.stringify({ exp: j.exp });
    const expected = crypto.createHmac('sha256', unlockSecret()).update(payload).digest('hex');
    const a = Buffer.from(j.sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createConstructionUnlockCookieValue() {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const payload = JSON.stringify({ exp });
  const sig = crypto.createHmac('sha256', unlockSecret()).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ exp, sig }), 'utf8').toString('base64url');
}

/** @param {import('express').Request} req */
export function hasValidConstructionUnlock(req) {
  const raw = req.headers.cookie;
  if (!raw) return false;
  const cookies = Object.fromEntries(
    raw.split(';').map((p) => {
      const i = p.indexOf('=');
      if (i === -1) return [p.trim(), ''];
      return [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1).trim())];
    })
  );
  return verifyConstructionUnlockCookie(cookies[CONSTRUCTION_COOKIE_NAME]);
}

/** Always excluded from marketplace / sidebar; shown only on Construction dashboard after PIN. */
const BUILTIN_CONSTRUCTION_MODULE_KEYS = new Set([
  'movie-review',
  'orbix-network',
  'emergency-dispatch',
  'emergency-network',
]);

function constructionKeysFromEnv() {
  const raw = String(process.env.CONSTRUCTION_MODULE_KEYS || '').trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  );
}

/**
 * @param {string} key
 * @param {{ metadata?: Record<string, unknown> } | null} [moduleRow]
 */
export function isConstructionModule(key, moduleRow = null) {
  const k = String(key || '').trim();
  if (!k) return false;
  if (BUILTIN_CONSTRUCTION_MODULE_KEYS.has(k)) return true;
  if (constructionKeysFromEnv().has(k)) return true;
  const meta = moduleRow?.metadata;
  if (meta && typeof meta === 'object' && meta.construction_only === true) return true;
  return false;
}

/**
 * @param {Array<{ key: string, metadata?: Record<string, unknown> }>} modules
 */
export function excludeConstructionModules(modules) {
  if (!Array.isArray(modules)) return [];
  return modules.filter((m) => m && m.key && !isConstructionModule(m.key, m));
}

/**
 * @param {Array<{ key: string, metadata?: Record<string, unknown> }>} modules
 */
export function filterToConstructionModulesOnly(modules) {
  if (!Array.isArray(modules)) return [];
  return modules.filter((m) => m && m.key && isConstructionModule(m.key, m));
}
