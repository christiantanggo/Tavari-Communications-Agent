'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const token = getAdminToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStats({
        total_accounts: 0,
        active_accounts: 0,
        inactive_accounts: 0,
        by_tier: { starter: 0, core: 0, pro: 0 },
      });
    } finally {
      setLoading(false);
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

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Admin Dashboard</h1>
            <div className="flex gap-4">
              <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
                Accounts
              </Link>
              <Link href="/admin/packages" className="text-gray-700 hover:text-blue-600">
                Packages
              </Link>
              <Link href="/admin/activity" className="text-gray-700 hover:text-blue-600">
                Activity
              </Link>
              <Link href="/admin/support" className="text-gray-700 hover:text-blue-600">
                Support Tickets
              </Link>
              <Link href="/admin/phone-numbers" className="text-gray-700 hover:text-blue-600">
                Phone Numbers
              </Link>
              <Link href="/admin/test-wizard" className="text-gray-700 hover:text-blue-600">
                Test Wizard
              </Link>
              <button
                onClick={handleLogout}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Total Accounts</h3>
              <p className="text-3xl font-bold text-gray-900">{stats?.total_accounts || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Active Accounts</h3>
              <p className="text-3xl font-bold text-green-600">{stats?.active_accounts || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Inactive Accounts</h3>
              <p className="text-3xl font-bold text-gray-600">{stats?.inactive_accounts || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Pro Plans</h3>
              <p className="text-3xl font-bold text-blue-600">{stats?.by_tier?.pro || 0}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Plan Distribution</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.by_tier?.starter || 0}</p>
                <p className="text-sm text-gray-600">Starter</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.by_tier?.core || 0}</p>
                <p className="text-sm text-gray-600">Core</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <p className="text-2xl font-bold text-gray-900">{stats?.by_tier?.pro || 0}</p>
                <p className="text-sm text-gray-600">Pro</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <Link
              href="/admin/accounts"
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Manage Accounts
            </Link>
            <Link
              href="/admin/packages"
              className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium"
            >
              Manage Packages
            </Link>
            <Link
              href="/admin/activity"
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
            >
              View Activity Logs
            </Link>
            <Link
              href="/admin/support"
              className="px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 font-medium"
            >
              Support Tickets
            </Link>
            <Link
              href="/admin/test-vapi"
              className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
            >
              Test VAPI Connection
            </Link>
            <Link
              href="/admin/phone-numbers"
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
            >
              Manage SMS Phone Numbers
            </Link>
          </div>
        </main>
      </div>
    </AdminGuard>
  );

  function handleLogout() {
    document.cookie = 'admin_token=; path=/; max-age=0';
    window.location.href = '/admin/login';
  }

  function getAdminToken() {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  }
}

export default AdminDashboardPage;

