import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, ''); // Remove trailing slash

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('token');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authAPI = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
};

// Agents API
export const agentsAPI = {
  get: () => api.get('/agents'),
  update: (data) => api.put('/agents', data),
  rebuild: () => api.post('/agents/rebuild'),
};

// Calls API
export const callsAPI = {
  list: (params) => api.get('/calls', { params }),
  get: (callId) => api.get(`/calls/${callId}`),
};

// Messages API
export const messagesAPI = {
  list: (params) => api.get('/messages', { params }),
  markRead: (messageId) => api.patch(`/messages/${messageId}/read`),
  markFollowUp: (messageId) => api.patch(`/messages/${messageId}/follow-up`),
};

// Usage API
export const usageAPI = {
  getStatus: () => api.get('/usage/status'),
  getMonthly: (year, month) => api.get('/usage/monthly', { params: { year, month } }),
};

// Setup API
export const setupAPI = {
  getStatus: () => api.get('/setup/status'),
  getData: () => api.get('/setup/data'),
  saveStep1: (data) => api.post('/setup/step1', data),
  saveStep2: (data) => api.post('/setup/step2', data),
  saveStep3: (data) => api.post('/setup/step3', data),
  saveStep4: (data) => api.post('/setup/step4', data),
  saveStep5: (data) => api.post('/setup/step5', data),
  finalize: () => api.post('/setup/finalize'),
};

// Billing API
export const billingAPI = {
  getStatus: () => api.get('/billing/status'),
  getPortal: () => api.get('/billing/portal'),
  createCheckout: (priceId) => api.post('/billing/checkout', { priceId }),
};

// Invoices API
export const invoicesAPI = {
  list: () => api.get('/invoices'),
  get: (id) => api.get(`/invoices/${id}`),
  downloadPDF: (id) => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
};

// Support API
export const supportAPI = {
  createTicket: (data) => api.post('/support/tickets', data),
  getTickets: () => api.get('/support/tickets'),
};

// Account API
export const accountAPI = {
  cancel: (data) => api.post('/account/cancel', data),
  delete: (data) => api.post('/account/delete', data),
  export: () => api.get('/account/export'),
};

// Business API
export const businessAPI = {
  updateSettings: (data) => api.put('/business/settings', data),
  retryActivation: () => api.post('/business/retry-activation'),
  searchPhoneNumbers: (params) => api.get('/business/phone-numbers/search', { params }),
  provisionPhoneNumber: (data) => api.post('/business/phone-numbers/provision', data),
  linkAssistant: () => api.post('/business/link-assistant'),
  sendTestEmail: () => api.post('/business/test-email'),
  sendTestSMS: (data) => api.post('/business/test-sms', data),
  sendTestMissedCall: (data) => api.post('/business/test-missed-call', data),
};

// Analytics API
export const analyticsAPI = {
  getCallAnalytics: (params) => api.get('/analytics/calls', { params }),
  getUsageTrends: (params) => api.get('/analytics/usage/trends', { params }),
  exportData: (type) => api.get('/analytics/export', { params: { type }, responseType: 'blob' }),
};

// Phone Numbers API (Voximplant - legacy)
export const phoneNumbersAPI = {
  search: (params) => api.get('/phone-numbers/search', { params }),
  purchase: (phoneNumber, countryCode) => api.post('/phone-numbers/purchase', { phoneNumber, countryCode }),
  getCurrent: () => api.get('/phone-numbers/current'),
};

// Telnyx Phone Numbers API
export const telnyxPhoneNumbersAPI = {
  search: (params) => api.get('/telnyx-phone-numbers/search', { params }),
  purchase: (phoneNumber, countryCode) => api.post('/telnyx-phone-numbers/purchase', { phoneNumber, countryCode }),
  getCurrent: () => api.get('/telnyx-phone-numbers/current'),
};

