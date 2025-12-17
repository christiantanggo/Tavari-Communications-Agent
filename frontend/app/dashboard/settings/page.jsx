'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { authAPI, billingAPI, businessAPI } from '@/lib/api';
import { logout, getToken } from '@/lib/auth';
import Link from 'next/link';

function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [settings, setSettings] = useState({
    ai_enabled: true,
    call_forward_rings: 4,
    after_hours_behavior: 'take_message',
    allow_call_transfer: true,
    email_ai_answered: true,
    email_missed_calls: false,
    sms_enabled: false,
    sms_notification_number: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userRes, billingRes] = await Promise.all([
        authAPI.getMe(),
        billingAPI.getStatus().catch(() => ({ data: null })),
      ]);
      setUser(userRes.data);
      setBilling(billingRes.data);
      
      if (userRes.data?.business) {
        setSettings({
          ai_enabled: userRes.data.business.ai_enabled ?? true,
          call_forward_rings: userRes.data.business.call_forward_rings || 4,
          after_hours_behavior: userRes.data.business.after_hours_behavior || 'take_message',
          allow_call_transfer: userRes.data.business.allow_call_transfer ?? true,
          email_ai_answered: userRes.data.business.email_ai_answered ?? true,
          email_missed_calls: userRes.data.business.email_missed_calls ?? false,
          sms_enabled: userRes.data.business.sms_enabled ?? false,
          sms_notification_number: userRes.data.business.sms_notification_number || '',
        });
      }
    } catch (error) {
      console.error('Failed to load settings data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update business settings via API
      const response = await businessAPI.updateSettings(settings);
      
      if (response.data?.success) {
        alert('Settings saved successfully!');
        await loadData();
        // Navigate to dashboard with refresh parameter to force reload
        router.push('/dashboard?refresh=' + Date.now());
      } else {
        alert('Failed to save settings');
      }
    } catch (error) {
      console.error('Save error:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save settings';
      const errorDetails = error.response?.data?.details;
      console.error('Error message:', errorMessage);
      if (errorDetails) {
        console.error('Error details:', errorDetails);
      }
      alert(`Failed to save settings: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const copyPhoneNumber = () => {
    const phoneNumber = user?.business?.vapi_phone_number;
    if (phoneNumber) {
      navigator.clipboard.writeText(phoneNumber);
      alert('Phone number copied to clipboard!');
    }
  };

  const handleRetryActivation = async () => {
    if (!confirm('This will attempt to provision a phone number for your account. Continue?')) {
      return;
    }

    setActivating(true);
    try {
      const response = await businessAPI.retryActivation();
      
      if (response.data?.success) {
        alert(`Phone number provisioned successfully! Your Tavari number is: ${response.data.phone_number}`);
        await loadData();
        // Navigate to dashboard to see updated checklist
        router.push('/dashboard?refresh=' + Date.now());
      } else {
        alert('Failed to provision phone number. Please try again or contact support.');
      }
    } catch (error) {
      console.error('Activation error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to provision phone number';
      alert(`Failed to provision phone number: ${errorMessage}`);
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold text-blue-600">Settings</h1>
            <div className="space-x-4">
              <Link href="/dashboard" className="text-gray-700 hover:text-blue-600">
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Business Information */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Business Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Business Name</label>
                <p className="text-gray-900">{user?.business?.name}</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Public Phone Number</label>
                <p className="text-gray-900">{user?.business?.public_phone_number || 'Not set'}</p>
              </div>
              {user?.business?.vapi_phone_number ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Your Tavari Number</label>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-blue-600">{user.business.vapi_phone_number}</span>
                    <button
                      onClick={copyPhoneNumber}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Forward calls from your public number to this number
                  </p>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number Not Provisioned</label>
                    <p className="text-sm text-gray-600 mb-3">
                      Your phone number was not provisioned during signup. Click the button below to provision a phone number now.
                    </p>
                    <button
                      onClick={handleRetryActivation}
                      disabled={activating}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {activating ? 'Provisioning...' : 'Provision Phone Number'}
                    </button>
                  </div>
                )}
                
                {/* Link Assistant Button - Show if phone number exists but might not be linked */}
                {user?.business?.vapi_phone_number && user?.business?.vapi_assistant_id && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Troubleshooting</label>
                    <p className="text-sm text-gray-600 mb-3">
                      If calls aren't being answered, the assistant might not be linked to the phone number. Click below to verify and link them.
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          const response = await businessAPI.linkAssistant();
                          if (response.data?.success) {
                            alert('Assistant successfully linked to phone number!');
                          }
                        } catch (error) {
                          alert(`Failed to link: ${error.response?.data?.error || error.message}`);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                    >
                      Link Assistant to Phone Number
                    </button>
                  </div>
                )}
            </div>
          </div>

          {/* AI Settings */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">AI Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    AI Phone Agent Enabled
                  </label>
                  <p className="text-xs text-gray-500">
                    When enabled, AI answers calls after X rings. When disabled, calls are immediately forwarded back to your restaurant.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.ai_enabled}
                    onChange={(e) => setSettings({ ...settings, ai_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {settings.ai_enabled && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Answer after X rings
                    </label>
                    <select
                      value={settings.call_forward_rings}
                      onChange={(e) => setSettings({ ...settings, call_forward_rings: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    >
                      <option value={2} className="text-gray-900">2 rings</option>
                      <option value={3} className="text-gray-900">3 rings</option>
                      <option value={4} className="text-gray-900">4 rings</option>
                      <option value={5} className="text-gray-900">5 rings</option>
                      <option value={6} className="text-gray-900">6 rings</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      After-hours behavior
                    </label>
                    <select
                      value={settings.after_hours_behavior}
                      onChange={(e) => setSettings({ ...settings, after_hours_behavior: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    >
                      <option value="take_message" className="text-gray-900">Take message (after answering FAQs)</option>
                      <option value="state_hours" className="text-gray-900">State hours only (after answering FAQs)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Note: FAQs are always answered, even after hours. This setting only controls whether you offer to take a message after answering their questions.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Call Handling */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Call Handling</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Allow Tavari to try connecting the caller to the restaurant
                  </label>
                  <p className="text-xs text-gray-500">
                    If enabled, Tavari may offer to transfer callers back to your restaurant when staff might be available. The caller must approve the transfer.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.allow_call_transfer}
                    onChange={(e) => setSettings({ ...settings, allow_call_transfer: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Notifications</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Email when Tavari answers the phone
                  </label>
                  <p className="text-xs text-gray-500">Get an email summary every time Tavari handles a call</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.email_ai_answered}
                    onChange={(e) => setSettings({ ...settings, email_ai_answered: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Calls your team couldn't answer during busy times
                  </label>
                  <p className="text-xs text-gray-500">Get email summaries for calls that went unanswered during your business hours</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.email_missed_calls}
                    onChange={(e) => setSettings({ ...settings, email_missed_calls: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      SMS for urgent callbacks
                    </label>
                    <p className="text-xs text-gray-500">Receive SMS alerts when callers request urgent callbacks (premium feature)</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.sms_enabled}
                      onChange={(e) => setSettings({ ...settings, sms_enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                {settings.sms_enabled && (
                  <div className="mt-2">
                    <input
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={settings.sms_notification_number}
                      onChange={(e) => setSettings({ ...settings, sms_notification_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">SMS messages are charged per message</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default SettingsPage;
