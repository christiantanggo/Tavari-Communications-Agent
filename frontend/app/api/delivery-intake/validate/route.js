import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy: browser calls this route; server forwards to the API.
 * Avoids CORS and client misconfiguration of NEXT_PUBLIC_API_URL on the marketing site.
 * Set BACKEND_URL or API_URL on the frontend host if the API is not at NEXT_PUBLIC_API_URL.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const apiBase = (
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://api.tavarios.com'
  ).replace(/\/$/, '');

  const url = `${apiBase}/api/v2/delivery-network/public/intake-sms-token/validate`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (err) {
    console.error('[delivery-intake/validate proxy]', err?.message || err);
    return NextResponse.json({ error: 'Validation failed' }, { status: 502 });
  }
}
