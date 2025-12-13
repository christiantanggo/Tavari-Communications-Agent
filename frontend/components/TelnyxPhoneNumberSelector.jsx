'use client';

import { useState, useEffect } from 'react';
import { telnyxPhoneNumbersAPI } from '@/lib/api';

const countries = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'MX', name: 'Mexico' },
];

const phoneTypes = [
  { value: 'local', label: 'Local' },
  { value: 'toll-free', label: 'Toll-Free' },
  { value: 'mobile', label: 'Mobile' },
];

export default function TelnyxPhoneNumberSelector({ onSelect, selectedNumber, countryCode: initialCountryCode = 'US' }) {
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [phoneType, setPhoneType] = useState('local');
  const [availableNumbers, setAvailableNumbers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualNumber, setManualNumber] = useState('');

  useEffect(() => {
    searchNumbers();
  }, [countryCode, phoneType]);

  const searchNumbers = async () => {
    setLoading(true);
    setError('');
    setAvailableNumbers([]);
    setShowManualEntry(false);
    try {
      const response = await telnyxPhoneNumbersAPI.search({
        countryCode,
        phoneType,
        limit: 20,
      });
      if (response.data.numbers.length === 0) {
        setError(`No ${phoneType} numbers available for ${countries.find(c => c.code === countryCode)?.name || countryCode}.`);
        setShowManualEntry(true);
      } else {
        setAvailableNumbers(response.data.numbers);
      }
    } catch (err) {
      console.error('Failed to search phone numbers:', err);
      setError(err.response?.data?.error || 'Failed to search for phone numbers.');
      setShowManualEntry(true);
    } finally {
      setLoading(false);
    }
  };

  const handleManualNumberChange = (e) => {
    setManualNumber(e.target.value);
    onSelect(e.target.value);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4 flex-wrap">
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
            Country:
          </label>
          <select
            id="country"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="mt-1 block px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 bg-white"
            disabled={loading}
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="phoneType" className="block text-sm font-medium text-gray-700 mb-1">
            Type:
          </label>
          <select
            id="phoneType"
            value={phoneType}
            onChange={(e) => setPhoneType(e.target.value)}
            className="mt-1 block px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 bg-white"
            disabled={loading}
          >
            {phoneTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={searchNumbers}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Refresh Numbers'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {availableNumbers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableNumbers.map((number) => (
            <div
              key={number.phone_number}
              onClick={() => onSelect(number.phone_number)}
              className={`cursor-pointer p-4 border rounded-lg shadow-sm transition-all duration-200 ${
                selectedNumber === number.phone_number
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <p className="text-lg font-semibold text-gray-900">{number.phone_number}</p>
              <p className="text-sm text-gray-600">
                {number.phone_price ? `$${number.phone_price} / month` : 'Price N/A'}
              </p>
              <p className="text-xs text-gray-500">
                {number.phone_category_name || phoneType} ({number.country_code})
              </p>
            </div>
          ))}
        </div>
      )}

      {showManualEntry && (
        <div className="mt-6 p-4 border border-gray-300 rounded-lg bg-gray-50">
          <h4 className="text-lg font-semibold text-gray-800 mb-3">Manually Enter Phone Number</h4>
          <p className="text-sm text-gray-600 mb-3">
            If you already own a Telnyx phone number, enter it below.
            It will be assigned to your AI agent and the webhook will be configured automatically.
          </p>
          <input
            type="text"
            value={manualNumber}
            onChange={handleManualNumberChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="+12014840333"
          />
          {manualNumber && (
            <p className="text-sm text-blue-700 mt-2">Selected manual number: {manualNumber}</p>
          )}
        </div>
      )}
    </div>
  );
}

