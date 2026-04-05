'use client';

import { useState, Suspense } from 'react';
import { SALES_ONBOARD_PRODUCT_CHOICES } from '@/lib/sales-onboard-modules';
import AdminDeliveryModulePricingPanel from '@/components/admin/AdminDeliveryModulePricingPanel';
import { PackagesAdminPanelInner } from '@/components/admin/PackagesAdminPanel';

/** Modules that use the shared Stripe pricing_packages CRUD (same as /admin/packages). */
const PACKAGE_EMBED_KEYS = ['phone-agent', 'reviews', 'delivery-dispatch'];

function PricingPage() {
  const [activeTab, setActiveTab] = useState('packages');
  const [packageModuleKey, setPackageModuleKey] = useState('phone-agent');

  const packagesIframeSrc = `/admin/packages?embed=1&module_key=${encodeURIComponent(packageModuleKey)}`;

  return (
    <div className="min-h-screen bg-gray-50">
        <main className="container mx-auto px-4 py-8">
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('packages')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'packages'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Packages
                </button>
                <button
                  onClick={() => setActiveTab('invoice-settings')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'invoice-settings'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Invoice Settings
                </button>
              </nav>
            </div>
            {activeTab === 'packages' && (
              <div className="border-b border-gray-100 bg-slate-50/80 px-2 py-2">
                <p className="px-4 pt-1 pb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Module</p>
                <nav className="flex flex-wrap gap-1 px-2 pb-2 overflow-x-auto">
                  {SALES_ONBOARD_PRODUCT_CHOICES.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPackageModuleKey(key)}
                      className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        packageModuleKey === key
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
              </div>
            )}
          </div>

          {/* Last-mile delivery: quote/margin only (no Stripe subscription package iframe). */}
          {activeTab === 'packages' && packageModuleKey === 'delivery-dispatch' && (
            <AdminDeliveryModulePricingPanel />
          )}
          {(activeTab === 'invoice-settings' ||
            (activeTab === 'packages' && packageModuleKey !== 'delivery-dispatch')) && (
            <div className="bg-white rounded-lg shadow" style={{ minHeight: '600px' }}>
              {activeTab === 'packages' && packageModuleKey !== 'delivery-dispatch' && (
                PACKAGE_EMBED_KEYS.includes(packageModuleKey) ? (
                  <Suspense
                    key={packageModuleKey}
                    fallback={
                      <div className="flex items-center justify-center p-12 text-gray-600">Loading packages…</div>
                    }
                  >
                    <PackagesAdminPanelInner embedded moduleKey={packageModuleKey} />
                  </Suspense>
                ) : (
                  <iframe
                    key={packageModuleKey}
                    src={packagesIframeSrc}
                    className="w-full border-0"
                    style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
                    title={`Packages — ${packageModuleKey}`}
                  />
                )
              )}
              {activeTab === 'invoice-settings' && (
                <iframe
                  src="/admin/invoice-settings?embed=1"
                  className="w-full border-0"
                  style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
                  title="Invoice Settings"
                />
              )}
            </div>
          )}
        </main>
    </div>
  );
}

export default PricingPage;
