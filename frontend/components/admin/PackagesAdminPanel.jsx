'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { adminPackagesAPI } from '@/lib/api';

const VALID_PACKAGE_MODULE_KEYS = ['phone-agent', 'reviews', 'delivery-dispatch'];

function normalizePackageModuleKey(raw) {
  const s = String(raw || '').trim();
  return VALID_PACKAGE_MODULE_KEYS.includes(s) ? s : 'phone-agent';
}

function buildEmptyPackageForm(moduleKey) {
  const mk = normalizePackageModuleKey(moduleKey);
  return {
    name: '',
    description: '',
    monthly_price: '',
    minutes_included: '',
    overage_price_per_minute: '',
    sms_included: '',
    sms_overage_price: '',
    emails_included: '',
    emails_overage_price: '',
    max_faqs: 5,
    stripe_product_id: '',
    stripe_price_id: '',
    is_active: true,
    is_public: true,
    sale_name: '',
    sale_start_date: '',
    sale_end_date: '',
    sale_max_quantity: '',
    sale_sold_count: 0,
    sale_price: '',
    sale_duration_months: '',
    module_key: mk,
    prompts_included: 0,
  };
}

const MODULE_PACKAGE_TABS = [
  { key: 'phone-agent', label: 'AI Phone Agent' },
  { key: 'reviews', label: 'Review Reply' },
  { key: 'delivery-dispatch', label: 'Delivery Dispatch' },
];

/**
 * @param {{ embedded?: boolean; moduleKey?: string }} props
 * - embedded: when true, used inside /admin/pricing (no URL module_key; parent passes moduleKey). Hides duplicate module tabs.
 * - moduleKey: required when embedded — product line for packages list.
 */
export function PackagesAdminPanelInner({ embedded = false, moduleKey: moduleKeyProp = 'phone-agent' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeModuleKey = embedded
    ? normalizePackageModuleKey(moduleKeyProp)
    : normalizePackageModuleKey(searchParams.get('module_key'));

  const { success, error: showError } = useToast();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [formData, setFormData] = useState(() => buildEmptyPackageForm('phone-agent'));
  const packagesFetchSeq = useRef(0);

  const loadPackages = useCallback(async (moduleKeyToUse) => {
    const key = normalizePackageModuleKey(moduleKeyToUse);
    const seq = ++packagesFetchSeq.current;
    try {
      setLoading(true);
      const response = await adminPackagesAPI.getPackages(true, key);
      if (seq !== packagesFetchSeq.current) return;
      setPackages(response.data.packages || []);
    } catch (error) {
      if (seq !== packagesFetchSeq.current) return;
      console.error('Failed to load packages:', error);
      showError('Failed to load packages');
    } finally {
      if (seq === packagesFetchSeq.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setShowForm(false);
    setEditingPackage(null);
    setFormData(buildEmptyPackageForm(activeModuleKey));
    loadPackages(activeModuleKey);
  }, [activeModuleKey, loadPackages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const packageData = {
        ...formData,
        monthly_price: parseFloat(formData.monthly_price),
        minutes_included: parseInt(formData.minutes_included) || 0,
        overage_price_per_minute: parseFloat(formData.overage_price_per_minute) || 0,
        sms_included: parseInt(formData.sms_included) || 0,
        sms_overage_price: parseFloat(formData.sms_overage_price) || 0,
        emails_included: parseInt(formData.emails_included) || 0,
        emails_overage_price: parseFloat(formData.emails_overage_price) || 0,
        max_faqs: parseInt(formData.max_faqs) || 5,
        module_key: activeModuleKey,
        prompts_included: parseInt(formData.prompts_included) || 0,
        sale_name: formData.sale_name || null,
        sale_start_date: formData.sale_start_date || null,
        sale_end_date: formData.sale_end_date || null,
        sale_max_quantity: formData.sale_max_quantity ? parseInt(formData.sale_max_quantity) : null,
        sale_sold_count: parseInt(formData.sale_sold_count) || 0,
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : null,
        sale_duration_months: formData.sale_duration_months ? parseInt(formData.sale_duration_months) : null,
      };

      if (editingPackage) {
        await adminPackagesAPI.updatePackage(editingPackage.id, packageData);
      } else {
        await adminPackagesAPI.createPackage(packageData);
      }

      success(editingPackage ? 'Package updated successfully!' : 'Package created successfully!');
      setShowForm(false);
      setEditingPackage(null);
      resetForm();
      await loadPackages(activeModuleKey);
    } catch (error) {
      console.error('Failed to save package:', error);
      showError(error.response?.data?.error || error.message || 'Failed to save package');
    }
  };

  const handleEdit = (pkg) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name || '',
      description: pkg.description || '',
      monthly_price: pkg.monthly_price || '',
      minutes_included: pkg.minutes_included || '',
      overage_price_per_minute: pkg.overage_price_per_minute || '',
      sms_included: pkg.sms_included || '',
      sms_overage_price: pkg.sms_overage_price || '',
      emails_included: pkg.emails_included || '',
      emails_overage_price: pkg.emails_overage_price || '',
      max_faqs: pkg.max_faqs || 5,
      stripe_product_id: pkg.stripe_product_id || '',
      stripe_price_id: pkg.stripe_price_id || '',
      is_active: pkg.is_active ?? true,
      is_public: pkg.is_public ?? true,
      sale_name: pkg.sale_name || '',
      sale_start_date: pkg.sale_start_date || '',
      sale_end_date: pkg.sale_end_date || '',
      sale_max_quantity: pkg.sale_max_quantity || '',
      sale_sold_count: pkg.sale_sold_count || 0,
      sale_price: pkg.sale_price || '',
      sale_duration_months: pkg.sale_duration_months || '',
      module_key: pkg.module_key || activeModuleKey,
      prompts_included: pkg.prompts_included || 0,
    });
    setShowForm(true);
  };

  const handleDelete = async (pkg) => {
    if (!confirm(`Are you sure you want to delete "${pkg.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await adminPackagesAPI.deletePackage(pkg.id);
      success('Package deleted successfully!');
      await loadPackages(activeModuleKey);
    } catch (error) {
      console.error('Failed to delete package:', error);
      showError(error.response?.data?.error || error.message || 'Failed to delete package');
    }
  };

  const resetForm = () => {
    setFormData(buildEmptyPackageForm(activeModuleKey));
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingPackage(null);
    resetForm();
  };

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center ${embedded ? 'min-h-[240px]' : 'min-h-screen bg-gray-50'}`}
      >
        <div className="text-lg text-gray-700">Loading packages…</div>
      </div>
    );
  }

  const isReviewsModule = activeModuleKey === 'reviews';
  const shellClass = embedded ? '' : 'min-h-screen bg-gray-50';
  const mainClass = embedded ? 'max-w-7xl mx-auto px-4 py-4' : 'container mx-auto px-4 py-8 max-w-7xl';

  return (
    <div className={shellClass}>
      <main className={mainClass}>
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Pricing Packages</h2>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditingPackage(null);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            + Create Package
          </button>
        </div>

        {!embedded && (
          <div className="mb-6 flex flex-wrap gap-2">
            <p className="w-full text-sm text-gray-600 mb-1">
              Packages are scoped by product module. Stripe checkout and commissions use each package&apos;s{' '}
              <code className="text-xs bg-gray-200 px-1 rounded">module_key</code>.
            </p>
            {MODULE_PACKAGE_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  router.replace(`/admin/packages?module_key=${encodeURIComponent(key)}`, { scroll: false })
                }
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  activeModuleKey === key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {embedded && (
          <p className="mb-4 text-sm text-gray-600">
            Packages are scoped by product module. Stripe checkout and commissions use each package&apos;s{' '}
            <code className="text-xs bg-gray-200 px-1 rounded">module_key</code>. Switch module with the bar above.
          </p>
        )}

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900">
              {editingPackage ? 'Edit Package' : 'Create New Package'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Package Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Monthly Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.monthly_price}
                    onChange={(e) => setFormData({ ...formData, monthly_price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                {isReviewsModule ? (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Prompts Included *</label>
                    <input
                      type="number"
                      value={formData.prompts_included || 0}
                      onChange={(e) => setFormData({ ...formData, prompts_included: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      required
                      placeholder="e.g., 100, 500, 1000"
                    />
                    <p className="text-xs text-gray-500 mt-1">Number of review reply prompts included per month</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Minutes Included *</label>
                      <input
                        type="number"
                        value={formData.minutes_included}
                        onChange={(e) => setFormData({ ...formData, minutes_included: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Overage Price per Minute ($)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.overage_price_per_minute}
                        onChange={(e) => setFormData({ ...formData, overage_price_per_minute: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">SMS Included</label>
                      <input
                        type="number"
                        value={formData.sms_included}
                        onChange={(e) => setFormData({ ...formData, sms_included: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">SMS Overage Price ($)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.sms_overage_price}
                        onChange={(e) => setFormData({ ...formData, sms_overage_price: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Emails Included</label>
                      <input
                        type="number"
                        value={formData.emails_included}
                        onChange={(e) => setFormData({ ...formData, emails_included: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Emails Overage Price ($)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={formData.emails_overage_price}
                        onChange={(e) => setFormData({ ...formData, emails_overage_price: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Max FAQs</label>
                      <input
                        type="number"
                        value={formData.max_faqs}
                        onChange={(e) => setFormData({ ...formData, max_faqs: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Stripe Product ID</label>
                  <input
                    type="text"
                    value={formData.stripe_product_id}
                    onChange={(e) => setFormData({ ...formData, stripe_product_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Stripe Price ID</label>
                  <input
                    type="text"
                    value={formData.stripe_price_id}
                    onChange={(e) => setFormData({ ...formData, stripe_price_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  rows={3}
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_public}
                    onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Public (Available for new signups)</span>
                </label>
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Sale/Promotion Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Sale Name</label>
                    <input
                      type="text"
                      value={formData.sale_name}
                      onChange={(e) => setFormData({ ...formData, sale_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="e.g., Black Friday Sale"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave empty to disable sale</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date (Optional)</label>
                    <input
                      type="date"
                      value={formData.sale_start_date}
                      onChange={(e) => setFormData({ ...formData, sale_start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">Sale starts immediately if not set</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">End Date (Optional)</label>
                    <input
                      type="date"
                      value={formData.sale_end_date}
                      onChange={(e) => setFormData({ ...formData, sale_end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Leave empty for quantity-only sales (runs until max quantity reached)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Max Quantity (Optional)</label>
                    <input
                      type="number"
                      value={formData.sale_max_quantity}
                      onChange={(e) => setFormData({ ...formData, sale_max_quantity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="Leave empty for unlimited"
                    />
                    <p className="text-xs text-gray-500 mt-1">Maximum number of plans to sell during this sale</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Sale Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.sale_price}
                      onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="Leave empty to use regular price"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Discounted price during sale (if empty, uses regular monthly price)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Duration (Months)</label>
                    <input
                      type="number"
                      value={formData.sale_duration_months}
                      onChange={(e) => setFormData({ ...formData, sale_duration_months: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="Leave empty for indefinite"
                    />
                    <p className="text-xs text-gray-500 mt-1">How long customers keep the sale price (empty = forever)</p>
                  </div>
                  {editingPackage && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Sold Count</label>
                      <input
                        type="number"
                        value={formData.sale_sold_count}
                        onChange={(e) => setFormData({ ...formData, sale_sold_count: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        readOnly
                      />
                      <p className="text-xs text-gray-500 mt-1">Automatically tracked - shows current count sold</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  {editingPackage ? 'Update Package' : 'Create Package'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                  {isReviewsModule ? (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prompts / mo</th>
                  ) : (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Minutes</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SMS</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emails</th>
                    </>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Businesses</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {packages.length === 0 ? (
                  <tr>
                    <td colSpan={isReviewsModule ? 6 : 8} className="px-6 py-8 text-center text-gray-500">
                      No packages found. Create your first package above.
                    </td>
                  </tr>
                ) : (
                  packages.map((pkg) => (
                    <tr key={pkg.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{pkg.name}</div>
                        {pkg.description && <div className="text-xs text-gray-500">{pkg.description}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${parseFloat(pkg.monthly_price).toFixed(2)}/mo
                      </td>
                      {isReviewsModule ? (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {pkg.prompts_included ?? 0}
                        </td>
                      ) : (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {pkg.minutes_included} min
                            {pkg.overage_price_per_minute > 0 && (
                              <div className="text-xs text-gray-500">
                                ${parseFloat(pkg.overage_price_per_minute).toFixed(4)}/min overage
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {pkg.sms_included || 0}
                            {pkg.sms_overage_price > 0 && (
                              <div className="text-xs text-gray-500">
                                ${parseFloat(pkg.sms_overage_price).toFixed(4)} overage
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {pkg.emails_included || 0}
                            {pkg.emails_overage_price > 0 && (
                              <div className="text-xs text-gray-500">
                                ${parseFloat(pkg.emails_overage_price).toFixed(4)} overage
                              </div>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/admin/packages/${pkg.id}`}
                          className={`text-sm font-medium ${
                            pkg.business_count > 0 ? 'text-blue-600 hover:text-blue-800' : 'text-gray-500'
                          }`}
                        >
                          {pkg.business_count || 0} business{pkg.business_count !== 1 ? 'es' : ''}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {pkg.is_active ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                              Inactive
                            </span>
                          )}
                          {pkg.is_public ? (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                              Public
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                              Private
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(pkg)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <Link href={`/admin/packages/${pkg.id}`} className="text-green-600 hover:text-green-800">
                            View
                          </Link>
                          {pkg.business_count === 0 && (
                            <button
                              type="button"
                              onClick={() => handleDelete(pkg)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
