'use client';

import { useState, useEffect, useRef } from 'react';

export default function HelcimPaymentForm({ customerId, onSuccess, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scriptLoading, setScriptLoading] = useState(true);
  const helcimJsLoaded = useRef(false);

  useEffect(() => {
    // Check if Helcim.js is already loaded
    if (typeof window !== 'undefined' && window.HelcimPay) {
      helcimJsLoaded.current = true;
      setScriptLoading(false);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="helcim.js"]');
    if (existingScript) {
      // Wait for existing script to load
      existingScript.addEventListener('load', () => {
        helcimJsLoaded.current = true;
        setScriptLoading(false);
      });
      existingScript.addEventListener('error', () => {
        setError('Failed to load Helcim.js. Please refresh the page.');
        setScriptLoading(false);
      });
      return;
    }

    // Load Helcim.js script
    if (typeof window !== 'undefined' && !helcimJsLoaded.current) {
      console.log('[HelcimPaymentForm] Loading Helcim.js script...');
      const script = document.createElement('script');
      // Try the correct Helcim.js URL - it might be different
      script.src = 'https://secure.helcim.com/helcim.js';
      script.async = true;
      console.log('[HelcimPaymentForm] Script src:', script.src);
      script.onload = () => {
        // Wait a bit for HelcimPay to be available
        const checkHelcim = setInterval(() => {
          if (window.HelcimPay) {
            helcimJsLoaded.current = true;
            setScriptLoading(false);
            clearInterval(checkHelcim);
          }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (!helcimJsLoaded.current) {
            clearInterval(checkHelcim);
            setError('Helcim.js loaded but HelcimPay object is not available. Please refresh the page.');
            setScriptLoading(false);
          }
        }, 5000);
      };
      script.onerror = () => {
        setError('Failed to load Helcim.js. Please refresh the page.');
        setScriptLoading(false);
      };
      document.body.appendChild(script);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Check if Helcim.js is loaded
      if (scriptLoading) {
        throw new Error('Helcim.js is still loading. Please wait a moment and try again.');
      }
      
      if (typeof window === 'undefined' || !window.HelcimPay) {
        throw new Error('Helcim.js is not loaded. Please refresh the page.');
      }

      // Get form data
      const formData = new FormData(e.target);
      const cardData = {
        cardNumber: formData.get('cardNumber').replace(/\s/g, ''),
        cardExpiry: formData.get('cardExpiry'),
        cardCVV: formData.get('cardCVV'),
        cardHolderName: formData.get('cardHolderName'),
      };

      // Tokenize card with Helcim.js
      const helcimJsToken = process.env.NEXT_PUBLIC_HELCIM_JS_TOKEN;
      if (!helcimJsToken) {
        throw new Error('Helcim.js token is not configured. Please contact support.');
      }

      const tokenResponse = await window.HelcimPay.tokenize({
        token: helcimJsToken,
        cardNumber: cardData.cardNumber,
        cardExpiry: cardData.cardExpiry,
        cardCVV: cardData.cardCVV,
        cardHolderName: cardData.cardHolderName,
      });

      if (!tokenResponse || !tokenResponse.token) {
        throw new Error('Failed to tokenize card. Please check your card details.');
      }

      // Send token to backend to save payment method
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];

      const response = await fetch(`${API_URL}/api/billing/payment-method`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: customerId,
          paymentToken: tokenResponse.token,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save payment method');
      }

      const result = await response.json();
      onSuccess(result);
    } catch (err) {
      setError(err.message || 'Failed to add payment method. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Debug logging
  useEffect(() => {
    console.log('[HelcimPaymentForm] Component mounted');
    console.log('[HelcimPaymentForm] customerId:', customerId);
    console.log('[HelcimPaymentForm] scriptLoading:', scriptLoading);
    console.log('[HelcimPaymentForm] error:', error);
  }, [customerId, scriptLoading, error]);

  if (!customerId) {
    console.warn('[HelcimPaymentForm] No customerId provided');
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Add Payment Method</h2>
        
        {scriptLoading && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4">
            Loading payment form...
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cardholder Name
              </label>
              <input
                type="text"
                name="cardHolderName"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Card Number
              </label>
              <input
                type="text"
                name="cardNumber"
                required
                maxLength="19"
                pattern="[0-9\s]{13,19}"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                placeholder="1234 5678 9012 3456"
                onChange={(e) => {
                  // Format card number with spaces
                  const value = e.target.value.replace(/\s/g, '');
                  const formatted = value.match(/.{1,4}/g)?.join(' ') || value;
                  e.target.value = formatted;
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiry (MM/YY)
                </label>
                <input
                  type="text"
                  name="cardExpiry"
                  required
                  maxLength="5"
                  pattern="[0-9]{2}/[0-9]{2}"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="12/25"
                  onChange={(e) => {
                    // Format expiry
                    let value = e.target.value.replace(/\D/g, '');
                    if (value.length >= 2) {
                      value = value.substring(0, 2) + '/' + value.substring(2, 4);
                    }
                    e.target.value = value;
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CVV
                </label>
                <input
                  type="text"
                  name="cardCVV"
                  required
                  maxLength="4"
                  pattern="[0-9]{3,4}"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="123"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || scriptLoading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : scriptLoading ? 'Loading...' : 'Add Payment Method'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

