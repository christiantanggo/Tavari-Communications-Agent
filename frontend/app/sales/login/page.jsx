'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api';

function getSalesToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  const c = cookies.find((x) => x.trim().startsWith('sales_token='));
  if (!c) return null;
  return decodeURIComponent(c.split('=').slice(1).join('=').trim());
}

export default function SalesLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [requestMsg, setRequestMsg] = useState('');

  useEffect(() => {
    if (getSalesToken()) {
      router.replace('/sales/dashboard');
    }
  }, [router]);

  const requestLink = async (e) => {
    e.preventDefault();
    setRequestMsg('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sales/request-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Request failed');
      setRequestMsg(json.message || 'Check your email.');
    } catch (err) {
      setRequestMsg(err.message || 'Something went wrong');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow p-8">
        <h1 className="text-xl font-bold text-gray-900">Sales team sign-in</h1>
        <p className="text-sm text-gray-600 mt-2">
          Tavari staff creates your account and enables sales portal access. Use the link from your welcome email, or
          enter your work email to receive a new one-time sign-in link.
        </p>
        <form onSubmit={requestLink} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              placeholder="you@company.com"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-teal-600 text-white font-medium py-2 rounded-md hover:bg-teal-700"
          >
            Email me a link
          </button>
        </form>
        {requestMsg && <p className="mt-4 text-sm text-gray-700">{requestMsg}</p>}
        <p className="mt-6 text-sm">
          <Link href="/" className="text-teal-700 hover:underline">
            ← Home
          </Link>
        </p>
      </div>
    </div>
  );
}
