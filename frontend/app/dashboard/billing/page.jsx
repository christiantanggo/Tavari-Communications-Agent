'use client';

import { useState, useEffect } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { authAPI, billingAPI, usageAPI } from '@/lib/api';
import Link from 'next/link';

function BillingPage() {
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    minutes_exhausted_behavior: 'disable_ai',
    overage_billing_enabled: false,
    overage_cap_minutes: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userRes, usageRes, billingRes] = await Promise.all([
        authAPI.getMe(),
        usageAPI.getStatus().catch(() => ({ data: null })),
        billingAPI.getStatus().catch(() => ({ data: null })),
      ]);
      setUser(userRes.data);
      setUsage(usageRes.data);
      setBilling(billingRes.data);
      
      if (userRes.data?.business) {
        setSettings({
          minutes_exhausted_behavior: userRes.data.business.minutes_exhausted_behavior || 'disable_ai',
          overage_billing_enabled: userRes.data.business.overage_billing_enabled || false,
          overage_cap_minutes: userRes.data.business.overage_cap_minutes || null,
        });
      }
    } catch (error) {
      console.error('Failed to load billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update billing settings
      const { businessAPI } = await import('@/lib/api');
      await businessAPI.updateSettings(settings);
      alert('Settings saved successfully!');
      await loadData();
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleUpgrade = async (planTier) => {
    // Handle plan upgrade
    const priceIds = {
      starter: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID,
      core: process.env.NEXT_PUBLIC_STRIPE_CORE_PRICE_ID,
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    };
    
    try {
      const res = await billingAPI.createCheckout(priceIds[planTier]);
      window.location.href = res.data.url;
    } catch (error) {
      alert('Failed to start upgrade process');
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
            <h1 className="text-xl font-bold text-blue-600">Billing & Usage</h1>
            <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
              Dashboard
            </Link>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Current Plan */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Current Plan</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Plan</span>
                <span className="font-semibold capitalize">{billing?.plan_tier || 'Starter'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Monthly Price</span>
                <span className="font-semibold">
                  ${billing?.plan_tier === 'starter' ? '79' : billing?.plan_tier === 'core' ? '129' : '179'}/month
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Included Minutes</span>
                <span className="font-semibold">{billing?.usage_limit_minutes || 250} minutes</span>
              </div>
            </div>
          </div>

          {/* Usage */}
          {usage && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold mb-4 text-gray-900">Usage This Month</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Minutes Used</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {usage.minutes_used?.toFixed(0) || 0} / {usage.minutes_total || 0}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full ${
                      usage.usage_percent >= 100
                        ? 'bg-red-500'
                        : usage.usage_percent >= 80
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(usage.usage_percent || 0, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{usage.minutes_remaining || 0} minutes remaining</span>
                  <span>{usage.usage_percent || 0}% used</span>
                </div>
                {usage.billing_cycle_end && (
                  <p className="text-sm text-gray-500">
                    Minutes reset on {new Date(usage.billing_cycle_end).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Minutes Exhaustion Settings */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">When Minutes Are Exhausted</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Behavior
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="behavior"
                      value="disable_ai"
                      checked={settings.minutes_exhausted_behavior === 'disable_ai'}
                      onChange={(e) => setSettings({ ...settings, minutes_exhausted_behavior: e.target.value, overage_billing_enabled: false })}
                      className="mr-2"
                    />
                    <div>
                      <span className="font-medium">Disable AI (Default)</span>
                      <p className="text-xs text-gray-500">AI turns off, calls forward to your restaurant. AI resumes on next billing date.</p>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="behavior"
                      value="allow_overage"
                      checked={settings.minutes_exhausted_behavior === 'allow_overage'}
                      onChange={(e) => setSettings({ ...settings, minutes_exhausted_behavior: e.target.value, overage_billing_enabled: true })}
                      className="mr-2"
                    />
                    <div>
                      <span className="font-medium">Allow Overage Billing</span>
                      <p className="text-xs text-gray-500">AI continues, you're charged at your plan's overage rate until monthly cap is reached.</p>
                    </div>
                  </label>
                </div>
              </div>

              {settings.minutes_exhausted_behavior === 'allow_overage' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Monthly Overage Cap (required)
                  </label>
                  <input
                    type="number"
                    value={settings.overage_cap_minutes || ''}
                    onChange={(e) => setSettings({ ...settings, overage_cap_minutes: parseInt(e.target.value) || null })}
                    placeholder="e.g., 200"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum overage minutes per month. AI stops when cap is reached.</p>
                </div>
              )}
            </div>
          </div>

          {/* Upgrade Options */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Upgrade Plan</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Starter</h3>
                <p className="text-2xl font-bold text-gray-900 mb-1">$79<span className="text-sm font-normal text-gray-600">/month</span></p>
                <p className="text-sm text-gray-600 mb-4">250 minutes, 5 FAQs</p>
                <button
                  onClick={() => handleUpgrade('starter')}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  disabled={billing?.plan_tier === 'starter'}
                >
                  {billing?.plan_tier === 'starter' ? 'Current Plan' : 'Select'}
                </button>
              </div>
              <div className="border-2 border-blue-500 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Core</h3>
                <p className="text-2xl font-bold text-gray-900 mb-1">$129<span className="text-sm font-normal text-gray-600">/month</span></p>
                <p className="text-sm text-gray-600 mb-4">500 minutes, 10 FAQs</p>
                <button
                  onClick={() => handleUpgrade('core')}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  disabled={billing?.plan_tier === 'core'}
                >
                  {billing?.plan_tier === 'core' ? 'Current Plan' : 'Upgrade'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Pro</h3>
                <p className="text-2xl font-bold text-gray-900 mb-1">$179<span className="text-sm font-normal text-gray-600">/month</span></p>
                <p className="text-sm text-gray-600 mb-4">750 minutes, 20 FAQs</p>
                <button
                  onClick={() => handleUpgrade('pro')}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                  disabled={billing?.plan_tier === 'pro'}
                >
                  {billing?.plan_tier === 'pro' ? 'Current Plan' : 'Upgrade'}
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default BillingPage;

