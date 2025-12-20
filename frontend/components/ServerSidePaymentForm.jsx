'use client';

import { useState } from 'react';
import { billingAPI } from '@/lib/api';

export default function ServerSidePaymentForm({ customerId, onSuccess, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.target);
      const cardData = {
        cardNumber: formData.get('cardNumber').replace(/\s/g, ''),
        cardExpiry: formData.get('cardExpiry'),
        cardCVV: formData.get('cardCVV'),
        cardHolderName: formData.get('cardHolderName'),
      };

      // Send card details to backend for processing
      const response = await billingAPI.addPaymentMethodDirect({
        customerId: customerId,
        ...cardData,
      });

      if (response.data.success) {
        onSuccess(response.data);
      } else {
        throw new Error(response.data.error || 'Failed to add payment method');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to add payment method. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Add Payment Method</h2>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-medium">{error}</p>
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
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Add Payment Method'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

