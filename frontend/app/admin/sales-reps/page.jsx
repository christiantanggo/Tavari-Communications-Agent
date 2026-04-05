'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.tavarios.com').replace(/\/$/, '');

function getAdminToken() {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find((c) => c.trim().startsWith('admin_token='));
  return tokenCookie ? decodeURIComponent(tokenCookie.split('=').slice(1).join('=').trim()) : null;
}

export default function AdminSalesRepsPage() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState('');
  const [newRep, setNewRep] = useState({ email: '', display_name: '' });
  const [showAllPartners, setShowAllPartners] = useState(false);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError('');
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
      setError(e.message || 'Failed to load partners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  const salesReps = useMemo(() => partners.filter((p) => p.is_sales_rep), [partners]);
  const nonSalesPartners = useMemo(() => partners.filter((p) => !p.is_sales_rep), [partners]);

  const patchPartner = async (id, body) => {
    setBusyId(id);
    setMsg('');
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
      setMsg(e.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const sendSalesLink = async (id) => {
    setBusyId(`link-${id}`);
    setMsg('');
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-partners/${id}/send-sales-login-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMsg(data.message || 'Link sent.');
    } catch (e) {
      setMsg(e.message || 'Failed to send link');
    } finally {
      setBusyId(null);
    }
  };

  const createSalesRep = async (e) => {
    e.preventDefault();
    setBusyId('create');
    setMsg('');
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/api/admin/affiliate-partners`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newRep.email.trim(),
          display_name: (newRep.display_name.trim() || newRep.email.trim()),
          is_sales_rep: true,
          active: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNewRep({ email: '', display_name: '' });
      setMsg('Sales rep created. Send them a sign-in link below.');
      await loadPartners();
    } catch (err) {
      setMsg(err.message || 'Create failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales reps</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Create logins for your sales team. Each rep gets a partner code for customer signup attribution and a separate{' '}
            <Link href="/sales/login" className="text-teal-700 hover:underline font-medium">
              sales portal
            </Link>{' '}
            (magic link). Full affiliate tools stay under{' '}
            <Link href="/admin/affiliates?tab=partners" className="text-blue-600 hover:underline font-medium">
              Affiliates → Partners
            </Link>
            .
          </p>
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800">{msg}</div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow border border-gray-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add sales rep</h2>
        <form onSubmit={createSalesRep} className="flex flex-col sm:flex-row sm:flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Work email</label>
            <input
              type="email"
              required
              value={newRep.email}
              onChange={(e) => setNewRep({ ...newRep, email: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
              placeholder="rep@company.com"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
            <input
              type="text"
              value={newRep.display_name}
              onChange={(e) => setNewRep({ ...newRep, display_name: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900"
              placeholder="Optional"
            />
          </div>
          <button
            type="submit"
            disabled={busyId === 'create'}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {busyId === 'create' ? 'Creating…' : 'Create sales rep'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Sales-enabled partners</h2>
          <button
            type="button"
            onClick={() => setShowAllPartners((v) => !v)}
            className="text-sm text-teal-700 hover:underline font-medium text-left sm:text-right"
          >
            {showAllPartners ? 'Hide' : 'Show'} partners without sales portal
          </button>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-600">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {salesReps.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No sales reps yet. Create one above or enable sales on an existing partner below.
                    </td>
                  </tr>
                ) : (
                  salesReps.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.display_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{p.email}</td>
                      <td className="px-4 py-3 font-mono text-xs bg-gray-50 rounded">{p.affiliate_code}</td>
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!p.active}
                            disabled={busyId === p.id}
                            onChange={(e) => patchPartner(p.id, { active: e.target.checked })}
                          />
                          <span className="text-gray-600">{p.active ? 'Yes' : 'No'}</span>
                        </label>
                      </td>
                      <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={busyId === `link-${p.id}` || !p.active}
                          onClick={() => sendSalesLink(p.id)}
                          className="text-teal-700 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                          {busyId === `link-${p.id}` ? 'Sending…' : 'Email sign-in link'}
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => {
                            if (confirm('Remove sales portal access? They keep their partner code for affiliate use.')) {
                              patchPartner(p.id, { is_sales_rep: false });
                            }
                          }}
                          className="text-gray-600 hover:text-red-700 font-medium disabled:opacity-50"
                        >
                          Remove sales access
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAllPartners && nonSalesPartners.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Other partners (affiliate only)</h2>
            <p className="text-xs text-gray-500 mt-1">Enable sales portal to let them use /sales/login and onboard customers.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {nonSalesPartners.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.display_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{p.email}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.affiliate_code}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyId === p.id || !p.active}
                        onClick={() => patchPartner(p.id, { is_sales_rep: true })}
                        className="px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-md hover:bg-teal-700 disabled:opacity-50"
                      >
                        {busyId === p.id ? '…' : 'Enable sales portal'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
