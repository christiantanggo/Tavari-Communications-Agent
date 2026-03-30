'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function getAdminToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find((c) => c.trim().startsWith('admin_token='));
  return tokenCookie ? tokenCookie.split('=')[1] : null;
}

/**
 * Global + per-module affiliate commission forms. Used on /admin/affiliates (tab) and /admin/affiliate-commission.
 */
export default function AffiliateCommissionSettingsPanel({ variant = 'embedded' }) {
  const showBackLink = variant === 'standalone';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [globalRow, setGlobalRow] = useState(null);
  const [modules, setModules] = useState([]);
  const [globalMsg, setGlobalMsg] = useState('');
  const [globalBusy, setGlobalBusy] = useState(false);
  const [moduleBusy, setModuleBusy] = useState(null);
  const [moduleMsg, setModuleMsg] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-commission-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setGlobalRow(data.global || null);
      setModules(data.modules || []);
    } catch (e) {
      setError(e.message || 'Failed to load');
      setGlobalRow(null);
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveGlobal = async (e) => {
    e.preventDefault();
    setGlobalBusy(true);
    setGlobalMsg('');
    const fd = new FormData(e.target);
    const limitMode = String(fd.get('recurring_limit_mode') || 'unlimited');
    const body = {
      first_sale_commission_percent: parseFloat(fd.get('first_sale_commission_percent')),
      recurring_commission_percent: parseFloat(fd.get('recurring_commission_percent')),
      payout_minimum_cents: Math.round(parseFloat(fd.get('payout_minimum_dollars')) * 100),
      refund_hold_days: Math.floor(parseInt(fd.get('refund_hold_days'), 10)),
      delivery_min_paid_sales_before_payout: Math.floor(
        parseInt(fd.get('delivery_min_paid_sales_before_payout'), 10),
      ),
      recurring_limit_mode: limitMode,
      recurring_limit_months: null,
      recurring_limit_transactions: null,
    };
    if (limitMode === 'months') {
      const n = Math.floor(parseInt(fd.get('recurring_limit_months'), 10));
      if (Number.isNaN(n) || n < 1) {
        setGlobalMsg('Enter recurring limit months (1 or more).');
        setGlobalBusy(false);
        return;
      }
      body.recurring_limit_months = n;
    } else if (limitMode === 'transactions') {
      const n = Math.floor(parseInt(fd.get('recurring_limit_transactions'), 10));
      if (Number.isNaN(n) || n < 1) {
        setGlobalMsg('Enter max renewal transactions (1 or more).');
        setGlobalBusy(false);
        return;
      }
      body.recurring_limit_transactions = n;
    }
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-commission-settings/global`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setGlobalRow(data.global);
      setGlobalMsg('Saved.');
    } catch (err) {
      setGlobalMsg(err.message || 'Save failed');
    } finally {
      setGlobalBusy(false);
    }
  };

  const saveModule = async (moduleKey, form) => {
    const fd = new FormData(form);
    const firstRaw = String(fd.get('first_sale_commission_percent') || '').trim();
    const recRaw = String(fd.get('recurring_commission_percent') || '').trim();
    const payoutRaw = String(fd.get('payout_minimum_dollars') || '').trim();
    const holdRaw = String(fd.get('refund_hold_days') || '').trim();
    const delRaw = String(fd.get('delivery_min_paid_sales_before_payout') || '').trim();

    const body = {
      recurring_commission_enabled: fd.get('recurring_commission_enabled') === 'on',
    };
    if (firstRaw === '') body.first_sale_commission_percent = null;
    else body.first_sale_commission_percent = parseFloat(firstRaw);
    if (recRaw === '') body.recurring_commission_percent = null;
    else body.recurring_commission_percent = parseFloat(recRaw);
    if (payoutRaw === '') body.payout_minimum_cents = null;
    else body.payout_minimum_cents = Math.round(parseFloat(payoutRaw) * 100);
    if (holdRaw === '') body.refund_hold_days = null;
    else body.refund_hold_days = Math.floor(parseInt(holdRaw, 10));
    if (delRaw === '') body.delivery_min_paid_sales_before_payout = null;
    else body.delivery_min_paid_sales_before_payout = Math.floor(parseInt(delRaw, 10));

    const limModeRaw = String(fd.get('recurring_limit_mode') || '').trim();
    if (!limModeRaw || limModeRaw === 'inherit') {
      body.recurring_limit_mode = null;
      body.recurring_limit_months = null;
      body.recurring_limit_transactions = null;
    } else if (limModeRaw === 'unlimited') {
      body.recurring_limit_mode = 'unlimited';
      body.recurring_limit_months = null;
      body.recurring_limit_transactions = null;
    } else if (limModeRaw === 'months') {
      body.recurring_limit_mode = 'months';
      const n = Math.floor(parseInt(String(fd.get('recurring_limit_months') || '').trim(), 10));
      if (Number.isNaN(n) || n < 1) {
        setModuleMsg((m) => ({ ...m, [moduleKey]: 'Recurring “months” override needs an integer ≥ 1.' }));
        setModuleBusy(null);
        return;
      }
      body.recurring_limit_months = n;
      body.recurring_limit_transactions = null;
    } else if (limModeRaw === 'transactions') {
      body.recurring_limit_mode = 'transactions';
      const n = Math.floor(parseInt(String(fd.get('recurring_limit_transactions') || '').trim(), 10));
      if (Number.isNaN(n) || n < 1) {
        setModuleMsg((m) => ({ ...m, [moduleKey]: 'Recurring “transactions” override needs an integer ≥ 1.' }));
        setModuleBusy(null);
        return;
      }
      body.recurring_limit_transactions = n;
      body.recurring_limit_months = null;
    }

    setModuleBusy(moduleKey);
    setModuleMsg((m) => ({ ...m, [moduleKey]: '' }));
    try {
      const token = getAdminToken();
      const res = await fetch(
        `${API_URL}/api/admin/affiliate-commission-settings/modules/${encodeURIComponent(moduleKey)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setModules((prev) => prev.map((row) => (row.module_key === moduleKey ? data.module : row)));
      setModuleMsg((m) => ({ ...m, [moduleKey]: 'Saved.' }));
    } catch (err) {
      setModuleMsg((m) => ({ ...m, [moduleKey]: err.message || 'Save failed' }));
    } finally {
      setModuleBusy(null);
    }
  };

  if (loading && !globalRow && !error) {
    return (
      <div className="flex items-center justify-center min-h-[30vh] rounded-lg border border-gray-100 bg-white">
        <p className="text-gray-600">Loading commission settings…</p>
      </div>
    );
  }

  const g = globalRow || {};

  return (
    <div>
      {showBackLink ? (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Affiliate commission rules</h1>
          <p className="mt-2 text-sm text-gray-600">
            Global defaults apply to every module unless a module row overrides a field (empty override = inherit
            global). Delivery uses a minimum number of paid checkouts per partner before delivery commissions can leave
            the hold pipeline. Run migrations{' '}
            <code className="text-xs bg-gray-200 px-1 rounded">add_affiliate_commission_engine.sql</code> and{' '}
            <code className="text-xs bg-gray-200 px-1 rounded">add_affiliate_recurring_commission_limits.sql</code> if
            columns are missing.
          </p>
          <p className="mt-2">
            <Link href="/admin/affiliates" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              ← Affiliate applications
            </Link>
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Commission & payout rules</h2>
          <p className="mt-1 text-sm text-gray-600 max-w-3xl">
            Global defaults apply unless a module overrides a field. Run{' '}
            <code className="text-xs bg-gray-200 px-1 rounded">add_affiliate_commission_engine.sql</code> and{' '}
            <code className="text-xs bg-gray-200 px-1 rounded">add_affiliate_recurring_commission_limits.sql</code> if
            API errors mention missing columns.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {globalRow && (
        <form
          onSubmit={saveGlobal}
          className="bg-white rounded-xl shadow border border-gray-100 p-6 space-y-4 mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-900">Global defaults</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">First sale commission (%)</label>
              <input
                name="first_sale_commission_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                defaultValue={g.first_sale_commission_percent ?? 15}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Recurring commission (%)</label>
              <input
                name="recurring_commission_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                defaultValue={g.recurring_commission_percent ?? 10}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
              <label className="block text-sm font-semibold text-gray-900">Recurring commission duration</label>
              <p className="text-xs text-gray-600 mt-1 mb-3">
                Controls how long affiliates earn on <strong>subscription renewals</strong> (not the first payment).
                “Months” counts from Stripe <code className="text-[11px] bg-white/80 px-1 rounded">start_date</code>;
                “transactions” counts renewal invoices per subscription.
              </p>
              <select
                name="recurring_limit_mode"
                defaultValue={g.recurring_limit_mode ?? 'unlimited'}
                className="w-full max-w-md border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="unlimited">Indefinite — commission on every renewal</option>
                <option value="months">Limited — stop after X calendar months from subscription start</option>
                <option value="transactions">Limited — stop after X renewal payments per subscription</option>
              </select>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Months (required if “months”)</label>
                  <input
                    name="recurring_limit_months"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 12"
                    defaultValue={g.recurring_limit_months ?? ''}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Max renewals (required if “transactions”)
                  </label>
                  <input
                    name="recurring_limit_transactions"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 6"
                    defaultValue={g.recurring_limit_transactions ?? ''}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Payout minimum (CAD)</label>
              <input
                name="payout_minimum_dollars"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={((g.payout_minimum_cents ?? 5000) / 100).toFixed(2)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Refund hold (days)</label>
              <input
                name="refund_hold_days"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={g.refund_hold_days ?? 14}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Commission stays accruing until this many days after payment; Stripe refunds reverse open earnings.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Delivery: min paid checkouts before volume gate clears
              </label>
              <input
                name="delivery_min_paid_sales_before_payout"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={g.delivery_min_paid_sales_before_payout ?? 5}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Per partner: attributed paid delivery Stripe checkouts before delivery commissions become eligible
                (after refund hold).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={globalBusy}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {globalBusy ? 'Saving…' : 'Save global'}
            </button>
            {globalMsg && <span className="text-sm text-gray-700">{globalMsg}</span>}
          </div>
        </form>
      )}

      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Per-module overrides</h2>
        <p className="text-sm text-gray-600">
          Leave a field empty to inherit from global. Check &quot;Recurring enabled&quot; for subscriptions (phone
          module).
        </p>
        {modules.map((m) => (
          <form
            key={m.module_key}
            className="bg-white rounded-xl shadow border border-gray-100 p-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveModule(m.module_key, e.target);
            }}
          >
            <h3 className="text-md font-semibold text-gray-900 font-mono">{m.module_key}</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First sale % (override)</label>
                <input
                  name="first_sale_commission_percent"
                  type="text"
                  inputMode="decimal"
                  placeholder="inherit"
                  defaultValue={m.first_sale_commission_percent ?? ''}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Recurring % (override)</label>
                <input
                  name="recurring_commission_percent"
                  type="text"
                  inputMode="decimal"
                  placeholder="inherit"
                  defaultValue={m.recurring_commission_percent ?? ''}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  name="recurring_commission_enabled"
                  id={`aff-comm-rec-${m.module_key}`}
                  defaultChecked={m.recurring_commission_enabled !== false}
                  className="rounded border-gray-300"
                />
                <label htmlFor={`aff-comm-rec-${m.module_key}`} className="text-sm text-gray-700">
                  Recurring commission enabled
                </label>
              </div>
              <div className="sm:col-span-2 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
                <label className="block text-sm font-semibold text-gray-900">Recurring duration (override)</label>
                <p className="text-xs text-gray-600 mt-1 mb-2">
                  Inherit global, or set a different renewal window for this module only.
                </p>
                <select
                  name="recurring_limit_mode"
                  defaultValue={m.recurring_limit_mode == null ? 'inherit' : m.recurring_limit_mode}
                  className="w-full max-w-md border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="inherit">Inherit global</option>
                  <option value="unlimited">Indefinite — every renewal</option>
                  <option value="months">Limited — months from subscription start</option>
                  <option value="transactions">Limited — max renewal payments</option>
                </select>
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Months (if “months”)</label>
                    <input
                      name="recurring_limit_months"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 6"
                      defaultValue={m.recurring_limit_months ?? ''}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Max renewals (if “transactions”)</label>
                    <input
                      name="recurring_limit_transactions"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 3"
                      defaultValue={m.recurring_limit_transactions ?? ''}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payout min CAD (override)</label>
                <input
                  name="payout_minimum_dollars"
                  type="text"
                  inputMode="decimal"
                  placeholder="inherit"
                  defaultValue={m.payout_minimum_cents != null ? (m.payout_minimum_cents / 100).toFixed(2) : ''}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Refund hold days (override)</label>
                <input
                  name="refund_hold_days"
                  type="text"
                  inputMode="numeric"
                  placeholder="inherit"
                  defaultValue={m.refund_hold_days ?? ''}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Delivery min paid sales (override)</label>
                <input
                  name="delivery_min_paid_sales_before_payout"
                  type="text"
                  inputMode="numeric"
                  placeholder="inherit"
                  defaultValue={m.delivery_min_paid_sales_before_payout ?? ''}
                  className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={moduleBusy === m.module_key}
                className="px-4 py-2 text-sm font-medium bg-gray-800 text-white rounded-md hover:bg-gray-900 disabled:opacity-50"
              >
                {moduleBusy === m.module_key ? 'Saving…' : 'Save module'}
              </button>
              {moduleMsg[m.module_key] && (
                <span className="text-sm text-gray-700">{moduleMsg[m.module_key]}</span>
              )}
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
