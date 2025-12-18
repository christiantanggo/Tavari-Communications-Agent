'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

function AdminAccountDetailPage() {
  const params = useParams();
  const { success, error: showError } = useToast();
  const accountId = params.id;
  const [account, setAccount] = useState(null);
  const [usage, setUsage] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [bonusMinutes, setBonusMinutes] = useState('');
  const [customMonthly, setCustomMonthly] = useState('');
  const [customOverage, setCustomOverage] = useState('');

  useEffect(() => {
    if (accountId) {
      loadAccount();
    }
  }, [accountId]);

  const loadAccount = async () => {
    try {
      const token = getAdminToken();
      const [accountRes, usageRes, activityRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/accounts/${accountId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/admin/accounts/${accountId}/usage`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${API_URL}/api/admin/accounts/${accountId}/activity`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => null),
      ]);

      const accountData = await accountRes.json();
      setAccount(accountData.business);
      setBonusMinutes(accountData.business.bonus_minutes || '');
      setCustomMonthly(accountData.business.custom_pricing_monthly || '');
      setCustomOverage(accountData.business.custom_pricing_overage || '');

      if (usageRes) {
        const usageData = await usageRes.json();
        setUsage(usageData.usage);
      }

      if (activityRes) {
        const activityData = await activityRes.json();
        setActivity(activityData.logs || []);
      }
    } catch (error) {
      console.error('Failed to load account:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMinutes = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/minutes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ minutes: parseInt(bonusMinutes) }),
      });

      if (response.ok) {
        success('Bonus minutes added successfully');
        await loadAccount();
      } else {
        showError('Failed to add minutes');
      }
    } catch (error) {
      showError('Failed to add minutes');
    }
  };

  const handleSetPricing = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/pricing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          monthly: customMonthly ? parseFloat(customMonthly) : null,
          overage: customOverage ? parseFloat(customOverage) : null,
        }),
      });

      if (response.ok) {
        success('Custom pricing set successfully');
        await loadAccount();
      } else {
        showError('Failed to set pricing');
      }
    } catch (error) {
      showError('Failed to set pricing');
    }
  };

  const handleRetryActivation = async () => {
    if (!confirm('Retry activation? This will create a new VAPI assistant and phone number.')) {
      return;
    }

    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/retry-activation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        success('Activation retried successfully');
        await loadAccount();
      } else {
        showError('Failed to retry activation');
      }
    } catch (error) {
      showError('Failed to retry activation');
    }
  };

  const handleSyncVAPI = async () => {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_URL}/api/admin/accounts/${accountId}/sync-vapi`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        success('VAPI assistant synced successfully');
      } else {
        showError('Failed to sync VAPI');
      }
    } catch (error) {
      showError('Failed to sync VAPI');
    }
  };

  if (loading) {
    return (
      <AdminGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AdminGuard>
    );
  }

  if (!account) {
    return (
      <AdminGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">Account not found</p>
            <Link href="/admin/accounts" className="text-blue-600 hover:underline mt-4 inline-block">
              Back to Accounts
            </Link>
          </div>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">{account.name}</h1>
            <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
              Back to Accounts
            </Link>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'details'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setActiveTab('usage')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'usage'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Usage
                </button>
                <button
                  onClick={() => setActiveTab('actions')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'actions'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Actions
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'activity'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Activity Log
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Business Name</label>
                      <p className="mt-1 text-gray-900">{account.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <p className="mt-1 text-gray-900">{account.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Public Phone</label>
                      <p className="mt-1 text-gray-900">{account.public_phone_number || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tavari Phone</label>
                      <p className="mt-1 text-gray-900">{account.vapi_phone_number || 'Not provisioned'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Plan Tier</label>
                      <p className="mt-1 text-gray-900 capitalize">{account.plan_tier || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">AI Enabled</label>
                      <p className="mt-1">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          account.ai_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {account.ai_enabled ? 'Yes' : 'No'}
                        </span>
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">VAPI Assistant ID</label>
                      <p className="mt-1 text-gray-900 font-mono text-sm">{account.vapi_assistant_id || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Created</label>
                      <p className="mt-1 text-gray-900">
                        {new Date(account.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'usage' && usage && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Minutes Used This Cycle</label>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {usage.minutes_used || 0} / {usage.minutes_total || 0}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Bonus Minutes</label>
                    <p className="mt-1 text-gray-900">{account.bonus_minutes || 0}</p>
                  </div>
                  {usage.billing_cycle_start && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Billing Cycle</label>
                      <p className="mt-1 text-gray-900">
                        {new Date(usage.billing_cycle_start).toLocaleDateString()} - {new Date(usage.billing_cycle_end).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'actions' && (
                <div className="space-y-6">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">Add Bonus Minutes</h3>
                    <div className="flex gap-4">
                      <input
                        type="number"
                        value={bonusMinutes}
                        onChange={(e) => setBonusMinutes(e.target.value)}
                        placeholder="Minutes to add"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleAddMinutes}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Add Minutes
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">Set Custom Pricing</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price</label>
                        <input
                          type="number"
                          value={customMonthly}
                          onChange={(e) => setCustomMonthly(e.target.value)}
                          placeholder="Leave empty for default"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Overage Rate (per minute)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={customOverage}
                          onChange={(e) => setCustomOverage(e.target.value)}
                          placeholder="Leave empty for default"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        onClick={handleSetPricing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Set Pricing
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">VAPI Actions</h3>
                    <div className="space-y-2">
                      <button
                        onClick={handleRetryActivation}
                        className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                      >
                        Retry Activation
                      </button>
                      <button
                        onClick={handleSyncVAPI}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        Sync VAPI Assistant
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="space-y-2">
                  {activity.length === 0 ? (
                    <p className="text-gray-500">No activity logs</p>
                  ) : (
                    activity.map((log) => (
                      <div key={log.id} className="border border-gray-200 rounded p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">{log.action.replace('_', ' ')}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(log.created_at).toLocaleString()}
                            </p>
                          </div>
                          {log.details && (
                            <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  );

  function getAdminToken() {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  }
}

export default AdminAccountDetailPage;

