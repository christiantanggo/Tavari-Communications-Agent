import { NextResponse } from 'next/server';
import { AFFILIATE_REF_COOKIE, AFFILIATE_REF_MAX_AGE_SEC } from '@/lib/affiliateCookie';
import { getServerBackendBaseUrl } from '@/lib/serverBackendBaseUrl';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const code = String(params?.code || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const apiBase = getServerBackendBaseUrl();

  try {
    await fetch(`${apiBase}/api/affiliate/track/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ affiliate_code: code }),
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[affiliate/go] track click', e?.message || e);
  }

  const origin = new URL(request.url).origin;
  const nextRaw = request.nextUrl.searchParams.get('next');
  /** Same-origin path only (open-redirect safe). */
  let nextPath = '';
  if (nextRaw) {
    try {
      const n = new URL(nextRaw, origin);
      if (n.origin === origin && n.pathname.startsWith('/') && !n.pathname.startsWith('//')) {
        nextPath = `${n.pathname}${n.search}${n.hash}`;
      }
    } catch {
      nextPath = '';
    }
  }

  const landUrl = new URL(`/r/${encodeURIComponent(code)}`, origin);
  if (nextPath) landUrl.searchParams.set('next', nextPath);

  const res = NextResponse.redirect(landUrl);
  res.cookies.set(AFFILIATE_REF_COOKIE, code, affiliateRefCookieServerOptions());
  return res;
}
