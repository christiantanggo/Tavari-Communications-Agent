'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
import { authAPI, billingAPI, businessAPI, agentsAPI } from '@/lib/api';
import { getToken } from '@/lib/auth';
import TimeInput12Hour from '@/components/TimeInput12Hour';
import { useToast } from '@/components/ToastProvider';

function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { success, error: showError, info } = useToast();
  const [user, setUser] = useState(null);
  const [billing, setBilling] = useState(null);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [sendingTestSMS, setSendingTestSMS] = useState(false);
  const [sendingTestMissedCall, setSendingTestMissedCall] = useState(false);
  const [activeTab, setActiveTab] = useState('business');
  
  // Business info state
  const [businessInfo, setBusinessInfo] = useState({
    name: '',
    phone: '',
    address: '',
    timezone: 'America/New_York',
    public_phone_number: '',
    website: '',
  });
  
  // Business hours state
  const [businessHours, setBusinessHours] = useState({
    monday: { open: '09:00', close: '17:00', closed: false },
    tuesday: { open: '09:00', close: '17:00', closed: false },
    wednesday: { open: '09:00', close: '17:00', closed: false },
    thursday: { open: '09:00', close: '17:00', closed: false },
    friday: { open: '09:00', close: '17:00', closed: false },
    saturday: { closed: true },
    sunday: { closed: true },
  });
  
  // Greetings state
  const [greetings, setGreetings] = useState({
    opening_greeting: '',
    ending_greeting: '',
  });
  
  // FAQs state
  const [faqs, setFaqs] = useState([]);
  
  // Holiday hours state
  const [holidayHours, setHolidayHours] = useState([]);
  
  // AI Settings state
  const [aiSettings, setAiSettings] = useState({
    ai_enabled: true,
    call_forward_rings: 4,
    after_hours_behavior: 'take_message',
    allow_call_transfer: true,
  });
  
  // Voice settings state
  const [voiceSettings, setVoiceSettings] = useState({
    provider: 'openai',
    voice_id: 'alloy',
  });
  
  // Notifications state
  const [notifications, setNotifications] = useState({
    email_ai_answered: true,
    email_missed_calls: false,
    sms_enabled: false,
    sms_notification_number: '',
  });

  useEffect(() => {
    loadData();
  }, [pathname]);

  // Reload data when page becomes visible (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userRes, billingRes, agentRes] = await Promise.all([
        authAPI.getMe(),
        billingAPI.getStatus().catch(() => ({ data: null })),
        agentsAPI.get().catch(() => ({ data: { agent: null } })),
      ]);
      
      console.log('[Settings Load] Raw API responses:', {
        business: userRes.data?.business,
        agent: agentRes.data?.agent,
      });
      console.log('[Settings Load] Business public_phone_number:', userRes.data?.business?.public_phone_number);
      console.log('[Settings Load] Business address:', userRes.data?.business?.address);
      console.log('[Settings Load] Agent opening_greeting:', agentRes.data?.agent?.opening_greeting);
      console.log('[Settings Load] Agent ending_greeting:', agentRes.data?.agent?.ending_greeting);
      
      setUser(userRes.data);
      setBilling(billingRes.data);
      
      if (userRes.data?.business) {
        const business = userRes.data.business;
        const loadedBusinessInfo = {
          name: business.name || '',
          phone: business.phone || '',
          address: business.address || '',
          timezone: business.timezone || 'America/New_York',
          public_phone_number: business.public_phone_number || '',
          website: business.website || '',
        };
        console.log('[Settings Load] Setting businessInfo:', loadedBusinessInfo);
        setBusinessInfo(loadedBusinessInfo);
        
        const loadedAiSettings = {
          ai_enabled: business.ai_enabled ?? true,
          call_forward_rings: business.call_forward_rings || 4,
          after_hours_behavior: business.after_hours_behavior || 'take_message',
          allow_call_transfer: business.allow_call_transfer ?? true,
        };
        console.log('[Settings Load] Setting aiSettings:', loadedAiSettings);
        setAiSettings(loadedAiSettings);
        
        const loadedNotifications = {
          email_ai_answered: business.email_ai_answered ?? true,
          email_missed_calls: business.email_missed_calls ?? false,
          sms_enabled: business.sms_enabled ?? false,
          sms_notification_number: business.sms_notification_number || '',
        };
        console.log('[Settings Load] Setting notifications:', loadedNotifications);
        setNotifications(loadedNotifications);
      }
      
      if (agentRes.data?.agent) {
        const agentData = agentRes.data.agent;
        
        // Always set business hours - use defaults if missing
        const loadedBusinessHours = (agentData.business_hours && typeof agentData.business_hours === 'object' && Object.keys(agentData.business_hours).length > 0)
          ? JSON.parse(JSON.stringify(agentData.business_hours))
          : {
              monday: { open: '09:00', close: '17:00', closed: false },
              tuesday: { open: '09:00', close: '17:00', closed: false },
              wednesday: { open: '09:00', close: '17:00', closed: false },
              thursday: { open: '09:00', close: '17:00', closed: false },
              friday: { open: '09:00', close: '17:00', closed: false },
              saturday: { closed: true },
              sunday: { closed: true },
            };
        console.log('[Settings Load] Setting businessHours:', loadedBusinessHours);
        setBusinessHours(loadedBusinessHours);
        
        // Always set FAQs
        const loadedFaqs = (agentData.faqs && Array.isArray(agentData.faqs)) 
          ? agentData.faqs.map(faq => ({ ...faq }))
          : [];
        console.log('[Settings Load] Setting faqs:', loadedFaqs);
        setFaqs(loadedFaqs);
        
        // Handle greetings
        const loadedGreetings = {
          opening_greeting: agentData.opening_greeting || '',
          ending_greeting: agentData.ending_greeting || '',
        };
        console.log('[Settings Load] Setting greetings:', loadedGreetings);
        setGreetings(loadedGreetings);
        
        // Handle holiday hours - filter out past holidays and sort by date
        // CRITICAL: Use date strings (YYYY-MM-DD) directly, don't convert to Date objects
        // This prevents timezone issues where dates shift when converted
        // Get today's date as YYYY-MM-DD in LOCAL timezone (not UTC)
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        const loadedHolidayHours = (agentData.holiday_hours && Array.isArray(agentData.holiday_hours))
          ? agentData.holiday_hours
              .map(h => {
                // Ensure date is in YYYY-MM-DD format (timezone-agnostic)
                let dateStr = h.date;
                if (dateStr) {
                  // If it's a Date object or ISO string, extract just the date part
                  if (dateStr instanceof Date) {
                    // Get date in local timezone (not UTC)
                    const year = dateStr.getFullYear();
                    const month = String(dateStr.getMonth() + 1).padStart(2, '0');
                    const day = String(dateStr.getDate()).padStart(2, '0');
                    dateStr = `${year}-${month}-${day}`;
                  } else if (dateStr.includes('T')) {
                    // If it's an ISO string, extract just the date part (before the T)
                    dateStr = dateStr.split('T')[0];
                  }
                  // Ensure it's in YYYY-MM-DD format
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    console.warn('[Settings Load] Invalid date format:', dateStr);
                    dateStr = null;
                  }
                }
                return { ...h, date: dateStr };
              })
              .filter(h => {
                if (!h.date) return false; // Remove holidays without dates
                // Compare date strings directly (YYYY-MM-DD format is sortable)
                return h.date >= todayStr; // Keep only future/current holidays
              })
              .sort((a, b) => {
                // Sort by date string: closest to today first
                if (!a.date) return 1; // Holidays without dates go to end
                if (!b.date) return -1;
                // Date strings in YYYY-MM-DD format are directly sortable
                return a.date.localeCompare(b.date); // Ascending order (closest first)
              })
          : [];
        console.log('[Settings Load] Setting holiday hours (filtered and sorted):', loadedHolidayHours);
        setHolidayHours(loadedHolidayHours);
        
        // Handle voice settings
        const loadedVoiceSettings = (agentData.voice_settings && typeof agentData.voice_settings === 'object')
          ? {
              provider: agentData.voice_settings.provider || 'openai',
              voice_id: agentData.voice_settings.voice_id || 'alloy',
            }
          : {
              provider: 'openai',
              voice_id: 'alloy',
            };
        console.log('[Settings Load] Setting voiceSettings:', loadedVoiceSettings);
        setVoiceSettings(loadedVoiceSettings);
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
      // Save business info
      // IMPORTANT: Put website AFTER spreads to ensure it's not overwritten
      const businessPayload = {
        name: businessInfo.name,
        phone: businessInfo.phone,
        address: businessInfo.address,
        timezone: businessInfo.timezone,
        public_phone_number: businessInfo.public_phone_number,
        ...aiSettings,
        ...notifications,
        // Put website last to ensure it's never overwritten
        website: businessInfo.website,
      };
      
      const businessResponse = await businessAPI.updateSettings(businessPayload);
      
      if (!businessResponse.data?.success) {
        throw new Error('Failed to save business settings');
      }
      
      // Filter out past holidays and sort by date before saving (clean up old holidays)
      // CRITICAL: Use date strings (YYYY-MM-DD) directly, don't convert to Date objects
      // This prevents timezone issues where dates shift when converted
      // Get today's date as YYYY-MM-DD in LOCAL timezone (not UTC)
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      const activeHolidayHours = holidayHours
        .map(h => {
          // Ensure date is in YYYY-MM-DD format (timezone-agnostic)
          let dateStr = h.date;
          if (dateStr) {
            // If it's a Date object or ISO string, extract just the date part
            if (dateStr instanceof Date) {
              // Get date in local timezone (not UTC)
              const year = dateStr.getFullYear();
              const month = String(dateStr.getMonth() + 1).padStart(2, '0');
              const day = String(dateStr.getDate()).padStart(2, '0');
              dateStr = `${year}-${month}-${day}`;
            } else if (dateStr.includes('T')) {
              // If it's an ISO string, extract just the date part (before the T)
              dateStr = dateStr.split('T')[0];
            }
            // Ensure it's in YYYY-MM-DD format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              console.warn('[Settings Save] Invalid date format:', dateStr);
              dateStr = null;
            }
          }
          return { ...h, date: dateStr };
        })
        .filter(h => {
          if (!h.date) return true; // Keep holidays without dates (new ones being added)
          // Compare date strings directly (YYYY-MM-DD format is sortable)
          return h.date >= todayStr; // Keep only future/current holidays
        })
        .sort((a, b) => {
          // Sort by date string: closest to today first
          if (!a.date) return 1; // Holidays without dates go to end
          if (!b.date) return -1;
          // Date strings in YYYY-MM-DD format are directly sortable
          return a.date.localeCompare(b.date); // Ascending order (closest first)
        });
      
      // CRITICAL: Ensure all holiday dates are in YYYY-MM-DD format before saving
      // Double-check to prevent any timezone conversion issues
      const finalHolidayHours = activeHolidayHours.map(h => {
        if (!h || !h.date) return h;
        
        // Ensure date is a string in YYYY-MM-DD format
        let dateStr = h.date;
        
        // If it's already a string in YYYY-MM-DD format, use it as-is
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return { ...h, date: dateStr };
        }
        
        // If it's a Date object, extract date parts in LOCAL timezone (not UTC!)
        if (dateStr instanceof Date) {
          const year = dateStr.getFullYear();
          const month = String(dateStr.getMonth() + 1).padStart(2, '0');
          const day = String(dateStr.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
          console.log(`[Settings Save] Converted Date object to string: ${dateStr}`);
        }
        // If it's an ISO string, extract just the date part
        else if (typeof dateStr === 'string' && dateStr.includes('T')) {
          dateStr = dateStr.split('T')[0];
          console.log(`[Settings Save] Extracted date from ISO string: ${dateStr}`);
        }
        // Try to extract YYYY-MM-DD from the string
        else if (typeof dateStr === 'string') {
          const dateMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            dateStr = dateMatch[1];
            console.log(`[Settings Save] Extracted date from string: ${dateStr}`);
          }
        }
        
        return { ...h, date: dateStr };
      });
      
      console.log('[Settings Save] Final holiday hours to save:', JSON.stringify(finalHolidayHours.map(h => ({ name: h?.name, date: h?.date })), null, 2));
      
      // Save agent settings (business hours, FAQs, greetings, holiday hours, voice settings)
      const agentPayload = {
        business_hours: businessHours,
        faqs: faqs,
        opening_greeting: greetings.opening_greeting || '',
        ending_greeting: greetings.ending_greeting || '',
        holiday_hours: finalHolidayHours, // Use normalized holiday hours
        voice_settings: voiceSettings, // Save voice settings
      };
      
      console.log('[Settings Save] Agent payload:', JSON.stringify(agentPayload, null, 2));
      console.log('[Settings Save] Greetings state:', greetings);
      
      const agentResponse = await agentsAPI.update(agentPayload);
      
      if (!agentResponse.data?.agent) {
        throw new Error('Failed to save agent settings');
      }
      
      success('Settings saved successfully!');
      
      // Reload data to ensure UI reflects saved changes
      await loadData();
    } catch (error) {
      console.error('[Settings Save] Save error:', error);
      console.error('[Settings Save] Error response:', error.response?.data);
      console.error('[Settings Save] Error stack:', error.stack);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save settings';
      showError(`Failed to save settings: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const copyPhoneNumber = () => {
    const phoneNumber = user?.business?.vapi_phone_number;
    if (phoneNumber) {
      navigator.clipboard.writeText(phoneNumber);
      info('Phone number copied to clipboard!');
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
        success(`Phone number provisioned successfully! Your Tavari number is: ${response.data.phone_number}`);
        await loadData();
        router.push('/dashboard?refresh=' + Date.now());
      } else {
        showError('Failed to provision phone number. Please try again or contact support.');
      }
    } catch (error) {
      console.error('Activation error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to provision phone number';
      showError(`Failed to provision phone number: ${errorMessage}`);
    } finally {
      setActivating(false);
    }
  };

  const handleSendTestSMS = async () => {
    if (!notifications.sms_enabled) {
      showError('SMS is not enabled. Please enable SMS notifications first.');
      return;
    }

    if (!notifications.sms_notification_number) {
      showError('SMS notification number is not configured. Please add a phone number first.');
      return;
    }

    setSendingTestSMS(true);
    
    try {
      const response = await businessAPI.sendTestSMS({
        sms_enabled: notifications.sms_enabled,
        sms_notification_number: notifications.sms_notification_number,
      });
      
      if (response.data?.success) {
        success(`Test SMS sent successfully to ${notifications.sms_notification_number}! Check your phone.`);
      } else {
        showError('Failed to send test SMS. Please try again.');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send test SMS';
      showError(`Failed to send test SMS: ${errorMessage}`);
    } finally {
      setSendingTestSMS(false);
    }
  };

  const handleSendTestMissedCall = async () => {
    if (!user?.business?.email) {
      showError('No email address found for your business. Please update your business email.');
      return;
    }

    setSendingTestMissedCall(true);
    
    try {
      const response = await businessAPI.sendTestMissedCall();
      
      if (response.data?.success) {
        success(`Test missed call email sent successfully to ${user.business.email}!`);
      } else {
        showError('Failed to send test missed call email. Please try again.');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send test missed call email';
      showError(`Failed to send test missed call email: ${errorMessage}`);
    } finally {
      setSendingTestMissedCall(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!user?.business?.email) {
      showError('No email address found for your business. Please update your business email.');
      return;
    }

    setSendingTestEmail(true);
    
    try {
      const response = await businessAPI.sendTestEmail();
      
      if (response.data?.success) {
        success(`Test email sent successfully to ${user.business.email}!`);
      } else {
        showError('Failed to send test email. Please try again.');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send test email';
      showError(`Failed to send test email: ${errorMessage}`);
    } finally {
      setSendingTestEmail(false);
    }
  };

  const addFAQ = () => {
    if (faqs.length >= 5) {
      showError('Maximum of 5 FAQs allowed');
      return;
    }
    setFaqs([...faqs, { question: '', answer: '' }]);
  };

  const removeFAQ = (index) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };

  const updateFAQ = (index, field, value) => {
    const newFaqs = [...faqs];
    newFaqs[index] = { ...newFaqs[index], [field]: value };
    setFaqs(newFaqs);
  };

  const updateBusinessHours = (day, field, value) => {
    setBusinessHours({
      ...businessHours,
      [day]: { ...businessHours[day], [field]: value },
    });
  };

  const tabs = [
    { id: 'business', label: 'Business Info' },
    { id: 'hours', label: 'Business Hours' },
    { id: 'greetings', label: 'Greetings' },
    { id: 'faqs', label: 'FAQs' },
    { id: 'ai', label: 'AI Settings' },
    { id: 'notifications', label: 'Notifications' },
  ];

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
        <DashboardHeader />

        <main className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Tavari Phone Number Display */}
          {user?.business?.vapi_phone_number ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
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
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
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

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-4 text-sm font-medium border-b-2 ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {/* Business Info Tab */}
              {activeTab === 'business' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Business Name</label>
                    <input
                      type="text"
                      value={businessInfo.name}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={businessInfo.phone}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Public Phone Number</label>
                    <input
                      type="tel"
                      value={businessInfo.public_phone_number}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, public_phone_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="+1 (555) 123-4567"
                    />
                    <p className="mt-1 text-xs text-gray-500">This is the number customers call. Forward calls from this number to your Tavari number above.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Address</label>
                    <textarea
                      value={businessInfo.address}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Website</label>
                    <input
                      type="url"
                      value={businessInfo.website}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, website: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      placeholder="https://example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Timezone</label>
                    <select
                      value={businessInfo.timezone}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, timezone: e.target.value })}
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

              {/* Business Hours Tab */}
              {activeTab === 'hours' && (
                <div className="space-y-6">
                  {/* Regular Business Hours */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Regular Business Hours</h3>
                    <div className="space-y-2">
                      {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                        const dayHours = businessHours[day] || { closed: true, open: '09:00', close: '17:00' };
                        return (
                          <div key={day} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                            <div className="w-24 capitalize font-medium text-gray-700">{day}</div>
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={!dayHours.closed}
                                onChange={(e) => updateBusinessHours(day, 'closed', !e.target.checked)}
                                className="w-4 h-4"
                              />
                              <span className="text-sm text-gray-700">Open</span>
                            </label>
                            {!dayHours.closed && (
                              <>
                                <TimeInput12Hour
                                  value={dayHours.open || '09:00'}
                                  onChange={(value) => updateBusinessHours(day, 'open', value)}
                                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                />
                                <span className="text-gray-600">to</span>
                                <TimeInput12Hour
                                  value={dayHours.close || '17:00'}
                                  onChange={(value) => updateBusinessHours(day, 'close', value)}
                                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Holiday Hours */}
                  <div className="border-t pt-6">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">Holiday Hours</h3>
                        <p className="text-sm text-gray-600 mt-1">Set special hours for holidays (e.g., Christmas Day, New Year's Day). Past holidays are automatically removed.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            // Add new holiday and sort by date
                            const newHoliday = { name: '', date: '', closed: false, open: '09:00', close: '17:00' };
                            const updated = [...holidayHours, newHoliday].sort((a, b) => {
                              // Sort by date string: closest to today first
                              if (!a.date) return 1; // Holidays without dates go to end
                              if (!b.date) return -1;
                              // Date strings in YYYY-MM-DD format are directly sortable
                              return a.date.localeCompare(b.date); // Ascending order (closest first)
                            });
                            setHolidayHours(updated);
                          }}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium text-sm"
                        >
                          Add Holiday
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                        >
                          {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                    {holidayHours.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <p>No holiday hours set. Click "Add Holiday" to get started.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {holidayHours.map((holiday, index) => (
                          <div key={index} className="border border-gray-300 p-4 rounded-lg bg-white">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Holiday Name</label>
                                <input
                                  type="text"
                                  value={holiday.name}
                                  onChange={(e) => {
                                    const updated = [...holidayHours];
                                    updated[index].name = e.target.value;
                                    setHolidayHours(updated);
                                  }}
                                  placeholder="e.g., Christmas Day, New Year's Day"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                                <input
                                  type="date"
                                  value={holiday.date || ''}
                                  onChange={(e) => {
                                    const updated = [...holidayHours];
                                    // CRITICAL: Store the date value directly as YYYY-MM-DD string (timezone-agnostic)
                                    // e.target.value from HTML5 date input is ALWAYS in YYYY-MM-DD format
                                    // Never convert this to a Date object - it will cause timezone shifts!
                                    const dateValue = e.target.value;
                                    console.log(`[Settings UI] Date input changed: ${dateValue} (type: ${typeof dateValue})`);
                                    updated[index].date = dateValue;
                                    // Sort by date string after updating
                                    const sorted = updated.sort((a, b) => {
                                      if (!a.date) return 1; // Holidays without dates go to end
                                      if (!b.date) return -1;
                                      // Date strings in YYYY-MM-DD format are directly sortable
                                      return a.date.localeCompare(b.date); // Ascending order (closest first)
                                    });
                                    setHolidayHours(sorted);
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                                />
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-center space-x-4">
                                <TimeInput12Hour
                                  value={holiday.open || '09:00'}
                                  onChange={(value) => {
                                    const updated = [...holidayHours];
                                    updated[index].open = value;
                                    setHolidayHours(updated);
                                  }}
                                  placeholder="Open time"
                                  disabled={holiday.closed}
                                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                />
                                <span className="text-gray-600">to</span>
                                <TimeInput12Hour
                                  value={holiday.close || '17:00'}
                                  onChange={(value) => {
                                    const updated = [...holidayHours];
                                    updated[index].close = value;
                                    setHolidayHours(updated);
                                  }}
                                  placeholder="Close time"
                                  disabled={holiday.closed}
                                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                />
                                <label className="flex items-center space-x-2 ml-4">
                                  <input
                                    type="checkbox"
                                    checked={holiday.closed}
                                    onChange={(e) => {
                                      const updated = [...holidayHours];
                                      updated[index].closed = e.target.checked;
                                      setHolidayHours(updated);
                                    }}
                                    className="w-4 h-4"
                                  />
                                  <span className="text-sm text-gray-700">Closed for the entire day</span>
                                </label>
                                <button
                                  onClick={() => setHolidayHours(holidayHours.filter((_, i) => i !== index))}
                                  className="ml-auto px-3 py-1 text-sm text-red-600 hover:text-red-700 font-medium"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Greetings Tab */}
              {activeTab === 'greetings' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Opening Greeting</label>
                    <textarea
                      value={greetings.opening_greeting}
                      onChange={(e) => setGreetings({ ...greetings, opening_greeting: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={3}
                      placeholder="Hello! Thanks for calling [Business Name]. How can I help you today?"
                    />
                    <p className="mt-1 text-xs text-gray-500">This is what the AI says when answering the phone.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Closing Greeting</label>
                    <textarea
                      value={greetings.ending_greeting}
                      onChange={(e) => setGreetings({ ...greetings, ending_greeting: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={3}
                      placeholder="Thank you for calling! Have a great day!"
                    />
                    <p className="mt-1 text-xs text-gray-500">This is what the AI says when ending the call (optional).</p>
                  </div>
                </div>
              )}

              {/* FAQs Tab */}
              {activeTab === 'faqs' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm text-gray-600">Add up to 5 frequently asked questions</p>
                    {faqs.length < 5 && (
                      <button
                        onClick={addFAQ}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                      >
                        Add FAQ
                      </button>
                    )}
                  </div>
                  {faqs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No FAQs yet. Click "Add FAQ" to get started.</p>
                    </div>
                  ) : (
                    faqs.map((faq, index) => (
                      <div key={index} className="border border-gray-300 p-4 rounded-lg bg-gray-50">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Question {index + 1}</label>
                        <input
                          type="text"
                          value={faq.question || ''}
                          onChange={(e) => updateFAQ(index, 'question', e.target.value)}
                          className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          placeholder="What are your hours?"
                        />
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Answer</label>
                        <textarea
                          value={faq.answer || ''}
                          onChange={(e) => updateFAQ(index, 'answer', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          rows={2}
                          placeholder="We're open Monday-Friday 9am-5pm"
                        />
                        <button
                          onClick={() => removeFAQ(index)}
                          className="mt-2 text-red-600 text-sm hover:text-red-700 font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* AI Settings Tab */}
              {activeTab === 'ai' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        AI Phone Agent Enabled
                      </label>
                      <p className="text-xs text-gray-500">
                        When enabled, AI answers calls after X rings. When disabled, calls are immediately forwarded.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aiSettings.ai_enabled}
                        onChange={(e) => setAiSettings({ ...aiSettings, ai_enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {aiSettings.ai_enabled && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Answer after X rings
                        </label>
                        <select
                          value={aiSettings.call_forward_rings}
                          onChange={(e) => setAiSettings({ ...aiSettings, call_forward_rings: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        >
                          <option value={2}>2 rings</option>
                          <option value={3}>3 rings</option>
                          <option value={4}>4 rings</option>
                          <option value={5}>5 rings</option>
                          <option value={6}>6 rings</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          After-hours behavior
                        </label>
                        <select
                          value={aiSettings.after_hours_behavior}
                          onChange={(e) => setAiSettings({ ...aiSettings, after_hours_behavior: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        >
                          <option value="take_message">Take message (after answering FAQs)</option>
                          <option value="state_hours">State hours only (after answering FAQs)</option>
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          Note: FAQs are always answered, even after hours.
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Allow call transfer
                          </label>
                          <p className="text-xs text-gray-500">
                            Allow Tavari to offer transferring callers back to your business.
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={aiSettings.allow_call_transfer}
                            onChange={(e) => setAiSettings({ ...aiSettings, allow_call_transfer: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <div className="border-t pt-4 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">
                            AI Voice
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            Choose the voice for your AI assistant. All OpenAI voices are included at no extra cost.
                          </p>
                          <select
                            value={voiceSettings.voice_id}
                            onChange={(e) => setVoiceSettings({ ...voiceSettings, voice_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          >
                            <option value="alloy">Alloy - Professional and balanced (Recommended)</option>
                            <option value="echo">Echo - Clear and confident</option>
                            <option value="fable">Fable - Expressive and engaging</option>
                            <option value="onyx">Onyx - Deep and authoritative</option>
                            <option value="nova">Nova - Warm and friendly</option>
                            <option value="shimmer">Shimmer - Smooth and calm</option>
                          </select>
                          <p className="mt-1 text-xs text-gray-500">
                            Note: After changing the voice, click "Rebuild Agent" in the dashboard header to apply the change.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Email when Tavari answers the phone
                      </label>
                      <p className="text-xs text-gray-500">Get an email summary every time Tavari handles a call</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSendTestEmail}
                        disabled={sendingTestEmail}
                        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {sendingTestEmail ? 'Sending...' : 'Test Email'}
                      </button>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.email_ai_answered}
                          onChange={(e) => setNotifications({ ...notifications, email_ai_answered: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Calls your team couldn't answer during busy times
                      </label>
                      <p className="text-xs text-gray-500">Get email summaries for calls that went unanswered during your business hours</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {notifications.email_missed_calls && (
                        <button
                          onClick={handleSendTestMissedCall}
                          disabled={sendingTestMissedCall}
                          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {sendingTestMissedCall ? 'Sending...' : 'Test Email'}
                        </button>
                      )}
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.email_missed_calls}
                          onChange={(e) => setNotifications({ ...notifications, email_missed_calls: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          SMS for urgent callbacks
                        </label>
                        <p className="text-xs text-gray-500">Receive SMS alerts when callers request urgent callbacks</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.sms_enabled}
                          onChange={(e) => setNotifications({ ...notifications, sms_enabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    {notifications.sms_enabled && (
                      <div className="mt-2">
                        <div className="flex gap-2">
                          <input
                            type="tel"
                            placeholder="+1 (555) 123-4567"
                            value={notifications.sms_notification_number}
                            onChange={(e) => setNotifications({ ...notifications, sms_notification_number: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 bg-white"
                          />
                          <button
                            onClick={handleSendTestSMS}
                            disabled={sendingTestSMS || !notifications.sms_notification_number}
                            className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap"
                          >
                            {sendingTestSMS ? 'Sending...' : 'Test SMS'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">SMS messages are charged per message</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
