'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signup } from '@/lib/auth';
import { formatPhoneInput, toE164, getPhoneValidationError } from '@/lib/phoneFormatter';
import TimeInput12Hour from '@/components/TimeInput12Hour';

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    first_name: '',
    last_name: '',
    phone: '',
    public_phone_number: '',
    timezone: 'America/New_York',
    business_hours: {
      monday: { open: '09:00', close: '17:00', closed: false },
      tuesday: { open: '09:00', close: '17:00', closed: false },
      wednesday: { open: '09:00', close: '17:00', closed: false },
      thursday: { open: '09:00', close: '17:00', closed: false },
      friday: { open: '09:00', close: '17:00', closed: false },
      saturday: { closed: true },
      sunday: { closed: true },
    },
    contact_email: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [activationStatus, setActivationStatus] = useState(null);
  const [vapiPhoneNumber, setVapiPhoneNumber] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Format phone number as user types
    if (name === 'public_phone_number') {
      const formatted = formatPhoneInput(value);
      setFormData({ ...formData, [name]: formatted });
      
      // Validate phone number
      const validationError = getPhoneValidationError(formatted);
      setPhoneError(validationError || '');
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleHoursChange = (day, field, value) => {
    setFormData({
      ...formData,
      business_hours: {
        ...formData.business_hours,
        [day]: {
          ...formData.business_hours[day],
          [field]: value,
        },
      },
    });
  };

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPhoneError('');
    setLoading(true);
    
    // Validate and convert phone number to E.164 format
    const e164Phone = toE164(formData.public_phone_number);
    if (!e164Phone) {
      setPhoneError('Please enter a valid phone number with country code (e.g., +1 555-123-4567)');
      setLoading(false);
      return;
    }
    
    try {
      const response = await signup({
        ...formData,
        public_phone_number: e164Phone, // Send E.164 format to backend
        address: '',
      });

      // Check if signup succeeded (we got a token)
      if (response?.token) {
        // Account was created successfully
        // Try to get phone number from multiple sources
        const phoneNumber = response?.activation?.phone_number || 
                           response?.business?.vapi_phone_number || 
                           null;
        
        if (phoneNumber) {
          setVapiPhoneNumber(phoneNumber);
          setActivationStatus('success');
        } else if (response?.activation?.error) {
          // Account created but activation failed - still show success, allow user to proceed
          setActivationStatus('success');
          setError(`Account created! Phone activation failed: ${response.activation.error}. You can retry activation from the dashboard.`);
        } else {
          // No activation info - assume success
          setActivationStatus('success');
        }
      } else {
        // Signup failed
        setActivationStatus('error');
        setError(response?.error || 'Signup failed');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Signup failed';
      const errorCode = err.response?.data?.code;
      
      // If account already exists, redirect to login
      if (errorCode === 'ACCOUNT_EXISTS' || errorMessage.includes('already exists') && errorMessage.includes('log in')) {
        setError(errorMessage);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };


  // Completion screen with phone number
  if (activationStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Your AI is Ready!</h1>
            {vapiPhoneNumber ? (
              <p className="text-gray-600">Forward calls from your public number to this Tavari number:</p>
            ) : (
              <p className="text-gray-600">Your account has been created successfully!</p>
            )}
          </div>

          {vapiPhoneNumber && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Your Tavari Number</label>
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-blue-600">{vapiPhoneNumber}</span>
                <button
                  onClick={copyPhoneNumber}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                >
                  Copy
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-3">
                Forward calls from <strong>{formData.public_phone_number || 'your public number'}</strong> to this number after {formData.call_forward_rings || 4} rings.
              </p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Next Steps:</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              {vapiPhoneNumber ? (
                <>
                  <li>Set up call forwarding with your phone carrier</li>
                  <li>Forward calls to the Tavari number above</li>
                  <li>Configure your FAQs in the dashboard</li>
                </>
              ) : (
                <>
                  <li>Complete phone activation from the dashboard</li>
                  <li>Set up call forwarding with your phone carrier</li>
                  <li>Configure your FAQs in the dashboard</li>
                </>
              )}
            </ol>
          </div>

          <button
            onClick={() => router.push('/dashboard/setup')}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 font-medium"
          >
            Complete Setup Wizard
          </button>
        </div>
      </div>
    );
  }

  // Loading/activation screen
  if (activationStatus === 'activating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Setting up your AI assistant...</h2>
          <p className="text-gray-600">This will just take a moment</p>
        </div>
      </div>
    );
  }

  // Multi-step form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Step {step} of 5</span>
            <span className="text-sm text-gray-500">{Math.round((step / 5) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(step / 5) * 100}%` }}
            ></div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center mb-6 text-gray-900">Sign Up</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={step === 5 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }} className="space-y-6">
          {/* Step 1: Email + Password */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
                <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
              </div>
            </div>
          )}

          {/* Step 2: Business name + Public phone number */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                />
              </div>
              <div>
                <label htmlFor="public_phone_number" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Restaurant's Public Phone Number *
                </label>
                <input
                  type="tel"
                  id="public_phone_number"
                  name="public_phone_number"
                  value={formData.public_phone_number}
                  onChange={handleChange}
                  required
                  placeholder="+1 (555) 123-4567"
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-gray-900 bg-white ${
                    phoneError 
                      ? 'border-red-300 focus:ring-red-500' 
                      : 'border-gray-300 focus:ring-blue-500'
                  }`}
                />
                {phoneError ? (
                  <p className="mt-1 text-xs text-red-600">{phoneError}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Include country code (e.g., +1 for US/Canada). This is your existing phone number that customers call.
                  </p>
                )}
              </div>
              
            </div>
          )}

          {/* Step 3: Timezone */}
          {step === 3 && (
            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
                What timezone is your restaurant in? *
              </label>
              <select
                id="timezone"
                name="timezone"
                value={formData.timezone}
                onChange={handleChange}
                required
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
          )}

          {/* Step 4: Business hours */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 mb-4">Business Hours</h3>
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                <div key={day} className="flex items-center gap-4">
                  <div className="w-24">
                    <label className="block text-sm font-medium text-gray-700 capitalize">{day}</label>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.business_hours[day].closed}
                      onChange={(e) => handleHoursChange(day, 'closed', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-600">Closed</span>
                  </div>
                  {!formData.business_hours[day].closed && (
                    <>
                      <TimeInput12Hour
                        value={formData.business_hours[day].open || '09:00'}
                        onChange={(value) => handleHoursChange(day, 'open', value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white text-sm"
                      />
                      <span className="text-gray-600">to</span>
                      <TimeInput12Hour
                        value={formData.business_hours[day].close || '17:00'}
                        onChange={(value) => handleHoursChange(day, 'close', value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white text-sm"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Step 5: Contact email */}
          {step === 5 && (
            <div>
              <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700 mb-1">
                Where should we send call summaries? *
              </label>
              <input
                type="email"
                id="contact_email"
                name="contact_email"
                value={formData.contact_email || formData.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
              <p className="mt-1 text-xs text-gray-500">Pre-filled from your signup email</p>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between pt-4">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
            )}
            <div className={step === 1 ? 'ml-auto' : ''}>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === 5 ? (loading ? 'Creating account...' : 'Create Account') : 'Next'}
              </button>
            </div>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
