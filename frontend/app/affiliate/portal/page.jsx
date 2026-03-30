'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getApiBaseUrl } from '@/lib/api';

function setAffiliateTokenCookie(token) {
  const maxAge = 90 * 24 * 60 * 60;
  document.cookie = `affiliate_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

const EXCHANGE_TIMEOUT_MS = 30000;

function PortalInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('t')?.trim() ?? '';
  const [status, setStatus] = useState(() => (token ? 'working' : 'idle'));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), EXCHANGE_TIMEOUT_MS);

    setStatus('working');
    setError('');

    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/affiliate/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: ac.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Sign-in failed');
        }
        if (cancelled) return;
        setAffiliateTokenCookie(data.accessToken);
        router.replace('/affiliate/dashboard');
      } catch (e) {
        if (cancelled) return;
        const name = e?.name;
        if (name === 'AbortError') {
          setError(
            'Sign-in timed out or was interrupted. Confirm the API server is running (same host as NEXT_PUBLIC_API_URL) and try the link again or request a new one.',
          );
          setStatus('error');
          return;
        }
        setError(e?.message || 'Sign-in failed');
        setStatus('error');
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      ac.abort();
    };
  }, [token, router]);

  if (status === 'working') {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4">
        <p className="text-gray-600">Signing you in…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 max-w-md mx-auto text-center">
        <p className="text-red-700 font-medium">{error}</p>
        <p className="text-sm text-gray-600 mt-2">Request a new link from the dashboard sign-in page.</p>
        <Link href="/affiliate/dashboard" className="mt-6 text-blue-600 font-medium hover:underline">
          Partner sign-in →
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 max-w-md mx-auto text-center">
      <p className="text-gray-700">Open the sign-in link from your email, or go to the dashboard to request a new link.</p>
      <Link href="/affiliate/dashboard" className="mt-6 text-blue-600 font-medium hover:underline">
        Partner dashboard →
      </Link>
    </div>
  );
}

export default function AffiliatePortalPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <Suspense
        fallback={
          <div className="flex justify-center">
            <p className="text-gray-600">Loading…</p>
          </div>
        }
      >
        <PortalInner />
      </Suspense>
    </div>
  );
}
