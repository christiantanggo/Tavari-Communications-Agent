import dotenv from 'dotenv';
import axios from 'axios';
import { Business } from '../models/Business.js';
import { CallSession } from '../models/CallSession.js';

dotenv.config();

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_URL = 'https://api.telnyx.com/v2';

export class TelnyxService {
  // Make authenticated API request to Telnyx
  static async makeAPIRequest(method, endpoint, data = null) {
    if (!TELNYX_API_KEY) {
      throw new Error('Telnyx API key not configured. Please set TELNYX_API_KEY in your .env file.');
    }

    // Clean the API key - remove any whitespace, newlines, or invalid characters
    const cleanApiKey = TELNYX_API_KEY.trim().replace(/\s+/g, '');

    try {
      const config = {
        method,
        url: `${TELNYX_API_URL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${cleanApiKey}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      };

      if (data && method !== 'GET') {
        config.data = data;
      }

      const response = await axios(config);
      
      console.log(`Telnyx API ${method} ${endpoint}:`, response.status, response.data);

      // Check for errors
      if (response.status >= 400) {
        const errorMsg = response.data?.errors?.[0]?.detail || 
                        response.data?.errors?.[0]?.title || 
                        response.data?.error || 
                        `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      return response.data;
    } catch (error) {
      console.error('Telnyx API error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      if (error.response?.status === 401) {
        throw new Error('Telnyx authentication failed. Please check your TELNYX_API_KEY in your .env file.');
      }
      if (error.response?.data?.errors) {
        throw new Error(error.response.data.errors[0].detail || error.response.data.errors[0].title || 'Telnyx API error');
      }

      throw new Error(error.message || 'Telnyx API request failed');
    }
  }

  // Parse inbound call data from Telnyx webhook
  static parseInboundCall(req) {
    const {
      data: {
        event_type,
        payload: {
          call_control_id,
          call_leg_id,
          call_session_id,
          connection_id,
          from,
          to,
          direction,
        } = {},
      } = {},
    } = req.body;

    // Telnyx uses different field names
    return {
      telnyx_call_id: call_control_id || call_leg_id || call_session_id,
      caller_number: from?.phone_number || from,
      called_number: to?.phone_number || to,
      call_type: direction === 'inbound' ? 'inbound' : 'outbound',
      connection_id,
      headers: {},
    };
  }

  // Find business by phone number
  static async findBusinessByNumber(called_number) {
    const { supabaseClient } = await import('../config/database.js');
    
    // Normalize the number (remove + and format)
    const normalizedNumber = called_number.replace(/^\+/, '');
    const withPlus = `+${normalizedNumber}`;
    
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .or(`telnyx_number.eq.${normalizedNumber},telnyx_number.eq.${withPlus}`)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // Create call session
  static async createCallSession(business_id, callData) {
    return CallSession.create({
      business_id,
      voximplant_call_id: callData.telnyx_call_id, // Reusing field name for compatibility
      caller_number: callData.caller_number,
      status: 'ringing',
    });
  }

  // Search for available phone numbers
  static async searchPhoneNumbers(countryCode = 'US', phoneType = 'local', limit = 20, locality = null, administrativeArea = null, areaCode = null, phoneNumberSearch = null) {
    try {
      const params = new URLSearchParams();

      // If searching for a specific phone number, use that filter only
      if (phoneNumberSearch) {
        // Clean the phone number (remove +, spaces, dashes, parentheses)
        let cleanNumber = phoneNumberSearch.replace(/[\s\-\(\)\+]/g, '');
        
        // Don't add country code automatically - let user search by what they type
        // If they type "1", show numbers starting with 1
        // If they type "415", show numbers starting with 415
        
        // Use Telnyx starts_with filter for prefix matching
        // Increase limit to get more results for client-side filtering
        params.set('filter[country_code]', countryCode); // Still filter by country
        params.set('filter[phone_number][starts_with]', cleanNumber);
        params.set('page[size]', '100'); // Get more results to filter client-side
      } else {
        // Normal browse search with filters
        params.set('filter[country_code]', countryCode);
        params.set('filter[phone_number_type]', phoneType); // 'local', 'toll-free', 'mobile'
        params.set('page[size]', limit.toString());

        // Add city/region filter if provided
        if (locality) {
          params.append('filter[locality]', locality);
        }

        // Add state/province filter if provided
        if (administrativeArea) {
          params.append('filter[administrative_area]', administrativeArea);
        }

        // Add area code filter if provided (national_destination_code)
        if (areaCode) {
          // Clean area code (remove non-digits)
          const cleanAreaCode = areaCode.replace(/\D/g, '');
          params.append('filter[national_destination_code]', cleanAreaCode);
        }
      }

      const result = await this.makeAPIRequest('GET', `/available_phone_numbers?${params.toString()}`);

      if (result.data && Array.isArray(result.data)) {
        let numbers = result.data.map((phone) => ({
          phone_number: phone.phone_number,
          phone_price: phone.cost_information?.monthly_cost || 0,
          phone_category_name: phone.phone_number_type || 'local',
          country_code: phone.region_information?.country_code || countryCode,
          locality: phone.region_information?.locality || null, // City
          administrative_area: phone.region_information?.administrative_area || null, // State/Province
          can_send_sms: phone.features?.sms || false,
          features: phone.features || {},
        }));

        // Client-side filtering: ensure numbers START with the search term (prefix match)
        // This ensures that typing "1" shows numbers starting with 1, "15" shows numbers starting with 15, etc.
        if (phoneNumberSearch) {
          const cleanSearch = phoneNumberSearch.replace(/[\s\-\(\)\+]/g, '');
          
          numbers = numbers.filter((phone) => {
            // Remove formatting from phone number for comparison
            const cleanPhone = phone.phone_number.replace(/[\s\-\(\)\+]/g, '');
            // Check if phone number starts with the search term (exact prefix match)
            return cleanPhone.startsWith(cleanSearch);
          });
        }

        // Limit results to requested limit
        return numbers.slice(0, limit);
      }

      return [];
    } catch (error) {
      console.error('Search phone numbers error:', error);
      throw error;
    }
  }

  // Purchase a phone number
  static async purchasePhoneNumber(phoneNumber) {
    try {
      // Telnyx uses "purchase" endpoint
      const result = await this.makeAPIRequest('POST', '/phone_numbers', {
        phone_number: phoneNumber,
      });

      if (result.data) {
        return {
          success: true,
          phone_number: result.data.phone_number,
          phone_number_id: result.data.id,
        };
      }

      throw new Error('Failed to purchase phone number');
    } catch (error) {
      console.error('Purchase phone number error:', error);
      throw error;
    }
  }

  // Update phone number to route to webhook
  static async configurePhoneNumber(phoneNumberId, webhookUrl) {
    try {
      const result = await this.makeAPIRequest('PATCH', `/phone_numbers/${phoneNumberId}`, {
        webhook_url: webhookUrl,
        webhook_url_method: 'POST',
      });

      return {
        success: true,
        phone_number_id: phoneNumberId,
      };
    } catch (error) {
      console.error('Configure phone number error:', error);
      throw error;
    }
  }

  // Purchase and assign phone number to business
  static async purchaseAndAssignPhoneNumber(businessId, phoneNumber, countryCode = 'US') {
    try {
      // Step 1: Purchase the phone number
      const purchaseResult = await this.purchasePhoneNumber(phoneNumber);
      const phoneNumberId = purchaseResult.phone_number_id;

      // Step 2: Configure webhook URL
      const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'http://localhost:5001'}/api/calls/webhook`;
      await this.configurePhoneNumber(phoneNumberId, webhookUrl);

      // Step 3: Update business record (format with + prefix for display)
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      await Business.setTelnyxNumber(businessId, formattedNumber);

      return {
        success: true,
        phone_number: formattedNumber,
        phone_number_id: phoneNumberId,
      };
    } catch (error) {
      console.error('Purchase and assign phone number error:', error);
      throw error;
    }
  }

  // Handle call start (webhook response)
  static async handleCallStart(callData) {
    // Find business by called number
    const business = await this.findBusinessByNumber(callData.called_number);

    if (!business) {
      throw new Error('Business not found for this number');
    }

    // Create call session
    const callSession = await this.createCallSession(business.id, callData);

    // Get server URL for WebSocket
    const serverUrl = process.env.SERVER_URL || process.env.WEBHOOK_BASE_URL || 'localhost:5001';
    const wsProtocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = serverUrl.replace(/^https?:\/\//, '');
    const audioWebSocketUrl = `${wsProtocol}://${wsHost}/api/calls/${callSession.id}/audio`;

    // Return Telnyx call control commands
    // Telnyx Call Control API uses specific command format
    // Note: This is a simplified version - actual implementation may need
    // to use Telnyx Call Control API to answer and stream
    return {
      callSession,
      business,
      commands: [
        {
          command: 'answer',
        },
        {
          command: 'stream',
          stream_url: audioWebSocketUrl,
        },
      ],
    };
  }

  // Handle call end
  static async handleCallEnd(telnyx_call_id, duration_seconds) {
    const callSession = await CallSession.findByVoximplantCallId(telnyx_call_id);

    if (callSession) {
      await CallSession.update(callSession.id, {
        status: 'ended',
        ended_at: new Date(),
        duration_seconds,
      });
    }
  }

  // Get phone number info
  static async getPhoneNumberInfo(phoneNumber) {
    try {
      const params = new URLSearchParams({
        'filter[phone_number]': phoneNumber,
      });
      const result = await this.makeAPIRequest('GET', `/phone_numbers?${params.toString()}`);

      if (result.data && result.data.length > 0) {
        return result.data[0];
      }

      return null;
    } catch (error) {
      console.error('Get phone number info error:', error);
      return null;
    }
  }
}

