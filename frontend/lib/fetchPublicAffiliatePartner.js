import { getServerBackendBaseUrl } from '@/lib/serverBackendBaseUrl';

/**
 * Loads public partner row for customer referral pages (server-only).
 */
export async function fetchPublicAffiliatePartner(code) {
  const apiBase = getServerBackendBaseUrl();
  const url = `${apiBase}/api/affiliate/public-partner/${encodeURIComponent(code)}`;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    if (typeof data.affiliate_code !== 'string') return null;
    return data;
  } catch (e) {
    console.error('[referral landing] public-partner fetch failed:', url, e?.message || e);
    return null;
  }
}
