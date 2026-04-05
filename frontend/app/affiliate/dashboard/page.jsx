'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { getApiBaseUrl } from '@/lib/api';

function getAffiliateToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  const c = cookies.find((x) => x.trim().startsWith('affiliate_token='));
  if (!c) return null;
  return decodeURIComponent(c.split('=').slice(1).join('=').trim());
}

function clearAffiliateToken() {
  document.cookie = 'affiliate_token=; path=/; max-age=0';
}

export default function AffiliateDashboardPage() {
  const [email, setEmail] = useState('');
  const [requestMsg, setRequestMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  const navItems = useMemo(() => {
    const purchaseList = data?.purchases || [];
    const linked = data?.linked_businesses || [];
    return [
      { id: 'overview', label: 'Overview' },
      { id: 'profile', label: 'Your profile' },
      { id: 'commission', label: 'Commission & payouts' },
      { id: 'links', label: 'Your links' },
      {
        id: 'customers',
        label: 'Assigned customers',
        badge: linked.length > 0 ? linked.length : null,
      },
      {
        id: 'ledger',
        label: 'Commission ledger',
        badge: purchaseList.length > 0 ? purchaseList.length : null,
      },
    ];
  }, [data]);

  const loadMe = useCallback(async () => {
    const token = getAffiliateToken();
    if (!token) {
      setLoading(false);
      setData(null);
      return;
    }
    setError('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/affiliate/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) clearAffiliateToken();
        throw new Error(json.error || 'Session expired');
      }
      if (json.commission_selection_debug && typeof console !== 'undefined' && console.log) {
        console.log(
          '[affiliate /me] commission_selection_debug (see API terminal too if NEXT_PUBLIC_API_URL points at local backend)',
          json.commission_selection_debug,
        );
      }
      setData(json);
    } catch (e) {
      setError(e.message || 'Could not load dashboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (data?.partner) {
      setProfileDisplayName(data.partner.display_name || '');
      setProfileEmail(data.partner.email || '');
    }
  }, [data?.partner]);

  const saveProfile = async (e) => {
    e.preventDefault();
    const token = getAffiliateToken();
    if (!token) return;
    setProfileErr('');
    setProfileMsg('');
    setProfileSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/affiliate/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: profileDisplayName.trim(),
          email: profileEmail.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Could not save profile');
      }
      setProfileMsg('Your profile was updated.');
      await loadMe();
    } catch (err) {
      setProfileErr(err.message || 'Could not save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const requestLink = async (e) => {
    e.preventDefault();
    setRequestMsg('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/affiliate/request-link`, {
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

  const logout = () => {
    clearAffiliateToken();
    setData(null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  const purchases = data?.purchases || [];
  const linkedBusinesses = data?.linked_businesses || [];
  const earningsSummary = data?.earnings_summary;
  const commissionPolicy = data?.commission_policy;

  if (!data?.partner) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-md mx-auto bg-white rounded-xl shadow p-8">
          <h1 className="text-xl font-bold text-gray-900">Partner sign-in</h1>
          <p className="text-sm text-gray-600 mt-2">
            Use the link from your approval email, or enter your email to receive a new one-time sign-in link.
          </p>
          <form onSubmit={requestLink} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-medium py-2 rounded-md hover:bg-blue-700"
            >
              Email me a link
            </button>
          </form>
          {requestMsg && <p className="mt-4 text-sm text-gray-700">{requestMsg}</p>}
          <p className="mt-6 text-sm">
            <Link href="/affiliates" className="text-blue-600 hover:underline">
              ← Partner program
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const {
    partner,
    stats,
    tracking_link: trackingLink,
    landing_page_url: landingPageUrl,
    join_urls: joinUrls,
  } = data;

  const activeLedgerPurchases = purchases.filter((p) => p.status !== 'reversed');
  const allPurchasesReversed =
    purchases.length > 0 && activeLedgerPurchases.length === 0;
  const noLedgerButLinked =
    linkedBusinesses.length > 0 &&
    (stats?.attributed_sales ?? 0) === 0 &&
    (stats?.gross_sales_cents ?? 0) === 0;

  const formatLedgerSource = (p) => {
    if (p.attribution_source === 'business_referral_assignment') {
      if (p.source === 'stripe_subscription_renewal') return 'Stripe renewal (account assignment)';
      if (p.source === 'stripe_checkout') return 'Stripe first payment (account assignment)';
    }
    if (p.source === 'stripe_checkout') return 'Stripe (first payment)';
    if (p.source === 'stripe_subscription_renewal') return 'Stripe (renewal)';
    if (p.source === 'stripe_delivery_checkout') return 'Stripe (delivery)';
    if (p.source === 'manual_admin') return 'Manual (admin)';
    if (p.earning_type === 'delivery_payment') return 'Delivery payment';
    if (p.earning_type === 'recurring') return 'Subscription renewal';
    if (p.earning_type === 'first_sale') return 'First sale';
    if (p.earning_type === 'manual') return 'Manual';
    return p.source || p.earning_type || '—';
  };

  const moduleLabel = (key) => {
    if (key === 'phone-agent') return 'Phone agent';
    if (key === 'delivery-dispatch') return 'Delivery';
    return key || '—';
  };

  const recurringLimitDescription = (m) => {
    if (!m.recurring_enabled) return null;
    const mode = m.recurring_limit_mode || 'unlimited';
    if (mode === 'unlimited') return 'Renewals run indefinitely (subject to refund rules).';
    if (mode === 'months' && m.recurring_limit_months != null) {
      return `Renewals paid within ${m.recurring_limit_months} calendar month(s) of the subscription start date.`;
    }
    if (mode === 'transactions' && m.recurring_limit_transactions != null) {
      return `Up to ${m.recurring_limit_transactions} renewal payment(s) per subscription (after the first sale).`;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partner dashboard</h1>
            <p className="text-gray-600 mt-1">{partner.display_name}</p>
            <p className="text-sm text-gray-500">{partner.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-sm text-gray-600 hover:text-gray-900 underline shrink-0"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 flex flex-col lg:flex-row gap-6 lg:gap-8">
        <nav
          className="lg:w-56 shrink-0 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0 lg:sticky lg:top-6 lg:self-start"
          aria-label="Dashboard sections"
        >
          {navItems.map(({ id, label, badge }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={`text-left rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap lg:whitespace-normal border lg:border-0 shrink-0 lg:shrink ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600 lg:border-l-4 lg:border-l-blue-600 lg:border-y-0 lg:border-r-0 lg:bg-blue-50 lg:text-blue-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 lg:bg-transparent lg:border-l-4 lg:border-transparent lg:hover:bg-gray-100/80'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{label}</span>
                  {badge != null ? (
                    <span
                      className={`tabular-nums text-xs font-semibold rounded-full px-2 py-0.5 min-w-[1.25rem] text-center ${
                        isActive
                          ? 'bg-white/20 text-white lg:bg-blue-200 lg:text-blue-900'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 min-w-0 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 text-red-800 text-sm px-4 py-2">{error}</div>
          )}

          {activeSection === 'overview' && (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">How the numbers work</p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-600">
                  <li>
                    <strong>Gross sales (ledger)</strong> and <strong>Attributed sales</strong> come from your{' '}
                    <strong>commission ledger</strong> only — created when Stripe confirms a payment we attribute to you
                    (or when staff records a manual sale).
                  </li>
                  <li>
                    <strong>Customers assigned to you</strong> only sets who gets credit on <strong>future</strong>{' '}
                    checkouts and renewals when checkout metadata has no other affiliate code. It does{' '}
                    <strong>not</strong> import older charges.
                  </li>
                  <li>
                    <strong>Event conversions</strong> / <strong>Event revenue</strong> count separate tracking events,
                    not the ledger — often zero unless those events were posted.
                  </li>
                </ul>
              </div>

              {noLedgerButLinked && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  You have linked customers but <strong>no ledger sales yet</strong>. The payment you are thinking of was
                  probably processed before the link existed or before our system could attribute it. The next
                  subscription renewal or new checkout (with no other affiliate code in Stripe) should add a row here
                  and update the top totals. To credit a past payment now, Tavari staff can record it under Admin →
                  Affiliates.
                </div>
              )}

              {allPurchasesReversed && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  Your ledger only shows <strong>reversed</strong> rows (e.g. refunds). The top cards intentionally
                  exclude those, so gross can show <strong>$0.00</strong> even though the table lists old amounts.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 items-stretch">
                {[
                  ['Clicks', stats.clicks],
                  ['Leads', stats.leads],
                  ['Event conversions', stats.conversions],
                  ['Attributed sales (ledger)', stats.attributed_sales ?? '—'],
                  ['Gross sales (ledger)', `$${((stats.gross_sales_cents ?? 0) / 100).toFixed(2)}`],
                  ['Event revenue (gross)', `$${((stats.revenue_cents ?? 0) / 100).toFixed(2)}`],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    className="bg-white rounded-lg shadow p-4 flex flex-col h-full min-h-[6.75rem] sm:min-h-[7.25rem]"
                  >
                    <p className="text-[11px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide leading-snug flex-1">
                      {label}
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums shrink-0 pt-2 border-t border-gray-100 mt-2">
                      {val}
                    </p>
                  </div>
                ))}
              </div>

              {earningsSummary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
                  {[
                    ['Commission (in refund hold)', earningsSummary.commission_accruing_cents],
                    ['Commission (eligible to pay)', earningsSummary.commission_eligible_cents],
                    ['Commission (paid out)', earningsSummary.commission_paid_cents],
                  ].map(([label, cents]) => (
                    <div
                      key={label}
                      className="bg-white rounded-lg shadow p-4 border border-emerald-100 flex flex-col h-full min-h-[6.5rem] sm:min-h-[7rem]"
                    >
                      <p className="text-[11px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide leading-snug flex-1">
                        {label}
                      </p>
                      <p className="text-lg sm:text-xl font-bold text-emerald-900 tabular-nums shrink-0 pt-2 border-t border-emerald-100/80 mt-2">
                        ${((Number(cents) || 0) / 100).toFixed(2)} CAD
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeSection === 'profile' && (
            <div className="bg-white rounded-xl shadow p-6 border border-slate-100 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Your profile</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Update the name and email shown on your account. Your partner code does not change.
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
                <p className="text-gray-500">Partner code</p>
                <p className="font-mono text-base font-medium text-gray-900 mt-0.5">{partner.affiliate_code}</p>
                <p className="text-xs text-gray-500 mt-2">
                  This code is assigned by Tavari and cannot be edited here. Contact support if you need a change.
                </p>
              </div>

              <form onSubmit={saveProfile} className="space-y-4 max-w-lg">
                <div>
                  <label htmlFor="aff-profile-name" className="block text-sm font-medium text-gray-700">
                    Display name
                  </label>
                  <input
                    id="aff-profile-name"
                    type="text"
                    required
                    maxLength={200}
                    value={profileDisplayName}
                    onChange={(ev) => setProfileDisplayName(ev.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="aff-profile-email" className="block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    id="aff-profile-email"
                    type="email"
                    required
                    maxLength={320}
                    value={profileEmail}
                    onChange={(ev) => setProfileEmail(ev.target.value)}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
                    autoComplete="email"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    Use this same address when you request a new sign-in link from the partner login page.
                  </p>
                </div>

                {profileErr && (
                  <div className="rounded-md bg-red-50 text-red-800 text-sm px-3 py-2">{profileErr}</div>
                )}
                {profileMsg && (
                  <div className="rounded-md bg-emerald-50 text-emerald-900 text-sm px-3 py-2">{profileMsg}</div>
                )}

                <button
                  type="submit"
                  disabled={profileSaving}
                  className="inline-flex items-center justify-center bg-blue-600 text-white font-medium px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {profileSaving ? 'Saving…' : 'Save changes'}
                </button>
              </form>
            </div>
          )}

          {activeSection === 'commission' && (
            <>
              {commissionPolicy ? (
                <div className="bg-white rounded-xl shadow p-6 space-y-4 border border-slate-100">
                  <h2 className="text-lg font-semibold text-gray-900">How you get paid</h2>
                  <p className="text-sm text-gray-600">
                    Commissions accrue when we receive payment. We hold each sale for the refund window below; after
                    that, eligible commission counts toward payouts once you meet the payout minimum. Stripe refunds
                    reverse commission that has not been paid yet.
                  </p>

                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-900">Your commission rates</p>
                    <p className="text-xs text-gray-600">
                      Percentages below are Tavari&apos;s live program settings (same as the Affiliate commission screen
                      in admin). This is what partners should expect unless Tavari agreed a custom deal (see note after
                      payout rules if that applies).
                    </p>
                    {(commissionPolicy.by_module || []).map((m) => {
                      const recDesc = recurringLimitDescription(m);
                      return (
                        <div key={m.module_key} className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-gray-800">
                          <p className="font-semibold text-gray-900">{moduleLabel(m.module_key)}</p>
                          <p className="mt-1">
                            First payment: <strong>{m.first_sale_commission_percent}%</strong>
                            {m.recurring_enabled ? (
                              <>
                                {' '}
                                · Renewals: <strong>{m.recurring_commission_percent}%</strong>
                              </>
                            ) : (
                              <span className="text-gray-500"> · Renewals off</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Hold {m.refund_hold_days}d · Payout min ${(m.payout_minimum_cents / 100).toFixed(2)} CAD
                            {m.module_key === 'delivery-dispatch' &&
                            m.delivery_min_paid_sales_before_payout != null ? (
                              <>
                                {' '}
                                · Delivery volume gate:{' '}
                                <strong>{m.delivery_min_paid_sales_before_payout}</strong> paid checkouts before
                                delivery commissions clear the gate
                              </>
                            ) : null}
                          </p>
                          {recDesc && (
                            <p className="text-xs text-gray-600 mt-2 border-t border-slate-200/80 pt-2">{recDesc}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
                    <li>
                      Default payout minimum:{' '}
                      <strong>${(commissionPolicy.payout_minimum_cents / 100).toFixed(2)} CAD</strong> (modules can
                      override).
                    </li>
                    <li>
                      Default refund hold: <strong>{commissionPolicy.refund_hold_days_default} days</strong> after
                      payment.
                    </li>
                    <li>
                      Your attributed delivery checkouts (paid):{' '}
                      <strong>{commissionPolicy.delivery_paid_checkouts_attributed}</strong>
                    </li>
                  </ul>

                  <p className="text-xs text-gray-600 border-t border-gray-100 pt-3">
                    Commission on each ledger row was computed from the module rules in effect when that payment was
                    recorded (and the module on that row, e.g. phone agent vs delivery).
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-200 p-6">
                  Commission policy details are not available right now. Refresh the page or contact support if this
                  persists.
                </p>
              )}
            </>
          )}

          {activeSection === 'links' && (
            <div className="bg-white rounded-xl shadow p-6 space-y-6">
              <div>
                <p className="text-sm font-medium text-gray-700">Partner code</p>
                <p className="mt-1 font-mono text-lg bg-gray-100 inline-block px-3 py-1 rounded">
                  {partner.affiliate_code}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Your tracking link (short)</p>
                <p className="mt-2">
                  <Link
                    href={`/affiliate/go/${encodeURIComponent(partner.affiliate_code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex text-sm font-medium text-blue-700 underline hover:text-blue-900"
                  >
                    Open tracking link
                  </Link>
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Records a click, sets a 30-day cookie, then sends visitors to your short hub (
                  <span className="font-mono text-gray-600">/r/your-code</span>).
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-600">Copy for emails or ads:</span>{' '}
                  <a
                    href={trackingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-gray-700 underline break-all"
                  >
                    {trackingLink}
                  </a>
                </p>
              </div>
              {joinUrls?.phone_agent ? (
                <div>
                  <p className="text-sm font-medium text-gray-700">AI Phone — full customer page (recommended)</p>
                  <p className="mt-2">
                    <Link
                      href={`/join/phone-agent/${encodeURIComponent(partner.affiliate_code)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-sm font-medium text-blue-700 underline hover:text-blue-900"
                    >
                      Open AI Phone signup page
                    </Link>
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    One page: product story, live demo, account creation, plan choice, and card checkout. Best for
                    attribution to you.
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Copy full URL:</span>{' '}
                    <a
                      href={joinUrls.phone_agent}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-gray-700 underline break-all"
                    >
                      {joinUrls.phone_agent}
                    </a>
                  </p>
                </div>
              ) : null}
              {joinUrls?.review_reply ? (
                <div>
                  <p className="text-sm font-medium text-gray-700">Review Reply AI — full funnel (Stripe)</p>
                  <p className="mt-2">
                    <Link
                      href={`/join/reviews/${encodeURIComponent(partner.affiliate_code)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-sm font-medium text-blue-700 underline hover:text-blue-900"
                    >
                      Open Review Reply signup &amp; checkout
                    </Link>
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    Same flow as the short hub card: account, plan, and card checkout. Also linked from{' '}
                    <span className="font-mono text-gray-600">/r/your-code</span> under Review Reply.
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Copy full URL:</span>{' '}
                    <a
                      href={joinUrls.review_reply}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-gray-700 underline break-all"
                    >
                      {joinUrls.review_reply}
                    </a>
                  </p>
                </div>
              ) : null}
              {joinUrls?.delivery_dispatch ? (
                <div>
                  <p className="text-sm font-medium text-gray-700">Last-mile delivery dispatch</p>
                  <p className="mt-2">
                    <Link
                      href={`/deliverydispatch?partner=${encodeURIComponent(partner.affiliate_code)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-sm font-medium text-blue-700 underline hover:text-blue-900"
                    >
                      Open delivery request page
                    </Link>
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    Public pickup &amp; delivery requests. Your partner code is stored in a cookie so paid checkouts can
                    credit your commission (same program rules as delivery in your commission section).
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Copy full URL:</span>{' '}
                    <a
                      href={joinUrls.delivery_dispatch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-gray-700 underline break-all"
                    >
                      {joinUrls.delivery_dispatch}
                    </a>
                  </p>
                </div>
              ) : null}
              {landingPageUrl ? (
                <div>
                  <p className="text-sm font-medium text-gray-700">Short hub (multiple products)</p>
                  <p className="mt-2">
                    <Link
                      href={`/r/${encodeURIComponent(partner.affiliate_code)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-sm font-medium text-blue-700 underline hover:text-blue-900"
                    >
                      Open short hub
                    </Link>
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Lighter page with links to AI Phone, Review Reply (Stripe), and Delivery. Use the dedicated links
                    above when you promote a single product.
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Copy for sharing (production URL):</span>{' '}
                    <a
                      href={landingPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-gray-700 underline break-all"
                    >
                      {landingPageUrl}
                    </a>
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {activeSection === 'customers' && (
            <div className="bg-white rounded-xl shadow overflow-hidden border border-slate-100">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Customers assigned to you</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Tavari linked these accounts to your partner record. Future subscription payments will credit you when
                  checkout does not carry a different affiliate code. Use this list to match customers you referred.
                </p>
              </div>
              {linkedBusinesses.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2">Business</th>
                        <th className="px-4 py-2">Email</th>
                        <th className="px-4 py-2">Since</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {linkedBusinesses.map((b) => (
                        <tr key={b.id}>
                          <td className="px-4 py-2 font-medium text-gray-900">{b.name || '—'}</td>
                          <td className="px-4 py-2 text-gray-700">{b.email || '—'}</td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                            {b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-8 text-sm text-gray-600 text-center">No customers are assigned to you yet.</p>
              )}
            </div>
          )}

          {activeSection === 'ledger' && (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Commission ledger (recent)</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Gross sale, your commission, and status (accruing = refund hold or volume gate; eligible = ready for
                  batch payout).
                </p>
              </div>
              {purchases.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Module</th>
                        <th className="px-4 py-2">Gross</th>
                        <th className="px-4 py-2">Commission</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Hold until</th>
                        <th className="px-4 py-2">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {purchases.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                            {p.created_at
                              ? new Date(p.created_at).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{moduleLabel(p.module_key)}</td>
                          <td className="px-4 py-2 font-medium text-gray-900">
                            {p.amount_cents != null
                              ? `${(p.currency || 'CAD').toUpperCase()} $${(p.amount_cents / 100).toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-emerald-900 font-medium">
                            {p.commission_cents != null
                              ? `${(p.currency || 'CAD').toUpperCase()} $${(p.commission_cents / 100).toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-gray-700 capitalize">{p.status || '—'}</td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap text-xs">
                            {p.refund_hold_until
                              ? new Date(p.refund_hold_until).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-gray-600">{formatLedgerSource(p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-8 text-sm text-gray-600 text-center">No ledger entries yet.</p>
              )}
            </div>
          )}

          <p className="text-sm text-center text-gray-500 pt-2">
            <Link href="/affiliates" className="text-blue-600 hover:underline">
              Program information
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
