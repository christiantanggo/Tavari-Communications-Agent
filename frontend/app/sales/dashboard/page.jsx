'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/api';
import { SALES_ONBOARD_PRODUCT_CHOICES, labelForSalesModuleKey } from '@/lib/sales-onboard-modules';

const TABS = [
  { id: 'credentials', label: 'Credentials / Codes' },
  { id: 'onboard', label: 'New Onboard' },
  { id: 'customers', label: 'Your Customers' },
  { id: 'earnings', label: 'Your Earnings' },
];

function getSalesToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  const c = cookies.find((x) => x.trim().startsWith('sales_token='));
  if (!c) return null;
  return decodeURIComponent(c.split('=').slice(1).join('=').trim());
}

function clearSalesToken() {
  document.cookie = 'sales_token=; path=/; max-age=0';
}

function formatLedgerSource(p) {
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
}

function moduleLabel(key) {
  if (key === 'phone-agent') return 'Phone agent';
  if (key === 'delivery-dispatch') return 'Delivery';
  return key || '—';
}

function recurringLimitDescription(m) {
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
}

/** Short line for service cards: how long recurring commission applies */
function recurringCommissionDurationSummary(row) {
  if (!row.recurring_commission_enabled) return null;
  const mode = row.recurring_limit_mode || 'unlimited';
  if (mode === 'unlimited') {
    return 'Recurring commission applies to all renewal payments (subject to refund hold and program rules).';
  }
  if (mode === 'months') {
    if (row.recurring_limit_months != null) {
      return `Recurring commission applies to renewals within ${row.recurring_limit_months} calendar month(s) of the subscription start date.`;
    }
    return 'Recurring commission window is limited by months (see affiliate program settings).';
  }
  if (mode === 'transactions') {
    if (row.recurring_limit_transactions != null) {
      return `Recurring commission applies to up to ${row.recurring_limit_transactions} renewal payment(s) after the first sale.`;
    }
    return 'Recurring commission is limited to a set number of renewals (see affiliate program settings).';
  }
  return null;
}

function businessModuleKeysRaw(b) {
  if (Array.isArray(b.sales_onboard_modules) && b.sales_onboard_modules.length) {
    return b.sales_onboard_modules.filter(Boolean).map(String);
  }
  if (b.sales_onboard_primary_module) return [String(b.sales_onboard_primary_module)];
  return [];
}

function businessPackageMapRaw(b) {
  const p = b.sales_onboard_package_by_module;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  return { ...p };
}

/** One line per module the customer is on (for read-only Services column). */
function subscribedServiceLines(business, salesServiceCatalog) {
  const keys = businessModuleKeysRaw(business);
  const pkgMap = businessPackageMapRaw(business);
  const catByKey = new Map((salesServiceCatalog || []).map((r) => [r.key, r]));
  return keys.map((key) => {
    const row = catByKey.get(key);
    const label = row?.label || labelForSalesModuleKey(key);
    const pkgs = Array.isArray(row?.packages) ? row.packages : [];
    const pid = pkgMap[key];
    let planText = null;
    if (pkgs.length === 1) {
      const pkg = pkgs[0];
      planText = `${pkg.name} — ${pkg.price_label}`;
    } else if (pkgs.length > 1) {
      if (pid) {
        const pkg = pkgs.find((p) => p.id === pid);
        planText = pkg ? `${pkg.name} — ${pkg.price_label}` : 'Plan on file';
      } else {
        planText = 'Plan not selected';
      }
    } else if (row?.customer_price_summary) {
      planText = row.customer_price_summary;
    }
    return { key, label, planText };
  });
}

function stablePackageJson(obj) {
  const keys = Object.keys(obj || {}).sort();
  const o = {};
  keys.forEach((k) => {
    o[k] = obj[k];
  });
  return JSON.stringify(o);
}

function orderKeysByCatalog(catalogOrder, keys) {
  const set = new Set(keys);
  return catalogOrder.filter((k) => set.has(k));
}

function toggleModuleKey(catalogOrder, keys, key) {
  const set = new Set(keys);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return catalogOrder.filter((k) => set.has(k));
}

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n)}%`;
}

function ServiceCheckboxList({
  catalogRows,
  selectedKeys,
  packageByModule,
  onPackageChange,
  disabled,
  onToggle,
  idPrefix,
}) {
  const set = new Set(selectedKeys);
  const pm = packageByModule && typeof packageByModule === 'object' ? packageByModule : {};
  return (
    <ul
      className="space-y-0 border rounded-lg border-gray-200 bg-gray-50/80 overflow-hidden"
      role="list"
      aria-label="Products and services"
    >
      {catalogRows.map((row) => {
        const pkgs = Array.isArray(row.packages) ? row.packages : [];
        const checked = set.has(row.key);
        return (
          <li key={row.key} className="border-b border-gray-100 last:border-b-0 px-3 py-2.5">
            <label className="flex gap-3 cursor-pointer items-start">
              <input
                type="checkbox"
                className="mt-1 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(row.key)}
                id={idPrefix ? `${idPrefix}-${row.key}` : undefined}
              />
              <span className="flex-1 min-w-0">
                <span className="font-medium text-gray-900 text-sm">{row.label}</span>
                <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                  <p>
                    <span className="text-gray-500">Customer cost:</span>{' '}
                    {pkgs.length > 1
                      ? `${pkgs.length} plans — choose below`
                      : row.customer_price_summary || '—'}
                  </p>
                  <p>
                    <span className="text-gray-500">Your commission</span> — initial:{' '}
                    {formatPct(row.first_sale_commission_percent)}
                    {row.recurring_commission_enabled
                      ? ` · recurring: ${formatPct(row.recurring_commission_percent)}`
                      : ' · recurring: n/a'}
                  </p>
                  {row.recurring_commission_enabled && (
                    <p className="text-[11px] text-gray-500 leading-snug">
                      {recurringCommissionDurationSummary(row) ||
                        'Recurring duration follows module settings in the affiliate program.'}
                    </p>
                  )}
                </div>
                {checked && pkgs.length > 0 && (
                  <div
                    className="mt-2 pt-2 border-t border-gray-200/90 space-y-1.5"
                    role="group"
                    aria-label={`Plans for ${row.label}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-[11px] font-medium text-gray-600">
                      {pkgs.length === 1 ? 'Plan (included)' : 'Select a plan *'}
                    </p>
                    {pkgs.map((pkg) => (
                      <label
                        key={pkg.id}
                        className="flex items-start gap-2 text-xs text-gray-800 cursor-pointer"
                      >
                        <input
                          type="radio"
                          className="mt-0.5 border-gray-300 text-teal-600 focus:ring-teal-500"
                          name={idPrefix ? `${idPrefix}-pkg-${row.key}` : `pkg-${row.key}`}
                          checked={pm[row.key] === pkg.id}
                          disabled={disabled}
                          onChange={() => onPackageChange(row.key, pkg.id)}
                        />
                        <span>
                          {pkg.name} — {pkg.price_label}
                          {pkg.is_on_sale ? (
                            <span className="text-amber-800 font-medium"> (sale)</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function CustomerServicesEditor({ business, salesServiceCatalog, onReload }) {
  const [editing, setEditing] = useState(false);

  const catalogRows = useMemo(() => {
    const base = salesServiceCatalog?.length
      ? salesServiceCatalog
      : SALES_ONBOARD_PRODUCT_CHOICES.map((o) => ({
          key: o.key,
          label: o.label,
          customer_price_summary: '—',
          packages: [],
          first_sale_commission_percent: null,
          recurring_commission_percent: null,
          recurring_commission_enabled: true,
          recurring_limit_mode: 'unlimited',
          recurring_limit_months: null,
          recurring_limit_transactions: null,
        }));
    const keysInCat = new Set(base.map((r) => r.key));
    const raw = businessModuleKeysRaw(business);
    const extraKeys = raw.filter((k) => !keysInCat.has(k));
    const extras = extraKeys.map((k) => ({
      key: k,
      label: `${labelForSalesModuleKey(k)} (legacy)`,
      customer_price_summary: '—',
      packages: [],
      first_sale_commission_percent: null,
      recurring_commission_percent: null,
      recurring_commission_enabled: true,
      recurring_limit_mode: 'unlimited',
      recurring_limit_months: null,
      recurring_limit_transactions: null,
    }));
    return extras.length ? [...extras, ...base] : base;
  }, [
    salesServiceCatalog,
    business.id,
    business.sales_onboard_primary_module,
    JSON.stringify(business.sales_onboard_modules || []),
  ]);

  const catalogOrder = useMemo(() => catalogRows.map((r) => r.key), [catalogRows]);

  const [keys, setKeys] = useState(() =>
    orderKeysByCatalog(catalogOrder, businessModuleKeysRaw(business)),
  );
  const [pkgByMod, setPkgByMod] = useState(() => businessPackageMapRaw(business));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setKeys(orderKeysByCatalog(catalogOrder, businessModuleKeysRaw(business)));
    setPkgByMod(businessPackageMapRaw(business));
  }, [
    business.id,
    business.sales_onboard_primary_module,
    JSON.stringify(business.sales_onboard_modules || []),
    stablePackageJson(business.sales_onboard_package_by_module || {}),
    catalogOrder.join('|'),
  ]);

  const serverOrdered = orderKeysByCatalog(catalogOrder, businessModuleKeysRaw(business));
  const serverPkg = businessPackageMapRaw(business);
  const dirty =
    keys.join('|') !== serverOrdered.join('|') ||
    stablePackageJson(pkgByMod) !== stablePackageJson(serverPkg);

  const toggleCustomerModule = useCallback(
    (key) => {
      setKeys((prevKeys) => {
        const newKeys = toggleModuleKey(catalogOrder, prevKeys, key);
        setPkgByMod((pm) => {
          const next = { ...pm };
          if (!newKeys.includes(key)) delete next[key];
          else {
            const row = catalogRows.find((r) => r.key === key);
            if (row?.packages?.length === 1) next[key] = row.packages[0].id;
            else if (row?.packages?.length > 1) {
              const ok = row.packages.some((p) => p.id === next[key]);
              if (!ok) delete next[key];
            }
          }
          return next;
        });
        return newKeys;
      });
    },
    [catalogOrder, catalogRows],
  );

  const save = async () => {
    const token = getSalesToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/api/sales/customers/${encodeURIComponent(business.id)}/modules`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ module_keys: keys, package_by_module: pkgByMod }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Update failed (${res.status})`);
      await onReload();
      setEditing(false);
    } catch (err) {
      alert(err.message || 'Could not update services');
      onReload();
    } finally {
      setBusy(false);
    }
  };

  const summaryLines = useMemo(
    () => subscribedServiceLines(business, salesServiceCatalog),
    [
      business.id,
      business.sales_onboard_primary_module,
      JSON.stringify(business.sales_onboard_modules || []),
      stablePackageJson(business.sales_onboard_package_by_module || {}),
      salesServiceCatalog,
    ],
  );

  const cancelEditing = () => {
    setEditing(false);
    setKeys(orderKeysByCatalog(catalogOrder, businessModuleKeysRaw(business)));
    setPkgByMod(businessPackageMapRaw(business));
  };

  if (!editing) {
    return (
      <div className="min-w-[12rem] max-w-xs text-xs text-gray-700">
        {summaryLines.length === 0 ? (
          <p className="text-gray-500">No services on file.</p>
        ) : (
          <ul className="space-y-1 text-gray-900">
            {summaryLines.map((line) => (
              <li key={line.key} className="font-medium leading-snug">
                {line.planText ? `${line.label} — ${line.planText}` : line.label}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1.5 text-xs font-medium text-teal-800 hover:underline"
        >
          Change services…
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-[18rem] max-w-md">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-medium text-gray-600">Edit products for this customer</span>
        <button
          type="button"
          onClick={cancelEditing}
          disabled={busy}
          className="text-[11px] font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <ServiceCheckboxList
        catalogRows={catalogRows}
        selectedKeys={keys}
        packageByModule={pkgByMod}
        onPackageChange={(moduleKey, packageId) =>
          setPkgByMod((p) => ({ ...p, [moduleKey]: packageId }))
        }
        disabled={busy}
        onToggle={toggleCustomerModule}
        idPrefix={`cust-${business.id}`}
      />
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={save}
        className="mt-2 text-xs font-medium px-2.5 py-1 rounded border border-teal-600 text-teal-800 hover:bg-teal-50 disabled:opacity-40 disabled:pointer-events-none"
      >
        {busy ? 'Saving…' : 'Save services'}
      </button>
    </div>
  );
}

export default function SalesDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('credentials');
  const [packages, setPackages] = useState([]);
  const [onboard, setOnboard] = useState({
    module_keys: [],
    package_by_module: {},
    business_name: '',
    owner_email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    terms_attested: false,
  });
  const [onboardMsg, setOnboardMsg] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(null);
  const [paymentEmailBusy, setPaymentEmailBusy] = useState(null);
  const [syncLedgerBusy, setSyncLedgerBusy] = useState(false);
  const [syncLedgerMsg, setSyncLedgerMsg] = useState('');

  const loadMe = useCallback(async () => {
    const token = getSalesToken();
    if (!token) {
      setLoading(false);
      setData(null);
      return;
    }
    setError('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sales/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) clearSalesToken();
        throw new Error(json.error || 'Session expired');
      }
      setData(json);
    } catch (e) {
      setError(e.message || 'Could not load dashboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/billing/packages`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.packages)) {
        setPackages(json.packages);
      }
    } catch {
      setPackages([]);
    }
  }, []);

  useEffect(() => {
    const token = getSalesToken();
    if (!token) {
      router.replace('/sales/login');
      return;
    }
    loadMe();
    loadPackages();
  }, [loadMe, loadPackages, router]);

  const logout = () => {
    clearSalesToken();
    setData(null);
    router.replace('/sales/login');
  };

  const syncCommissionFromInvoices = async () => {
    const token = getSalesToken();
    if (!token) return;
    setSyncLedgerBusy(true);
    setSyncLedgerMsg('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sales/me/sync-commission-from-invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      if (json.inserted > 0) {
        const bits = [];
        if (json.inserted_from_stripe_invoice)
          bits.push(`${json.inserted_from_stripe_invoice} via Stripe invoice id on file`);
        if (json.inserted_from_local_invoice)
          bits.push(`${json.inserted_from_local_invoice} from Tavari billing without Stripe invoice id`);
        setSyncLedgerMsg(
          `Added ${json.inserted} ledger row(s)${bits.length ? ` (${bits.join('; ')})` : ''}.`,
        );
      } else {
        setSyncLedgerMsg(
          'No new rows added. Open the "Paid vs your commission" table below — it explains each customer (for example: commission on another partner\'s id, or "paid" coming from Stripe fields without a subscription invoice row).',
        );
      }
      await loadMe();
    } catch (e) {
      setSyncLedgerMsg(e.message || 'Sync failed');
    } finally {
      setSyncLedgerBusy(false);
    }
  };

  const submitOnboard = async (e) => {
    e.preventDefault();
    setOnboardMsg('');
    const token = getSalesToken();
    if (!token) return;
    if (!onboard.module_keys?.length) {
      setOnboardMsg('Select at least one product or service for this customer.');
      return;
    }
    if (!onboard.terms_attested) {
      setOnboardMsg(
        'Check the box to confirm the customer agreed to the Terms of Service and Privacy Policy.',
      );
      return;
    }
    for (const mk of onboard.module_keys) {
      const row = salesCatalogRows.find((r) => r.key === mk);
      if (!row?.packages?.length) continue;
      const sel = onboard.package_by_module[mk];
      if (row.packages.length > 1 && !sel) {
        setOnboardMsg(
          'Select a pricing plan for each selected service that has more than one plan.',
        );
        return;
      }
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sales/onboard-customer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          module_keys: onboard.module_keys,
          package_by_module: onboard.package_by_module,
          business_name: onboard.business_name.trim(),
          owner_email: onboard.owner_email.trim(),
          password: onboard.password,
          first_name: onboard.first_name.trim() || undefined,
          last_name: onboard.last_name.trim() || undefined,
          phone: onboard.phone.trim() || undefined,
          terms_attested: onboard.terms_attested,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = [json.error, json.code].filter(Boolean).join(' — ');
        console.error('[sales onboard]', res.status, json);
        throw new Error(detail || `Request failed (${res.status})`);
      }
      const modList =
        json.business?.sales_onboard_modules ||
        json.business?.sales_onboard_primary_module ||
        onboard.module_keys;
      const keys = Array.isArray(modList) ? modList : modList ? [modList] : [];
      const productLabel = keys.length ? keys.map((k) => labelForSalesModuleKey(k)).join(', ') : '—';
      let msg = `Created account for ${json.business?.email || 'customer'} (${productLabel}). They can sign in with the email and password you set.`;
      if (json.warning) {
        msg += ` ${json.warning}`;
      }
      setOnboardMsg(msg);
      setOnboard((o) => ({
        ...o,
        module_keys: [],
        package_by_module: {},
        business_name: '',
        owner_email: '',
        password: '',
        first_name: '',
        last_name: '',
        phone: '',
        terms_attested: false,
      }));
      loadMe();
    } catch (err) {
      setOnboardMsg(err.message || 'Onboarding failed');
    }
  };

  const startCheckoutSavedPackage = async (businessId) => {
    const token = getSalesToken();
    if (!token) return;
    setCheckoutBusy(businessId);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sales/checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ business_id: businessId, use_saved_package: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Checkout failed');
      if (json.skipPayment) {
        alert(json.message || 'Package assigned without Stripe.');
        loadMe();
        return;
      }
      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err) {
      alert(err.message || 'Checkout failed');
    } finally {
      setCheckoutBusy(null);
    }
  };

  const startCheckout = async (businessId, packageId) => {
    const token = getSalesToken();
    if (!token) return;
    setCheckoutBusy(businessId);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sales/checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ business_id: businessId, packageId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Checkout failed');
      if (json.skipPayment) {
        alert(json.message || 'Package assigned without Stripe.');
        loadMe();
        return;
      }
      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err) {
      alert(err.message || 'Checkout failed');
    } finally {
      setCheckoutBusy(null);
    }
  };

  const sendPaymentEmailLink = async (businessId) => {
    const token = getSalesToken();
    if (!token) return;
    setPaymentEmailBusy(businessId);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sales/send-payment-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ business_id: businessId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      alert(json.message || 'Payment link sent.');
    } catch (err) {
      alert(err.message || 'Failed to send payment email');
    } finally {
      setPaymentEmailBusy(null);
    }
  };

  const sendInvite = async (businessId) => {
    const token = getSalesToken();
    if (!token) return;
    setInviteBusy(businessId);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sales/send-invite`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ business_id: businessId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed');
      alert(json.message || 'Done');
    } catch (err) {
      alert(err.message || 'Failed to send email');
    } finally {
      setInviteBusy(null);
    }
  };

  const salesCatalogRows = useMemo(() => {
    const c = data?.sales_service_catalog;
    if (c?.length) return c;
    return SALES_ONBOARD_PRODUCT_CHOICES.map((o) => ({
      key: o.key,
      label: o.label,
      customer_price_summary: '—',
      packages: [],
      first_sale_commission_percent: null,
      recurring_commission_percent: null,
      recurring_commission_enabled: true,
      recurring_limit_mode: 'unlimited',
      recurring_limit_months: null,
      recurring_limit_transactions: null,
    }));
  }, [data?.sales_service_catalog]);

  const onboardCatalogOrder = useMemo(() => salesCatalogRows.map((r) => r.key), [salesCatalogRows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!data?.partner) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <p className="text-gray-800 font-medium">{error || 'Could not load sales portal.'}</p>
        <button type="button" onClick={logout} className="mt-4 text-sm text-teal-700 underline">
          Back to sign-in
        </button>
      </div>
    );
  }

  const { partner, linked_businesses: linked, join_urls: joinUrls, short_hub_url: shortHub } = data;
  const stats = data.stats || {};
  const earningsSummary = data.earnings_summary || {};
  const purchases = data.purchases || [];
  const commissionPolicy = data.commission_policy;
  const earningsCustomerContext = data.earnings_customer_context || [];
  const earningsMismatches = earningsCustomerContext.filter((row) => row.mismatch_code);

  const activeLedgerPurchases = purchases.filter((p) => p.status !== 'reversed');
  const allPurchasesReversed =
    purchases.length > 0 && activeLedgerPurchases.length === 0;
  const noLedgerButLinked =
    linked.length > 0 &&
    (stats?.attributed_sales ?? 0) === 0 &&
    (stats?.gross_sales_cents ?? 0) === 0;

  function shortBusinessId(id) {
    if (!id || typeof id !== 'string') return '—';
    const t = id.replace(/-/g, '');
    if (t.length <= 8) return id;
    return `…${t.slice(-8)}`;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const trackingLink = partner.affiliate_code ? `${origin}/affiliate/go/${partner.affiliate_code}` : '';
  const landingLink = partner.affiliate_code ? `${origin}/r/${partner.affiliate_code}` : '';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales portal</h1>
            <p className="text-gray-600 mt-1">{partner.display_name}</p>
            <p className="text-sm text-gray-500">{partner.email}</p>
          </div>
          <button type="button" onClick={logout} className="text-sm text-gray-600 hover:text-gray-900 underline shrink-0">
            Sign out
          </button>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 text-red-800 text-sm px-4 py-2">{error}</div>}

        <div
          className="flex gap-1 p-1 bg-gray-200/80 rounded-lg mb-6 overflow-x-auto"
          role="tablist"
          aria-label="Sales portal sections"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[9.5rem] px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-teal-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'credentials' && (
          <div className="bg-white rounded-xl shadow border border-teal-100 p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sign-in</h2>
              <p className="text-sm text-gray-600 mt-1">
                You signed in with a magic link sent to <span className="font-medium text-gray-800">{partner.email}</span>.
                Request a new link anytime from{' '}
                <Link href="/sales/login" className="text-teal-700 font-medium hover:underline">
                  Sales sign-in
                </Link>
                .
              </p>
            </div>
            <div className="border-t border-gray-100 pt-6">
              <h2 className="text-lg font-semibold text-gray-900">Attribution code</h2>
              <p className="text-sm text-gray-600 mt-1">
                Customers can enter this on the public sign-up page. Commissions use the same partner program as affiliates.
              </p>
              <p className="font-mono text-lg bg-gray-100 inline-block px-3 py-2 rounded mt-3">{partner.affiliate_code}</p>
            </div>
            {trackingLink && partner.affiliate_code && (
              <div>
                <p className="text-sm font-medium text-gray-700">Tracking link (click → cookie → your hub)</p>
                <p className="mt-2">
                  <Link
                    href={`/affiliate/go/${encodeURIComponent(partner.affiliate_code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-teal-800 underline hover:text-teal-950"
                  >
                    Open tracking link
                  </Link>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-medium text-gray-600">Copy:</span>{' '}
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
            )}
            {joinUrls?.review_reply && partner.affiliate_code && (
              <div>
                <p className="text-sm font-medium text-gray-700">Review Reply AI — Stripe funnel</p>
                <p className="mt-2">
                  <Link
                    href={`/join/reviews/${encodeURIComponent(partner.affiliate_code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-teal-800 underline hover:text-teal-950"
                  >
                    Open Review Reply signup &amp; checkout
                  </Link>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-medium text-gray-600">Copy:</span>{' '}
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
            )}
            {joinUrls?.phone_agent && partner.affiliate_code && (
              <div>
                <p className="text-sm font-medium text-gray-700">AI Phone — full funnel</p>
                <p className="mt-2">
                  <Link
                    href={`/join/phone-agent/${encodeURIComponent(partner.affiliate_code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-teal-800 underline hover:text-teal-950"
                  >
                    Open AI Phone signup page
                  </Link>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-medium text-gray-600">Copy:</span>{' '}
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
            )}
            {joinUrls?.delivery_dispatch && partner.affiliate_code && (
              <div>
                <p className="text-sm font-medium text-gray-700">Last-mile delivery dispatch</p>
                <p className="mt-2">
                  <Link
                    href={`/deliverydispatch?partner=${encodeURIComponent(partner.affiliate_code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-teal-800 underline hover:text-teal-950"
                  >
                    Open delivery request page
                  </Link>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-medium text-gray-600">Copy:</span>{' '}
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
            )}
            {(shortHub || landingLink) && partner.affiliate_code && (
              <div>
                <p className="text-sm font-medium text-gray-700">Short hub</p>
                <p className="mt-2">
                  <Link
                    href={`/r/${encodeURIComponent(partner.affiliate_code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-teal-800 underline hover:text-teal-950"
                  >
                    Open short hub
                  </Link>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-medium text-gray-600">Copy:</span>{' '}
                  <a
                    href={shortHub || landingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-gray-700 underline break-all"
                  >
                    {shortHub || landingLink}
                  </a>
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'onboard' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Onboard a customer</h2>
            <p className="text-sm text-gray-600 mb-4">
              Creates their business and owner login, linked to your code for future payments. Set a temporary password; use
              &quot;Send login help email&quot; on the Customers tab so they can set their own password via reset.
            </p>
            <form onSubmit={submitOnboard} className="space-y-4 max-w-2xl">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Business name *</label>
                  <input
                    required
                    value={onboard.business_name}
                    onChange={(e) => setOnboard({ ...onboard, business_name: e.target.value })}
                    className="mt-0.5 w-full border rounded-md px-3 py-2 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Owner email *</label>
                  <input
                    type="email"
                    required
                    value={onboard.owner_email}
                    onChange={(e) => setOnboard({ ...onboard, owner_email: e.target.value })}
                    className="mt-0.5 w-full border rounded-md px-3 py-2 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Initial password * (min 8)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={onboard.password}
                    onChange={(e) => setOnboard({ ...onboard, password: e.target.value })}
                    className="mt-0.5 w-full border rounded-md px-3 py-2 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Phone (optional)</label>
                  <input
                    value={onboard.phone}
                    onChange={(e) => setOnboard({ ...onboard, phone: e.target.value })}
                    className="mt-0.5 w-full border rounded-md px-3 py-2 text-sm text-gray-900"
                    placeholder="+1…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">First name</label>
                  <input
                    value={onboard.first_name}
                    onChange={(e) => setOnboard({ ...onboard, first_name: e.target.value })}
                    className="mt-0.5 w-full border rounded-md px-3 py-2 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Last name</label>
                  <input
                    value={onboard.last_name}
                    onChange={(e) => setOnboard({ ...onboard, last_name: e.target.value })}
                    className="mt-0.5 w-full border rounded-md px-3 py-2 text-sm text-gray-900"
                  />
                </div>
              </div>
              <div>
                <p className="block text-xs font-medium text-gray-700">Products / services for this customer *</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  Check every service they are signing up for. When a line has multiple plans, pick the exact plan; your
                  commission rates for that module still apply.
                </p>
                <ServiceCheckboxList
                  catalogRows={salesCatalogRows}
                  selectedKeys={onboard.module_keys}
                  packageByModule={onboard.package_by_module}
                  onPackageChange={(moduleKey, packageId) =>
                    setOnboard((o) => ({
                      ...o,
                      package_by_module: { ...o.package_by_module, [moduleKey]: packageId },
                    }))
                  }
                  onToggle={(key) =>
                    setOnboard((o) => {
                      const newKeys = toggleModuleKey(onboardCatalogOrder, o.module_keys, key);
                      const pm = { ...o.package_by_module };
                      if (!newKeys.includes(key)) delete pm[key];
                      else {
                        const row = salesCatalogRows.find((r) => r.key === key);
                        if (row?.packages?.length === 1) pm[key] = row.packages[0].id;
                        else if (row?.packages?.length > 1) {
                          const ok = row.packages.some((p) => p.id === pm[key]);
                          if (!ok) delete pm[key];
                        }
                      }
                      return { ...o, module_keys: newKeys, package_by_module: pm };
                    })
                  }
                  idPrefix="onboard"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={onboard.terms_attested}
                  onChange={(e) => setOnboard({ ...onboard, terms_attested: e.target.checked })}
                  className="mt-1"
                />
                <span>
                  I confirm the customer agreed to the Terms of Service and Privacy Policy (required to create the account).
                </span>
              </label>
              <button
                type="submit"
                className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-teal-700"
              >
                Create customer account
              </button>
            </form>
            {onboardMsg && <p className="mt-3 text-sm text-gray-700">{onboardMsg}</p>}
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Your customers</h2>
              <p className="text-xs text-gray-500 mt-1">
                Accounts linked to your code (self-signup or you onboarded). The Services column shows only each
                customer&apos;s current products; use <span className="font-medium text-gray-600">Change services…</span>{' '}
                to add, remove, or adjust plans.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Business</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2 whitespace-nowrap">Payment</th>
                  <th className="px-4 py-2 whitespace-nowrap">Setup</th>
                  <th className="px-4 py-2 min-w-[20rem]">Services</th>
                  <th className="px-4 py-2">Since</th>
                  <th className="px-4 py-2 min-w-[12rem]">Actions</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(linked || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                        No linked customers yet.
                      </td>
                    </tr>
                  ) : (
                    (linked || []).map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-2 font-medium text-gray-900">{b.name || '—'}</td>
                        <td className="px-4 py-2 text-gray-700">{b.email || '—'}</td>
                        <td className="px-4 py-2 text-xs">
                          <span
                            className={
                              b.sales_payment_complete
                                ? 'text-emerald-800 font-medium'
                                : 'text-amber-800 font-medium'
                            }
                          >
                            {b.sales_payment_complete ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <span
                            className={
                              b.sales_setup_complete ? 'text-emerald-800 font-medium' : 'text-slate-600'
                            }
                          >
                            {b.sales_setup_complete ? 'Complete' : 'Not done'}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-gray-700">
                          <CustomerServicesEditor
                            business={b}
                            salesServiceCatalog={data.sales_service_catalog}
                            onReload={loadMe}
                          />
                        </td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                          {b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-2 space-y-2 align-top">
                          <div className="flex flex-col gap-1.5">
                            {b.primary_sales_package_id ? (
                              <button
                                type="button"
                                onClick={() => startCheckoutSavedPackage(b.id)}
                                disabled={checkoutBusy === b.id}
                                className="text-left text-xs font-medium text-teal-800 hover:underline disabled:opacity-50"
                              >
                                {checkoutBusy === b.id ? 'Opening…' : 'Pay with saved plan (Stripe)'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => sendPaymentEmailLink(b.id)}
                              disabled={paymentEmailBusy === b.id || !b.primary_sales_package_id}
                              title={
                                !b.primary_sales_package_id
                                  ? 'Save a plan on the customer first'
                                  : 'Email the owner a payment link (plan pre-selected)'
                              }
                              className="text-left text-xs font-medium text-teal-700 hover:underline disabled:opacity-50"
                            >
                              {paymentEmailBusy === b.id ? 'Sending…' : 'Email payment link'}
                            </button>
                            <select
                              className="border rounded-md text-xs px-2 py-1 max-w-[11rem] text-gray-900"
                              defaultValue=""
                              onChange={(e) => {
                                const pid = e.target.value;
                                e.target.value = '';
                                if (pid) startCheckout(b.id, pid);
                              }}
                              disabled={checkoutBusy === b.id}
                              aria-label="Checkout with another package"
                            >
                              <option value="">Other package…</option>
                              {packages.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.module_key || 'plan'})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => sendInvite(b.id)}
                              disabled={inviteBusy === b.id}
                              className="text-left text-xs font-medium text-teal-700 hover:underline disabled:opacity-50"
                            >
                              {inviteBusy === b.id ? 'Sending…' : 'Send login help email'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'earnings' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">How the numbers work</p>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-slate-600">
                <li>
                  <strong>Ledger rows</strong> is how many non-reversed commission rows are credited to your partner id.
                  <strong> Gross sales (ledger)</strong> sums the gross on those same rows (same currency per row in the
                  table below).
                </li>
                <li>
                  <strong>Event conversions</strong> and <strong>event revenue</strong> come from tracking pixels/links
                  and may differ from the ledger.
                </li>
                <li>
                  Customers can pay before a ledger row exists. Use <strong>Pull from paid invoices</strong> below to
                  create missing rows from billing (safe to run more than once).
                </li>
                <li>
                  The <strong>Your Customers</strong> tab reflects payment/setup from Stripe and invoices; the ledger
                  only lists rows credited to <em>your</em> partner id.
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-teal-100 bg-white px-4 py-3">
              <div className="flex-1 text-sm text-gray-700">
                <p className="font-medium text-gray-900">Missing your first payment?</p>
                <p className="text-gray-600 mt-0.5">
                  Backfill commission rows from paid subscription invoices for all customers assigned to you.
                </p>
              </div>
              <button
                type="button"
                onClick={syncCommissionFromInvoices}
                disabled={syncLedgerBusy}
                className="shrink-0 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
              >
                {syncLedgerBusy ? 'Working…' : 'Pull from paid invoices'}
              </button>
            </div>
            {syncLedgerMsg && (
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">{syncLedgerMsg}</p>
            )}

            {earningsMismatches.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/80">
                  <h2 className="text-base font-semibold text-amber-950">Paid vs your commission</h2>
                  <p className="text-xs text-amber-900/90 mt-1">
                    Your Customers can show <strong>Paid</strong> using Stripe, subscriptions, or any commission row on the
                    account. Your Earnings only counts rows on <em>your</em> partner id. This table lists linked accounts
                    where you have $0 commission here but billing still shows them as paid.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2">Customer</th>
                        <th className="px-4 py-2">Your commission</th>
                        <th className="px-4 py-2">Invoices</th>
                        <th className="px-4 py-2">Why earnings are empty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {earningsMismatches.map((row) => (
                        <tr key={row.business_id}>
                          <td className="px-4 py-2 text-gray-900">
                            <div className="font-medium">{row.name || '—'}</div>
                            <div className="text-xs text-gray-500">{row.email || ''}</div>
                          </td>
                          <td className="px-4 py-2 tabular-nums text-gray-800">
                            ${((Number(row.your_commission_cents) || 0) / 100).toFixed(2)} CAD
                          </td>
                          <td className="px-4 py-2 text-gray-600 text-xs whitespace-nowrap">
                            {row.paid_subscription_invoice_count ?? 0} sub. invoice(s)
                            {row.has_setup_invoice_missing_stripe ? (
                              <span className="block text-amber-800 mt-0.5">Setup missing Stripe id</span>
                            ) : null}
                            {row.other_partner_ledger_rows > 0 ? (
                              <span className="block text-gray-500 mt-0.5">
                                {row.other_partner_ledger_rows} row(s) other partner(s)
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 text-gray-700 text-xs leading-snug">{row.mismatch_detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {noLedgerButLinked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">No commission rows on your partner id yet</p>
                <p className="mt-1 text-amber-900/90">
                  You have linked customers, but the ledger below only shows payments credited to <em>you</em>. If they
                  already paid, try <strong>Pull from paid invoices</strong> above to add rows from billing (when Stripe
                  invoice IDs are on file). New checkouts for assigned customers should credit you automatically. If
                  nothing appears after that, ask an admin to confirm the sale is not on another partner's ledger.
                </p>
              </div>
            )}

            {allPurchasesReversed && (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Ledger history</p>
                <p className="mt-1 text-slate-600">
                  Recent rows below are all reversed (refund or adjustment). Totals above exclude reversed rows.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                ['Clicks', stats.clicks ?? '—'],
                ['Leads', stats.leads ?? '—'],
                ['Event conversions', stats.conversions ?? '—'],
                ['Ledger rows (non-reversed)', stats.attributed_sales ?? '—'],
                ['Gross sales (ledger)', `$${((stats.gross_sales_cents ?? 0) / 100).toFixed(2)}`],
                ['Event revenue (gross)', `$${((stats.revenue_cents ?? 0) / 100).toFixed(2)}`],
              ].map(([label, val]) => (
                <div key={label} className="bg-white rounded-lg shadow border border-gray-100 p-3 flex flex-col min-h-[5.5rem]">
                  <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase leading-snug flex-1">{label}</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 tabular-nums pt-2 border-t border-gray-100 mt-2">
                    {val}
                  </p>
                </div>
              ))}
            </div>

            {earningsSummary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  ['Commission (in refund hold)', earningsSummary.commission_accruing_cents],
                  ['Commission (eligible to pay)', earningsSummary.commission_eligible_cents],
                  ['Commission (paid out)', earningsSummary.commission_paid_cents],
                ].map(([label, cents]) => (
                  <div
                    key={label}
                    className="bg-white rounded-lg shadow p-4 border border-emerald-100 flex flex-col min-h-[5.5rem]"
                  >
                    <p className="text-[11px] font-medium text-gray-500 uppercase leading-snug flex-1">{label}</p>
                    <p className="text-lg font-bold text-emerald-900 tabular-nums pt-2 border-t border-emerald-100/80 mt-2">
                      ${((Number(cents) || 0) / 100).toFixed(2)} CAD
                    </p>
                  </div>
                ))}
              </div>
            )}

            {commissionPolicy && (
              <div className="bg-white rounded-xl shadow p-6 border border-gray-100 space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Commission rates</h2>
                <p className="text-sm text-gray-600">
                  Same program rules as the affiliate dashboard. Payout minimum and refund hold apply per module where set.
                </p>
                <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
                  <li>
                    Default payout minimum:{' '}
                    <strong>
                      ${((Number(commissionPolicy.payout_minimum_cents) || 0) / 100).toFixed(2)} CAD
                    </strong>
                  </li>
                  <li>
                    Default refund hold: <strong>{commissionPolicy.refund_hold_days_default} days</strong>
                  </li>
                  <li>
                    Your attributed delivery checkouts (paid):{' '}
                    <strong>{commissionPolicy.delivery_paid_checkouts_attributed}</strong>
                  </li>
                </ul>
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
                        Hold {m.refund_hold_days ?? '—'}d · Payout min $
                        {((Number(m.payout_minimum_cents) || 0) / 100).toFixed(2)} CAD
                        {m.module_key === 'delivery-dispatch' && m.delivery_min_paid_sales_before_payout != null ? (
                          <>
                            {' '}
                            · Delivery gate: <strong>{m.delivery_min_paid_sales_before_payout}</strong> paid checkouts
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
            )}

            <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Commission ledger (recent)</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Payment date uses Stripe payment time when present. Gross sale, your commission, and status (accruing =
                  refund hold or volume gate; eligible = ready for batch payout). Reversed rows are shown for history but
                  excluded from totals above.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2">Payment date</th>
                      <th className="px-4 py-2">Account</th>
                      <th className="px-4 py-2">Module</th>
                      <th className="px-4 py-2">Gross</th>
                      <th className="px-4 py-2">Commission</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Hold until</th>
                      <th className="px-4 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchases.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                          No ledger rows yet.
                        </td>
                      </tr>
                    ) : (
                      purchases.map((p) => (
                        <tr
                          key={p.id}
                          className={p.status === 'reversed' ? 'opacity-60 bg-slate-50/80' : undefined}
                        >
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
                          <td
                            className="px-4 py-2 text-gray-600 font-mono text-xs whitespace-nowrap"
                            title={p.business_id || undefined}
                          >
                            {shortBusinessId(p.business_id)}
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
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <p className="mt-8 text-sm text-center text-gray-500">
          <Link href="/" className="text-teal-700 hover:underline">
            Home
          </Link>
        </p>
      </div>
    </div>
  );
}
