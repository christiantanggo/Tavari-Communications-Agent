'use client';

import { Suspense } from 'react';
import { PackagesAdminPanelInner } from '@/components/admin/PackagesAdminPanel';

export default function PackagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-lg text-gray-700">Loading packages…</div>
        </div>
      }
    >
      <PackagesAdminPanelInner embedded={false} moduleKey="phone-agent" />
    </Suspense>
  );
}
