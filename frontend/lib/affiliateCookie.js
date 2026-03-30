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

/** Same-origin path only (for ?next= on affiliate landing). */
export function sanitizeInternalNextPath(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('/') || t.startsWith('//')) return null;
  if (t.includes('://')) return null;
  return t;
}
