'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getApiBaseUrl } from '@/lib/api';

function RedeemBody() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Preparing secure checkout…');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = searchParams.get('t');
    if (!t) {
      setStatus('error');
      setMessage('');
      setError('This link is incomplete. Ask your sales representative to resend the payment email.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/sales/checkout-invite/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t }),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setStatus('error');
          setMessage('');
          setError(json.error || 'Could not start checkout.');
          return;
        }

        if (json.alreadyPaid) {
          setStatus('done');
          setMessage(json.message || 'Your plan is already active.');
          setError('');
          return;
        }

        if (json.skipPayment) {
          setStatus('done');
          setMessage(json.message || 'Your account has been updated.');
          return;
        }

        if (json.url) {
          window.location.href = json.url;
          return;
        }

        setStatus('error');
        setMessage('');
        setError('Unexpected response from server.');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('');
          setError('Network error. Check your connection and try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-xl shadow border border-slate-200 p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Tavari checkout</h1>
        {status === 'loading' && <p className="mt-4 text-slate-600 text-sm">{message}</p>}
        {status === 'done' && <p className="mt-4 text-slate-700 text-sm">{message}</p>}
        {status === 'error' && error && <p className="mt-4 text-red-700 text-sm">{error}</p>}
        <div className="mt-6 flex flex-col gap-2 text-sm">
          <Link href="/login" className="text-teal-700 font-medium hover:underline">
            Sign in to your account
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SalesCompletePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-600">Loading…</div>
      }
    >
      <RedeemBody />
    </Suspense>
  );
}
