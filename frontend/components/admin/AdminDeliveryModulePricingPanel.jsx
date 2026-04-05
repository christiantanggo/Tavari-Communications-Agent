'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getApiBaseUrl } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

function getAdminToken() {
  if (typeof document === 'undefined') return null;
  return (
    document.cookie
      .split(';')
      .find((c) => c.trim().startsWith('admin_token='))
      ?.split('=')[1]
      ?.trim() || null
  );
}

function billingFromConfig(b) {
  return {
    price_basic_cents: b?.price_basic_cents ?? '',
    price_priority_cents: b?.price_priority_cents ?? '',
    price_premium_cents: b?.price_premium_cents ?? '',
    sms_fee_cents: b?.sms_fee_cents ?? '',
    quote_margin_cents: b?.quote_margin_cents ?? '',
    margin_multiplier: b?.margin_multiplier ?? 1.4,
    minimum_delivery_price_cad: b?.minimum_delivery_price_cad ?? 15,
    minimum_enabled: b?.minimum_enabled !== false,
    exchange_rate_source: b?.exchange_rate_source === 'manual' ? 'manual' : 'automatic',
    manual_exchange_rate_cad_per_usd: b?.manual_exchange_rate_cad_per_usd ?? 1.35,
  };
}

function normalizeBillingForSave(form) {
  const num = (v) => {
    if (v === '' || v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    price_basic_cents: num(form.price_basic_cents) != null ? Math.round(num(form.price_basic_cents)) : undefined,
    price_priority_cents: num(form.price_priority_cents) != null ? Math.round(num(form.price_priority_cents)) : undefined,
    price_premium_cents: num(form.price_premium_cents) != null ? Math.round(num(form.price_premium_cents)) : undefined,
    sms_fee_cents: num(form.sms_fee_cents) != null ? Math.round(num(form.sms_fee_cents)) : undefined,
    quote_margin_cents: num(form.quote_margin_cents) != null ? Math.round(num(form.quote_margin_cents)) : undefined,
    margin_multiplier: num(form.margin_multiplier),
    minimum_delivery_price_cad: num(form.minimum_delivery_price_cad),
    minimum_enabled: !!form.minimum_enabled,
    exchange_rate_source: form.exchange_rate_source === 'automatic' ? 'automatic' : 'manual',
    manual_exchange_rate_cad_per_usd: num(form.manual_exchange_rate_cad_per_usd),
  };
}

/**
 * Global last-mile delivery quote & margin settings (delivery_network_config.value.billing).
 * Shown under Admin → Pricing when the delivery-dispatch module tab is selected.
 */
export default function AdminDeliveryModulePricingPanel() {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState(() => billingFromConfig({}));

  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/config?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = res.ok ? await res.json() : {};
      setBilling(billingFromConfig(data.billing));
    } catch (e) {
      console.error(e);
      showError('Failed to load delivery pricing settings');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e) => {
    e?.preventDefault();
    const token = getAdminToken();
    if (!token) {
      showError('Not signed in as admin');
      return;
    }
    const normalized = normalizeBillingForSave(billing);
    Object.keys(normalized).forEach((k) => {
      if (normalized[k] === undefined) delete normalized[k];
    });
    if (
      normalized.margin_multiplier != null &&
      (normalized.margin_multiplier <= 0 || Number.isNaN(normalized.margin_multiplier))
    ) {
      showError('Margin multiplier must be a positive number');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v2/admin/delivery-operator/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ billing: normalized }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || res.statusText);
      success('Delivery pricing settings saved');
      if (body.billing) setBilling(billingFromConfig(body.billing));
      else await load();
    } catch (err) {
      showError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const mult = Number(billing.margin_multiplier);
  const markupPct =
    Number.isFinite(mult) && mult > 0 ? Math.round((mult - 1) * 100) : null;

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading delivery pricing…</div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-white shadow-sm overflow-hidden mb-4">
      <div className="border-b border-emerald-100 bg-emerald-50/90 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Delivery dispatch — quote pricing & margins</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          These settings control how customer-facing delivery quotes are calculated from broker cost (USD → CAD, then
          markup and minimum), plus legacy flat dispatch rates. They apply globally.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Line numbers, Shipday keys, and notifications:{' '}
          <Link href="/admin/delivery-operator" className="text-emerald-800 font-medium hover:underline">
            Last-Mile Delivery admin
          </Link>
          .
        </p>
      </div>

      <form onSubmit={save} className="p-5 space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Pricing engine (Shipday / on-demand quotes)</h3>
          <p className="text-xs text-slate-600 mb-4 max-w-3xl">
            Final price (CAD) = CEILING( MAX( broker cost in USD × exchange rate × margin multiplier, minimum price ) ).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Margin multiplier</label>
              <input
                type="number"
                step="0.01"
                min="1"
                value={billing.margin_multiplier}
                onChange={(e) => setBilling((b) => ({ ...b, margin_multiplier: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900"
              />
              {markupPct != null ? (
                <p className="text-xs text-slate-500 mt-1">≈ {markupPct}% markup on landed CAD cost before minimum</p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Minimum delivery price (CAD)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={billing.minimum_delivery_price_cad}
                onChange={(e) => setBilling((b) => ({ ...b, minimum_delivery_price_cad: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900"
              />
            </div>
            <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 pt-6 lg:pt-8">
              <input
                type="checkbox"
                checked={!!billing.minimum_enabled}
                onChange={(e) => setBilling((b) => ({ ...b, minimum_enabled: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Enforce minimum when quote is lower</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">USD → CAD rate source</label>
              <select
                value={billing.exchange_rate_source}
                onChange={(e) => setBilling((b) => ({ ...b, exchange_rate_source: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900"
              >
                <option value="automatic">Automatic (env DELIVERY_USD_TO_CAD_RATE, else fallback below)</option>
                <option value="manual">Manual (fallback rate only)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fallback rate (CAD per 1 USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={billing.manual_exchange_rate_cad_per_usd}
                onChange={(e) => setBilling((b) => ({ ...b, manual_exchange_rate_cad_per_usd: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900"
              />
              <p className="text-xs text-slate-500 mt-1">
                With Automatic, set server env <code className="text-slate-700">DELIVERY_USD_TO_CAD_RATE</code> for the
                live rate; otherwise this fallback is used.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Legacy flat dispatch rates (cents)</h3>
          <p className="text-xs text-slate-600 mb-4">
            Used when the pricing engine or Shipday path does not apply; optional add-ons in older flows.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              ['price_basic_cents', 'Basic (cents)'],
              ['price_priority_cents', 'Priority (cents)'],
              ['price_premium_cents', 'Premium (cents)'],
              ['sms_fee_cents', 'SMS fee (cents)'],
              ['quote_margin_cents', 'Quote margin (cents)'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                <input
                  type="number"
                  value={billing[key]}
                  onChange={(e) => setBilling((b) => ({ ...b, [key]: e.target.value }))}
                  placeholder="—"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save delivery pricing'}
          </button>
        </div>
      </form>
    </div>
  );
}
