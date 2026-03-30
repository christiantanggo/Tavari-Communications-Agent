'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';
import { AFFILIATE_REF_COOKIE, AFFILIATE_REF_MAX_AGE_SEC } from '@/lib/affiliateCookie';
import { getApiBaseUrl } from '@/lib/api';

const PRODUCT_CARDS = [
  {
    module_key: 'phone-agent',
    title: 'AI phone agent',
    blurb:
      'Never miss a call—an AI answers in your voice, books appointments, and hands off to you when it matters. Built for busy shops and service businesses.',
    cta: 'See how it works',
  },
  {
    module_key: 'delivery-dispatch',
    title: 'Local delivery',
    blurb:
      'Schedule pickup and delivery in our service area. Request online or by phone—upfront pricing and updates you can track.',
    path: '/deliverydispatch',
    cta: 'Start a delivery request',
  },
];

/** Skip duplicate click when we already counted /affiliate/go → this page. */
function cameFromTrackedShortLink() {
  try {
    if (typeof document === 'undefined' || !document.referrer) return false;
    return document.referrer.includes('/affiliate/go/');
  } catch {
    return false;
  }
}

export default function PartnerReferralLanding({ code, initial, nextPath }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.cookie = buildAffiliateRefClientCookie(code);
  }, [code]);

  useEffect(() => {
    if (cameFromTrackedShortLink()) return undefined;

    (async () => {
      try {
        await fetch(`${getApiBaseUrl()}/api/affiliate/track/click`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ affiliate_code: code }),
        });
      } catch {
        /* ignore */
      }
    })();
    return undefined;
  }, [code]);

  const firstName = (() => {
    const raw = (initial?.display_name || '').trim();
    if (!raw) return null;
    const part = raw.split(/\s+/)[0];
    return part || null;
  })();

  const q = `partner=${encodeURIComponent(code)}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900 hover:text-blue-700">
            {APP_DISPLAY_NAME}
          </Link>
          <Link href="/" className="text-sm font-medium text-slate-600 hover:text-blue-700">
            Visit homepage
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {firstName ? (
              <span className="text-slate-600">{firstName} thought you might like this</span>
            ) : (
              <span className="text-slate-600">Someone you know suggested {APP_DISPLAY_NAME}</span>
            )}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            You&apos;re on our real website—same products, pricing, and checkout as everyone else. Pick what you need below;
            there&apos;s nothing extra you have to do.
          </p>

          {nextPath ? (
            <div className="mt-8">
              <Link
                href={nextPath}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-center text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto"
              >
                Continue
              </Link>
            </div>
          ) : null}

          <section className="mt-12 border-t border-slate-100 pt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Popular with businesses</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {PRODUCT_CARDS.map((p) => {
                const href =
                  p.module_key === 'phone-agent'
                    ? `/join/phone-agent/${encodeURIComponent(code)}`
                    : `${p.path}?${q}`;
                return (
                  <div
                    key={p.module_key}
                    className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-6 transition hover:border-slate-300 hover:bg-white"
                  >
                    <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{p.blurb}</p>
                    <Link
                      href={href}
                      className="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      {p.cta}
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <details className="mt-8 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <summary className="cursor-pointer font-medium text-slate-700 outline-none hover:text-slate-900">
            Checkout asks for a code?
          </summary>
          <p className="mt-3 border-t border-slate-100 pt-3 leading-relaxed">
            Rarely, a payment screen may ask for a reference. Use this code:{' '}
            <span className="font-mono text-slate-800">{code}</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
              className="ml-2 font-medium text-blue-700 hover:text-blue-800 underline-offset-2 hover:underline"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </p>
        </details>
      </main>
    </div>
  );
}
