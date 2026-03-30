'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DemoModal from '@/components/DemoModal';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import { AFFILIATE_REF_COOKIE, AFFILIATE_REF_MAX_AGE_SEC } from '@/lib/affiliateCookie';
import { billingAPI } from '@/lib/api';
import { getToken, signup } from '@/lib/auth';

const MODULE_KEY = 'phone-agent';

function useAffiliateCookie(code) {
  useEffect(() => {
    document.cookie = buildAffiliateRefClientCookie(code);
  }, [code]);
}

function CheckoutSuccessPanel({ affiliateCode }) {
  const searchParams = useSearchParams();
  /** Avoid SSR/client URL mismatch from useSearchParams before mount. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const checkout = hydrated ? searchParams.get('checkout') : null;
  const sessionId = hydrated ? searchParams.get('session_id') : null;
  const [verified, setVerified] = useState(null);

  useEffect(() => {
    if (!hydrated || checkout !== 'success' || !sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await billingAPI.verifyStripeSession(sessionId);
        if (!cancelled) setVerified(res.data?.success !== false);
      } catch {
        if (!cancelled) setVerified(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, checkout, sessionId]);

  if (!hydrated || checkout !== 'success') return null;

  return (
    <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-6 text-center sm:px-6">
      <p className="text-lg font-semibold text-emerald-900">Payment received—welcome aboard</p>
      <p className="mt-2 text-sm text-emerald-800">
        {verified === false
          ? 'We are confirming your payment. If anything looks wrong, contact support.'
          : 'Your subscription is processing. Continue below to finish setting up your AI phone agent.'}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard/setup"
          className="inline-flex rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Finish setup
        </Link>
        <Link
          href="/tavari-ai-phone/dashboard"
          className="inline-flex rounded-lg border border-emerald-700 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
        >
          Open phone dashboard
        </Link>
      </div>
      <p className="mt-3 text-xs text-emerald-800/80">
        Save this link to return later:{' '}
        <span className="font-mono text-emerald-900">/join/phone-agent/{affiliateCode}</span>
      </p>
    </div>
  );
}

export default function PhoneAgentAffiliateFunnel({ affiliateCode }) {
  useAffiliateCookie(affiliateCode);

  const [demoOpen, setDemoOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const [form, setForm] = useState({ email: '', password: '', name: '', termsAccepted: false });
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  const loadPackages = useCallback(async () => {
    if (!getToken()) return;
    setPackagesLoading(true);
    try {
      const res = await billingAPI.getPackages(MODULE_KEY);
      const list = res.data?.packages || [];
      setPackages(list);
      if (list.length === 1) setSelectedId(list[0].id);
    } catch (e) {
      console.error(e);
      setPackages([]);
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, []);

  useEffect(() => {
    if (loggedIn) loadPackages();
  }, [loggedIn, loadPackages]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setSignupError('');
    if (!form.email || !form.password || !form.name) {
      setSignupError('Please fill in all fields.');
      return;
    }
    if (form.password.length < 8) {
      setSignupError('Password must be at least 8 characters.');
      return;
    }
    if (!form.termsAccepted) {
      setSignupError('Please agree to the terms and privacy policy.');
      return;
    }
    setSignupLoading(true);
    try {
      const response = await signup({
        email: form.email,
        password: form.password,
        name: form.name,
        first_name: '',
        last_name: '',
        phone: '',
        public_phone_number: '',
        address: '',
        timezone: 'America/New_York',
        business_hours: {
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false },
          wednesday: { open: '09:00', close: '17:00', closed: false },
          thursday: { open: '09:00', close: '17:00', closed: false },
          friday: { open: '09:00', close: '17:00', closed: false },
          saturday: { closed: true },
          sunday: { closed: true },
        },
        contact_email: form.email,
        terms_accepted: true,
      });
      if (response?.token) {
        setLoggedIn(true);
        document.getElementById('choose-plan')?.scrollIntoView({ behavior: 'smooth' });
      } else {
        setSignupError(response?.error || 'Could not create account.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Signup failed';
      setSignupError(msg);
    } finally {
      setSignupLoading(false);
    }
  };

  const handlePay = async () => {
    setCheckoutError('');
    if (!selectedId) {
      setCheckoutError('Select a plan first.');
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await billingAPI.createCheckout(selectedId, {
        affiliate_code: affiliateCode,
        joinFunnel: 'phone-agent',
        joinCode: affiliateCode,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
        return;
      }
      if (res.data?.skipPayment) {
        setCheckoutError('');
        window.location.href = '/dashboard/setup';
        return;
      }
      setCheckoutError(res.data?.message || 'Could not start checkout.');
    } catch (err) {
      const data = err.response?.data;
      setCheckoutError(data?.error || data?.details || err.message || 'Checkout failed');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900" id="top">
      <Suspense fallback={null}>
        <CheckoutSuccessPanel affiliateCode={affiliateCode} />
      </Suspense>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-lg font-semibold text-slate-900">{APP_DISPLAY_NAME}</span>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">AI phone agent</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <section className="mt-2 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Never miss a call. Never lose a sale.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            An AI answers your phone as your business—24/7. Hear how it sounds, then create your account and choose a
            plan—all on this page.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="w-full rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-md hover:bg-blue-700 sm:w-auto"
            >
              Hear the demo
            </button>
            <a
              href="#create-account"
              className="w-full rounded-xl border-2 border-slate-300 bg-white px-8 py-4 text-lg font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
            >
              Create account
            </a>
          </div>
        </section>

        <section className="mt-14 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative">
            <Image
              src="/SMB-owner-photo.jpg"
              alt="Business owner using AI phone coverage"
              width={1200}
              height={600}
              className="h-[280px] w-full object-cover sm:h-[360px]"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <p className="absolute bottom-6 left-6 right-6 text-left text-xl font-bold text-white drop-shadow sm:text-2xl">
              Real businesses use Tavari to capture bookings and messages around the clock.
            </p>
          </div>
        </section>

        <section className="mt-14 grid gap-8 sm:grid-cols-3">
          {[
            { t: 'Every call answered', d: 'Day, night, weekends—your line is always covered.' },
            { t: 'Sounds like you', d: 'Trained on your services, hours, and how you talk to customers.' },
            { t: 'Urgent calls flagged', d: 'When it matters, your team gets notified right away.' },
          ].map((x) => (
            <div key={x.t} className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-lg font-semibold text-slate-900">{x.t}</h2>
              <p className="mt-2 text-sm text-slate-600">{x.d}</p>
            </div>
          ))}
        </section>

        <section className="mt-14 rounded-2xl border border-slate-200 bg-slate-50 p-8 sm:p-10">
          <h2 className="text-center text-2xl font-bold text-slate-900">Live in about 10 minutes</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">
            Answer a short setup once—business info, hours, services, voice, and escalation. No sales call required.
          </p>
        </section>

        <section id="create-account" className="mt-16 scroll-mt-24">
          <h2 className="text-2xl font-bold text-slate-900">Create your account</h2>
          <p className="mt-2 text-slate-600">Use your work email—you’ll use it to sign in and manage your AI agent.</p>

          {loggedIn ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
              You’re signed in. Scroll down to choose your plan and pay securely.
            </div>
          ) : (
            <form onSubmit={handleSignup} className="mt-6 max-w-md space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Business name</label>
                <input
                  name="name"
                  autoComplete="organization"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  minLength={8}
                  required
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })}
                  className="mt-1"
                />
                <span>
                  I agree to the{' '}
                  <Link href="/legal/terms" className="font-medium text-blue-700 underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/legal/privacy" className="font-medium text-blue-700 underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {signupError ? <p className="text-sm text-red-600">{signupError}</p> : null}
              <button
                type="submit"
                disabled={signupLoading}
                className="w-full rounded-xl bg-slate-900 py-3.5 text-center font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {signupLoading ? 'Creating account…' : 'Continue'}
              </button>
            </form>
          )}
        </section>

        <section id="choose-plan" className="mt-16 scroll-mt-24">
          <h2 className="text-2xl font-bold text-slate-900">Choose your plan</h2>
          <p className="mt-2 text-slate-600">Monthly subscription in CAD. Taxes calculated at checkout.</p>

          {!loggedIn ? (
            <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Create an account above to see plans and pay.
            </p>
          ) : packagesLoading ? (
            <p className="mt-6 text-slate-500">Loading plans…</p>
          ) : packages.length === 0 ? (
            <p className="mt-6 text-slate-600">No plans are available right now. Please try again later or contact support.</p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {packages.map((pkg, index) => {
                const isOnSale = pkg.isOnSale && pkg.saleAvailable;
                const price = isOnSale && pkg.sale_price ? pkg.sale_price : pkg.monthly_price;
                const selected = selectedId === pkg.id;
                const lastAlone = packages.length % 2 === 1 && index === packages.length - 1;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedId(pkg.id)}
                    className={`rounded-xl border-2 p-6 text-left transition${lastAlone ? ' sm:col-span-2' : ''} ${
                      selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <h3 className="text-lg font-semibold text-slate-900">{pkg.name}</h3>
                    <p className="mt-2 text-2xl font-bold text-blue-700">${parseFloat(price || 0).toFixed(2)}/mo</p>
                    {isOnSale && pkg.monthly_price && (
                      <p className="text-sm text-slate-400 line-through">${parseFloat(pkg.monthly_price).toFixed(2)}/mo</p>
                    )}
                    <p className="mt-2 text-sm text-slate-600">{pkg.description}</p>
                  </button>
                );
              })}
            </div>
          )}

          {loggedIn && packages.length > 0 ? (
            <div className="mt-8">
              {checkoutError ? <p className="mb-3 text-sm text-red-600">{checkoutError}</p> : null}
              <button
                type="button"
                onClick={handlePay}
                disabled={checkoutLoading || !selectedId}
                className="w-full rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {checkoutLoading ? 'Redirecting to secure checkout…' : 'Pay securely with card'}
              </button>
              <p className="mt-3 text-xs text-slate-500">
                You’ll complete payment on our secure payment page, then return here for next steps.
              </p>
            </div>
          ) : null}
        </section>

        <footer className="mt-20 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
          <p>
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-blue-700 hover:underline">
              Log in
            </Link>{' '}
            — you can add or change your plan from your dashboard.
          </p>
        </footer>
      </main>

      <DemoModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
