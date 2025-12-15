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
    console.log('Creating call session for business:', business_id);
    console.log('Call data:', JSON.stringify(callData, null, 2));
    
    try {
      const session = await CallSession.create({
        business_id,
        voximplant_call_id: callData.telnyx_call_id, // Reusing field name for compatibility
        caller_number: callData.caller_number,
        status: 'ringing',
      });
      
      console.log('✅ Call session created successfully:', session.id);
      console.log('Call session data:', JSON.stringify(session, null, 2));
      
      return session;
    } catch (error) {
      console.error('❌ Failed to create call session:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
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
      
      // Configure voice settings using the dedicated /voice endpoint
      // Note: messaging_profile_id must be set via separate /messaging endpoint
      const voiceUpdatePayload = {};
      
      // Set connection_id if available (for SIP trunking or Voice API Applications)
      // Voice API Applications use connection_id, not voice_application_id
      if (process.env.TELNYX_VOICE_APPLICATION_ID) {
        voiceUpdatePayload.connection_id = process.env.TELNYX_VOICE_APPLICATION_ID;
        console.log('Setting connection_id (Voice API Application):', process.env.TELNYX_VOICE_APPLICATION_ID);
      } else if (process.env.TELNYX_CONNECTION_ID) {
        voiceUpdatePayload.connection_id = process.env.TELNYX_CONNECTION_ID;
        console.log('Setting connection_id (SIP Connection):', process.env.TELNYX_CONNECTION_ID);
      }
      
      console.log('Voice update payload:', JSON.stringify(voiceUpdatePayload, null, 2));
      
      // Update voice settings using dedicated /voice endpoint
      const voiceResult = await this.makeAPIRequest('PATCH', `/phone_numbers/${phoneNumberId}/voice`, voiceUpdatePayload);
      console.log('Voice configuration result:', JSON.stringify(voiceResult, null, 2));
      
      // Configure webhook URL separately (on the main phone number endpoint)
      const webhookUpdatePayload = {
        webhook_url: webhookUrl,
        webhook_url_method: 'POST',
      };
      console.log('Webhook update payload:', JSON.stringify(webhookUpdatePayload, null, 2));
      const webhookResult = await this.makeAPIRequest('PATCH', `/phone_numbers/${phoneNumberId}`, webhookUpdatePayload);
      console.log('Webhook configuration result:', JSON.stringify(webhookResult, null, 2));
      
      // Configure messaging settings separately (required by Telnyx API)
      if (process.env.TELNYX_MESSAGING_PROFILE_ID) {
        console.log('Setting messaging_profile_id:', process.env.TELNYX_MESSAGING_PROFILE_ID);
        const messagingUpdatePayload = {
          messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
        };
        console.log('Messaging update payload:', JSON.stringify(messagingUpdatePayload, null, 2));
        
        // Use the dedicated messaging endpoint
        const messagingResult = await this.makeAPIRequest('PATCH', `/phone_numbers/${phoneNumberId}/messaging`, messagingUpdatePayload);
        console.log('Messaging configuration result:', JSON.stringify(messagingResult, null, 2));
      }
      
      const result = voiceResult;

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
      
      // Method 1: Number Orders endpoint (recommended by Telnyx)
      try {
        console.log('Method 1: Trying Number Orders endpoint...');
        const numberOrderPayload = {
          phone_numbers: [{
            phone_number: cleanNumber
          }]
        };
        
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
      
      console.log('Step 4: Configuring number (Voice API Application, Messaging Profile, and Webhook)...');
      console.log('  Number:', purchasedNumber);
      console.log('  ID:', phoneNumberId);
      
      // Configure Voice API Application, Messaging Profile, and Webhook URL
      // This MUST happen after purchase - Telnyx doesn't support setting these during purchase
      const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'http://localhost:5001'}/api/calls/webhook`;
      try {
        await this.configurePhoneNumber(phoneNumberId, webhookUrl);
        console.log('✅ Number fully configured:');
        console.log('   - Voice API Application:', process.env.TELNYX_VOICE_APPLICATION_ID || 'NOT SET');
        console.log('   - Messaging Profile:', process.env.TELNYX_MESSAGING_PROFILE_ID || 'NOT SET');
        console.log('   - Webhook URL:', webhookUrl);
      } catch (configError) {
        console.error('❌ Configuration failed:', configError.message);
        console.error('   Phone number was purchased but configuration failed.');
        console.error('   This means the number will NOT route calls/SMS automatically.');
        console.error('   Error details:', JSON.stringify(configError.response?.data, null, 2));
        // Don't throw - the number was purchased successfully, but log a warning
        console.warn('⚠️  WARNING: Number purchased but not fully configured. Manual configuration may be required.');
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
  // This should ONLY create the call session and answer the call
  // Streaming will be started in call.answered event handler
  static async handleCallStart(callData, callControlId) {
    console.log('🔵 handleCallStart() called');
    console.log('🔵 callData:', JSON.stringify(callData, null, 2));
    console.log('🔵 callControlId:', callControlId);
    
    // Find business by called number
    console.log('🔵 Finding business by number:', callData.called_number);
    const business = await this.findBusinessByNumber(callData.called_number);

    if (!business) {
      console.error('❌ Business not found for number:', callData.called_number);
      throw new Error('Business not found for this number');
    }
    console.log('✅ Business found:', business.id);

    // Create call session
    console.log('🔵 Creating call session...');
    const callSession = await this.createCallSession(business.id, callData);
    console.log('✅ Call session created:', callSession.id);

    // NOTE: Call is answered in the webhook handler (routes/calls.js) before this is called
    // This method now only handles business logic and session creation

    return {
      callSession,
      business,
      callControlId,
    };
  }

  // Start media stream for a call (called after call.answered)
  static async startMediaStream(callControlId) {
    if (!callControlId) {
      console.error('❌ Cannot start media stream: callControlId is required');
      throw new Error('callControlId is required to start media stream');
    }
    
    console.log('🔵 startMediaStream() called with callControlId:', callControlId);
    
    try {
      // Find the call session by call_control_id (stored in voximplant_call_id field)
      // Note: For Telnyx, we store call_control_id in the voximplant_call_id field
      console.log('🔵 Looking up call session by call_control_id:', callControlId);
      const callSession = await CallSession.findByVoximplantCallId(callControlId);
      
      if (!callSession) {
        console.error('❌ Cannot start media stream: call session not found for call_control_id:', callControlId);
        throw new Error(`Call session not found for call_control_id: ${callControlId}`);
      }
      
      console.log('✅ Call session found:', callSession.id);
      console.log('🔵 Starting media stream with session ID:', callSession.id);
      
      await this.startMediaStreamWithSessionId(callControlId, callSession.id);
      console.log('✅ Media stream started successfully');
    } catch (error) {
      console.error('❌ Failed to start media stream:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Error details:', error.response?.data || error);
      throw error;
    }
  }

  // Start media stream with explicit call session ID (used when we already have the session)
  static async startMediaStreamWithSessionId(callControlId, callSessionId) {
    if (!callControlId) {
      console.error('Cannot start media stream: callControlId is required');
      return;
    }
    
    if (!callSessionId) {
      console.error('Cannot start media stream: callSessionId is required');
      return;
    }
    
    try {
      console.log('🔵 Starting media stream for call:', callControlId);
      console.log('🔵 Call session ID:', callSessionId);
      
      // Get server URL for WebSocket
      const serverUrl = process.env.SERVER_URL || process.env.WEBHOOK_BASE_URL || 'https://api.tavarios.com';
      const wsProtocol = serverUrl.startsWith('https') ? 'wss' : 'ws';
      const wsHost = serverUrl.replace(/^https?:\/\//, '');
      const streamUrl = `${wsProtocol}://${wsHost}/api/calls/${callSessionId}/audio`;
      
      // Start media stream using Telnyx Call Control API
      // This creates a bidirectional WebSocket connection for audio
      // CRITICAL: stream_track must be "both_tracks" for bidirectional audio (Telnyx API requirement)
      // Valid values: "inbound_track", "outbound_track", "both_tracks"
      const streamPayload = {
        stream_url: streamUrl,
        stream_track: 'both_tracks', // CRITICAL: Must be "both_tracks" for bidirectional audio (Telnyx API requirement)
      };
      
      console.log('🔵 Starting media stream for Telnyx...');
      console.log('🔵 Stream URL:', streamUrl);
      console.log('🔵 Stream payload:', JSON.stringify(streamPayload, null, 2));
      console.log('🔵 Making streaming_start API call to Telnyx...');
      
      // URL encode the callControlId in case it contains special characters
      const encodedCallControlId = encodeURIComponent(callControlId);
      const streamEndpoint = `/calls/${encodedCallControlId}/actions/streaming_start`;
      
      process.stdout.write(`\n🔵 [startMediaStream] Making streaming_start API call\n`);
      process.stdout.write(`🔵 [startMediaStream] Endpoint: POST ${streamEndpoint}\n`);
      
      const streamResponse = await this.makeAPIRequest('POST', streamEndpoint, streamPayload);
      console.log('✅ Telnyx streaming_start API call successful');
      console.log('🔵 Telnyx response:', JSON.stringify(streamResponse, null, 2));
      console.log('⚠️  IMPORTANT: Telnyx should now connect to WebSocket URL:', streamUrl);
      console.log('⚠️  If you don\'t see WebSocket connection logs, Telnyx cannot reach the WebSocket server');
      
      // CRITICAL: This stream must stay open continuously for bidirectional audio
      // DO NOT call streaming_stop - the stream should remain open for the entire call
      // The WebSocket will handle continuous audio in both directions:
      // - Inbound: User speaks → Telnyx → WebSocket → OpenAI
      // - Outbound: OpenAI → WebSocket → Telnyx → User hears
      console.log('⚠️  CRITICAL: Media stream must stay open continuously - do not stop it');
      console.log('⚠️  The stream will handle all audio bidirectionally until the call ends');
      
      // Call handler will be initialized when WebSocket connects in callAudio.js
      console.log('Call handler will be initialized when WebSocket connects');
      
    } catch (error) {
      console.error('❌ Failed to start media stream:', error.message);
      console.error('Error details:', error.response?.data || error);
      throw error;
    }
  }

  // Handle call answered - speak greeting (DEPRECATED - keeping for backward compatibility)
  static async handleCallAnswered(callControlId, toNumber) {
    try {
      // Find business by phone number
      const business = await this.findBusinessByNumber(toNumber);
      if (!business) {
        console.error('Business not found for number:', toNumber);
        return;
      }

      // Get opening message
      const openingMessage = business.opening_message || `Hello! Thank you for calling ${business.name}. How can I help you today?`;
      
      // Store client state for conversation tracking
      const clientStateData = {
        business_id: business.id,
        call_control_id: callControlId,
        conversation_turn: 1,
        waiting_for_speak_end: true,
        conversation_history: [],
        remembered_info: {},
      };
      const clientStateBase64 = Buffer.from(JSON.stringify(clientStateData)).toString('base64');

      // Speak greeting
      await this.makeAPIRequest('POST', `/calls/${callControlId}/actions/speak`, {
        payload: openingMessage,
        voice: 'Polly.Joanna',
        language: 'en-US',
        premium: true,
        client_state: clientStateBase64,
        interruption_settings: {
          enabled: false,
        },
      });

      console.log('Greeting spoken, waiting for speak.ended to start gather');
    } catch (error) {
      console.error('Error in handleCallAnswered:', error);
    }
  }

  // Handle speak ended - start gathering speech
  static async handleSpeakEnded(callControlId, clientStateBase64) {
    try {
      if (!clientStateBase64) {
        console.log('No client_state in speak.ended, ignoring');
        return;
      }

      // Decode client state
      let clientState = {};
      try {
        clientState = JSON.parse(Buffer.from(clientStateBase64, 'base64').toString());
      } catch (e) {
        console.error('Error decoding client_state:', e);
        return;
      }

      // Only start gather if we're waiting for speak to end
      if (clientState.waiting_for_speak_end) {
        console.log('Speak ended, starting gather');
        
        // Remove the flag
        delete clientState.waiting_for_speak_end;
        const newClientStateBase64 = Buffer.from(JSON.stringify(clientState)).toString('base64');

        // Start gather_using_ai
        await this.makeAPIRequest('POST', `/calls/${callControlId}/actions/gather_using_ai`, {
          instructions: 'You are a speech-to-text transcription service. Only transcribe what the user says. Do not respond, do not ask questions, do not have a conversation. Just listen and transcribe the user\'s speech accurately. Ignore background noise, music, TV sounds, or other ambient sounds. Only transcribe clear human speech directed at you.',
          parameters: {
            type: 'object',
            properties: {
              user_speech: {
                type: 'string',
                description: 'The full transcription of what the caller said. Ignore background noise.',
              },
            },
            required: ['user_speech'],
          },
          voice: 'Polly.Joanna',
          client_state: newClientStateBase64,
          timeout_ms: 15000,
          interruption_settings: {
            enabled: false,
          },
        });

        console.log('Gather started after speak ended');
      }
    } catch (error) {
      console.error('Error in handleSpeakEnded:', error);
    }
  }

  // Handle speech gathered - process with AI and speak response
  static async handleSpeechGathered(callControlId, clientStateBase64, speechText) {
    try {
      if (!speechText || speechText.trim() === '') {
        console.log('No speech text, re-gathering');
        // Re-gather if no speech
        await this.handleSpeakEnded(callControlId, clientStateBase64);
        return;
      }

      // Decode client state
      let clientState = {};
      if (clientStateBase64) {
        try {
          clientState = JSON.parse(Buffer.from(clientStateBase64, 'base64').toString());
        } catch (e) {
          console.error('Error decoding client_state:', e);
          return;
        }
      }

      console.log('Processing speech with AI:', speechText);

      // Process speech with AI
      const { AIProcessor } = await import('./aiProcessor.js');
      const aiResult = await AIProcessor.processSpeech(
        speechText,
        clientState.business_id,
        clientState.conversation_history || [],
        clientState.remembered_info || {}
      );

      // Update client state
      const nextClientState = {
        ...clientState,
        conversation_turn: (clientState.conversation_turn || 1) + 1,
        waiting_for_speak_end: true,
        conversation_history: aiResult.conversation_history,
        remembered_info: aiResult.remembered_info,
      };
      const nextClientStateBase64 = Buffer.from(JSON.stringify(nextClientState)).toString('base64');

      // Speak AI response
      await this.makeAPIRequest('POST', `/calls/${callControlId}/actions/speak`, {
        payload: aiResult.response,
        voice: 'Polly.Joanna',
        language: 'en-US',
        premium: true,
        client_state: nextClientStateBase64,
        interruption_settings: {
          enabled: false,
        },
      });

      console.log('AI response spoken, waiting for speak.ended to start next gather');
    } catch (error) {
      console.error('Error in handleSpeechGathered:', error);
    }
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

