import dotenv from 'dotenv';
import axios from 'axios';
import { Business } from '../models/Business.js';
import { CallSession } from '../models/CallSession.js';

dotenv.config();

const VOXIMPLANT_ACCOUNT_ID = process.env.VOXIMPLANT_ACCOUNT_ID;
const VOXIMPLANT_APPLICATION_ID = process.env.VOXIMPLANT_APPLICATION_ID;
const VOXIMPLANT_API_KEY = process.env.VOXIMPLANT_API_KEY;
const VOXIMPLANT_ACCOUNT_NAME = process.env.VOXIMPLANT_ACCOUNT_NAME;
const VOXIMPLANT_API_URL = 'https://api.voximplant.com/platform_api';

export class VoximplantService {
  // Parse inbound call data from Voximplant
  static parseInboundCall(req) {
    const {
      call_session_id,
      call_id,
      caller_id,
      called_did,
      call_type,
      headers,
    } = req.body;
    
    return {
      voximplant_call_id: call_session_id || call_id,
      caller_number: caller_id,
      called_number: called_did,
      call_type: call_type || 'inbound',
      headers: headers || {},
    };
  }
  
  // Find business by Voximplant number
  static async findBusinessByNumber(called_number) {
    const { query } = await import('../config/database.js');
    const result = await query(
      'SELECT * FROM businesses WHERE voximplant_number = $1 AND deleted_at IS NULL',
      [called_number]
    );
    return result.rows[0];
  }
  
  // Create call session
  static async createCallSession(business_id, callData) {
    return CallSession.create({
      business_id,
      voximplant_call_id: callData.voximplant_call_id,
      caller_number: callData.caller_number,
      status: 'ringing',
    });
  }
  
  // Generate Voximplant scenario XML
  static generateScenario(callSessionId, audioWebSocketUrl) {
    // Get the server URL - use environment variable or construct from request
    const serverUrl = process.env.SERVER_URL || process.env.WEBHOOK_BASE_URL || 'localhost:5001';
    const wsUrl = audioWebSocketUrl || `ws://${serverUrl}/api/calls/${callSessionId}/audio`;
    
    // This scenario connects the call to our WebSocket server for AI processing
    // Voximplant will call our webhook, and we return this scenario XML
    return `<?xml version="1.0" encoding="UTF-8"?>
<scenario>
  <param name="callSessionId" value="${callSessionId}"/>
  <action name="answer"/>
  <action name="set" value="${wsUrl}"/>
  <action name="transfer" value="websocket"/>
</scenario>`;
  }
  
  // Handle call start
  static async handleCallStart(callData) {
    // Find business by called number
    const business = await this.findBusinessByNumber(callData.called_number);
    
    if (!business) {
      throw new Error('Business not found for this number');
    }
    
    // Create call session
    const callSession = await this.createCallSession(business.id, callData);
    
    return {
      callSession,
      business,
      scenario: this.generateScenario(callSession.id, null),
    };
  }
  
  // Handle call end
  static async handleCallEnd(voximplant_call_id, duration_seconds) {
    const callSession = await CallSession.findByVoximplantCallId(voximplant_call_id);
    
    if (callSession) {
      await CallSession.update(callSession.id, {
        status: 'ended',
        ended_at: new Date(),
        duration_seconds,
      });
    }
    
    return callSession;
  }

  // Make authenticated API request to Voximplant
  static async makeAPIRequest(method, params = {}) {
    if (!VOXIMPLANT_ACCOUNT_NAME || !VOXIMPLANT_API_KEY) {
      throw new Error('Voximplant credentials not configured. Please set VOXIMPLANT_ACCOUNT_NAME and VOXIMPLANT_API_KEY in your .env file.');
    }
    
    // Voximplant uses account_name:api_key for Basic Auth
    // Remove .voximplant.com from account name if present (some APIs need just the account part)
    let accountName = VOXIMPLANT_ACCOUNT_NAME.trim();
    if (accountName.includes('.voximplant.com')) {
      accountName = accountName.replace('.voximplant.com', '');
    }
    const apiKey = VOXIMPLANT_API_KEY.trim();
    const auth = Buffer.from(`${accountName}:${apiKey}`).toString('base64');
    
    try {
      // Voximplant Management API format
      const requestParams = {
        account_id: VOXIMPLANT_ACCOUNT_ID,
        ...params,
      };
      
      console.log(`Making Voximplant API request: ${method}`, { 
        account_id: VOXIMPLANT_ACCOUNT_ID,
        account_name: accountName,
        has_api_key: !!apiKey,
        params: { ...requestParams, account_id: '[REDACTED]' }
      });
      
      // Voximplant Management API uses account_id + api_key (verified working format)
      // Remove account_id from params if it exists to avoid duplication
      const { account_id: _, ...paramsWithoutAccountId } = params;
      
      const response = await axios.post(
        `${VOXIMPLANT_API_URL}?cmd=${method}`,
        new URLSearchParams({
          account_id: VOXIMPLANT_ACCOUNT_ID,
          api_key: apiKey,
          ...paramsWithoutAccountId,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          validateStatus: () => true,
        }
      );
      
      console.log('Voximplant API response:', response.status, response.data);
      
      // Check for HTTP errors
      if (response.status !== 200) {
        const errorMsg = response.data?.error?.msg || response.data?.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }
      
      // Check for API errors in response body
      if (response.data && response.data.error) {
        const error = response.data.error;
        const errorMsg = error.msg || error || 'Voximplant API error';
        const apiError = new Error(errorMsg);
        // Preserve error code for specific handling
        apiError.code = error.code;
        apiError.voximplantError = error;
        throw apiError;
      }
      
      return response.data;
    } catch (error) {
      console.error('Voximplant API error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      
      // Provide more helpful error messages
      if (error.response?.status === 401) {
        throw new Error('Voximplant authentication failed. Please check your VOXIMPLANT_ACCOUNT_NAME and VOXIMPLANT_API_KEY.');
      }
      if (error.response?.status === 404) {
        throw new Error('Voximplant API endpoint not found. Please check the API URL format.');
      }
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.msg || error.response.data.error || 'Voximplant API error');
      }
      
      throw new Error(error.message || 'Voximplant API request failed');
    }
  }

  // Search for available phone numbers
  static async searchPhoneNumbers(countryCode = 'US', phoneCategoryName = 'GEOGRAPHIC', count = 10) {
    try {
      // Voximplant GetNewPhoneNumbers works with just country_code and count
      // If phone_category_name is provided, it requires phone_region_id instead
      // So we'll use the simpler format: country_code + count only
      const result = await this.makeAPIRequest('GetNewPhoneNumbers', {
        country_code: countryCode,
        count: count,
      });
      
      console.log('Voximplant search result:', JSON.stringify(result, null, 2));
      
      // Handle empty result (no numbers available)
      if (result.result && Array.isArray(result.result) && result.result.length === 0) {
        console.log('No phone numbers available for country:', countryCode);
        return []; // Return empty array instead of throwing error
      }
      
      if (result.count === 0 || result.total_count === 0) {
        console.log('No phone numbers available for country:', countryCode);
        return []; // Return empty array instead of throwing error
      }
      
      // Handle different response formats
      // Format 1: result is an array of phone numbers
      if (Array.isArray(result.result) && result.result.length > 0) {
        return result.result.map((phone) => ({
          phone_number: phone.phone_number || phone,
          phone_price: phone.phone_price || 0,
          phone_category_name: phone.phone_category_name || 'GEOGRAPHIC',
          country_code: phone.country_code || countryCode,
          can_send_sms: phone.can_send_sms || false,
        }));
      }
      
      // Format 2: result.phone_numbers is an array
      if (result.phone_numbers && Array.isArray(result.phone_numbers) && result.phone_numbers.length > 0) {
        return result.phone_numbers.map((phone) => ({
          phone_number: phone.phone_number || phone,
          phone_price: phone.phone_price || 0,
          phone_category_name: phone.phone_category_name || 'GEOGRAPHIC',
          country_code: phone.country_code || countryCode,
          can_send_sms: phone.can_send_sms || false,
        }));
      }
      
      // Format 3: result.result is a single phone number (string)
      if (result.result && typeof result.result === 'string') {
        return [{
          phone_number: result.result,
          phone_price: 0,
          phone_category_name: 'GEOGRAPHIC',
          country_code: countryCode,
          can_send_sms: false,
        }];
      }
      
      // Format 4: result.result is a number (success code) but no phone_numbers
      if (result.result && typeof result.result === 'number') {
        // Check if there's a phone_numbers array elsewhere
        if (result.phone_numbers && Array.isArray(result.phone_numbers) && result.phone_numbers.length > 0) {
          return result.phone_numbers.map((phone) => ({
            phone_number: phone.phone_number || phone,
            phone_price: phone.phone_price || 0,
            phone_category_name: phone.phone_category_name || 'GEOGRAPHIC',
            country_code: phone.country_code || countryCode,
            can_send_sms: phone.can_send_sms || false,
          }));
        }
        // If result is just a success code, no numbers available
        return []; // Return empty array instead of throwing error
      }
      
      // If we get here, no numbers were found - return empty array
      console.log('No phone numbers found in response for country:', countryCode);
      return [];
    } catch (error) {
      console.error('Search phone numbers error:', error);
      // Re-throw with a user-friendly message
      if (error.message.includes('No phone numbers')) {
        throw error;
      }
      throw new Error(error.message || 'Failed to search phone numbers. Please check your Voximplant credentials and try again.');
    }
  }

  // Purchase and attach a phone number
  static async purchasePhoneNumber(phoneNumber, countryCode = 'US') {
    try {
      // Ensure phone number is in correct format (no + prefix, just digits)
      const cleanNumber = phoneNumber.replace(/^\+/, '').replace(/\D/g, '');
      
      const result = await this.makeAPIRequest('AttachPhoneNumber', {
        phone_number: cleanNumber,
        country_code: countryCode,
      });
      
      if (result.result && result.result === 1) {
        return {
          success: true,
          phone_number: cleanNumber,
        };
      }
      
      // If result is not 1, it might be an error
      if (result.result !== 1 && result.result !== undefined) {
        console.error('Unexpected AttachPhoneNumber result:', result);
        throw new Error('Failed to purchase phone number. Unexpected response from Voximplant.');
      }
      
      throw new Error('Failed to purchase phone number');
    } catch (error) {
      console.error('Purchase phone number error:', error);
      
      // Check if the number is already owned - this is actually OK, we can still use it
      if (error.message && error.message.includes('phone number is yours')) {
        console.log('Phone number is already owned by account - this is OK, proceeding to bind it.');
        return {
          success: true,
          phone_number: phoneNumber.replace(/^\+/, '').replace(/\D/g, ''),
          alreadyOwned: true,
        };
      }
      
      // Check if the number is already owned - this is actually OK, we can still use it
      if (error.message && (error.message.includes('phone number is yours') || error.message.includes('is yours'))) {
        console.log('Phone number is already owned by account - this is OK, proceeding to bind it.');
        const cleanNumber = phoneNumber.replace(/^\+/, '').replace(/\D/g, '');
        return {
          success: true,
          phone_number: cleanNumber,
          alreadyOwned: true,
        };
      }
      
      // Check for specific Voximplant error codes
      if (error.code === 127) {
        throw new Error('Insufficient funds. Please add funds to your Voximplant account to purchase phone numbers.');
      }
      if (error.code === 121) {
        throw new Error('Invalid phone number format. Please try selecting a different number.');
      }
      
      // Re-throw the error (might already have a good message)
      throw error;
    }
  }

  // Bind phone number to application
  static async bindPhoneNumberToApplication(phoneNumber, applicationId = null) {
    try {
      const appId = applicationId || VOXIMPLANT_APPLICATION_ID;
      
      // Ensure phone number is in correct format (no + prefix, just digits)
      const cleanNumber = phoneNumber.replace(/^\+/, '').replace(/\D/g, '');
      
      const result = await this.makeAPIRequest('BindPhoneNumberToApplication', {
        phone_number: cleanNumber,
        application_id: appId,
        application_name: null, // Use application_id instead
      });
      
      if (result.result && result.result === 1) {
        return {
          success: true,
          phone_number: phoneNumber,
          application_id: appId,
        };
      }
      
      throw new Error('Failed to bind phone number to application');
    } catch (error) {
      console.error('Bind phone number error:', error);
      throw error;
    }
  }

  // Purchase and assign phone number to business (complete flow)
  static async purchaseAndAssignPhoneNumber(businessId, phoneNumber, countryCode = 'US') {
    try {
      // Step 1: Purchase the phone number (or verify it's already owned)
      const purchaseResult = await this.purchasePhoneNumber(phoneNumber, countryCode);
      const cleanNumber = purchaseResult.phone_number;
      
      // Step 2: Bind it to the application
      await this.bindPhoneNumberToApplication(cleanNumber);
      
      // Step 3: Update business record (format with + prefix for display)
      const formattedNumber = cleanNumber.startsWith('+') ? cleanNumber : `+${cleanNumber}`;
      console.log('Updating business record with phone number:', formattedNumber);
      const updatedBusiness = await Business.setVoximplantNumber(businessId, formattedNumber);
      console.log('Business updated successfully:', {
        id: updatedBusiness.id,
        voximplant_number: updatedBusiness.voximplant_number,
      });
      
      // Verify the update worked
      const verifyBusiness = await Business.findById(businessId);
      if (verifyBusiness.voximplant_number !== formattedNumber) {
        console.error('WARNING: Phone number update verification failed!', {
          expected: formattedNumber,
          actual: verifyBusiness.voximplant_number,
        });
        throw new Error('Failed to update phone number in database. Please try again.');
      }
      
      return {
        success: true,
        phone_number: formattedNumber,
        alreadyOwned: purchaseResult.alreadyOwned || false,
      };
    } catch (error) {
      console.error('Purchase and assign phone number error:', error);
      throw error;
    }
  }

  // Get phone number info
  static async getPhoneNumberInfo(phoneNumber) {
    try {
      const result = await this.makeAPIRequest('GetPhoneNumbers', {
        phone_number: phoneNumber,
      });
      
      if (result.result && result.result.length > 0) {
        return result.result[0];
      }
      
      return null;
    } catch (error) {
      console.error('Get phone number info error:', error);
      throw error;
    }
  }
}

