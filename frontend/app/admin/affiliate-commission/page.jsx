'use client';

import AffiliateCommissionSettingsPanel from '@/components/admin/AffiliateCommissionSettingsPanel';

export default function AdminAffiliateCommissionPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <AffiliateCommissionSettingsPanel variant="standalone" />
      </main>
    </div>
  );
}
