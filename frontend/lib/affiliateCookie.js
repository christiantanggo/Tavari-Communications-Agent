/** First-party referral cookie (must match affiliate/go route and middleware). */
export const AFFILIATE_REF_COOKIE = 'tavari_affiliate_ref';
export const AFFILIATE_REF_MAX_AGE_SEC = 30 * 24 * 60 * 60;

/**
 * Optional e.g. `.tavari.com` so the same ref is visible on `www` and `app` hostnames.
 * Set NEXT_PUBLIC_AFFILIATE_COOKIE_DOMAIN in env (leading dot for subdomains).
 */
export function getAffiliateCookieDomain() {
  if (typeof process === 'undefined') return '';
  const d = process.env.NEXT_PUBLIC_AFFILIATE_COOKIE_DOMAIN;
  return typeof d === 'string' ? d.trim() : '';
}

/** Next.js Route Handler / Server: options for cookies.set(name, value, opts) */
export function affiliateRefCookieServerOptions() {
  const domain = getAffiliateCookieDomain();
  return {
    maxAge: AFFILIATE_REF_MAX_AGE_SEC,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    ...(domain ? { domain } : {}),
  };
}

/** Browser: full Set-Cookie style string for document.cookie */
export function buildAffiliateRefClientCookie(code) {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  let s = `${AFFILIATE_REF_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${AFFILIATE_REF_MAX_AGE_SEC}; SameSite=Lax`;
  if (secure) s += '; Secure';
  const domain = getAffiliateCookieDomain();
  if (domain) s += `; Domain=${domain}`;
  return s;
}

const CODE_RE = /^[A-Z0-9]{4,16}$/;

export function normalizeAffiliateCodeParam(raw) {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!CODE_RE.test(code)) return null;
  return code;
}

/** Query keys treated as partner / affiliate code on signup and landings. */
const SIGNUP_REF_QUERY_KEYS = ['partner', 'affiliate_code', 'affiliate', 'ref', 'referral_code'];

/**
 * Parse a valid affiliate code from a query string (e.g. `window.location.search`).
 * URL wins over cookie when both are present via {@link resolveAffiliateCodeForSignup}.
 */
export function parseAffiliateRefFromSearch(search) {
  if (search == null || search === '') return null;
  const raw = String(search).trim();
  const qs = raw.startsWith('?') ? raw : `?${raw}`;
  let sp;
  try {
    sp = new URLSearchParams(qs);
  } catch {
    return null;
  }
  for (const key of SIGNUP_REF_QUERY_KEYS) {
    const v = sp.get(key);
    const n = normalizeAffiliateCodeParam(v);
    if (n) return n;
  }
  return null;
}

/**
 * Read `tavari_affiliate_ref` from a `document.cookie`-style string.
 */
export function parseAffiliateRefFromCookieString(cookieStr) {
  if (!cookieStr || typeof cookieStr !== 'string') return null;
  const parts = cookieStr.split(';');
  for (const p of parts) {
    const t = p.trim();
    if (!t.startsWith(`${AFFILIATE_REF_COOKIE}=`)) continue;
    const raw = decodeURIComponent(t.slice(AFFILIATE_REF_COOKIE.length + 1).trim());
    return normalizeAffiliateCodeParam(raw);
  }
  return null;
}

/**
 * Resolve code for signup: explicit prop (e.g. join funnel path) → URL params → `tavari_affiliate_ref` cookie.
 */
export function resolveAffiliateCodeForSignup(options = {}) {
  const e = normalizeAffiliateCodeParam(options.explicit);
  if (e) return e;
  const search =
    options.search !== undefined
      ? options.search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  const fromSearch = parseAffiliateRefFromSearch(search);
  if (fromSearch) return fromSearch;
  const cookieStr =
    options.cookieString !== undefined
      ? options.cookieString
      : typeof document !== 'undefined'
        ? document.cookie
        : '';
  return parseAffiliateRefFromCookieString(cookieStr);
}

/**
 * If the URL contains a valid ref, set `tavari_affiliate_ref` (same shape as short hub / affiliate go).
 * Call on signup and public landings so `?partner=` deep links persist across navigation.
 */
export function syncAffiliateRefCookieFromUrl(search) {
  if (typeof document === 'undefined') return null;
  const s =
    search !== undefined ? search : typeof window !== 'undefined' ? window.location.search : '';
  const code = parseAffiliateRefFromSearch(s);
  if (code) {
    document.cookie = buildAffiliateRefClientCookie(code);
  }
  return code;
}

/** Same-origin path only (for ?next= on affiliate landing). */
export function sanitizeInternalNextPath(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('/') || t.startsWith('//')) return null;
  if (t.includes('://')) return null;
  return t;
}
