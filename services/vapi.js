// services/vapi.js
// VAPI API client for creating assistants, provisioning numbers, and managing calls

import axios from "axios";
import { supabaseClient } from "../config/database.js";

// Lazy client creation to ensure env vars are loaded
let vapiClient = null;

function getVapiClient() {
  if (!vapiClient) {
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

    if (!VAPI_API_KEY) {
      console.warn("⚠️  VAPI_API_KEY not set. VAPI functions will not work.");
    }

    vapiClient = axios.create({
      baseURL: VAPI_BASE_URL,
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
  }
  return vapiClient;
}

/**
 * Create a VAPI assistant for a business
 * @param {Object} businessData - Business information
 * @param {string} businessData.name - Business name
 * @param {string} businessData.public_phone_number - Business's public phone number
 * @param {string} businessData.timezone - Business timezone
 * @param {Object} businessData.business_hours - Business hours JSON
 * @param {Array} businessData.faqs - FAQs array (limited by tier)
 * @param {string} businessData.contact_email - Contact email
 * @param {string} businessData.address - Business address
 * @param {boolean} businessData.allow_call_transfer - Whether to allow call transfers
 * @returns {Promise<Object>} VAPI assistant object
 */
export async function createAssistant(businessData) {
  try {
    const { generateAssistantPrompt } = await import("../templates/vapi-assistant-template.js");
    
    const systemPrompt = await generateAssistantPrompt(businessData);
    
    // Get custom greetings, personality, and voice from agent data
    const openingGreeting = businessData.opening_greeting || `Hello! Thanks for calling ${businessData.name}. How can I help you today?`;
    const endingGreeting = businessData.ending_greeting || null; // Optional ending greeting
    const personality = businessData.personality || 'professional';
    const voiceProvider = businessData.voice_provider || '11labs';
    const voiceId = businessData.voice_id || '21m00Tcm4TlvDq8ikWAM'; // Default professional voice
    
    // Adjust temperature based on personality
    let temperature = 0.7;
    if (personality === 'friendly') {
      temperature = 0.8;
    } else if (personality === 'professional') {
      temperature = 0.6;
    } else if (personality === 'casual') {
      temperature = 0.9;
    }
    
    const assistantConfig = {
      name: `${businessData.name} - Tavari Assistant`,
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: temperature,
        maxTokens: 150,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
      },
      voice: {
        provider: voiceProvider,
        voiceId: voiceId,
      },
      firstMessage: openingGreeting,
      serverUrl: `${process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL || "https://api.tavarios.com"}/api/vapi/webhook`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      // Transcriber settings for better responsiveness
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US",
      },
      // Start speaking plan - wait a bit before speaking to avoid interrupting caller
      startSpeakingPlan: {
        waitSeconds: 0.8,
        smartEndpointingEnabled: false, // Disable to prevent premature responses
      },
    };
    
    // Add ending message if provided
    if (endingGreeting) {
      assistantConfig.endCallFunctionEnabled = true;
      // Note: VAPI may handle ending messages differently - check their API docs
    }

    console.log("[VAPI] Creating assistant with config:", {
      name: assistantConfig.name,
      personality,
      voiceProvider,
      voiceId,
      hasOpeningGreeting: !!openingGreeting,
      hasEndingGreeting: !!endingGreeting,
    });

    const response = await getVapiClient().post("/assistant", assistantConfig);
    return response.data;
  } catch (error) {
    console.error("Error creating VAPI assistant:", error.response?.data || error.message);
    throw new Error(`Failed to create VAPI assistant: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Provision a phone number via VAPI
 * @returns {Promise<Object>} Phone number object
 */
/**
 * Get Telnyx credentials from VAPI
 * @returns {Promise<Array>} List of Telnyx credentials
 */
export async function getTelnyxCredentials() {
  try {
    // Try different possible endpoints
    let response;
    try {
      // Try /credential endpoint
      response = await getVapiClient().get("/credential");
    } catch (error) {
      // If that fails, try /credentials (plural)
      if (error.response?.status === 404) {
        response = await getVapiClient().get("/credentials");
      } else {
        throw error;
      }
    }
    
    const allCredentials = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    // Filter for Telnyx credentials
    const telnyxCreds = allCredentials.filter(cred => cred.provider === "telnyx");
    console.log(`[VAPI] Found ${telnyxCreds.length} Telnyx credential(s) out of ${allCredentials.length} total`);
    return telnyxCreds;
  } catch (error) {
    console.error("Error getting Telnyx credentials:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    // If credentials endpoint doesn't exist or fails, return empty array
    // Phone provisioning might work without explicitly setting credentialId
    return [];
  }
}

/**
 * Search for available phone numbers via Telnyx
 * @param {string} countryCode - Country code (default: 'US')
 * @param {string} phoneType - Phone type: 'local', 'toll-free', 'mobile' (default: 'local')
 * @param {number} limit - Number of results (default: 5)
 * @param {string} areaCode - Optional area code to match (e.g., '415', '212')
 * @returns {Promise<Array>} Array of available phone numbers
 */
export async function searchAvailablePhoneNumbers(countryCode = 'US', phoneType = 'local', limit = 5, areaCode = null) {
  try {
    // Check if we have Telnyx API key for direct search
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    if (!TELNYX_API_KEY) {
      console.warn("[VAPI] TELNYX_API_KEY not set - cannot search for numbers directly");
      return [];
    }

    const axios = (await import("axios")).default;
    const params = new URLSearchParams({
      'filter[country_code]': countryCode,
      'filter[phone_number_type]': phoneType,
      'page[size]': limit.toString(),
    });

    // Add area code filter if provided (Telnyx uses national_destination_code)
    if (areaCode) {
      const cleanAreaCode = areaCode.replace(/\D/g, ''); // Remove non-digits
      if (cleanAreaCode.length === 3) {
        params.append('filter[national_destination_code]', cleanAreaCode);
        console.log(`[VAPI] Searching for numbers with area code: ${cleanAreaCode}`);
      }
    }

    const response = await axios.get(`https://api.telnyx.com/v2/available_phone_numbers?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const numbers = response.data?.data || [];
    console.log(`[VAPI] Found ${numbers.length} available ${phoneType} numbers for ${countryCode}${areaCode ? ` (area code: ${areaCode})` : ''}`);
    return numbers.map(num => ({
      phone_number: num.phone_number,
      phone_price: num.cost_information?.upfront_cost || 0,
      region_information: num.region_information,
    }));
  } catch (error) {
    console.error("[VAPI] Error searching for phone numbers:", error.response?.data || error.message);
    return [];
  }
}

/**
 * Find unassigned phone numbers in Telnyx (numbers not assigned to any business)
 * @param {string} preferredAreaCode - Optional area code to prefer
 * @returns {Promise<Array>} Array of unassigned phone number objects
 */
export async function findUnassignedTelnyxNumbers(preferredAreaCode = null) {
  try {
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    const TELNYX_API_BASE_URL = process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2';
    
    if (!TELNYX_API_KEY) {
      console.warn('[VAPI] TELNYX_API_KEY not set, cannot find unassigned numbers');
      return [];
    }

    const axios = (await import("axios")).default;
    const { Business } = await import("../models/Business.js");
    
    console.log('[VAPI] Finding unassigned phone numbers in Telnyx...');
    
    // Get all phone numbers from Telnyx
    const telnyxResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'page[size]': 100, // Get up to 100 numbers
      },
    });
    
    const allTelnyxNumbers = telnyxResponse.data?.data || [];
    console.log(`[VAPI] Found ${allTelnyxNumbers.length} phone numbers in Telnyx account`);
    
    // Get all phone numbers assigned to businesses in our database
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('vapi_phone_number')
      .not('vapi_phone_number', 'is', null);
    
    if (error) {
      console.warn('[VAPI] Error fetching assigned numbers from database:', error);
      return [];
    }
    
    const assignedNumbers = new Set(
      (businesses || [])
        .map(b => b.vapi_phone_number)
        .filter(n => n)
        .map(n => {
          // Normalize phone numbers for comparison
          let normalized = n.replace(/[^0-9+]/g, '');
          if (!normalized.startsWith('+')) {
            normalized = '+' + normalized;
          }
          return normalized;
        })
    );
    
    console.log(`[VAPI] Found ${assignedNumbers.size} phone numbers assigned to businesses`);
    
    // Find unassigned numbers
    const unassignedNumbers = allTelnyxNumbers.filter(telnyxNum => {
      const telnyxPhone = telnyxNum.phone_number || telnyxNum.number;
      if (!telnyxPhone) return false;
      
      // Normalize for comparison
      let normalized = telnyxPhone.replace(/[^0-9+]/g, '');
      if (!normalized.startsWith('+')) {
        normalized = '+' + normalized;
      }
      
      return !assignedNumbers.has(normalized);
    });
    
    console.log(`[VAPI] Found ${unassignedNumbers.length} unassigned phone numbers`);
    
    // If preferred area code is provided, prioritize numbers with that area code
    if (preferredAreaCode && unassignedNumbers.length > 0) {
      const cleanAreaCode = preferredAreaCode.replace(/\D/g, '');
      const preferred = unassignedNumbers.filter(num => {
        const phone = (num.phone_number || num.number || '').replace(/[^0-9]/g, '');
        return phone.startsWith(cleanAreaCode) || phone.startsWith('1' + cleanAreaCode);
      });
      
      if (preferred.length > 0) {
        console.log(`[VAPI] Found ${preferred.length} unassigned numbers with preferred area code ${cleanAreaCode}`);
        return preferred;
      }
    }
    
    return unassignedNumbers;
  } catch (error) {
    console.error('[VAPI] Error finding unassigned numbers:', error.message);
    return [];
  }
}

/**
 * Purchase a phone number from Telnyx
 * Uses the recommended /number_orders endpoint, with fallback to /phone_numbers
 * @param {string} phoneNumber - Phone number in E.164 format
 * @returns {Promise<Object>} Purchased phone number object
 */
export async function purchaseTelnyxNumber(phoneNumber) {
  try {
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    const TELNYX_API_BASE_URL = process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2';
    
    if (!TELNYX_API_KEY) {
      throw new Error('TELNYX_API_KEY not set. Cannot purchase phone numbers directly from Telnyx.');
    }

    const axios = (await import("axios")).default;
    
    // Clean phone number - ensure E.164 format
    let cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!cleanNumber.startsWith('+')) {
      if (cleanNumber.length === 10) {
        cleanNumber = '+1' + cleanNumber;
      } else if (cleanNumber.length === 11 && cleanNumber.startsWith('1')) {
        cleanNumber = '+' + cleanNumber;
      } else {
        cleanNumber = '+1' + cleanNumber;
      }
    }
    
    console.log(`[VAPI] Purchasing phone number: ${cleanNumber}`);
    
    // Check if number already exists in Telnyx account
    try {
      const checkResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`, {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      });
      
      if (checkResponse.data?.data && checkResponse.data.data.length > 0) {
        console.log(`[VAPI] ✅ Phone number already exists in Telnyx: ${cleanNumber}`);
        return checkResponse.data.data[0];
      }
    } catch (checkError) {
      // If check fails, continue to purchase
      console.log("[VAPI] Could not check existing numbers, proceeding with purchase...");
    }
    
    // Method 1: Try Number Orders endpoint (recommended by Telnyx)
    try {
      console.log("[VAPI] Attempting purchase via /number_orders endpoint...");
      const numberOrderPayload = {
        phone_numbers: [{
          phone_number: cleanNumber
        }]
      };
      
      const orderResponse = await axios.post(`${TELNYX_API_BASE_URL}/number_orders`, numberOrderPayload, {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      
      // Number Orders returns an order, we need to wait for it to complete or get the phone number
      console.log("[VAPI] ✅ Number order created successfully");
      
      // Extract phone number from order response
      if (orderResponse.data?.data?.phone_numbers && orderResponse.data.data.phone_numbers.length > 0) {
        const purchasedNumber = orderResponse.data.data.phone_numbers[0];
        console.log(`[VAPI] ✅ Phone number purchased via number_orders: ${purchasedNumber.phone_number || cleanNumber}`);
        
        // Return in consistent format
        return {
          id: purchasedNumber.id,
          phone_number: purchasedNumber.phone_number || cleanNumber,
          ...purchasedNumber
        };
      }
      
      // If order was created but number not in response, fetch it
      if (orderResponse.data?.data?.id) {
        // Wait a moment for order to process, then fetch the number
        await new Promise(resolve => setTimeout(resolve, 1000));
        const getResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`, {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
          },
        });
        if (getResponse.data?.data && getResponse.data.data.length > 0) {
          return getResponse.data.data[0];
        }
      }
      
      // Return what we have
      return {
        phone_number: cleanNumber,
        ...orderResponse.data?.data
      };
    } catch (orderError) {
      console.log("[VAPI] Number Orders endpoint failed, trying direct /phone_numbers endpoint...");
      console.log("[VAPI] Order error:", orderError.response?.data || orderError.message);
      
      // Method 2: Try direct /phone_numbers endpoint (fallback)
      try {
        const directResponse = await axios.post(`${TELNYX_API_BASE_URL}/phone_numbers`, {
          phone_number: cleanNumber,
        }, {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        console.log(`[VAPI] ✅ Purchased phone number from Telnyx via direct endpoint: ${cleanNumber}`);
        return directResponse.data.data;
      } catch (directError) {
        // If both methods fail, check if number might already exist
        if (directError.response?.status === 422 || directError.response?.status === 409) {
          console.log("[VAPI] Number might already be purchased, fetching existing number...");
          try {
            const getResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`, {
              headers: {
                Authorization: `Bearer ${TELNYX_API_KEY}`,
              },
            });
            if (getResponse.data?.data && getResponse.data.data.length > 0) {
              console.log(`[VAPI] ✅ Number already exists in Telnyx: ${cleanNumber}`);
              return getResponse.data.data[0];
            }
          } catch (getError) {
            // Ignore and throw original error
          }
        }
        
        // Both methods failed
        const errorDetails = orderError.response?.data || directError.response?.data || {};
        const errorMessage = errorDetails.errors?.[0]?.detail || errorDetails.errors?.[0]?.title || directError.message || orderError.message;
        
        console.error("[VAPI] Both purchase methods failed:");
        console.error("[VAPI] Order error:", orderError.response?.data || orderError.message);
        console.error("[VAPI] Direct error:", directError.response?.data || directError.message);
        
        throw new Error(`Failed to purchase phone number from Telnyx: ${errorMessage}`);
      }
    }
  } catch (error) {
    console.error("[VAPI] Error purchasing Telnyx number:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Provision a phone number via VAPI
 * This function will:
 * 1. Search for available numbers (if not provided)
 * 2. Purchase the number from Telnyx (if needed)
 * 3. Provision it to VAPI
 * 
 * @param {string} specificNumber - Optional: specific phone number to provision (E.164 format)
 * @returns {Promise<Object>} Phone number object
 */
export async function provisionPhoneNumber(specificNumber = null, businessPhoneNumber = null) {
  try {
    let phoneNumberToProvision = specificNumber;
    
    // If no specific number provided, purchase a new one (don't reuse existing)
    if (!phoneNumberToProvision) {
      console.log("[VAPI] No specific number provided, will purchase a new number...");
      
      // Extract area code from business phone number if provided
      let areaCode = null;
      if (businessPhoneNumber) {
        const { extractAreaCode } = await import("../utils/phoneFormatter.js");
        areaCode = extractAreaCode(businessPhoneNumber);
        if (areaCode) {
          console.log(`[VAPI] Matching area code from business phone: ${areaCode}`);
        }
      }
      
      // Search for numbers, matching area code if available
      const availableNumbers = await searchAvailablePhoneNumbers('US', 'local', 5, areaCode);
      
      if (availableNumbers.length === 0) {
        // If no numbers found with area code, try without area code
        if (areaCode) {
          console.log(`[VAPI] No numbers found with area code ${areaCode}, trying without area code...`);
          const fallbackNumbers = await searchAvailablePhoneNumbers('US', 'local', 5, null);
          if (fallbackNumbers.length === 0) {
            throw new Error('No available phone numbers found. Please try again or contact support.');
          }
          phoneNumberToProvision = fallbackNumbers[0].phone_number;
        } else {
          throw new Error('No available phone numbers found. Please try again or contact support.');
        }
      } else {
        phoneNumberToProvision = availableNumbers[0].phone_number;
      }
      
      console.log(`[VAPI] Selected phone number: ${phoneNumberToProvision}`);
      
      // Purchase the number from Telnyx
      console.log("[VAPI] Attempting to purchase number from Telnyx...");
      await purchaseTelnyxNumber(phoneNumberToProvision);
      console.log("[VAPI] ✅ Number purchased from Telnyx, proceeding to VAPI...");
    } else {
      // Specific number provided - verify it exists in Telnyx
      const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
      if (TELNYX_API_KEY) {
        try {
          const axios = (await import("axios")).default;
          const checkResponse = await axios.get(`https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumberToProvision)}`, {
            headers: {
              Authorization: `Bearer ${TELNYX_API_KEY}`,
            },
          });
          
          if (!checkResponse.data?.data || checkResponse.data.data.length === 0) {
            throw new Error(`Phone number ${phoneNumberToProvision} does not exist in your Telnyx account. Please purchase it first.`);
          }
          
          console.log(`[VAPI] ✅ Verified number exists in Telnyx: ${phoneNumberToProvision}`);
        } catch (error) {
          if (error.message.includes('does not exist')) {
            throw error;
          }
          console.warn("[VAPI] Could not verify number in Telnyx, proceeding anyway...");
        }
      }
    }
    
    // VAPI requires a specific phone number in E.164 format
    const requestBody = {
      provider: "telnyx",
      number: phoneNumberToProvision, // Must be in E.164 format (e.g., +15551234567)
    };
    
    // Try to get credential ID from environment first
    let credentialId = process.env.VAPI_TELNYX_CREDENTIAL_ID;
    
    // If not set, try to get the first available Telnyx credential
    if (!credentialId) {
      try {
        console.log("[VAPI] Auto-detecting Telnyx credential...");
        const credentials = await getTelnyxCredentials();
        console.log(`[VAPI] Found ${credentials.length} Telnyx credential(s)`);
        if (credentials.length > 0) {
          credentialId = credentials[0].id;
          console.log(`[VAPI] ✅ Using auto-detected Telnyx credential: ${credentialId}`);
        } else {
          console.warn("[VAPI] ⚠️  No Telnyx credentials found via API.");
          console.warn("[VAPI] VAPI may auto-detect credentials during provisioning.");
          console.warn("[VAPI] Attempting provisioning without explicit credentialId...");
        }
      } catch (error) {
        // Credentials endpoint might not be accessible, but provisioning might still work
        console.warn("[VAPI] ⚠️  Could not fetch credentials (this is OK if VAPI auto-detects)");
        console.warn("[VAPI] Attempting provisioning without credentialId - VAPI may auto-detect it");
      }
    } else {
      console.log(`[VAPI] Using configured Telnyx credential: ${credentialId}`);
    }
    
    // Add credentialId if we have one (VAPI may auto-detect if not provided)
    if (credentialId) {
      requestBody.credentialId = credentialId;
      console.log(`[VAPI] Provisioning phone number with credentialId: ${credentialId}`);
    } else {
      console.log("[VAPI] Provisioning phone number without credentialId - VAPI will auto-detect if available");
    }
    
    console.log("[VAPI] Request body:", JSON.stringify(requestBody, null, 2));
    const response = await getVapiClient().post("/phone-number", requestBody);
    
    // VAPI returns phone number in different possible fields
    const phoneNumberData = response.data;
    const phoneNumber = phoneNumberData?.phoneNumber || 
                       phoneNumberData?.phone_number || 
                       phoneNumberData?.number ||
                       phoneNumberData?.id;
    
    console.log("[VAPI] ✅ Phone number provisioned successfully");
    console.log("[VAPI] Phone number:", phoneNumber);
    console.log("[VAPI] Full response:", JSON.stringify(phoneNumberData, null, 2));
    
    // Ensure phoneNumber field exists for consistency
    if (!phoneNumberData.phoneNumber && phoneNumber) {
      phoneNumberData.phoneNumber = phoneNumber;
    }
    
    return phoneNumberData;
  } catch (error) {
    const errorDetails = error.response?.data || {};
    const errorMessage = errorDetails.message || errorDetails.error || error.message;
    
    console.error("Error provisioning phone number:", {
      message: errorMessage,
      details: errorDetails,
      status: error.response?.status,
    });
    
    // Provide helpful error message
    if (errorMessage.includes("credentialId") || errorMessage.includes("UUID")) {
      const helpMessage = process.env.VAPI_TELNYX_CREDENTIAL_ID
        ? `VAPI credential ID is set but may be invalid. Please verify VAPI_TELNYX_CREDENTIAL_ID in your .env file matches the credential UUID from VAPI dashboard (Settings → Credentials).`
        : `VAPI phone provisioning requires a Telnyx credential. Please:
1. Go to VAPI Dashboard → Settings → Credentials
2. Add a Telnyx credential (use your Telnyx API key from portal.telnyx.com)
3. Copy the credential ID (UUID format)
4. Add to .env: VAPI_TELNYX_CREDENTIAL_ID=your-uuid-here
5. Restart server

See VAPI_CREDENTIAL_SETUP.md for detailed instructions.`;
      
      throw new Error(`${helpMessage}\n\nOriginal error: ${errorMessage}`);
    }
    
    throw new Error(`Failed to provision phone number: ${errorMessage}`);
  }
}

/**
 * Link an assistant to a phone number
 * @param {string} assistantId - VAPI assistant ID
 * @param {string} phoneNumberId - VAPI phone number ID
 * @returns {Promise<Object>} Updated phone number object
 */
export async function linkAssistantToNumber(assistantId, phoneNumberId) {
  try {
    console.log(`[VAPI] Linking assistant ${assistantId} to phone number ${phoneNumberId}...`);
    
    // Try the standard PATCH endpoint first
    let response;
    try {
      response = await getVapiClient().patch(`/phone-number/${phoneNumberId}`, {
        assistantId: assistantId,
      });
    } catch (patchError) {
      // If PATCH fails, try PUT (some APIs use PUT for updates)
      if (patchError.response?.status === 405 || patchError.response?.status === 404) {
        console.log(`[VAPI] PATCH failed, trying PUT...`);
        response = await getVapiClient().put(`/phone-number/${phoneNumberId}`, {
          assistantId: assistantId,
        });
      } else {
        throw patchError;
      }
    }
    
    console.log(`[VAPI] ✅ Successfully linked assistant to phone number`);
    console.log(`[VAPI] Link response:`, JSON.stringify(response.data, null, 2));
    
    // Verify the link was successful
    const verifyResponse = await getVapiClient().get(`/phone-number/${phoneNumberId}`);
    const linkedAssistantId = verifyResponse.data?.assistantId || verifyResponse.data?.assistant?.id;
    
    if (linkedAssistantId === assistantId) {
      console.log(`[VAPI] ✅ Verification: Phone number is correctly linked to assistant ${assistantId}`);
    } else {
      console.warn(`[VAPI] ⚠️  Verification: Phone number shows assistant ID ${linkedAssistantId}, expected ${assistantId}`);
    }
    
    return response.data;
  } catch (error) {
    console.error("[VAPI] Error linking assistant to number:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
    });
    
    // Provide helpful error message
    if (error.response?.status === 404) {
      throw new Error(`Phone number ${phoneNumberId} not found in VAPI. Please verify the phone number ID.`);
    } else if (error.response?.status === 400) {
      throw new Error(`Invalid request: ${error.response?.data?.message || 'Check that assistant ID and phone number ID are valid UUIDs'}`);
    }
    
    throw new Error(`Failed to link assistant to number: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Update a VAPI assistant
 * @param {string} assistantId - VAPI assistant ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<Object>} Updated assistant object
 */
export async function updateAssistant(assistantId, updates) {
  try {
    // Handle systemPrompt updates - VAPI API expects it in model.messages
    const updatePayload = { ...updates };
    
    if (updates.systemPrompt) {
      // Put system prompt in model.messages structure
      updatePayload.model = {
        ...(updates.model || {}),
        messages: [
          {
            role: "system",
            content: updates.systemPrompt,
          },
        ],
      };
      // Remove systemPrompt from top level
      delete updatePayload.systemPrompt;
    }
    
    const response = await getVapiClient().patch(`/assistant/${assistantId}`, updatePayload);
    return response.data;
  } catch (error) {
    console.error("Error updating VAPI assistant:", error.response?.data || error.message);
    throw new Error(`Failed to update VAPI assistant: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Rebuild VAPI assistant with all current business and agent data
 * This ensures the assistant always has the latest information
 * @param {string} businessId - Business ID
 * @returns {Promise<void>}
 */
export async function rebuildAssistant(businessId) {
  try {
    console.log(`[VAPI Rebuild] ========== REBUILDING ASSISTANT FOR BUSINESS ${businessId} ==========`);
    
    // Import models
    const { Business } = await import("../models/Business.js");
    const { AIAgent } = await import("../models/AIAgent.js");
    const { generateAssistantPrompt } = await import("../templates/vapi-assistant-template.js");
    
    // Fetch latest business data
    const business = await Business.findById(businessId);
    if (!business) {
      console.error(`[VAPI Rebuild] Business not found: ${businessId}`);
      return;
    }
    
    if (!business.vapi_assistant_id) {
      console.log(`[VAPI Rebuild] No VAPI assistant ID for business ${businessId}, skipping rebuild`);
      return;
    }
    
    // Fetch latest agent data
    const agent = await AIAgent.findByBusinessId(businessId);
    if (!agent) {
      console.warn(`[VAPI Rebuild] Agent not found for business ${businessId}, using defaults`);
    }
    
    console.log(`[VAPI Rebuild] Business data:`, {
      name: business.name,
      timezone: business.timezone,
      address: business.address,
      public_phone_number: business.public_phone_number,
    });
    
    console.log(`[VAPI Rebuild] Agent data:`, {
      faqs_count: agent?.faqs?.length || 0,
      has_business_hours: !!agent?.business_hours,
      holiday_hours_count: agent?.holiday_hours?.length || 0,
      opening_greeting: agent?.opening_greeting ? 'set' : 'not set',
      ending_greeting: agent?.ending_greeting ? 'set' : 'not set',
    });
    
    // Generate fresh prompt with all current data
    const updatedPrompt = await generateAssistantPrompt({
      name: business.name,
      public_phone_number: business.public_phone_number || "",
      timezone: business.timezone,
      business_hours: agent?.business_hours || {},
      holiday_hours: agent?.holiday_hours || [],
      faqs: agent?.faqs || [],
      contact_email: business.email,
      address: business.address || "",
      allow_call_transfer: business.allow_call_transfer ?? true,
      after_hours_behavior: business.after_hours_behavior || "take_message",
      opening_greeting: agent?.opening_greeting,
      ending_greeting: agent?.ending_greeting,
      personality: agent?.personality || 'professional',
    });
    
    console.log(`[VAPI Rebuild] Generated prompt length: ${updatedPrompt.length} characters`);
    console.log(`[VAPI Rebuild] Prompt includes FAQs: ${updatedPrompt.includes('FREQUENTLY ASKED QUESTIONS')}`);
    console.log(`[VAPI Rebuild] Prompt includes business hours: ${updatedPrompt.includes('Regular Business Hours')}`);
    console.log(`[VAPI Rebuild] Prompt includes holiday hours: ${updatedPrompt.includes('Holiday Hours')}`);
    
    // Build update payload
    const updatePayload = {
      model: {
        messages: [
          {
            role: "system",
            content: updatedPrompt,
          },
        ],
      },
    };
    
    // Update first message if opening greeting exists
    if (agent?.opening_greeting) {
      updatePayload.firstMessage = agent.opening_greeting;
    }
    
    // Update ending greeting if it exists
    if (agent?.ending_greeting) {
      updatePayload.endCallFunctionEnabled = true;
    }
    
    // Update the assistant
    console.log(`[VAPI Rebuild] Updating assistant ${business.vapi_assistant_id} with payload:`, {
      hasModel: !!updatePayload.model,
      hasFirstMessage: !!updatePayload.firstMessage,
      hasEndCallFunction: !!updatePayload.endCallFunctionEnabled,
    });
    
    const updatedAssistant = await updateAssistant(business.vapi_assistant_id, updatePayload);
    
    console.log(`[VAPI Rebuild] ✅ Assistant rebuilt successfully for business ${businessId}`);
    console.log(`[VAPI Rebuild] Updated assistant ID: ${updatedAssistant?.id || business.vapi_assistant_id}`);
  } catch (error) {
    console.error(`[VAPI Rebuild] ❌❌❌ ERROR rebuilding assistant:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data,
      businessId,
      assistantId: business?.vapi_assistant_id,
    });
    throw error;
  }
}

/**
 * Get call summary from VAPI
 * @param {string} callId - VAPI call ID
 * @returns {Promise<Object>} Call summary with transcript and metadata
 */
export async function getCallSummary(callId) {
  try {
    const response = await getVapiClient().get(`/call/${callId}`);
    return {
      transcript: response.data.transcript,
      summary: response.data.summary,
      duration: response.data.duration,
      endedReason: response.data.endedReason,
      metadata: response.data.metadata,
      messages: response.data.messages || [], // Include messages array from VAPI
    };
  } catch (error) {
    console.error("Error getting call summary:", error.response?.data || error.message);
    throw new Error(`Failed to get call summary: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Transfer a call to the business number
 * @param {string} callId - VAPI call ID
 * @param {string} targetNumber - Business phone number to transfer to (must be E.164 format)
 * @returns {Promise<Object>} Transfer response
 */
export async function transferCall(callId, targetNumber) {
  try {
    // Ensure phone number is in E.164 format
    const { formatPhoneNumberE164, validatePhoneNumber } = await import("../utils/phoneFormatter.js");
    const e164Number = formatPhoneNumberE164(targetNumber);
    
    if (!e164Number || !validatePhoneNumber(e164Number)) {
      throw new Error(`Invalid phone number format: ${targetNumber}. Must be in E.164 format (e.g., +15551234567)`);
    }
    
    const response = await getVapiClient().post(`/call/${callId}/transfer`, {
      phoneNumberId: null, // Not using VAPI phone number
      phoneNumber: e164Number, // Direct number transfer in E.164 format
    });
    return response.data;
  } catch (error) {
    console.error("Error transferring call:", error.response?.data || error.message);
    throw new Error(`Failed to transfer call: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Forward a call to business immediately (no AI interaction)
 * @param {string} callId - VAPI call ID
 * @param {string} targetNumber - Business phone number (must be E.164 format)
 * @returns {Promise<Object>} Forward response
 */
export async function forwardCallToBusiness(callId, targetNumber) {
  try {
    // Ensure phone number is in E.164 format
    const { formatPhoneNumberE164, validatePhoneNumber } = await import("../utils/phoneFormatter.js");
    const e164Number = formatPhoneNumberE164(targetNumber);
    
    if (!e164Number || !validatePhoneNumber(e164Number)) {
      throw new Error(`Invalid phone number format: ${targetNumber}. Must be in E.164 format (e.g., +15551234567)`);
    }
    
    // Use transfer API to forward call immediately
    const response = await getVapiClient().post(`/call/${callId}/transfer`, {
      phoneNumber: e164Number,
    });
    return response.data;
  } catch (error) {
    console.error("Error forwarding call to business:", error.response?.data || error.message);
    throw new Error(`Failed to forward call: ${error.response?.data?.message || error.message}`);
  }
}

