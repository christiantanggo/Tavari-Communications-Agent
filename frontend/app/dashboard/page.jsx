'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { authAPI, usageAPI } from '@/lib/api';
import { logout } from '@/lib/auth';
import Link from 'next/link';

function DashboardContent() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userRes, usageRes] = await Promise.all([
          authAPI.getMe(),
          usageAPI.getStatus(),
        ]);
        setUser(userRes.data);
        setUsage(usageRes.data);
        
        // Redirect to setup wizard if onboarding is not complete
        if (userRes.data?.business && !userRes.data.business.onboarding_complete) {
          router.push('/dashboard/setup');
          return;
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [router]);

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
          <h1 className="text-xl font-bold text-blue-600">Tavari AI Dashboard</h1>
          <div className="space-x-4">
            <Link href="/dashboard/setup" className="text-gray-700 hover:text-blue-600">
              Setup
            </Link>
            <button onClick={logout} className="text-gray-700 hover:text-blue-600">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back!</h2>
          <p className="text-gray-600">
            {user?.business?.name || 'Business'} • {user?.user?.email}
          </p>
        </div>

        {usage && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Usage This Month</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Minutes Used</span>
                <span className="font-semibold">
                  {usage.usage?.toFixed(1) || 0} / {usage.limit || 1000}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    usage.percentage >= 100
                      ? 'bg-red-500'
                      : usage.warning
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(usage.percentage || 0, 100)}%` }}
                />
              </div>
              {usage.warning && (
                <p className="text-sm text-yellow-600">You're at 80% of your usage limit</p>
              )}
              {usage.percentage >= 100 && (
                <p className="text-sm text-red-600">Usage limit reached</p>
              )}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <Link
            href="/dashboard/setup"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="text-lg font-semibold mb-2">Setup Wizard</h3>
            <p className="text-gray-600">
              {user?.business?.onboarding_complete
                ? 'Update your AI agent configuration'
                : 'Complete your setup to start receiving calls'}
            </p>
          </Link>

          <Link
            href="/dashboard/calls"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="text-lg font-semibold mb-2">Call History</h3>
            <p className="text-gray-600">View and manage your call sessions</p>
          </Link>

          <Link
            href="/dashboard/messages"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="text-lg font-semibold mb-2">Messages</h3>
            <p className="text-gray-600">View messages left by callers</p>
          </Link>

          <Link
            href="/dashboard/settings"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="text-lg font-semibold mb-2">Settings</h3>
            <p className="text-gray-600">Manage your account and preferences</p>
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

