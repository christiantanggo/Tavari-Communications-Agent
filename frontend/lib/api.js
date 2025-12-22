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

// Retry logic for rate limiting (429 errors)
const retryRequest = async (config, retries = 2) => {
  for (let i = 0; i < retries; i++) {
    // Exponential backoff: wait 1s, 2s, 4s
    const delay = Math.pow(2, i) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      return await api.request(config);
    } catch (retryError) {
      if (retryError.response?.status !== 429 || i === retries - 1) {
        throw retryError;
      }
    }
  }
};

// Handle auth errors and rate limiting
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('token');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    
    // Retry on 429 (rate limit) errors
    if (error.response?.status === 429 && error.config && !error.config._retry) {
      error.config._retry = true;
      try {
        return await retryRequest(error.config);
      } catch (retryError) {
        // If retry fails, return the original error
        return Promise.reject(error);
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
  markFollowUp: (messageId) => api.patch(`/messages/${messageId}/followup`),
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
  getPackages: () => api.get('/billing/packages'),
  createCheckout: (packageId) => api.post('/billing/checkout', { packageId }),
  getHostedPayment: () => api.get('/billing/hosted-payment'),
  getHostedPaymentCheckout: (packageId) => api.get(`/billing/hosted-payment/checkout?packageId=${packageId}`),
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
  getTicket: (id) => api.get(`/support/tickets/${id}`),
  addResponse: (id, responseText) => api.post(`/support/tickets/${id}/response`, { response_text: responseText }),
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

// Phone Numbers API (unified API for VAPI/Telnyx)
export const phoneNumbersAPI = {
  search: (params) => api.get('/phone-numbers/search', { params }),
  getAvailable: (areaCode) => api.get('/phone-numbers/available', { params: areaCode ? { areaCode } : {} }),
  assign: (phoneNumber, purchaseNew = false) => api.post('/phone-numbers/assign', { phone_number: phoneNumber, purchase_new: purchaseNew }),
  provision: (phoneNumber) => api.post('/phone-numbers/provision', { phoneNumber }),
};

// Telnyx Phone Numbers API (legacy - used in setup wizard)
// Note: Uses provision endpoint which handles both existing and new number purchase
export const telnyxPhoneNumbersAPI = {
  search: (params) => api.get('/phone-numbers/search', { params }),
  purchase: (phoneNumber, _countryCode) => api.post('/business/phone-numbers/provision', { phoneNumber }),
  getCurrent: () => api.get('/phone-numbers/available'),
};

// Admin Phone Numbers API
export const adminPhoneNumbersAPI = {
  getAvailable: (areaCode) => api.get('/phone-numbers/admin/available', { params: areaCode ? { areaCode } : {} }),
  assign: (businessId, phoneNumber, purchaseNew = false) => api.post(`/phone-numbers/admin/assign/${businessId}`, { phone_number: phoneNumber, purchase_new: purchaseNew }),
  change: (businessId, phoneNumber, purchaseNew = false) => api.post(`/phone-numbers/admin/change/${businessId}`, { phone_number: phoneNumber, purchase_new: purchaseNew }),
};

// Admin API (uses admin token from cookie)
const adminApi = axios.create({
  baseURL: `${API_URL}/api/admin`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add admin auth token to requests
adminApi.interceptors.request.use((config) => {
  if (typeof document !== 'undefined') {
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('admin_token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Admin Support API
export const adminSupportAPI = {
  getTickets: (params) => adminApi.get('/support/tickets', { params }),
  getTicket: (id) => adminApi.get(`/support/tickets/${id}`),
  updateStatus: (id, status, resolutionNotes) => adminApi.patch(`/support/tickets/${id}/status`, { status, resolution_notes: resolutionNotes }),
  addResponse: (id, responseText) => adminApi.post(`/support/tickets/${id}/response`, { response_text: responseText }),
};

// Admin Packages API
export const adminPackagesAPI = {
  getPackages: (includeInactive = false) => adminApi.get('/packages', { params: { includeInactive } }),
  getPackage: (id) => adminApi.get(`/packages/${id}`),
  createPackage: (data) => adminApi.post('/packages', data),
  updatePackage: (id, data) => adminApi.put(`/packages/${id}`, data),
  deletePackage: (id) => adminApi.delete(`/packages/${id}`),
};

// Admin SMS Phone Numbers API
export const adminSMSNumbersAPI = {
  getUnassigned: () => adminApi.get('/phone-numbers/unassigned'),
  assignSMS: (businessId, phoneNumber, isPrimary = false) => adminApi.post(`/phone-numbers/assign-sms/${businessId}`, { phone_number: phoneNumber, is_primary: isPrimary }),
  getBusinessNumbers: (businessId) => adminApi.get(`/phone-numbers/business/${businessId}`),
  removeNumber: (businessId, phoneNumberId) => adminApi.delete(`/phone-numbers/business/${businessId}/${phoneNumberId}`),
  migrateToTelnyx: (businessId) => adminApi.post(`/phone-numbers/migrate-to-telnyx/${businessId}`),
  verify: () => adminApi.get('/phone-numbers/verify'),
};

// Bulk SMS API
export const bulkSMSAPI = {
  createCampaign: (data) => api.post('/bulk-sms/campaigns', data),
  getCampaigns: () => api.get('/bulk-sms/campaigns'),
  getCampaign: (id) => api.get(`/bulk-sms/campaigns/${id}`),
  cancelCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/cancel`),
  deleteCampaign: (id) => api.delete(`/bulk-sms/campaigns/${id}`),
  pauseCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/pause`),
  restartCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/restart`),
  resendCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/resend`),
  resendRecipients: (id, recipientIds) => api.post(`/bulk-sms/campaigns/${id}/resend-recipients`, { recipient_ids: recipientIds }),
  recoverCampaign: (id) => api.post(`/bulk-sms/campaigns/${id}/recover`),
  testSMS: (data) => api.post('/bulk-sms/test', data),
  getRecipients: (id, status) => api.get(`/bulk-sms/campaigns/${id}/recipients`, { 
    params: status ? { status } : {} 
  }),
  getNumbers: () => api.get('/bulk-sms/numbers'),
  getOptOuts: () => api.get('/bulk-sms/opt-outs'),
  diagnose: () => api.get('/bulk-sms/diagnose'),
  debugOptOuts: () => api.get('/bulk-sms/debug-opt-outs'),
};

// Contacts API
export const contactsAPI = {
  getContacts: (params) => api.get('/contacts', { params }),
  getContact: (id) => api.get(`/contacts/${id}`),
  createContact: (data) => api.post('/contacts', data),
  updateContact: (id, data) => api.put(`/contacts/${id}`, data),
  deleteContact: (id) => api.delete(`/contacts/${id}`),
  uploadContacts: (formData) => api.post('/contacts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getLists: () => api.get('/contacts/lists/all'),
  createList: (data) => api.post('/contacts/lists', data),
  getList: (id) => api.get(`/contacts/lists/${id}`),
  updateList: (id, data) => api.put(`/contacts/lists/${id}`, data),
  deleteList: (id) => api.delete(`/contacts/lists/${id}`),
  addContactToList: (listId, contactId) => api.post(`/contacts/lists/${listId}/contacts`, { contact_id: contactId }),
  removeContactFromList: (listId, contactId) => api.delete(`/contacts/lists/${listId}/contacts/${contactId}`),
  toggleOptOut: (contactId, optedOut) => api.post(`/contacts/${contactId}/opt-out`, { opted_out: optedOut }),
  syncOptOuts: () => api.post('/contacts/sync-opt-outs'),
};

