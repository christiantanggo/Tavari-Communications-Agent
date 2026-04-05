'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AffiliateCommissionSettingsPanel from '@/components/admin/AffiliateCommissionSettingsPanel';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function getAdminToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find((c) => c.trim().startsWith('admin_token='));
  return tokenCookie ? tokenCookie.split('=')[1] : null;
}

function normalizeStatus(row) {
  const s = row?.status;
  if (s === 'approved' || s === 'rejected' || s === 'pending') return s;
  return 'pending';
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-100 text-amber-900',
    approved: 'bg-green-100 text-green-900',
    rejected: 'bg-gray-200 text-gray-800',
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold capitalize ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}

function pickPartner(row) {
  const raw = row.affiliate_partners;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}

export default function AdminAffiliatesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [sectionTab, setSectionTab] = useState('applications');
  const [partners, setPartners] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState('');
  const [newPartner, setNewPartner] = useState({ email: '', display_name: '', is_sales_rep: true });
  const [partnerBusy, setPartnerBusy] = useState(false);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionId, setActionId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [eventModal, setEventModal] = useState(null);
  const [eventType, setEventType] = useState('conversion');
  const [eventModuleKey, setEventModuleKey] = useState('phone-agent');
  const [eventDollars, setEventDollars] = useState('');
  const [eventBusy, setEventBusy] = useState(false);
  const [eventMsg, setEventMsg] = useState('');
  const [purchasesModal, setPurchasesModal] = useState(null);
  const [resendBusyId, setResendBusyId] = useState(null);
  const [resendMsg, setResendMsg] = useState({});

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-applications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setApplications(data.applications || []);
    } catch (e) {
      setApplications([]);
      setError(e.message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const tab = q.get('tab');
    if (tab === 'commission') setSectionTab('commission');
    if (tab === 'partners') setSectionTab('partners');
  }, []);

  const goSection = (tab) => {
    setSectionTab(tab);
    const path = pathname || '/admin/affiliates';
    let next = path;
    if (tab === 'commission') next = `${path}?tab=commission`;
    else if (tab === 'partners') next = `${path}?tab=partners`;
    router.replace(next, { scroll: false });
  };

  const loadPartners = useCallback(async () => {
    setPartnersLoading(true);
    setPartnersError('');
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-partners`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPartners(data.partners || []);
    } catch (e) {
      setPartners([]);
      setPartnersError(e.message || 'Failed to load partners');
    } finally {
      setPartnersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sectionTab === 'partners') loadPartners();
  }, [sectionTab, loadPartners]);

  const patchPartner = async (id, body) => {
    setPartnerBusy(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-partners/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await loadPartners();
    } catch (e) {
      alert(e.message || 'Update failed');
    } finally {
      setPartnerBusy(false);
    }
  };

  const createPartner = async (e) => {
    e.preventDefault();
    setPartnerBusy(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-partners`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newPartner.email.trim(),
          display_name: newPartner.display_name.trim() || newPartner.email.trim(),
          is_sales_rep: newPartner.is_sales_rep,
          active: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNewPartner({ email: '', display_name: '', is_sales_rep: true });
      await loadPartners();
      alert('Partner created. Send them a magic link from Sales sign-in or create a portal token from support tooling.');
    } catch (err) {
      alert(err.message || 'Create failed');
    } finally {
      setPartnerBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    setActionError('');
    setActionId(id);
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-applications/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const updated = data.application;
      setApplications((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch (e) {
      setActionError(e.message || 'Update failed');
    } finally {
      setActionId(null);
    }
  };

  const openEventModal = (partnerId, partnerName) => {
    setEventMsg('');
    setEventType('conversion');
    setEventModuleKey('phone-agent');
    setEventDollars('');
    setEventModal({ partnerId, partnerName });
  };

  const openPurchasesModal = async (partnerId, partnerName) => {
    setPurchasesModal({ partnerId, partnerName, events: [], loading: true, error: '' });
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-partners/${partnerId}/events?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPurchasesModal({
        partnerId,
        partnerName,
        events: data.events || [],
        loading: false,
        error: '',
      });
    } catch (e) {
      setPurchasesModal({
        partnerId,
        partnerName,
        events: [],
        loading: false,
        error: e.message || 'Failed to load',
      });
    }
  };

  const submitPartnerEvent = async () => {
    if (!eventModal?.partnerId) return;
    setEventBusy(true);
    setEventMsg('');
    try {
      const token = getAdminToken();
      const body =
        eventType === 'lead'
          ? { event_type: 'lead' }
          : {
              event_type: 'conversion',
              amount_cents: Math.round(parseFloat(eventDollars || '0') * 100),
              module_key: eventModuleKey,
            };
      if (eventType === 'conversion' && (Number.isNaN(body.amount_cents) || body.amount_cents < 0)) {
        setEventMsg('Enter a valid dollar amount (0 or more).');
        setEventBusy(false);
        return;
      }
      const res = await fetch(`${API_URL}/api/admin/affiliate-partners/${eventModal.partnerId}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEventMsg('Recorded.');
      setTimeout(() => {
        setEventModal(null);
        setEventMsg('');
      }, 600);
    } catch (e) {
      setEventMsg(e.message || 'Failed');
    } finally {
      setEventBusy(false);
    }
  };

  const filteredByStatus = useMemo(() => {
    if (!statusFilter) return applications;
    return applications.filter((a) => normalizeStatus(a) === statusFilter);
  }, [applications, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredByStatus;
    return filteredByStatus.filter((a) => {
      const blob = [
        a.name,
        a.email,
        a.company,
        a.website_or_channel,
        a.audience,
        a.promote_plan,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [filteredByStatus, search]);

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const a of applications) {
      const s = normalizeStatus(a);
      if (s === 'approved') approved += 1;
      else if (s === 'rejected') rejected += 1;
      else pending += 1;
    }
    return { pending, approved, rejected, total: applications.length };
  }, [applications]);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Affiliate program</h1>
          <div className="mt-4 border-b border-gray-200 bg-white rounded-t-lg px-1 pt-1 shadow-sm">
            <nav
              className="-mb-px flex flex-wrap gap-0.5"
              role="tablist"
              aria-label="Affiliate admin sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={sectionTab === 'applications'}
                onClick={() => goSection('applications')}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-t-md ${
                  sectionTab === 'applications'
                    ? 'border-blue-600 text-blue-700 bg-gray-50/80'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                Applications
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sectionTab === 'commission'}
                onClick={() => goSection('commission')}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-t-md ${
                  sectionTab === 'commission'
                    ? 'border-blue-600 text-blue-700 bg-gray-50/80'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                Commission &amp; payout rules
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sectionTab === 'partners'}
                onClick={() => goSection('partners')}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-t-md ${
                  sectionTab === 'partners'
                    ? 'border-blue-600 text-blue-700 bg-gray-50/80'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                Partners &amp; sales reps
              </button>
            </nav>
          </div>
        </div>

        {sectionTab === 'commission' && <AffiliateCommissionSettingsPanel variant="embedded" />}

        {sectionTab === 'partners' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900">Create partner or sales rep</h2>
              <p className="text-sm text-gray-600 mt-1">
                Creates an <code className="text-xs bg-gray-100 px-1 rounded">affiliate_partners</code> row with a unique
                code. Enable <strong>Sales rep</strong> for the sales portal (magic link from{' '}
                <code className="text-xs bg-gray-100 px-1 rounded">/sales/login</code>). Run migration{' '}
                <code className="text-xs bg-gray-100 px-1 rounded">add_sales_rep_portal.sql</code> first.
              </p>
              <form onSubmit={createPartner} className="mt-4 grid sm:grid-cols-2 gap-3 max-w-2xl">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Email *</label>
                  <input
                    required
                    type="email"
                    value={newPartner.email}
                    onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                    className="mt-0.5 w-full border rounded-md px-3 py-2 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Display name</label>
                  <input
                    value={newPartner.display_name}
                    onChange={(e) => setNewPartner({ ...newPartner, display_name: e.target.value })}
                    className="mt-0.5 w-full border rounded-md px-3 py-2 text-sm text-gray-900"
                    placeholder="Optional"
                  />
                </div>
                <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={newPartner.is_sales_rep}
                    onChange={(e) => setNewPartner({ ...newPartner, is_sales_rep: e.target.checked })}
                  />
                  Sales rep (can use sales portal)
                </label>
                <button
                  type="submit"
                  disabled={partnerBusy}
                  className="sm:col-span-2 w-fit bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {partnerBusy ? 'Creating…' : 'Create'}
                </button>
              </form>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">All partners</h2>
                <button
                  type="button"
                  onClick={loadPartners}
                  className="text-sm text-blue-600 hover:underline"
                  disabled={partnersLoading}
                >
                  Refresh
                </button>
              </div>
              {partnersError && <p className="px-4 py-2 text-sm text-red-700">{partnersError}</p>}
              {partnersLoading && <p className="px-4 py-6 text-sm text-gray-600">Loading…</p>}
              {!partnersLoading && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2">Code</th>
                        <th className="px-4 py-2">Email</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Sales</th>
                        <th className="px-4 py-2">Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {partners.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2 font-mono text-xs">{p.affiliate_code}</td>
                          <td className="px-4 py-2">{p.email}</td>
                          <td className="px-4 py-2">{p.display_name}</td>
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={!!p.is_sales_rep}
                              onChange={(e) => patchPartner(p.id, { is_sales_rep: e.target.checked })}
                              disabled={partnerBusy}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={!!p.active}
                              onChange={(e) => patchPartner(p.id, { active: e.target.checked })}
                              disabled={partnerBusy}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {sectionTab === 'applications' && loading && applications.length === 0 && !error && (
          <div className="flex items-center justify-center min-h-[40vh] rounded-lg border border-gray-100 bg-white">
            <p className="text-lg text-gray-600">Loading applications…</p>
          </div>
        )}

        {sectionTab === 'applications' && !(loading && applications.length === 0 && !error) && (
          <>
        <div className="mb-6">
          <p className="text-sm text-gray-600 max-w-3xl">
            Submissions are emailed to{' '}
            <code className="text-xs bg-gray-200 px-1 rounded">AFFILIATE_CONTACT_EMAIL</code> (or
            fallbacks). Run partner-program migrations on Supabase:{' '}
            <code className="text-xs bg-gray-200 px-1 rounded">add_affiliate_application_approval.sql</code>,{' '}
            <code className="text-xs bg-gray-200 px-1 rounded">add_affiliate_partner_program.sql</code>.
            Approving creates a partner record, sends a dashboard link, and enables tracking URLs.
          </p>
          <p className="mt-2">
            <Link href="/affiliates" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              Open public partner page →
            </Link>
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Could not load saved applications</p>
            <p className="mt-1 text-amber-800">{error}</p>
            <p className="mt-2 text-amber-800">
              Run <code className="text-xs">add_affiliate_applications.sql</code> then{' '}
              <code className="text-xs">add_affiliate_application_approval.sql</code> if columns are missing.
            </p>
          </div>
        )}

        {actionError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {actionError}
          </div>
        )}

        <div className="mb-4 border-b border-gray-200 bg-white rounded-t-lg px-1 pt-1 shadow-sm">
          <nav className="-mb-px flex flex-wrap gap-0.5" role="tablist" aria-label="Filter by application status">
            {[
              { id: '', label: 'All', count: counts.total, activeClass: 'border-blue-600 text-blue-700' },
              {
                id: 'pending',
                label: 'Pending',
                count: counts.pending,
                activeClass: 'border-amber-500 text-amber-900',
              },
              {
                id: 'approved',
                label: 'Approved',
                count: counts.approved,
                activeClass: 'border-green-600 text-green-800',
              },
              {
                id: 'rejected',
                label: 'Rejected',
                count: counts.rejected,
                activeClass: 'border-gray-500 text-gray-800',
              },
            ].map((tab) => {
              const selected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  id={`affiliate-tab-${tab.id || 'all'}`}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-t-md ${
                    selected
                      ? `${tab.activeClass} bg-gray-50/80`
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`min-w-[1.5rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
                      selected ? 'bg-white/90 text-current shadow-sm' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Search (current list)</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, audience…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Channel
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Partner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500 text-sm">
                      {applications.length === 0 && !error
                        ? 'No applications in this view.'
                        : 'No rows match your search.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const st = normalizeStatus(row);
                    const busy = actionId === row.id;
                    const partner = pickPartner(row);
                    return (
                      <tr key={row.id} className="align-top">
                        <td className="px-4 py-3">
                          <StatusBadge status={st} />
                          {st !== 'pending' && row.reviewed_at && (
                            <p className="text-[10px] text-gray-400 mt-1 max-w-[7rem] leading-tight">
                              {formatDate(row.reviewed_at)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-3 text-sm">
                          <a href={`mailto:${row.email}`} className="text-blue-600 hover:underline">
                            {row.email}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.company || '—'}</td>
                        <td
                          className="px-4 py-3 text-sm text-gray-700 max-w-[8rem] truncate"
                          title={row.website_or_channel || ''}
                        >
                          {row.website_or_channel || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[9rem]">
                          {partner?.affiliate_code ? (
                            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                              {partner.affiliate_code}
                            </span>
                          ) : (
                            '—'
                          )}
                          {partner && !partner.active && (
                            <span className="block text-[10px] text-amber-700 mt-0.5">inactive</span>
                          )}
                          {partner?.id && partner.active && (
                            <p className="mt-2 text-[10px] text-gray-600 leading-snug max-w-[11rem]">
                              Commission % is set per module under{' '}
                              <button
                                type="button"
                                onClick={() => goSection('commission')}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                Commission &amp; payout
                              </button>
                              .
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-col gap-1 min-w-[7rem]">
                            {st === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setStatus(row.id, 'approved')}
                                  className="px-2 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  {busy ? '…' : 'Approve'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setStatus(row.id, 'rejected')}
                                  className="px-2 py-1 rounded text-xs font-medium bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {st !== 'pending' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setStatus(row.id, 'pending')}
                                className="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                {busy ? '…' : 'Mark pending'}
                              </button>
                            )}
                            {st === 'approved' && partner?.id && partner.active && (
                              <button
                                type="button"
                                disabled={resendBusyId === row.id}
                                onClick={() => resendApprovalEmail(row.id)}
                                className="px-2 py-1 rounded text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                              >
                                {resendBusyId === row.id ? 'Sending…' : 'Resend approval email'}
                              </button>
                            )}
                            {resendMsg[row.id] && (
                              <p
                                className={`text-[10px] leading-tight ${
                                  resendMsg[row.id].includes('sent') ? 'text-green-700' : 'text-red-600'
                                }`}
                              >
                                {resendMsg[row.id]}
                              </p>
                            )}
                            {partner?.id && partner.active && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEventModal(partner.id, row.name)}
                                  className="px-2 py-1 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                  Record lead / sale
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openPurchasesModal(partner.id, row.name)}
                                  className="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-800 hover:bg-gray-50"
                                >
                                  All activity
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {purchasesModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Close"
              onClick={() => setPurchasesModal(null)}
            />
            <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-t-xl bg-white shadow-xl sm:rounded-xl flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Partner activity</h3>
                  <p className="text-sm text-gray-600">{purchasesModal.partnerName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPurchasesModal(null)}
                  className="text-sm text-gray-500 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                {purchasesModal.loading && <p className="text-sm text-gray-600">Loading…</p>}
                {purchasesModal.error && (
                  <p className="text-sm text-red-700">{purchasesModal.error}</p>
                )}
                {!purchasesModal.loading && !purchasesModal.error && (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <tr>
                        <th className="px-2 py-2">When</th>
                        <th className="px-2 py-2">Type</th>
                        <th className="px-2 py-2">Amount</th>
                        <th className="px-2 py-2">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(purchasesModal.events || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-2 py-4 text-center text-gray-500">
                            No events yet.
                          </td>
                        </tr>
                      ) : (
                        purchasesModal.events.map((ev) => (
                          <tr key={ev.id}>
                            <td className="px-2 py-2 whitespace-nowrap text-gray-700">
                              {formatDate(ev.created_at)}
                            </td>
                            <td className="px-2 py-2 capitalize">{ev.event_type}</td>
                            <td className="px-2 py-2">
                              {ev.amount_cents != null
                                ? `${(ev.currency || 'CAD').toUpperCase()} $${(ev.amount_cents / 100).toFixed(2)}`
                                : '—'}
                            </td>
                            <td className="px-2 py-2 text-gray-600 text-xs break-all max-w-[12rem]">
                              {ev.metadata?.source === 'stripe_checkout' && 'Stripe checkout'}
                              {ev.metadata?.source === 'stripe_subscription_renewal' && 'Stripe renewal'}
                              {ev.metadata?.source === 'manual' && 'Manual'}
                              {!ev.metadata?.source && ev.event_type === 'conversion' && '—'}
                              {ev.metadata?.stripe_checkout_session_id && (
                                <span className="block text-[10px] text-gray-400 mt-0.5 truncate">
                                  {ev.metadata.stripe_checkout_session_id}
                                </span>
                              )}
                              {ev.metadata?.stripe_invoice_id && (
                                <span className="block text-[10px] text-gray-400 mt-0.5 truncate">
                                  {ev.metadata.stripe_invoice_id}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {eventModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Close"
              onClick={() => !eventBusy && setEventModal(null)}
            />
            <div className="relative z-10 w-full max-w-md rounded-t-xl bg-white p-6 shadow-xl sm:rounded-xl">
              <h3 className="text-lg font-semibold text-gray-900">Record attribution</h3>
              <p className="text-sm text-gray-600 mt-1">{eventModal.partnerName}</p>
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-gray-700">Event</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="lead">Lead (signup / qualified interest)</option>
                  <option value="conversion">Conversion (sale — enter amount)</option>
                </select>
                {eventType === 'conversion' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Module (ledger)</label>
                      <select
                        value={eventModuleKey}
                        onChange={(e) => setEventModuleKey(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="phone-agent">phone-agent (subscriptions / default)</option>
                        <option value="delivery-dispatch">delivery-dispatch</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Sale amount (CAD)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={eventDollars}
                        onChange={(e) => setEventDollars(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </>
                )}
              </div>
              {eventMsg && <p className="mt-3 text-sm text-gray-700">{eventMsg}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={eventBusy}
                  onClick={() => setEventModal(null)}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={eventBusy}
                  onClick={submitPartnerEvent}
                  className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {eventBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Details</h2>
            {filtered.map((row) => (
              <details
                key={`d-${row.id}`}
                className="bg-white rounded-lg shadow border border-gray-100 open:ring-2 open:ring-blue-100"
              >
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-800 hover:bg-gray-50 rounded-lg flex items-center gap-2">
                  <StatusBadge status={normalizeStatus(row)} />
                  <span>
                    {row.name} — {row.email}
                  </span>
                </summary>
                <div className="px-4 pb-4 pt-0 border-t border-gray-100 space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-700">Audience</p>
                    <p className="mt-1 text-gray-600 whitespace-pre-wrap">{row.audience}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Promotion plan</p>
                    <p className="mt-1 text-gray-600 whitespace-pre-wrap">{row.promote_plan}</p>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
