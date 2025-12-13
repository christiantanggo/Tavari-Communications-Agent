'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { authAPI, billingAPI } from '@/lib/api';
import { logout } from '@/lib/auth';
import Link from 'next/link';

function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userRes, billingRes] = await Promise.all([
        authAPI.getMe(),
        billingAPI.getStatus().catch(() => ({ data: null })),
      ]);
      setUser(userRes.data);
      setBilling(billingRes.data);
    } catch (error) {
      console.error('Failed to load settings data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBillingPortal = async () => {
    try {
      const res = await billingAPI.getPortal();
      window.location.href = res.data.url;
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to open billing portal');
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Settings</h1>
            <div className="space-x-4">
              <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Account Information */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Account Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <p className="text-gray-900">{user?.user?.email}</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Name</label>
                <p className="text-gray-900">
                  {user?.user?.first_name} {user?.user?.last_name}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Business</label>
                <p className="text-gray-900">{user?.business?.name}</p>
              </div>
              {user?.business?.voximplant_number && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">AI Phone Number</label>
                  <p className="text-gray-900 font-mono">{user?.business?.voximplant_number}</p>
                </div>
              )}
            </div>
          </div>

          {/* Billing & Subscription */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Billing & Subscription</h2>
            {billing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Plan</label>
                  <p className="text-gray-900 capitalize">{billing.plan_tier || 'Free'}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Usage Limit</label>
                  <p className="text-gray-900">{billing.usage_limit_minutes || 0} minutes/month</p>
                </div>
                {billing.subscription && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Subscription Status</label>
                    <p className="text-gray-900 capitalize">{billing.subscription.status}</p>
                  </div>
                )}
                <button
                  onClick={handleBillingPortal}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  Manage Billing
                </button>
              </div>
            ) : (
              <div>
                <p className="text-gray-600 mb-4">No active subscription</p>
                <Link
                  href="/dashboard/billing"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  Subscribe Now
                </Link>
              </div>
            )}
          </div>

          {/* AI Agent Configuration */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">AI Agent Configuration</h2>
            <p className="text-gray-600 mb-4">
              Update your AI agent settings, business hours, FAQs, and more.
            </p>
            <Link
              href="/dashboard/setup"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Update Configuration
            </Link>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-lg shadow p-6 border-2 border-red-200">
            <h2 className="text-xl font-bold mb-4 text-red-600">Danger Zone</h2>
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
            >
              Logout
            </button>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default SettingsPage;

