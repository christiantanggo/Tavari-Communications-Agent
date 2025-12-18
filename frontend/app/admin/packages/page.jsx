'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';
import Link from 'next/link';

function PackagesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [formData, setFormData] = useState({
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
  });

  useEffect(() => {
    loadPackages();
  }, []);

  const getAdminToken = () => {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
  };

  const loadPackages = async () => {
    try {
      setLoading(true);
      const token = getAdminToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      const response = await fetch(`${API_URL}/api/admin/packages?includeInactive=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to load packages');
      const data = await response.json();
      setPackages(data.packages || []);
    } catch (error) {
      console.error('Failed to load packages:', error);
      alert('Failed to load packages');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = getAdminToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      const url = editingPackage
        ? `${API_URL}/api/admin/packages/${editingPackage.id}`
        : `${API_URL}/api/admin/packages`;
      const method = editingPackage ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          monthly_price: parseFloat(formData.monthly_price),
          minutes_included: parseInt(formData.minutes_included) || 0,
          overage_price_per_minute: parseFloat(formData.overage_price_per_minute) || 0,
          sms_included: parseInt(formData.sms_included) || 0,
          sms_overage_price: parseFloat(formData.sms_overage_price) || 0,
          emails_included: parseInt(formData.emails_included) || 0,
          emails_overage_price: parseFloat(formData.emails_overage_price) || 0,
          max_faqs: parseInt(formData.max_faqs) || 5,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save package');
      }

      alert(editingPackage ? 'Package updated successfully!' : 'Package created successfully!');
      setShowForm(false);
      setEditingPackage(null);
      resetForm();
      await loadPackages();
    } catch (error) {
      console.error('Failed to save package:', error);
      alert(error.message || 'Failed to save package');
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
    });
    setShowForm(true);
  };

  const handleDelete = async (pkg) => {
    if (!confirm(`Are you sure you want to delete "${pkg.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const token = getAdminToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      const response = await fetch(`${API_URL}/api/admin/packages/${pkg.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete package');
      }

      alert('Package deleted successfully!');
      await loadPackages();
    } catch (error) {
      console.error('Failed to delete package:', error);
      alert(error.message || 'Failed to delete package');
    }
  };

  const resetForm = () => {
    setFormData({
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
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingPackage(null);
    resetForm();
  };

  if (loading) {
    return (
      <AdminGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading packages...</div>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Package Management</h1>
            <div className="flex gap-4">
              <Link href="/admin/dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
              <Link href="/admin/accounts" className="text-gray-700 hover:text-blue-600">
                Accounts
              </Link>
              <button
                onClick={() => {
                  document.cookie = 'admin_token=; path=/; max-age=0';
                  router.push('/admin/login');
                }}
                className="text-gray-700 hover:text-blue-600"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Pricing Packages</h2>
            <button
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Minutes Included *</label>
                    <input
                      type="number"
                      value={formData.minutes_included}
                      onChange={(e) => setFormData({ ...formData, minutes_included: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">SMS Included</label>
                    <input
                      type="number"
                      value={formData.sms_included}
                      onChange={(e) => setFormData({ ...formData, sms_included: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">SMS Overage Price ($)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={formData.sms_overage_price}
                      onChange={(e) => setFormData({ ...formData, sms_overage_price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Emails Included</label>
                    <input
                      type="number"
                      value={formData.emails_included}
                      onChange={(e) => setFormData({ ...formData, emails_included: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Emails Overage Price ($)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={formData.emails_overage_price}
                      onChange={(e) => setFormData({ ...formData, emails_overage_price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Max FAQs</label>
                    <input
                      type="number"
                      value={formData.max_faqs}
                      onChange={(e) => setFormData({ ...formData, max_faqs: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Stripe Product ID</label>
                    <input
                      type="text"
                      value={formData.stripe_product_id}
                      onChange={(e) => setFormData({ ...formData, stripe_product_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Stripe Price ID</label>
                    <input
                      type="text"
                      value={formData.stripe_price_id}
                      onChange={(e) => setFormData({ ...formData, stripe_price_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Minutes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SMS</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emails</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Businesses</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {packages.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                        No packages found. Create your first package above.
                      </td>
                    </tr>
                  ) : (
                    packages.map((pkg) => (
                      <tr key={pkg.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{pkg.name}</div>
                          {pkg.description && (
                            <div className="text-xs text-gray-500">{pkg.description}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${parseFloat(pkg.monthly_price).toFixed(2)}/mo
                        </td>
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link
                            href={`/admin/packages/${pkg.id}`}
                            className={`text-sm font-medium ${
                              pkg.business_count > 0
                                ? 'text-blue-600 hover:text-blue-800'
                                : 'text-gray-500'
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
                              onClick={() => handleEdit(pkg)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                            <Link
                              href={`/admin/packages/${pkg.id}`}
                              className="text-green-600 hover:text-green-800"
                            >
                              View
                            </Link>
                            {pkg.business_count === 0 && (
                              <button
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
    </AdminGuard>
  );
}

export default PackagesPage;

