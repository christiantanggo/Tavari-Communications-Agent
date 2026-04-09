'use client';

import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';

function SmsAdvertisingPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <p className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              Coming Soon
            </p>
            <h1 className="mt-4 text-2xl font-semibold text-gray-900">SMS Advertising</h1>
            <p className="mt-3 text-sm text-gray-600">
              The SMS advertising workspace is under construction. Tavari staff can unlock this feature for internal testing, but it is not ready for business use yet.
            </p>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

export default SmsAdvertisingPage;
