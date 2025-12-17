'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { authAPI, usageAPI, agentsAPI } from '@/lib/api';
import { logout } from '@/lib/auth';
import Link from 'next/link';

function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const prevPathnameRef = useRef(pathname);

  const loadData = async () => {
    try {
      console.log('[Dashboard] Loading data...');
      const [userRes, usageRes] = await Promise.all([
        authAPI.getMe(),
        usageAPI.getStatus().catch(() => ({ data: null })),
      ]);
      
      console.log('[Dashboard] User data:', userRes.data);
      console.log('[Dashboard] Agent data from /me:', userRes.data?.agent);
      
      setUser(userRes.data);
      setUsage(usageRes.data);
      
      // Use agent from /me endpoint (now includes agent data)
      if (userRes.data?.agent) {
        console.log('[Dashboard] Setting agent from /me:', userRes.data.agent);
        setAgent(userRes.data.agent);
      } else {
        // Fallback: fetch agent separately if not in /me response
        console.log('[Dashboard] Fetching agent separately...');
        const agentRes = await agentsAPI.get().catch(() => ({ data: null }));
        console.log('[Dashboard] Agent from separate fetch:', agentRes.data);
        setAgent(agentRes.data?.agent || { faqs: [] });
      }
      
      // Don't redirect to setup wizard - show checklist on dashboard instead
    } catch (error) {
      console.error('[Dashboard] Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Reload data whenever pathname changes to /dashboard (user navigated here)
  // Also reload when search params change (refresh parameter from settings/faqs pages)
  useEffect(() => {
    if (pathname === '/dashboard') {
      // Always reload when on dashboard page (handles navigation from other pages)
      loadData();
      // Clean up refresh parameter from URL if present
      if (searchParams.get('refresh')) {
        router.replace('/dashboard', { scroll: false });
      }
    }
  }, [pathname, searchParams, router]);

  // Reload data when page becomes visible (user switches back to tab or window)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };

    const handleFocus = () => {
      loadData();
    };

    // Reload when window gets focus (user switches back to tab)
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const copyPhoneNumber = () => {
    const phoneNumber = user?.business?.vapi_phone_number;
    if (phoneNumber) {
      navigator.clipboard.writeText(phoneNumber);
      alert('Phone number copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">Tavari Dashboard</h1>
          <div className="space-x-4">
            <Link href="/dashboard/settings" className="text-gray-700 hover:text-blue-600">
              Settings
            </Link>
            <button onClick={logout} className="text-gray-700 hover:text-blue-600">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back!</h2>
          <p className="text-gray-600">
            {user?.business?.name || 'Business'} • {user?.user?.email}
          </p>
        </div>

        {/* Setup Checklist */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Setup Checklist</h2>
          <div className="space-y-3">
            {/* Phone Number */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user?.business?.vapi_phone_number ? (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className={`text-sm ${user?.business?.vapi_phone_number ? 'text-gray-900' : 'text-gray-500'}`}>
                  Phone number provisioned
                </span>
              </div>
              {!user?.business?.vapi_phone_number && (
                <Link href="/dashboard/phone-number" className="text-sm text-blue-600 hover:underline">
                  Select phone number →
                </Link>
              )}
            </div>

            {/* FAQs */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {agent?.faqs && agent.faqs.length > 0 ? (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className={`text-sm ${agent?.faqs && agent.faqs.length > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                  FAQs configured ({agent?.faqs?.length || 0} added)
                </span>
              </div>
              {(!agent?.faqs || agent.faqs.length === 0) && (
                <Link href="/dashboard/faqs" className="text-sm text-blue-600 hover:underline">
                  Add FAQs →
                </Link>
              )}
            </div>

            {/* Email Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user?.business?.email_ai_answered !== false ? (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className={`text-sm ${user?.business?.email_ai_answered !== false ? 'text-gray-900' : 'text-gray-500'}`}>
                  Email notifications enabled
                </span>
              </div>
              {user?.business?.email_ai_answered === false && (
                <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                  Enable →
                </Link>
              )}
            </div>

            {/* SMS Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user?.business?.sms_enabled ? (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className={`text-sm ${user?.business?.sms_enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  SMS notifications {user?.business?.sms_enabled ? 'enabled' : '(optional)'}
                </span>
              </div>
              {!user?.business?.sms_enabled && (
                <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                  Set up →
                </Link>
              )}
            </div>

            {/* AI Agent Active */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user?.business?.ai_enabled ? (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className={`text-sm ${user?.business?.ai_enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  AI Phone Agent active
                </span>
              </div>
              {!user?.business?.ai_enabled && (
                <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                  Enable →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Tavari Phone Number - Prominently Displayed */}
        {user?.business?.vapi_phone_number && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Forward calls to</h3>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <span className="text-3xl font-bold text-blue-600">{user.business.vapi_phone_number}</span>
              <button
                onClick={copyPhoneNumber}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Copy
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              Forward calls from <strong>{user.business.public_phone_number || 'your public number'}</strong> to this number after {user.business.call_forward_rings || 4} rings.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-block w-3 h-3 rounded-full ${user.business.ai_enabled ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              <span className="text-sm text-gray-700">
                AI Phone Agent: {user.business.ai_enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {usage && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-semibold text-gray-600 mb-2">Minutes Used This Month</h3>
              <p className="text-2xl font-bold text-gray-900">
                {usage.minutes_used?.toFixed(0) || 0} / {usage.minutes_total || 0}
              </p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    usage.usage_percent >= 100
                      ? 'bg-red-500'
                      : usage.usage_percent >= 80
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(usage.usage_percent || 0, 100)}%` }}
                />
              </div>
              {usage.usage_percent >= 100 && (
                <p className="text-xs text-red-600 mt-1">Usage limit reached</p>
              )}
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Recent Calls</h3>
            <p className="text-2xl font-bold text-gray-900">-</p>
            <Link href="/dashboard/calls" className="text-sm text-blue-600 hover:underline mt-2 block">
              View all →
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">New Messages</h3>
            <p className="text-2xl font-bold text-gray-900">-</p>
            <Link href="/dashboard/messages" className="text-sm text-blue-600 hover:underline mt-2 block">
              View all →
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            href="/dashboard/settings"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Settings</h3>
            <p className="text-gray-600 text-sm">Manage your account and preferences</p>
          </Link>

          <Link
            href="/dashboard/calls"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Call History</h3>
            <p className="text-gray-600 text-sm">View and manage your call sessions</p>
          </Link>

          <Link
            href="/dashboard/messages"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Messages</h3>
            <p className="text-gray-600 text-sm">View messages left by callers</p>
          </Link>

          <Link
            href="/dashboard/billing"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Billing</h3>
            <p className="text-gray-600 text-sm">View usage and manage subscription</p>
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
