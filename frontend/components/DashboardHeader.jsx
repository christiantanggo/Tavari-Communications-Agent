'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logout } from '@/lib/auth';
import { agentsAPI } from '@/lib/api';

export default function DashboardHeader() {
  const router = useRouter();
  const [rebuilding, setRebuilding] = useState(false);

  const handleRebuildAgent = async () => {
    if (!confirm('This will rebuild your AI agent with the latest settings. Continue?')) {
      return;
    }

    setRebuilding(true);
    try {
      const response = await agentsAPI.rebuild();
      if (response.data?.success) {
        alert('AI agent rebuilt successfully! The agent now has the latest information.');
      } else {
        alert('Failed to rebuild agent. Please try again.');
      }
    } catch (error) {
      console.error('Rebuild agent error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to rebuild agent';
      alert(`Failed to rebuild agent: ${errorMessage}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">Tavari Dashboard</h1>
        <div className="flex items-center space-x-4">
          <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
            Dashboard
          </Link>
          <button
            onClick={handleRebuildAgent}
            disabled={rebuilding}
            className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:bg-yellow-300 disabled:cursor-not-allowed font-medium"
            title="Rebuild AI agent with latest settings"
          >
            {rebuilding ? 'Rebuilding...' : '🔄 Rebuild Agent'}
          </button>
          <Link href="/dashboard/settings" className="text-gray-700 hover:text-blue-600">
            Settings
          </Link>
          <button onClick={logout} className="text-gray-700 hover:text-blue-600">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

