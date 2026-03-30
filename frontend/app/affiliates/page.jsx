'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import { getApiBaseUrl } from '@/lib/api';
import { ArrowRight, Check, Sparkles, Wallet, X, Zap } from 'lucide-react';

const AFFILIATE_EMAIL =
  (process.env.NEXT_PUBLIC_AFFILIATE_CONTACT_EMAIL || 'info@tanggo.ca').trim() || 'info@tanggo.ca';

const initialForm = {
  name: '',
  email: '',
  company: '',
  website_or_channel: '',
  audience: '',
  promote_plan: '',
};

export default function AffiliatesPage() {
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  const closeApplyModal = () => {
    setApplyModalOpen(false);
    setFormError('');
  };

  const openApplyModal = () => {
    setFormError('');
    setApplyModalOpen(true);
  };

  useEffect(() => {
    if (!applyModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setApplyModalOpen(false);
        setFormError('');
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [applyModalOpen]);

  useEffect(() => {
    if (!applyModalOpen && submitted) {
      setForm(initialForm);
      setSubmitted(false);
    }
  }, [applyModalOpen, submitted]);

  const ApplyButton = ({ className = '', light = false }) => (
    <button
      type="button"
      onClick={openApplyModal}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-8 py-4 text-lg font-bold shadow-lg transition hover:shadow-xl ${
        light
          ? 'bg-white text-blue-700 shadow-white/20 hover:bg-blue-50'
          : 'bg-blue-600 text-white shadow-blue-600/25 hover:bg-blue-700'
      } ${className}`}
    >
      Apply to earn with us
      <ArrowRight className="h-5 w-5" aria-hidden />
    </button>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/support/affiliate-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not send application');
      }
      setSubmitted(true);
      setForm(initialForm);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.message === 'Failed to fetch') {
        setFormError('Network error. Check your connection or try again in a moment.');
      } else {
        setFormError(err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const benefits = [
    {
      icon: Wallet,
      title: 'Paid by us—not a marketplace',
      line: 'Commissions and terms are in your partner agreement. No middleman clipping your earnings.',
    },
    {
      icon: Sparkles,
      title: 'AI businesses actually buy',
      line: 'Phone, reviews, dispatch, and more. Recurring subscriptions your audience can justify.',
    },
    {
      icon: Zap,
      title: 'Links & assets, fast onboarding',
      line: 'Approved partners get tracking links, approved copy, and a clear payout rhythm.',
    },
  ];

  const steps = [
    { n: '1', t: 'Apply', d: 'Quick form' },
    { n: '2', t: 'Get approved', d: 'We reply fast' },
    { n: '3', t: 'Share your link', d: 'We track sign-ups' },
    { n: '4', t: 'Get paid', d: 'Per your agreement' },
  ];

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {applyModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="affiliate-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close application"
            onClick={closeApplyModal}
          />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 id="affiliate-modal-title" className="text-lg font-bold text-gray-900 sm:text-xl">
                Partner application
              </h2>
              <button
                type="button"
                onClick={closeApplyModal}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {submitted ? (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
                    <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Application received</h3>
                  <p className="mt-2 text-gray-600">
                    Check your inbox for a confirmation. We&apos;ll follow up if there&apos;s a fit.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setForm(initialForm);
                    }}
                    className="mt-6 text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Submit another application
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Under two minutes. We review every application and reply by email.
                  </p>
                  {formError && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                      {formError}
                    </div>
                  )}
                  <div>
                    <label htmlFor="aff-name" className="mb-1 block text-sm font-semibold text-gray-800">
                      Full name <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="aff-name"
                      name="name"
                      required
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="aff-email" className="mb-1 block text-sm font-semibold text-gray-800">
                      Email <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="aff-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="aff-company" className="mb-1 block text-sm font-semibold text-gray-800">
                      Company or brand <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="aff-company"
                      name="company"
                      value={form.company}
                      onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="aff-web" className="mb-1 block text-sm font-semibold text-gray-800">
                      Website or main channel <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="aff-web"
                      name="website_or_channel"
                      placeholder="e.g. youtube.com/@you or yoursite.com"
                      value={form.website_or_channel}
                      onChange={(e) => setForm((f) => ({ ...f, website_or_channel: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="aff-audience" className="mb-1 block text-sm font-semibold text-gray-800">
                      Who is your audience? <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      id="aff-audience"
                      name="audience"
                      required
                      rows={3}
                      placeholder="Niche, size, and where they hang out"
                      value={form.audience}
                      onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="aff-plan" className="mb-1 block text-sm font-semibold text-gray-800">
                      How will you promote {APP_DISPLAY_NAME}? <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      id="aff-plan"
                      name="promote_plan"
                      required
                      rows={3}
                      placeholder="Content, ads, referrals, newsletter, etc."
                      value={form.promote_plan}
                      onChange={(e) => setForm((f) => ({ ...f, promote_plan: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {submitting ? 'Sending…' : 'Submit application'}
                    {!submitting && <ArrowRight className="h-5 w-5" aria-hidden />}
                  </button>
                  <p className="text-center text-xs text-gray-500">
                    By applying you agree we may email you about this program. See{' '}
                    <Link href="/legal/privacy" className="text-blue-600 hover:underline" onClick={closeApplyModal}>
                      Privacy policy
                    </Link>
                    .
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <nav className="border-b border-gray-200/80 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center">
            <Image
              src="/tavari-logo.png"
              alt={APP_DISPLAY_NAME}
              width={280}
              height={80}
              className="h-10 w-auto sm:h-11"
              priority
            />
          </Link>
          <div className="flex items-center gap-3 text-sm font-medium">
            <Link href="/" className="hidden text-gray-600 hover:text-blue-600 sm:inline">
              Home
            </Link>
            <Link href="/affiliate/dashboard" className="text-gray-600 hover:text-blue-600">
              Partner login
            </Link>
            <ApplyButton className="!px-5 !py-2.5 !text-sm" />
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-600 to-blue-700 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(255,255,255,0.15),transparent)]" />
          <div className="container relative mx-auto max-w-5xl px-4 py-14 sm:py-20 text-center">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-100">
              Direct partner program
            </p>
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl sm:leading-tight">
              Turn your audience into recurring revenue with {APP_DISPLAY_NAME}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-blue-100 sm:text-xl">
              We approve partners individually, then pay you for real subscriptions—not clicks that go nowhere.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <ApplyButton light />
              <p className="max-w-xs text-sm text-blue-200">
                Free to apply · No network fees · We respond to serious applications quickly
              </p>
            </div>
          </div>
        </section>

        <section className="container mx-auto max-w-5xl px-4 -mt-8 relative z-10">
          <div className="grid gap-4 sm:grid-cols-3">
            {benefits.map(({ icon: Icon, title, line }) => (
              <div
                key={title}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md shadow-gray-200/50"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                </div>
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{line}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="container mx-auto max-w-5xl px-4 py-16 sm:py-20">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">From application to payout</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-gray-600">
            Tap <strong>Apply</strong> anytime to open the form—it takes under two minutes.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
                  {s.n}
                </div>
                <p className="mt-3 font-semibold text-gray-900">{s.t}</p>
                <p className="text-sm text-gray-500">{s.d}</p>
              </div>
            ))}
          </div>

          <ul className="mx-auto mt-12 max-w-md space-y-3 text-gray-700">
            {[
              'Small business, agency, or creator audiences',
              'Honest claims—no “get rich with AI” hype',
              'Willing to use our approved links and disclosures',
            ].map((line) => (
              <li key={line} className="flex gap-3 text-sm sm:text-base">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-14 text-center">
            <ApplyButton />
            <p className="mt-4 text-sm text-gray-500">
              Questions?{' '}
              <a href={`mailto:${AFFILIATE_EMAIL}`} className="font-medium text-blue-600 hover:underline">
                {AFFILIATE_EMAIL}
              </a>
            </p>
          </div>
        </section>

        <section className="border-t border-gray-200 bg-white py-14">
          <div className="container mx-auto max-w-5xl px-4 text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Ready to partner?</h2>
            <p className="mx-auto mt-2 max-w-lg text-gray-600">
              Open the application with one tap—we&apos;ll get back to you by email.
            </p>
            <div className="mt-8">
              <ApplyButton />
            </div>
            <p className="mt-8 text-xs text-gray-400">
              Approved partner?{' '}
              <Link href="/affiliate/dashboard" className="text-blue-600 hover:underline">
                Partner dashboard
              </Link>
              {' · '}
              Already a customer?{' '}
              <Link href="/login" className="text-blue-600 hover:underline">
                Log in
              </Link>
              {' · '}
              <Link href="/legal/terms" className="text-blue-600 hover:underline">
                Terms
              </Link>{' '}
              ·{' '}
              <Link href="/legal/privacy" className="text-blue-600 hover:underline">
                Privacy
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
