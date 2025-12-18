'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
import { authAPI, usageAPI, callsAPI, messagesAPI } from '@/lib/api';

function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [calls, setCalls] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSmsBanner, setShowSmsBanner] = useState(false);
  const prevPathnameRef = useRef(pathname);

  const loadData = async () => {
    try {
      console.log('[Dashboard] Loading data...');
      const [userRes, usageRes, callsRes, messagesRes] = await Promise.all([
        authAPI.getMe(),
        usageAPI.getStatus().catch(() => ({ data: null })),
        callsAPI.list({ limit: 10 }).catch(() => ({ data: { calls: [] } })),
        messagesAPI.list({ limit: 10 }).catch(() => ({ data: { messages: [] } })),
      ]);
      
      console.log('[Dashboard] User data:', userRes.data);
      setUser(userRes.data);
      setUsage(usageRes.data);
      setCalls(callsRes.data?.calls || []);
      setMessages(messagesRes.data?.messages || []);

      // Check if SMS banner should be shown (checklist complete but SMS not enabled)
      const business = userRes.data?.business;
      if (business) {
        const checklistComplete = 
          business.vapi_phone_number &&
          business.email_ai_answered !== false &&
          business.ai_enabled;
        
        if (checklistComplete && !business.sms_enabled) {
          // Check if user has dismissed the banner
          const dismissed = localStorage.getItem('sms_banner_dismissed');
          setShowSmsBanner(!dismissed);
        }
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Reload data whenever pathname changes to /dashboard
  useEffect(() => {
    if (pathname === '/dashboard') {
      loadData();
      if (searchParams.get('refresh')) {
        router.replace('/dashboard', { scroll: false });
      }
    }
  }, [pathname, searchParams, router]);

  // Reload data when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };

    const handleFocus = () => {
      loadData();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Check if checklist should be shown
  const shouldShowChecklist = () => {
    if (!user?.business) return true;
    const business = user.business;
    
    // Checklist is complete when everything except SMS is done
    const isComplete = 
      business.vapi_phone_number &&
      business.email_ai_answered !== false &&
      business.ai_enabled;
    
    return !isComplete;
  };

  // Count AI handled calls (completed calls without messages)
  const aiHandledCalls = calls.filter(
    call => call.status === 'completed' && !call.message_taken
  ).length;

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const dismissSmsBanner = () => {
    localStorage.setItem('sms_banner_dismissed', 'true');
    setShowSmsBanner(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const business = user?.business;
  const showChecklist = shouldShowChecklist();

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back!</h2>
          <p className="text-gray-600">
            {business?.name || 'Business'} • {user?.user?.email}
          </p>
        </div>

        {/* SMS Activation Banner */}
        {showSmsBanner && !showChecklist && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg relative">
            <button
              onClick={dismissSmsBanner}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900 mb-1">Activate SMS for important messages</h3>
                <p className="text-sm text-blue-700">Get instant SMS alerts when callers request urgent callbacks</p>
              </div>
              <button
                onClick={() => router.push('/dashboard/settings')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
              >
                Activate SMS
              </button>
            </div>
          </div>
        )}

        {/* Setup Checklist */}
        {showChecklist && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Setup Checklist</h2>
            <div className="space-y-3">
              {/* Phone Number */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {business?.vapi_phone_number ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`text-sm ${business?.vapi_phone_number ? 'text-gray-900' : 'text-gray-500'}`}>
                    Phone number provisioned
                  </span>
                </div>
                {!business?.vapi_phone_number && (
                  <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                    Select phone number →
                  </Link>
                )}
              </div>

              {/* Email Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {business?.email_ai_answered !== false ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`text-sm ${business?.email_ai_answered !== false ? 'text-gray-900' : 'text-gray-500'}`}>
                    Email notifications enabled
                  </span>
                </div>
                {business?.email_ai_answered === false && (
                  <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                    Enable →
                  </Link>
                )}
              </div>

              {/* AI Agent Active */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {business?.ai_enabled ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={`text-sm ${business?.ai_enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                    AI Phone Agent active
                  </span>
                </div>
                {!business?.ai_enabled && (
                  <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
                    Enable →
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Your AI Agent Number */}
          {business?.vapi_phone_number && (
            <button
              onClick={() => router.push('/dashboard/settings')}
              className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-left hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              <div className="flex items-center justify-between mb-2">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span className={`inline-block w-3 h-3 rounded-full ${business?.ai_enabled ? 'bg-green-400' : 'bg-gray-400'}`}></span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-1">Your AI Agent Number</h3>
              <p className="text-blue-100 text-sm mb-2">{business.vapi_phone_number}</p>
              <p className="text-blue-200 text-xs">Click to manage settings</p>
            </button>
          )}

          {/* Minutes Used */}
          {usage && (
            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
              <h3 className="text-sm font-semibold text-gray-600 mb-2">Minutes Used</h3>
              <p className="text-3xl font-bold text-gray-900 mb-2">
                {Math.round(usage.minutes_used || 0)} / {usage.minutes_total || 0}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    usage.usage_percent >= 100
                      ? 'bg-red-500'
                      : usage.usage_percent >= 80
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(usage.usage_percent || 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">
                {usage.minutes_remaining || 0} minutes remaining
              </p>
            </div>
          )}

          {/* AI Handled Calls */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">AI Handled Calls</h3>
            <p className="text-3xl font-bold text-gray-900 mb-1">{aiHandledCalls}</p>
            <p className="text-xs text-gray-500">Calls handled completely by AI</p>
          </div>

          {/* Recent Calls */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Recent Calls</h3>
            <p className="text-3xl font-bold text-gray-900 mb-1">{calls.length}</p>
            <Link href="/dashboard/calls" className="text-xs text-blue-600 hover:underline">
              View all →
            </Link>
          </div>
        </div>

        {/* Recent Calls and Messages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Recent Calls */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Recent Calls</h3>
              <Link href="/dashboard/calls" className="text-sm text-blue-600 hover:underline">
                View all →
              </Link>
            </div>
            {calls.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No calls yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {calls.slice(0, 5).map((call) => (
                  <div key={call.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {call.caller_number || 'Unknown'}
                        </span>
                        {call.message_taken && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                            Message
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatDate(call.started_at)}</span>
                        <span>•</span>
                        <span>{formatDuration(call.duration_seconds)}</span>
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/calls/${call.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Messages */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Recent Messages</h3>
              <Link href="/dashboard/messages" className="text-sm text-blue-600 hover:underline">
                View all →
              </Link>
            </div>
            {messages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No messages yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.slice(0, 5).map((message) => (
                  <div
                    key={message.id}
                    className={`p-3 rounded-lg hover:bg-gray-50 transition ${
                      !message.is_read ? 'bg-blue-50 border-l-4 border-blue-500' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {message.caller_name || 'Unknown Caller'}
                      </span>
                      {!message.is_read && (
                        <span className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{formatDate(message.created_at)}</p>
                    <p className="text-sm text-gray-700 line-clamp-2">{message.message_text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            href="/dashboard/settings"
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition transform hover:-translate-y-1"
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Settings</h3>
            <p className="text-gray-600 text-sm">Manage your account and preferences</p>
          </Link>

          <Link
            href="/dashboard/faqs"
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition transform hover:-translate-y-1"
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-900">FAQs</h3>
            <p className="text-gray-600 text-sm">Add and edit frequently asked questions</p>
          </Link>

          <Link
            href="/dashboard/calls"
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition transform hover:-translate-y-1"
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Call History</h3>
            <p className="text-gray-600 text-sm">View and manage your call sessions</p>
          </Link>

          <Link
            href="/dashboard/messages"
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition transform hover:-translate-y-1"
          >
            <h3 className="text-lg font-semibold mb-2 text-gray-900">Messages</h3>
            <p className="text-gray-600 text-sm">View messages left by callers</p>
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
