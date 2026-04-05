import { NextResponse } from 'next/server';

/**
 * Keep in sync with `lib/affiliateCookie.js` and `app/affiliate/go/[code]/route.js`.
 * Inlined here so Edge middleware does not depend on path-alias resolution (avoids dev 500s on /_next/*).
 */
const AFFILIATE_REF_COOKIE = 'tavari_affiliate_ref';
const AFFILIATE_REF_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const PARTNER_CODE_RE = /^[A-Z0-9]{4,16}$/;

function normalizePartnerQuery(raw) {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!PARTNER_CODE_RE.test(code)) return null;
  return code;
}

export function middleware(request) {
  try {
    const partner = normalizePartnerQuery(request.nextUrl.searchParams.get('partner'));
    if (!partner) {
      return NextResponse.next();
    }

    const res = NextResponse.next();
    res.cookies.set(AFFILIATE_REF_COOKIE, partner, {
      maxAge: AFFILIATE_REF_MAX_AGE_SEC,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (e) {
    console.error('[middleware] affiliate partner cookie:', e);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Skip API and Next internals so we never attach cookies to static chunks, HMR, or RSC data fetches.
     */
    '/((?!api|_next/static|_next/image|_next/webpack-hmr|_next/data|favicon.ico).*)',
  ],
};
