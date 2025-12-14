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
        
        // Check if it looks like an area code (3 digits for US/Canada)
        // If so, use national_destination_code filter instead
        if (cleanNumber.length === 3 && /^\d{3}$/.test(cleanNumber)) {
          // It's an area code - use national_destination_code filter
          params.set('filter[country_code]', countryCode);
          params.set('filter[phone_number_type]', phoneType);
          params.append('filter[national_destination_code]', cleanNumber);
          params.set('page[size]', limit.toString());
          console.log('Treating as area code search:', cleanNumber);
        } else {
          // It's a longer number - search without filters and filter client-side
          // Telnyx doesn't have a reliable starts_with filter, so we'll get all numbers
          // and filter client-side
          params.set('filter[country_code]', countryCode);
          params.set('filter[phone_number_type]', phoneType);
          params.set('page[size]', '200'); // Get more results for client-side filtering
          console.log('Treating as phone number prefix search:', cleanNumber);
        }
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

        // Add area code filter if provided
        // Telnyx uses 'national_destination_code' for area code filtering
        if (areaCode) {
          // Clean area code (remove non-digits)
          const cleanAreaCode = areaCode.replace(/\D/g, '');
          // Telnyx API uses national_destination_code for area code
          params.append('filter[national_destination_code]', cleanAreaCode);
          // Also log what we're sending for debugging
          console.log('Searching with area code (national_destination_code) filter:', cleanAreaCode);
        }
      }

      const apiUrl = `/available_phone_numbers?${params.toString()}`;
      console.log('Telnyx API request URL:', apiUrl);
      
      const result = await this.makeAPIRequest('GET', apiUrl);
      
      console.log('Telnyx API response:', {
        hasData: !!result.data,
        dataLength: result.data?.length || 0,
        firstResult: result.data?.[0] || null,
      });

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
          
          // If it's a 3-digit area code, we already filtered by national_destination_code
          // Otherwise, filter by phone number prefix
          if (cleanSearch.length !== 3 || !/^\d{3}$/.test(cleanSearch)) {
            numbers = numbers.filter((phone) => {
              // Remove formatting from phone number for comparison
              const cleanPhone = phone.phone_number.replace(/[\s\-\(\)\+]/g, '');
              // Check if phone number starts with the search term (exact prefix match)
              // Also check with country code prefix (1 for US/Canada)
              return cleanPhone.startsWith(cleanSearch) || 
                     cleanPhone.startsWith('1' + cleanSearch);
            });
          }
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
      // Clean phone number - Telnyx expects E.164 format WITH + prefix
      // Remove spaces, dashes, parentheses but keep the +
      let cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
      
      // Ensure it starts with + for E.164 format
      if (!cleanNumber.startsWith('+')) {
        // If it's 10 digits, assume US and add +1
        if (cleanNumber.length === 10) {
          cleanNumber = '+1' + cleanNumber;
        } else if (cleanNumber.length === 11 && cleanNumber.startsWith('1')) {
          // Already has country code, just add +
          cleanNumber = '+' + cleanNumber;
        } else {
          // Try to add +1 for US/Canada
          cleanNumber = '+1' + cleanNumber;
        }
      }
      
      console.log('Purchasing phone number - original:', phoneNumber, 'E.164 format:', cleanNumber);
      
      // Check if number already exists in account
      try {
        const numberInfo = await this.getPhoneNumberInfo(cleanNumber);
        if (numberInfo && numberInfo.phone_number) {
          console.log('Number already exists in account:', numberInfo);
          return {
            success: true,
            phone_number: numberInfo.phone_number,
            phone_number_id: numberInfo.id,
          };
        }
      } catch (infoError) {
        // Number doesn't exist in account, continue to purchase
        console.log('Number not in account, proceeding with purchase');
      }
      
      // Skip availability check - if the number came from our search results, it's available
      // Just try to purchase it directly
      console.log('Attempting direct purchase of:', cleanNumber);
      
      // Telnyx requires phone_number in the request body
      // Make sure we're using the exact E.164 format
      const purchasePayload = {
        phone_number: cleanNumber, // E.164 format with +
      };
      
      console.log('Purchase request payload:', JSON.stringify(purchasePayload, null, 2));
      console.log('Purchase endpoint: POST /phone_numbers');
      console.log('Full URL will be:', `${TELNYX_API_URL}/phone_numbers`);
      
      let result;
      try {
        result = await this.makeAPIRequest('POST', '/phone_numbers', purchasePayload);
        console.log('Telnyx purchase response:', JSON.stringify(result, null, 2));
      } catch (purchaseError) {
        // Log the FULL error from Telnyx
        console.error('=== TELNYX PURCHASE ERROR ===');
        console.error('Error message:', purchaseError.message);
        console.error('Error response status:', purchaseError.response?.status);
        console.error('Error response data:', JSON.stringify(purchaseError.response?.data, null, 2));
        console.error('Full error object:', purchaseError);
        console.error('=== END TELNYX PURCHASE ERROR ===');
        throw purchaseError; // Re-throw to be handled by outer catch
      }

      // Check if result has data property (Telnyx wraps responses in { data: {...} })
      if (result && result.data) {
        return {
          success: true,
          phone_number: result.data.phone_number,
          phone_number_id: result.data.id,
        };
      }
      
      // Sometimes Telnyx returns the data directly, not wrapped
      if (result && result.phone_number) {
        return {
          success: true,
          phone_number: result.phone_number,
          phone_number_id: result.id,
        };
      }

      throw new Error('Failed to purchase phone number - unexpected response format from Telnyx');
    } catch (error) {
      console.error('Purchase phone number error:', error);
      console.error('Telnyx error response:', error.response?.data);
      console.error('Telnyx error status:', error.response?.status);
      
      // Log the full error for debugging
      if (error.response?.data) {
        console.error('Full Telnyx error data:', JSON.stringify(error.response.data, null, 2));
      }
      
      // Just throw the original error - let Telnyx's error message come through
      // Don't add our own confusing messages
      throw error;
    }
  }

  // Update phone number to route to webhook
  static async configurePhoneNumber(phoneNumberId, webhookUrl) {
    try {
      console.log('Configuring webhook - Phone Number ID:', phoneNumberId);
      console.log('Webhook URL:', webhookUrl);
      console.log('Endpoint: PATCH /phone_numbers/' + phoneNumberId);
      
      // First, try to get the phone number to verify it exists
      try {
        const phoneInfo = await this.makeAPIRequest('GET', `/phone_numbers/${phoneNumberId}`);
        console.log('Phone number exists:', phoneInfo.data?.phone_number);
      } catch (getError) {
        console.error('Could not fetch phone number:', getError.message);
        // Continue anyway - maybe the ID format is different
      }
      
      // Configure webhook, connection/application, and messaging profile
      const updatePayload = {
        webhook_url: webhookUrl,
        webhook_url_method: 'POST',
      };
      
      // Set connection_id if available (for SIP trunking)
      if (process.env.TELNYX_CONNECTION_ID) {
        updatePayload.connection_id = process.env.TELNYX_CONNECTION_ID;
        console.log('Setting connection_id:', process.env.TELNYX_CONNECTION_ID);
      }
      
      // Set voice_application_id if available (for Voice API Applications)
      // This takes precedence over connection_id if both are set
      if (process.env.TELNYX_VOICE_APPLICATION_ID) {
        updatePayload.voice_application_id = process.env.TELNYX_VOICE_APPLICATION_ID;
        console.log('Setting voice_application_id:', process.env.TELNYX_VOICE_APPLICATION_ID);
      }
      
      // Set messaging_profile_id if available (for SMS/MMS)
      if (process.env.TELNYX_MESSAGING_PROFILE_ID) {
        updatePayload.messaging_profile_id = process.env.TELNYX_MESSAGING_PROFILE_ID;
        console.log('Setting messaging_profile_id:', process.env.TELNYX_MESSAGING_PROFILE_ID);
      }
      
      console.log('Update payload:', JSON.stringify(updatePayload, null, 2));
      
      const result = await this.makeAPIRequest('PATCH', `/phone_numbers/${phoneNumberId}`, updatePayload);

      console.log('Webhook configuration result:', JSON.stringify(result, null, 2));

      return {
        success: true,
        phone_number_id: phoneNumberId,
      };
    } catch (error) {
      console.error('Configure phone number error:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw error;
    }
  }

  // Purchase and assign phone number to business
  // SIMPLIFIED: Number came from frontend search, so format is correct. Just purchase it.
  static async purchaseAndAssignPhoneNumber(businessId, phoneNumber, countryCode = 'US') {
    try {
      console.log('=== DIRECT PURCHASE ===');
      console.log('Purchasing number (from frontend search):', phoneNumber);
      
      // Ensure number is in E.164 format (with +)
      let cleanNumber = phoneNumber.trim();
      if (!cleanNumber.startsWith('+')) {
        cleanNumber = '+' + cleanNumber.replace(/^\+/, '');
      }
      // Remove spaces, dashes, parentheses but keep +
      cleanNumber = cleanNumber.replace(/[\s\-\(\)]/g, '');
      
      console.log('Cleaned number:', cleanNumber);
      
      // Try both endpoints - Number Orders first, then direct
      let purchaseResult;
      let purchaseMethod = 'unknown';
      
      // Method 1: Number Orders endpoint (with configuration in purchase request)
      try {
        console.log('Method 1: Trying Number Orders endpoint...');
        const numberOrderPayload = {
          phone_numbers: [{
            phone_number: cleanNumber
          }]
        };
        
        // Set configuration DURING purchase (more reliable than updating after)
        if (process.env.TELNYX_VOICE_APPLICATION_ID) {
          numberOrderPayload.phone_numbers[0].voice_application_id = process.env.TELNYX_VOICE_APPLICATION_ID;
          console.log('Setting voice_application_id in purchase request:', process.env.TELNYX_VOICE_APPLICATION_ID);
        }
        
        if (process.env.TELNYX_MESSAGING_PROFILE_ID) {
          numberOrderPayload.phone_numbers[0].messaging_profile_id = process.env.TELNYX_MESSAGING_PROFILE_ID;
          console.log('Setting messaging_profile_id in purchase request:', process.env.TELNYX_MESSAGING_PROFILE_ID);
        }
        
        console.log('Number Order payload:', JSON.stringify(numberOrderPayload, null, 2));
        purchaseResult = await this.makeAPIRequest('POST', '/number_orders', numberOrderPayload);
        purchaseMethod = 'number_orders';
        console.log('SUCCESS with Number Orders');
      } catch (orderError) {
        console.log('Number Orders failed:', orderError.message);
        console.log('Order error response:', JSON.stringify(orderError.response?.data, null, 2));
        
        // Method 2: Direct phone_numbers endpoint
        try {
          console.log('Method 2: Trying direct phone_numbers endpoint...');
          const directPayload = {
            phone_number: cleanNumber
          };
          console.log('Direct payload:', JSON.stringify(directPayload, null, 2));
          purchaseResult = await this.makeAPIRequest('POST', '/phone_numbers', directPayload);
          purchaseMethod = 'phone_numbers';
          console.log('SUCCESS with direct phone_numbers');
        } catch (directError) {
          console.log('Direct purchase also failed:', directError.message);
          console.log('Direct error response:', JSON.stringify(directError.response?.data, null, 2));
          throw new Error(`Both purchase methods failed. Number Orders: ${orderError.message}. Direct: ${directError.message}`);
        }
      }
      
      console.log('Purchase result:', JSON.stringify(purchaseResult, null, 2));
      
      // Parse response based on which method succeeded
      let phoneNumberId, purchasedNumber;
      
      if (purchaseMethod === 'number_orders') {
        // Number Orders returns: { data: { phone_numbers: [{ id, phone_number }] } }
        if (purchaseResult.data?.phone_numbers && purchaseResult.data.phone_numbers.length > 0) {
          phoneNumberId = purchaseResult.data.phone_numbers[0].id;
          purchasedNumber = purchaseResult.data.phone_numbers[0].phone_number;
        } else {
          throw new Error('Number Order succeeded but no phone numbers in response');
        }
      } else {
        // Direct purchase returns: { data: { id, phone_number } }
        if (purchaseResult.data?.id && purchaseResult.data?.phone_number) {
          phoneNumberId = purchaseResult.data.id;
          purchasedNumber = purchaseResult.data.phone_number;
        } else {
          throw new Error('Direct purchase succeeded but missing id or phone_number in response');
        }
      }
      
      console.log('Extracted - ID:', phoneNumberId, 'Number:', purchasedNumber);
      
      if (!phoneNumberId) {
        throw new Error('Failed to extract phone number ID from purchase response');
      }
      
      console.log('Step 4: Configuring webhook for number:', purchasedNumber, 'ID:', phoneNumberId);
      
      // Configure webhook URL - but don't fail if it doesn't work
      const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'http://localhost:5001'}/api/calls/webhook`;
      try {
        await this.configurePhoneNumber(phoneNumberId, webhookUrl);
        console.log('Webhook configured successfully');
      } catch (webhookError) {
        console.error('Webhook configuration failed (non-fatal):', webhookError.message);
        console.error('Phone number purchased but webhook not configured. You can configure it manually in Telnyx dashboard.');
        // Don't throw - the number was purchased successfully
      }

      // Update business record
      await Business.setTelnyxNumber(businessId, purchasedNumber);

      console.log('=== PURCHASE SUCCESS ===');
      
      return {
        success: true,
        phone_number: purchasedNumber,
        phone_number_id: phoneNumberId,
      };
    } catch (error) {
      console.error('=== PURCHASE AND ASSIGN ERROR ===');
      console.error('Error:', error.message);
      console.error('Response:', error.response?.data);
      console.error('Status:', error.response?.status);
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

