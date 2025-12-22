'use client';

import NewSetupWizard from './new-wizard';

function SetupPage() {
  return <NewSetupWizard testMode={false} />;
}

export default SetupPage;

/* OLD SETUP WIZARD - REPLACED BY NEW 9-STEP WIZARD
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
import { agentsAPI, authAPI, telnyxPhoneNumbersAPI } from '@/lib/api';
import api from '@/lib/api';
import TelnyxPhoneNumberSelector from '@/components/TelnyxPhoneNumberSelector';
import TimeInput12Hour from '@/components/TimeInput12Hour';
import { useToast } from '@/components/ToastProvider';

function SetupPage() {
  const router = useRouter();
  const { success, error: showError, warning } = useToast();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState(null);
  const [business, setBusiness] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState(null);
  const [phoneNumberCountry, setPhoneNumberCountry] = useState('US');
  const [formData, setFormData] = useState({
    step1: { name: '', phone: '', address: '', website: '', timezone: 'America/New_York' },
    step2: { greeting_text: '', opening_greeting: '', ending_greeting: '' },
    step3: {
      business_hours: {
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { closed: true },
        sunday: { closed: true },
      },
    },
    step4: { faqs: [] },
    step5: {
      message_settings: {
        ask_name: true,
        ask_phone: true,
        ask_email: false,
        ask_reason: true,
      },
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Get user/business info
      const userRes = await authAPI.getMe();
      const isComplete = userRes.data.business?.onboarding_complete;
      setOnboardingComplete(isComplete);
      
      // Get all setup data
      const setupRes = await api.get('/setup/data');
      setBusiness(setupRes.data.business);
      setAgent(setupRes.data.agent);
      
      // Load form data
      if (setupRes.data.business) {
        setFormData(prev => ({
          ...prev,
          step1: {
            name: setupRes.data.business.name || '',
            phone: setupRes.data.business.phone || '',
            address: setupRes.data.business.address || '',
            website: setupRes.data.business.website || '',
            timezone: setupRes.data.business.timezone || 'America/New_York',
          },
        }));
      }
      
      if (setupRes.data.agent) {
        setFormData(prev => ({
          ...prev,
          step2: { 
            greeting_text: setupRes.data.agent.greeting_text || '',
            opening_greeting: setupRes.data.agent.opening_greeting || '',
            ending_greeting: setupRes.data.agent.ending_greeting || '',
          },
          step3: { 
            business_hours: setupRes.data.agent.business_hours || prev.step3.business_hours 
          },
          step4: { faqs: setupRes.data.agent.faqs || [] },
          step5: { 
            message_settings: setupRes.data.agent.message_settings || prev.step5.message_settings 
          },
        }));
      }
    } catch (error) {
      console.error('Failed to load setup data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (step, field, value) => {
    setFormData(prev => ({
      ...prev,
      [step]: { ...prev[step], [field]: value },
    }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Save all steps
      await api.post('/setup/step1', formData.step1);
      await api.post('/setup/step2', formData.step2);
      await api.post('/setup/step3', formData.step3);
      await api.post('/setup/step4', formData.step4);
      await api.post('/setup/step5', formData.step5);
      
          // Purchase phone number if selected and business has no number
          if (selectedPhoneNumber && !business?.telnyx_number) {
            try {
              console.log('Purchasing Telnyx phone number:', selectedPhoneNumber, 'for country:', phoneNumberCountry);
              const purchaseResult = await telnyxPhoneNumbersAPI.purchase(selectedPhoneNumber, phoneNumberCountry);
              console.log('Telnyx phone number purchase result:', purchaseResult);
              
              if (purchaseResult.data?.success) {
                console.log('Phone number purchased successfully:', purchaseResult.data.phone_number);
              }
            } catch (phoneError) {
              console.error('Phone number purchase error:', phoneError);
              console.error('Error response:', phoneError.response?.data);
              const errorMsg = phoneError.response?.data?.error || phoneError.message || 'Unknown error';
              warning('Settings saved but phone number purchase failed: ' + errorMsg + '. You can try again later.');
              // Don't block the rest of the save if phone purchase fails
            }
          }
      
      if (!onboardingComplete) {
        // Finalize if not already complete
        await api.post('/setup/finalize', {
          phoneNumber: selectedPhoneNumber,
          countryCode: phoneNumberCountry,
        });
        setOnboardingComplete(true);
        success('Setup saved and completed!');
      } else {
        success('Settings saved successfully!');
      }
      
      // Reload data to get updated phone number
      await loadData();
      
      // Clear selected phone number after successful purchase
      if (selectedPhoneNumber && !business?.telnyx_number && !business?.voximplant_number) {
        setSelectedPhoneNumber(null);
      }
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveStep = async (step) => {
    setSaving(true);
    try {
      await api.post(`/setup/step${step}`, formData[`step${step}`]);
      return true;
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const saved = await saveStep(currentStep);
    if (saved && currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    const skipWarning = '⚠️ Warning: Skipping this step may prevent your AI phone agent from functioning properly or providing correct information to your callers. The AI needs this information to answer questions accurately and handle calls effectively.\n\nAre you sure you want to skip this step?';
    
    if (confirm(skipWarning)) {
      if (currentStep < 5) {
        setCurrentStep(currentStep + 1);
      } else {
        handleFinalize();
      }
    }
  };

  const handleFinalize = async () => {
    setSaving(true);
    try {
      await saveStep(5);
      
          // Purchase phone number if selected
          if (selectedPhoneNumber) {
            try {
              await telnyxPhoneNumbersAPI.purchase(selectedPhoneNumber, phoneNumberCountry);
            } catch (phoneError) {
              console.error('Phone number purchase error:', phoneError);
              // Continue with setup even if phone purchase fails
              warning('Setup completed but phone number purchase failed. You can add a phone number later in settings.');
            }
          }
          
          const res = await api.post('/setup/finalize', {
            phoneNumber: selectedPhoneNumber,
            countryCode: phoneNumberCountry,
          });
          
          success('Setup complete! Your AI number is: ' + (res.data.telnyx_number || res.data.voximplant_number || 'Please add a phone number in settings'));
      setOnboardingComplete(true);
      await loadData();
    } catch (error) {
      showError(error.response?.data?.error || 'Failed to finalize setup');
    } finally {
      setSaving(false);
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

  // Show single-page settings view if onboarding is complete
  if (onboardingComplete) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white shadow-sm">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
              <h1 className="text-xl font-bold text-blue-600">AI Agent Settings</h1>
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-700 hover:text-blue-600"
              >
                Back to Dashboard
              </button>
            </div>
          </nav>

          <main className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Your AI Phone Number</h2>
              {business?.telnyx_number || business?.voximplant_number ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Your active AI phone number:</p>
                  <p className="text-2xl font-bold text-green-600">{business.telnyx_number || business.voximplant_number}</p>
                  <p className="text-sm text-green-600 mt-2">This number is active and receiving calls.</p>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600">No phone number assigned yet. Select one below to start receiving calls.</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6 space-y-8">
              {/* Business Information */}
              <section>
                <h3 className="text-xl font-bold mb-4 text-gray-900">Business Information</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Business Name</label>
                    <input
                      type="text"
                      value={formData.step1?.name || ''}
                      onChange={(e) => updateFormData('step1', 'name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                    <input
                      type="tel"
                      value={formData.step1?.phone || ''}
                      onChange={(e) => updateFormData('step1', 'phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                    <textarea
                      value={formData.step1?.address || ''}
                      onChange={(e) => updateFormData('step1', 'address', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={2}
                    />
                  </div>
                </div>
              </section>

              {/* Greeting */}
              <section>
                <h3 className="text-xl font-bold mb-4 text-gray-900">Greeting</h3>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Greeting Text</label>
                  <textarea
                    value={formData.step2?.greeting_text || ''}
                    onChange={(e) => updateFormData('step2', 'greeting_text', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={3}
                    placeholder="Hello! Thank you for calling [Business Name]. How can I help you today?"
                  />
                </div>
              </section>

              {/* Business Hours */}
              <section>
                <h3 className="text-xl font-bold mb-4 text-gray-900">Business Hours</h3>
                <div className="space-y-2">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
                    (day) => {
                      const dayHours = formData.step3?.business_hours?.[day] || { closed: true, open: '09:00', close: '17:00' };
                      return (
                        <div key={day} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                          <div className="w-24 capitalize font-medium text-gray-700">{day}</div>
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={!dayHours.closed}
                              onChange={(e) => {
                                const newHours = { ...formData.step3.business_hours };
                                newHours[day] = { ...newHours[day], closed: !e.target.checked };
                                updateFormData('step3', 'business_hours', newHours);
                              }}
                              className="w-4 h-4"
                            />
                            <span className="text-sm text-gray-700">Open</span>
                          </label>
                          {!dayHours.closed && (
                            <>
                              <TimeInput12Hour
                                value={dayHours.open || '09:00'}
                                onChange={(value) => {
                                  const newHours = { ...formData.step3.business_hours };
                                  newHours[day] = { ...newHours[day], open: value };
                                  updateFormData('step3', 'business_hours', newHours);
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                              />
                              <span className="text-gray-600">to</span>
                              <TimeInput12Hour
                                value={dayHours.close || '17:00'}
                                onChange={(value) => {
                                  const newHours = { ...formData.step3.business_hours };
                                  newHours[day] = { ...newHours[day], close: value };
                                  updateFormData('step3', 'business_hours', newHours);
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                              />
                            </>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </section>

              {/* FAQs */}
              <section>
                <h3 className="text-xl font-bold mb-4 text-gray-900">FAQs (Max 5)</h3>
                <div className="space-y-4">
                  {(formData.step4?.faqs || []).map((faq, index) => (
                    <div key={index} className="border border-gray-300 p-4 rounded-lg bg-gray-50">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Question {index + 1}</label>
                      <input
                        type="text"
                        value={faq?.question || ''}
                        onChange={(e) => {
                          const newFaqs = [...(formData.step4?.faqs || [])];
                          newFaqs[index] = { ...newFaqs[index], question: e.target.value };
                          updateFormData('step4', 'faqs', newFaqs);
                        }}
                        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Answer</label>
                      <textarea
                        value={faq?.answer || ''}
                        onChange={(e) => {
                          const newFaqs = [...(formData.step4?.faqs || [])];
                          newFaqs[index] = { ...newFaqs[index], answer: e.target.value };
                          updateFormData('step4', 'faqs', newFaqs);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        rows={2}
                      />
                      <button
                        onClick={() => {
                          const newFaqs = (formData.step4?.faqs || []).filter((_, i) => i !== index);
                          updateFormData('step4', 'faqs', newFaqs);
                        }}
                        className="mt-2 text-red-600 text-sm hover:text-red-700 font-medium"
                      >
                        Remove FAQ
                      </button>
                    </div>
                  ))}
                  {(formData.step4?.faqs || []).length < 5 && (
                    <button
                      onClick={() => {
                        const newFaqs = [...(formData.step4?.faqs || []), { question: '', answer: '' }];
                        updateFormData('step4', 'faqs', newFaqs);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                    >
                      + Add FAQ
                    </button>
                  )}
                </div>
              </section>

              {/* Message Settings */}
              <section>
                <h3 className="text-xl font-bold mb-4 text-gray-900">Message Settings</h3>
                <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step5?.message_settings?.ask_name ?? true}
                      onChange={(e) => {
                        updateFormData('step5', 'message_settings', {
                          ...(formData.step5?.message_settings || {}),
                          ask_name: e.target.checked,
                        });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="text-gray-700 font-medium">Ask for caller's name</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step5?.message_settings?.ask_phone ?? true}
                      onChange={(e) => {
                        updateFormData('step5', 'message_settings', {
                          ...(formData.step5?.message_settings || {}),
                          ask_phone: e.target.checked,
                        });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="text-gray-700 font-medium">Ask for phone number</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step5?.message_settings?.ask_email ?? false}
                      onChange={(e) => {
                        updateFormData('step5', 'message_settings', {
                          ...(formData.step5?.message_settings || {}),
                          ask_email: e.target.checked,
                        });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="text-gray-700 font-medium">Ask for email address</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step5?.message_settings?.ask_reason ?? true}
                      onChange={(e) => {
                        updateFormData('step5', 'message_settings', {
                          ...(formData.step5?.message_settings || {}),
                          ask_reason: e.target.checked,
                        });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="text-gray-700 font-medium">Ask for reason for calling</span>
                  </label>
                </div>
              </section>

              {/* Phone Number Selection - Only show if no number exists */}
              {!business?.telnyx_number && !business?.voximplant_number && (
                <section>
                  <h3 className="text-xl font-bold mb-4 text-gray-900">Phone Number</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Select a phone number for your AI agent. This number will receive calls and the webhook will be configured automatically.
                  </p>
                  <TelnyxPhoneNumberSelector
                    onSelect={(number) => setSelectedPhoneNumber(number)}
                    selectedNumber={selectedPhoneNumber}
                    countryCode={phoneNumberCountry}
                  />
                  {selectedPhoneNumber && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Selected:</strong> {selectedPhoneNumber}
                        <br />
                        Click "Save All Settings" below to purchase and assign this number. The webhook will be configured automatically.
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* Add Second Number Option - Show if they already have a number */}
              {(business?.telnyx_number || business?.voximplant_number) && (
                <section>
                  <h3 className="text-xl font-bold mb-4 text-gray-900">Need a Second Number?</h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-4">
                      You currently have <strong>{business.telnyx_number || business.voximplant_number}</strong> assigned. 
                      If you need an additional phone number, you can add one below.
                    </p>
                    <button
                      onClick={() => {
                        // Show phone selector for second number
                        setSelectedPhoneNumber(null);
                        // You could add a state to track if this is a second number
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                    >
                      Add Another Number
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Note: Multiple numbers feature coming soon. For now, contact support to add additional numbers.
                    </p>
                  </div>
                </section>
              )}

              {/* Save Button */}
              <div className="pt-4 border-t">
                <button
                  onClick={saveAll}
                  disabled={saving}
                  className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save All Settings'}
                </button>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  // Show wizard for initial setup
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />

        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div
                    key={step}
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step <= currentStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>

            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Business Information</h2>
                <p className="text-sm text-gray-600 mb-4">Enter your business details</p>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Business Name</label>
                  <input
                    type="text"
                    value={formData.step1?.name || ''}
                    onChange={(e) => updateFormData('step1', 'name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    placeholder="Enter your business name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={formData.step1?.phone || ''}
                    onChange={(e) => updateFormData('step1', 'phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    placeholder="Enter your business phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                  <textarea
                    value={formData.step1?.address || ''}
                    onChange={(e) => updateFormData('step1', 'address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={3}
                    placeholder="Enter your business address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Website</label>
                  <input
                    type="url"
                    value={formData.step1?.website || ''}
                    onChange={(e) => updateFormData('step1', 'website', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Timezone</label>
                  <select
                    value={formData.step1?.timezone || 'America/New_York'}
                    onChange={(e) => updateFormData('step1', 'timezone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="America/Phoenix">Arizona Time</option>
                    <option value="America/Anchorage">Alaska Time</option>
                    <option value="Pacific/Honolulu">Hawaii Time</option>
                  </select>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Greetings</h2>
                <p className="text-sm text-gray-600 mb-4">Customize how your AI greets and ends calls</p>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Opening Greeting</label>
                  <textarea
                    value={formData.step2?.opening_greeting || ''}
                    onChange={(e) => updateFormData('step2', 'opening_greeting', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={3}
                    placeholder="Hello! Thank you for calling [Business Name]. How can I help you today?"
                  />
                  <p className="mt-1 text-xs text-gray-500">This is what the AI says when answering the call</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Ending Greeting</label>
                  <textarea
                    value={formData.step2?.ending_greeting || ''}
                    onChange={(e) => updateFormData('step2', 'ending_greeting', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={3}
                    placeholder="Thank you for calling [Business Name]. Have a great day!"
                  />
                  <p className="mt-1 text-xs text-gray-500">This is what the AI says when ending the call</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Legacy Greeting Text (Optional)</label>
                  <textarea
                    value={formData.step2?.greeting_text || ''}
                    onChange={(e) => updateFormData('step2', 'greeting_text', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={2}
                    placeholder="Legacy field - use Opening/Ending greetings above instead"
                  />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Business Hours</h2>
                <p className="text-sm text-gray-600 mb-4">Set your business hours for each day of the week</p>
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
                  (day) => {
                    const dayHours = formData.step3?.business_hours?.[day] || { closed: true, open: '09:00', close: '17:00' };
                    return (
                      <div key={day} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                        <div className="w-24 capitalize font-medium text-gray-700">{day}</div>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={!dayHours.closed}
                            onChange={(e) => {
                              const newHours = { ...formData.step3.business_hours };
                              newHours[day] = { ...newHours[day], closed: !e.target.checked };
                              updateFormData('step3', 'business_hours', newHours);
                            }}
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-gray-700">Open</span>
                        </label>
                        {!dayHours.closed && (
                          <>
                            <TimeInput12Hour
                              value={dayHours.open || '09:00'}
                              onChange={(value) => {
                                const newHours = { ...formData.step3.business_hours };
                                newHours[day] = { ...newHours[day], open: value };
                                updateFormData('step3', 'business_hours', newHours);
                              }}
                              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                            />
                            <span className="text-gray-600">to</span>
                            <TimeInput12Hour
                              value={dayHours.close || '17:00'}
                              onChange={(value) => {
                                const newHours = { ...formData.step3.business_hours };
                                newHours[day] = { ...newHours[day], close: value };
                                updateFormData('step3', 'business_hours', newHours);
                              }}
                              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                            />
                          </>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">FAQs (Max 5)</h2>
                <p className="text-sm text-gray-600 mb-4">Add up to 5 frequently asked questions that your AI can answer</p>
                {(formData.step4?.faqs || []).map((faq, index) => (
                  <div key={index} className="border border-gray-300 p-4 rounded-lg bg-gray-50">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Question {index + 1}</label>
                    <input
                      type="text"
                      placeholder="Enter the question"
                      value={faq?.question || ''}
                      onChange={(e) => {
                        const newFaqs = [...(formData.step4?.faqs || [])];
                        newFaqs[index] = { ...newFaqs[index], question: e.target.value };
                        updateFormData('step4', 'faqs', newFaqs);
                      }}
                      className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Answer</label>
                    <textarea
                      placeholder="Enter the answer"
                      value={faq?.answer || ''}
                      onChange={(e) => {
                        const newFaqs = [...(formData.step4?.faqs || [])];
                        newFaqs[index] = { ...newFaqs[index], answer: e.target.value };
                        updateFormData('step4', 'faqs', newFaqs);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={2}
                    />
                    <button
                      onClick={() => {
                        const newFaqs = (formData.step4?.faqs || []).filter((_, i) => i !== index);
                        updateFormData('step4', 'faqs', newFaqs);
                      }}
                      className="mt-2 text-red-600 text-sm hover:text-red-700 font-medium"
                    >
                      Remove FAQ
                    </button>
                  </div>
                ))}
                {(formData.step4?.faqs || []).length < 5 && (
                  <button
                    onClick={() => {
                      const newFaqs = [...(formData.step4?.faqs || []), { question: '', answer: '' }];
                      updateFormData('step4', 'faqs', newFaqs);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    + Add FAQ
                  </button>
                )}
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Message Settings</h2>
                <p className="text-sm text-gray-600 mb-4">Choose what information to collect when taking messages from callers</p>
                <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step5?.message_settings?.ask_name ?? true}
                      onChange={(e) => {
                        updateFormData('step5', 'message_settings', {
                          ...(formData.step5?.message_settings || {}),
                          ask_name: e.target.checked,
                        });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="text-gray-700 font-medium">Ask for caller's name</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step5?.message_settings?.ask_phone ?? true}
                      onChange={(e) => {
                        updateFormData('step5', 'message_settings', {
                          ...(formData.step5?.message_settings || {}),
                          ask_phone: e.target.checked,
                        });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="text-gray-700 font-medium">Ask for phone number</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step5?.message_settings?.ask_email ?? false}
                      onChange={(e) => {
                        updateFormData('step5', 'message_settings', {
                          ...(formData.step5?.message_settings || {}),
                          ask_email: e.target.checked,
                        });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="text-gray-700 font-medium">Ask for email address</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.step5?.message_settings?.ask_reason ?? true}
                      onChange={(e) => {
                        updateFormData('step5', 'message_settings', {
                          ...(formData.step5?.message_settings || {}),
                          ask_reason: e.target.checked,
                        });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <span className="text-gray-700 font-medium">Ask for reason for calling</span>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-between">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="px-4 py-2 border rounded disabled:opacity-50"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                >
                  Skip
                </button>
                {currentStep < 5 ? (
                  <button
                    onClick={handleNext}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={handleFinalize}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                  >
                    {saving ? 'Finalizing...' : 'Complete Setup'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default SetupPage;
