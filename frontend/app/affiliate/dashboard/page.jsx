'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getApiBaseUrl } from '@/lib/api';
import { APP_DISPLAY_NAME } from '@/lib/appBrand';

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
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-start gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partner dashboard</h1>
            <p className="text-gray-600 mt-1">{partner.display_name}</p>
            <p className="text-sm text-gray-500">{partner.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Sign out
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-800 text-sm px-4 py-2">{error}</div>
        )}

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">How the numbers work</p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-600">
            <li>
              <strong>Gross sales (ledger)</strong> and <strong>Attributed sales</strong> come from your{' '}
              <strong>commission ledger</strong> only — created when Stripe confirms a payment we attribute to you (or
              when staff records a manual sale).
            </li>
            <li>
              <strong>Customers assigned to you</strong> only sets who gets credit on <strong>future</strong> checkouts
              and renewals when checkout metadata has no other affiliate code. It does <strong>not</strong> import older
              charges.
            </li>
            <li>
              <strong>Event conversions</strong> / <strong>Event revenue</strong> count separate tracking events, not the
              ledger — often zero unless those events were posted.
            </li>
          </ul>
        </div>

        {noLedgerButLinked && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            You have linked customers but <strong>no ledger sales yet</strong>. The payment you are thinking of was
            probably processed before the link existed or before our system could attribute it. The next subscription
            renewal or new checkout (with no other affiliate code in Stripe) should add a row here and update the top
            totals. To credit a past payment now, Tavari staff can record it under Admin → Affiliates.
          </div>
        )}

        {allPurchasesReversed && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Your ledger only shows <strong>reversed</strong> rows (e.g. refunds). The top cards intentionally exclude
            those, so gross can show <strong>$0.00</strong> even though the table lists old amounts.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8 items-stretch">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 items-stretch">
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

        {commissionPolicy && (
          <div className="bg-white rounded-xl shadow p-6 space-y-4 mb-8 border border-slate-100">
            <h2 className="text-lg font-semibold text-gray-900">How you get paid</h2>
            <p className="text-sm text-gray-600">
              Commissions accrue when we receive payment. We hold each sale for the refund window below; after that,
              eligible commission counts toward payouts once you meet the payout minimum. Stripe refunds reverse
              commission that has not been paid yet.
            </p>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">Your commission rates</p>
              <p className="text-xs text-gray-600">
                Percentages below are Tavari&apos;s live program settings (same as the Affiliate commission screen in
                admin). This is what partners should expect unless Tavari agreed a custom deal (see note after payout
                rules if that applies).
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
                      {m.module_key === 'delivery-dispatch' && m.delivery_min_paid_sales_before_payout != null ? (
                        <>
                          {' '}
                          · Delivery volume gate:{' '}
                          <strong>{m.delivery_min_paid_sales_before_payout}</strong> paid checkouts before delivery
                          commissions clear the gate
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
                <strong>${(commissionPolicy.payout_minimum_cents / 100).toFixed(2)} CAD</strong> (modules can override).
              </li>
              <li>
                Default refund hold: <strong>{commissionPolicy.refund_hold_days_default} days</strong> after payment.
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
        )}

        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Partner code</p>
            <p className="mt-1 font-mono text-lg bg-gray-100 inline-block px-3 py-1 rounded">{partner.affiliate_code}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Your tracking link (short)</p>
            <p className="mt-1 text-sm text-blue-700 break-all">{trackingLink}</p>
            <p className="text-xs text-gray-500 mt-2">
              Records a click, sets a 30-day cookie, then sends them to your short customer link (<span className="font-mono text-gray-600">/r/your-code</span>) below.
            </p>
          </div>
          {joinUrls?.phone_agent ? (
            <div>
              <p className="text-sm font-medium text-gray-700">AI Phone — full customer page (recommended)</p>
              <p className="mt-1 text-sm text-blue-700 break-all">{joinUrls.phone_agent}</p>
              <p className="text-xs text-gray-500 mt-2">
                One page: product story, live demo, account creation, plan choice, and card checkout. Returns here after
                Stripe so they can finish setup. Best for attribution to you.
              </p>
            </div>
          ) : null}
          {landingPageUrl ? (
            <div>
              <p className="text-sm font-medium text-gray-700">Short hub (multiple products)</p>
              <p className="mt-1 text-sm text-blue-700 break-all">{landingPageUrl}</p>
              <p className="text-xs text-gray-500 mt-2">
                Lighter page with links to AI Phone and Delivery. Use the AI Phone link above when you only promote
                phone agent.
              </p>
            </div>
          ) : null}
        </div>

        {linkedBusinesses.length > 0 && (
          <div className="mt-8 bg-white rounded-xl shadow overflow-hidden border border-slate-100">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Customers assigned to you</h2>
              <p className="text-xs text-gray-500 mt-1">
                Tavari linked these accounts to your partner record. Future subscription payments will credit you when
                checkout does not carry a different affiliate code. Use this list to match customers you referred.
              </p>
            </div>
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
          </div>
        )}

        {purchases.length > 0 && (
          <div className="mt-8 bg-white rounded-xl shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Commission ledger (recent)</h2>
              <p className="text-xs text-gray-500 mt-1">
                Gross sale, your commission, and status (accruing = refund hold or volume gate; eligible = ready for
                batch payout).
              </p>
            </div>
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
          </div>
        )}

        <p className="mt-8 text-sm text-center text-gray-500">
          <Link href="/affiliates" className="text-blue-600 hover:underline">
            Program information
          </Link>
        </p>
      </div>
    </div>
  );
}
