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
  const [phoneNumberSearch, setPhoneNumberSearch] = useState('');
  const [searchMode, setSearchMode] = useState('browse'); // 'browse' or 'search'
  const [locality, setLocality] = useState(''); // City/Region
  const [administrativeArea, setAdministrativeArea] = useState(''); // State/Province
  const [areaCode, setAreaCode] = useState(''); // Area Code
  const [availableNumbers, setAvailableNumbers] = useState([]);
  const [filteredNumbers, setFilteredNumbers] = useState([]);
  const [sortBy, setSortBy] = useState('none'); // 'none', 'price'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualNumber, setManualNumber] = useState('');

  useEffect(() => {
    if (searchMode === 'browse') {
      searchNumbers();
    }
  }, [countryCode, phoneType, searchMode]);

  // Filter and sort numbers when they change or sort option changes
  useEffect(() => {
    let filtered = [...availableNumbers];
    
    // Apply sorting
    if (sortBy === 'price') {
      filtered.sort((a, b) => {
        const priceA = a.phone_price || 0;
        const priceB = b.phone_price || 0;
        return priceA - priceB;
      });
    }
    
    setFilteredNumbers(filtered);
  }, [availableNumbers, sortBy]);

  const searchNumbers = async () => {
    setLoading(true);
    setError('');
    setAvailableNumbers([]);
    setShowManualEntry(false);
    try {
      let searchParams = {};
      
      // If searching by phone number, only send that parameter
      if (searchMode === 'search' && phoneNumberSearch.trim()) {
        searchParams = {
          phoneNumber: phoneNumberSearch.trim(),
          limit: 50,
        };
      } else {
        // Browse mode - use country, type, and location filters
        searchParams = {
          countryCode,
          phoneType,
          limit: 50,
        };
        
        // Add location filters if provided
        if (locality.trim()) {
          searchParams.locality = locality.trim();
        }
        if (administrativeArea.trim()) {
          searchParams.administrativeArea = administrativeArea.trim();
        }
        if (areaCode.trim()) {
          searchParams.areaCode = areaCode.trim();
        }
      }
      
      const response = await telnyxPhoneNumbersAPI.search(searchParams);
      if (response.data.numbers.length === 0) {
        if (searchMode === 'search') {
          setError(`No phone numbers found matching "${phoneNumberSearch}". Try a different number or browse available numbers.`);
        } else {
          setError(`No ${phoneType} numbers available for ${countries.find(c => c.code === countryCode)?.name || countryCode}.`);
        }
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

  const handlePhoneNumberSearch = (e) => {
    e.preventDefault();
    if (phoneNumberSearch.trim()) {
      searchNumbers();
    }
  };

  const handleManualNumberChange = (e) => {
    setManualNumber(e.target.value);
    onSelect(e.target.value);
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex items-center space-x-4 border-b pb-3">
        <button
          onClick={() => {
            setSearchMode('browse');
            setPhoneNumberSearch('');
          }}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            searchMode === 'browse'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Browse Numbers
        </button>
        <button
          onClick={() => {
            setSearchMode('search');
            setAvailableNumbers([]);
          }}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            searchMode === 'search'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Search by Number
        </button>
      </div>

      {searchMode === 'search' ? (
        /* Phone Number Search Mode */
        <div className="space-y-3">
          <form onSubmit={handlePhoneNumberSearch} className="flex items-end space-x-4">
            <div className="flex-1">
              <label htmlFor="phoneNumberSearch" className="block text-sm font-medium text-gray-700 mb-1">
                Search for a specific phone number:
              </label>
              <input
                id="phoneNumberSearch"
                type="text"
                value={phoneNumberSearch}
                onChange={(e) => setPhoneNumberSearch(e.target.value)}
                placeholder="e.g., +14155551234, (415) 555-1234, 4155551234"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 bg-white"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter a phone number to check if it's available for purchase
              </p>
            </div>
            <button
              type="submit"
              disabled={loading || !phoneNumberSearch.trim()}
              className="px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>
      ) : (
        /* Browse Mode */
        <div className="space-y-3">
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
          
          {/* Location Filters */}
          <div className="border-t pt-3 mt-3">
            <p className="text-sm font-semibold text-gray-700 mb-2">Location Filters (Optional):</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="areaCode" className="block text-sm font-medium text-gray-700 mb-1">
                  Area Code:
                </label>
                <input
                  id="areaCode"
                  type="text"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  placeholder="e.g., 415, 416, 212"
                  maxLength={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 bg-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                  City/Region:
                </label>
                <input
                  id="city"
                  type="text"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  placeholder="e.g., Toronto, New York"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 bg-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="province" className="block text-sm font-medium text-gray-700 mb-1">
                  State/Province:
                </label>
                <input
                  id="province"
                  type="text"
                  value={administrativeArea}
                  onChange={(e) => setAdministrativeArea(e.target.value)}
                  placeholder="e.g., ON, CA, NY"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 bg-white"
                  disabled={loading}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Use any combination of filters to narrow your search. Leave blank to search all locations.
            </p>
          </div>
          
          {/* Sort Options */}
          {availableNumbers.length > 0 && (
            <div className="flex items-center space-x-4">
              <label htmlFor="sortBy" className="block text-sm font-medium text-gray-700">
                Sort by:
              </label>
              <select
                id="sortBy"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 bg-white"
              >
                <option value="none">No sorting</option>
                <option value="price">Price (Low to High)</option>
              </select>
              <span className="text-sm text-gray-600">
                Showing {filteredNumbers.length} number{filteredNumbers.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {filteredNumbers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNumbers.map((number) => (
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
                {number.locality && number.administrative_area 
                  ? `${number.locality}, ${number.administrative_area}`
                  : number.locality 
                    ? number.locality
                    : number.administrative_area
                      ? number.administrative_area
                      : number.phone_category_name || phoneType
                } ({number.country_code})
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

