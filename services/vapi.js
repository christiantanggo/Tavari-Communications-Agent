// services/vapi.js
// VAPI API client for creating assistants, provisioning numbers, and managing calls

import axios from "axios";
import { supabaseClient } from "../config/database.js";

// Lazy client creation to ensure env vars are loaded
let vapiClient = null;

export function getVapiClient() {
  if (!vapiClient) {
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

    if (!VAPI_API_KEY) {
      console.warn("⚠️  VAPI_API_KEY not set. VAPI functions will not work.");
      // Still create client but it will fail on API calls - better to fail fast
    }

    vapiClient = axios.create({
      baseURL: VAPI_BASE_URL,
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY || ''}`,
        "Content-Type": "application/json",
      },
    });
    
    // Add response interceptor to log errors
    vapiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.error("[VAPI] ❌ Authentication failed - check VAPI_API_KEY");
        }
        return Promise.reject(error);
      }
    );
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
    // Use voice settings from businessData, default to OpenAI/alloy
    const voiceSettings = businessData.voice_settings || {};
    const voiceProvider = voiceSettings.provider || businessData.voice_provider || 'openai';
    const voiceId = voiceSettings.voice_id || businessData.voice_id || 'alloy'; // Default professional voice (OpenAI)
    
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
        model: "gpt-4o-mini", // Using mini for lower cost (~80% cheaper than gpt-4o)
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
      serverUrl: (() => {
        let backendUrl = process.env.BACKEND_URL || 
                          process.env.RAILWAY_PUBLIC_DOMAIN || 
                          process.env.VERCEL_URL || 
                          process.env.SERVER_URL ||
                          "https://api.tavarios.com";
        
        // Ensure URL has https:// protocol
        if (backendUrl && !backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
          backendUrl = `https://${backendUrl}`;
        }
        
        const webhookUrl = `${backendUrl}/api/vapi/webhook`;
        console.log(`[VAPI] Setting webhook URL: ${webhookUrl}`);
        return webhookUrl;
      })(),
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      // CRITICAL: serverMessages tells VAPI which events to send to the webhook
      // Without this, VAPI won't send any webhooks even if serverUrl is set
      serverMessages: [
        "status-update",      // Call status changes (call-start, call-end, etc.)
        "end-of-call-report", // Final call summary with transcript, duration, etc.
        "function-call",      // Function calls during the call
        "hang",               // Call hangup events
      ],
      // Transcriber settings - reduce sensitivity to background noise
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US",
      },
      // Enable background denoising to filter out ambient noise
      backgroundDenoisingEnabled: true,
      // Prevent interruptions during AI speech - stops background voices from cutting off AI
      interruptionsEnabled: false, // Disable interruptions - AI will finish speaking before listening
      firstMessageInterruptionsEnabled: false, // Also disable for first message
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
 * Get all phone numbers from VAPI
 * @returns {Promise<Array>} Array of all VAPI phone number objects
 */
export async function getAllVapiPhoneNumbers() {
  try {
    const response = await getVapiClient().get('/phone-number');
    const allVapiNumbers = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    console.log(`[VAPI] Found ${allVapiNumbers.length} phone numbers in VAPI`);
    return allVapiNumbers;
  } catch (error) {
    console.error('[VAPI] Error getting VAPI phone numbers:', error.message);
    return [];
  }
}

/**
 * Check if a phone number is already provisioned in VAPI
 * @param {string} phoneNumber - Phone number in E.164 format
 * @returns {Promise<Object|null>} VAPI phone number object if found, null otherwise
 */
export async function checkIfNumberProvisionedInVAPI(phoneNumber) {
  try {
    // Normalize phone number
    let normalized = phoneNumber.replace(/[^0-9+]/g, '');
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    
    // Get all phone numbers from VAPI
    const response = await getVapiClient().get('/phone-number');
    const allVapiNumbers = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    
    // Find matching number
    const matching = allVapiNumbers.find(vapiNum => {
      const vapiPhone = vapiNum.phoneNumber || vapiNum.phone_number || vapiNum.number;
      if (!vapiPhone) return false;
      
      let vapiNormalized = vapiPhone.replace(/[^0-9+]/g, '');
      if (!vapiNormalized.startsWith('+')) {
        vapiNormalized = '+' + vapiNormalized;
      }
      
      return vapiNormalized === normalized;
    });
    
    if (matching) {
      console.log(`[VAPI] Phone number ${normalized} is already provisioned in VAPI`);
      return matching;
    }
    
    return null;
  } catch (error) {
    console.warn(`[VAPI] Could not check if number is provisioned in VAPI:`, error.message);
    return null;
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
    
    // Find unassigned numbers in Telnyx
    const unassignedTelnyxNumbers = allTelnyxNumbers.filter(telnyxNum => {
      const telnyxPhone = telnyxNum.phone_number || telnyxNum.number;
      if (!telnyxPhone) return false;
      
      // Normalize for comparison
      let normalized = telnyxPhone.replace(/[^0-9+]/g, '');
      if (!normalized.startsWith('+')) {
        normalized = '+' + normalized;
      }
      
      return !assignedNumbers.has(normalized);
    });
    
    console.log(`[VAPI] Found ${unassignedTelnyxNumbers.length} unassigned phone numbers in Telnyx`);
    
    // Also check VAPI for numbers not assigned to businesses
    let unassignedVapiNumbers = [];
    try {
      const vapiNumbers = await getAllVapiPhoneNumbers();
      unassignedVapiNumbers = vapiNumbers.filter(vapiNum => {
        const vapiPhone = vapiNum.phoneNumber || vapiNum.phone_number || vapiNum.number;
        if (!vapiPhone) return false;
        
        // Normalize for comparison
        let normalized = vapiPhone.replace(/[^0-9+]/g, '');
        if (!normalized.startsWith('+')) {
          normalized = '+' + normalized;
        }
        
        return !assignedNumbers.has(normalized);
      });
      
      console.log(`[VAPI] Found ${unassignedVapiNumbers.length} unassigned phone numbers in VAPI`);
    } catch (error) {
      console.warn('[VAPI] Could not check VAPI numbers:', error.message);
    }
    
    // Combine both lists (VAPI numbers are preferred since they're already provisioned)
    const unassignedNumbers = [...unassignedVapiNumbers, ...unassignedTelnyxNumbers];
    console.log(`[VAPI] Total unassigned numbers available: ${unassignedNumbers.length}`);
    
    // If preferred area code is provided, prioritize numbers with that area code
    if (preferredAreaCode && unassignedNumbers.length > 0) {
      const cleanAreaCode = preferredAreaCode.replace(/\D/g, '');
      const preferred = unassignedNumbers.filter(num => {
        const phone = (num.phoneNumber || num.phone_number || num.number || '').replace(/[^0-9]/g, '');
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
    
    // Check if VAPI_API_KEY is set before making the request
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    if (!VAPI_API_KEY) {
      throw new Error('VAPI_API_KEY is not set. Cannot provision phone number to VAPI. Please set VAPI_API_KEY in your environment variables.');
    }
    
    const response = await getVapiClient().post("/phone-number", requestBody);
    
    // VAPI returns phone number in different possible fields
    const phoneNumberData = response.data;
    const phoneNumber = phoneNumberData?.phoneNumber || 
                       phoneNumberData?.phone_number || 
                       phoneNumberData?.number ||
                       phoneNumberData?.id;
    
    // Extract phoneNumberId - this is critical for linking
    const phoneNumberId = phoneNumberData?.id || 
                         phoneNumberData?.phoneNumberId || 
                         phoneNumberData?.phone_number_id;
    
    if (!phoneNumberId) {
      console.error("[VAPI] ⚠️  WARNING: phoneNumberId not found in VAPI response!");
      console.error("[VAPI] Response data:", JSON.stringify(phoneNumberData, null, 2));
      // Try to extract from nested structure
      if (phoneNumberData?.data?.id) {
        phoneNumberData.id = phoneNumberData.data.id;
        phoneNumberData.phoneNumberId = phoneNumberData.data.id;
      }
    }
    
    console.log("[VAPI] ✅ Phone number provisioned successfully");
    console.log("[VAPI] Phone number:", phoneNumber);
    console.log("[VAPI] Phone number ID:", phoneNumberId || 'NOT FOUND');
    console.log("[VAPI] Full response:", JSON.stringify(phoneNumberData, null, 2));
    
    // Ensure phoneNumber and id fields exist for consistency
    if (!phoneNumberData.phoneNumber && phoneNumber) {
      phoneNumberData.phoneNumber = phoneNumber;
    }
    if (!phoneNumberData.id && phoneNumberId) {
      phoneNumberData.id = phoneNumberId;
      phoneNumberData.phoneNumberId = phoneNumberId;
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
    console.log(`[updateAssistant] Updating assistant ${assistantId}`);
    console.log(`[updateAssistant] Updates received:`, {
      hasModel: !!updates.model,
      hasFirstMessage: !!updates.firstMessage,
      hasEndCallFunction: !!updates.endCallFunctionEnabled,
      modelMessagesCount: updates.model?.messages?.length || 0,
    });
    
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
    
    console.log(`[updateAssistant] Sending update payload to VAPI:`, {
      hasModel: !!updatePayload.model,
      hasFirstMessage: !!updatePayload.firstMessage,
      hasEndCallFunction: !!updatePayload.endCallFunctionEnabled,
      modelProvider: updatePayload.model?.provider,
      modelModel: updatePayload.model?.model,
    });
    
    const response = await getVapiClient().patch(`/assistant/${assistantId}`, updatePayload);
    
    console.log(`[updateAssistant] ✅ Assistant updated successfully:`, {
      assistantId: response.data?.id || assistantId,
      name: response.data?.name,
    });
    
    return response.data;
  } catch (error) {
    console.error("[updateAssistant] ❌❌❌ ERROR updating VAPI assistant:", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      assistantId,
    });
    throw new Error(`Failed to update VAPI assistant: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Rebuild VAPI assistant with all current business and agent data
 * @param {string} businessId - Business ID
 * @returns {Promise<Object>} Updated assistant object
 */
export async function rebuildAssistant(businessId) {
  try {
    console.log(`[VAPI Rebuild] Starting rebuild for business: ${businessId}`);
    
    // Import everything we need first
    const BusinessModule = await import("../models/Business.js");
    const AIAgentModule = await import("../models/AIAgent.js");
    const TemplateModule = await import("../templates/vapi-assistant-template.js");
    
    const Business = BusinessModule.Business;
    const AIAgent = AIAgentModule.AIAgent;
    const generateAssistantPrompt = TemplateModule.generateAssistantPrompt;
    
    // Fetch business data
    const businessRecord = await Business.findById(businessId);
    if (!businessRecord) {
      throw new Error(`Business not found: ${businessId}`);
    }
    
    if (!businessRecord.vapi_assistant_id) {
      throw new Error(`No VAPI assistant ID. Please provision a phone number first.`);
    }
    
    const assistantId = businessRecord.vapi_assistant_id;
    
    // CRITICAL: Fetch current assistant config from VAPI first
    // VAPI requires all fields to be present in PATCH, otherwise it may clear missing fields
    console.log(`[VAPI Rebuild] Fetching current assistant config from VAPI...`);
    let currentAssistant;
    try {
      const currentResponse = await getVapiClient().get(`/assistant/${assistantId}`);
      currentAssistant = currentResponse.data;
      console.log(`[VAPI Rebuild] Current assistant config:`, {
        model: currentAssistant.model?.model,
        voiceProvider: currentAssistant.voice?.provider,
        voiceId: currentAssistant.voice?.voiceId,
      });
    } catch (fetchError) {
      console.warn(`[VAPI Rebuild] Could not fetch current assistant, proceeding with new config:`, fetchError.message);
      currentAssistant = null;
    }
    
    // Fetch agent data
    const agentRecord = await AIAgent.findByBusinessId(businessId);
    
    console.log(`[VAPI Rebuild] ========== RAW DATA FROM DATABASE ==========`);
    console.log(`[VAPI Rebuild] Raw agent record holiday_hours:`, JSON.stringify(agentRecord?.holiday_hours, null, 2));
    console.log(`[VAPI Rebuild] Holiday hours type:`, typeof agentRecord?.holiday_hours);
    console.log(`[VAPI Rebuild] Holiday hours is array:`, Array.isArray(agentRecord?.holiday_hours));
    if (Array.isArray(agentRecord?.holiday_hours)) {
      console.log(`[VAPI Rebuild] Each holiday date from DB:`, JSON.stringify(agentRecord.holiday_hours.map(h => ({ 
        name: h?.name, 
        date: h?.date, 
        dateType: typeof h?.date,
        dateValue: String(h?.date),
        dateLength: String(h?.date).length
      })), null, 2));
    }
    console.log(`[VAPI Rebuild] ===========================================`);
    
    // Extract all values we need into simple variables - NO references to businessRecord after this
    const businessName = businessRecord.name || "Business";
    const businessEmail = businessRecord.email || "";
    const businessAddress = businessRecord.address || "";
    const businessPhone = businessRecord.public_phone_number || "";
    const businessTimezone = businessRecord.timezone || "America/New_York";
    const allowTransfer = businessRecord.allow_call_transfer ?? true;
    const afterHoursBehavior = businessRecord.after_hours_behavior || "take_message";
    
    const businessHours = agentRecord?.business_hours || {};
    
    // CRITICAL: Normalize holiday hours dates to ensure they're in YYYY-MM-DD format
    // This prevents timezone issues when dates are stored/retrieved from the database
    let holidayHours = agentRecord?.holiday_hours || [];
    
    console.log(`[VAPI Rebuild] ========== HOLIDAY HOURS FROM DATABASE ==========`);
    console.log(`[VAPI Rebuild] Raw holiday hours before normalization:`, JSON.stringify(holidayHours.map(h => ({ 
      name: h?.name, 
      date: h?.date, 
      dateType: typeof h?.date,
      dateValue: String(h?.date),
      dateLength: String(h?.date).length
    })), null, 2));
    if (Array.isArray(holidayHours)) {
      holidayHours = holidayHours.map(h => {
        if (!h || !h.date) return h;
        
        // Ensure date is in YYYY-MM-DD format (timezone-agnostic)
        let dateStr = h.date;
        
        // If it's a Date object, extract the date parts in local timezone
        if (dateStr instanceof Date) {
          const year = dateStr.getFullYear();
          const month = String(dateStr.getMonth() + 1).padStart(2, '0');
          const day = String(dateStr.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        } 
        // If it's an ISO string with time, extract just the date part
        else if (typeof dateStr === 'string' && dateStr.includes('T')) {
          dateStr = dateStr.split('T')[0];
        }
        // If it's already in YYYY-MM-DD format, use it as-is (most common case)
        else if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          // Already in correct format - this is what we want! No conversion needed.
          console.log(`[VAPI Rebuild] ✅ Date "${dateStr}" for ${h.name} is already in YYYY-MM-DD format, using as-is`);
          return { ...h, date: dateStr }; // Return early to avoid unnecessary processing
        }
        // If it's in a different format, try to parse it
        else if (typeof dateStr === 'string') {
          // Try to extract YYYY-MM-DD from various formats
          const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (dateMatch) {
            dateStr = dateMatch[0]; // Use the matched YYYY-MM-DD
          } else {
            console.warn(`[VAPI Rebuild] Could not parse holiday date: ${dateStr}, using as-is`);
          }
        }
        
        return { ...h, date: dateStr };
      });
      
      console.log(`[VAPI Rebuild] Normalized holiday hours after processing:`, JSON.stringify(holidayHours.map(h => ({ 
        name: h?.name, 
        date: h?.date, 
        dateType: typeof h?.date 
      })), null, 2));
      console.log(`[VAPI Rebuild] ================================================`);
    } else {
      console.log(`[VAPI Rebuild] Holiday hours is not an array:`, typeof holidayHours, holidayHours);
    }
    
    const faqs = agentRecord?.faqs || [];
    const openingGreeting = agentRecord?.opening_greeting || `Hello! Thanks for calling ${businessName}. How can I help you today?`;
    const endingGreeting = agentRecord?.ending_greeting || null;
    const personality = agentRecord?.personality || 'professional';
    // Use voice settings from agent record, default to OpenAI/alloy
    const voiceSettings = agentRecord?.voice_settings || {};
    const voiceProvider = voiceSettings.provider || 'openai'; // Default to OpenAI to save costs
    const voiceId = voiceSettings.voice_id || 'alloy'; // Default professional voice (OpenAI)
    
    // Calculate temperature
    let temperature = 0.7;
    if (personality === 'friendly') temperature = 0.8;
    else if (personality === 'professional') temperature = 0.6;
    else if (personality === 'casual') temperature = 0.9;
    
    console.log(`[VAPI Rebuild] Preparing to generate prompt with holiday hours:`, JSON.stringify(holidayHours.map(h => ({ name: h?.name, date: h?.date })), null, 2));
    
    // Generate system prompt
    const systemPrompt = await generateAssistantPrompt({
      name: businessName,
      public_phone_number: businessPhone,
      timezone: businessTimezone,
      business_hours: businessHours,
      holiday_hours: holidayHours,
      faqs: faqs,
      contact_email: businessEmail,
      address: businessAddress,
      allow_call_transfer: allowTransfer,
      after_hours_behavior: afterHoursBehavior,
      opening_greeting: openingGreeting,
      ending_greeting: endingGreeting,
      personality: personality,
    });
    
    // Build a clean payload with ONLY the fields VAPI accepts for updates
    // VAPI rejects updates with read-only fields (orgId, id, createdAt, isServerUrlSecretSet, etc.)
    // We build a fresh payload instead of spreading currentAssistant to avoid read-only fields
    const updatePayload = {
      name: `${businessName} - Tavari Assistant`,
      // FORCE model to gpt-4o-mini (cheaper) - this is critical for cost reduction
      model: {
        provider: "openai",
        model: "gpt-4o-mini", // Using mini for lower cost (~80% cheaper than gpt-4o)
        temperature: temperature,
        maxTokens: 150,
        messages: [{ role: "system", content: systemPrompt }],
      },
      // Use voice settings from agent record (defaults to OpenAI/alloy if not set)
      voice: {
        provider: voiceProvider, // Use selected provider (defaults to openai)
        voiceId: voiceId, // Use selected voice (defaults to alloy)
      },
      firstMessage: openingGreeting,
      serverUrl: (() => {
        const backendUrl = process.env.BACKEND_URL || 
                          process.env.RAILWAY_PUBLIC_DOMAIN || 
                          process.env.VERCEL_URL || 
                          process.env.SERVER_URL ||
                          "https://api.tavarios.com";
        const webhookUrl = `${backendUrl}/api/vapi/webhook`;
        console.log(`[VAPI Rebuild] Setting webhook URL: ${webhookUrl}`);
        return webhookUrl;
      })(),
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
      // CRITICAL: serverMessages tells VAPI which events to send to the webhook
      // Without this, VAPI won't send any webhooks even if serverUrl is set
      serverMessages: [
        "status-update",      // Call status changes (call-start, call-end, etc.)
        "end-of-call-report", // Final call summary with transcript, duration, etc.
        "function-call",      // Function calls during the call
        "hang",               // Call hangup events
      ],
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US",
      },
      // Enable background denoising to filter out ambient noise
      backgroundDenoisingEnabled: true,
      // Prevent interruptions during AI speech - stops background voices from cutting off AI
      interruptionsEnabled: false, // Disable interruptions - AI will finish speaking before listening
      firstMessageInterruptionsEnabled: false, // Also disable for first message
      startSpeakingPlan: {
        waitSeconds: 0.8,
        smartEndpointingEnabled: false, // Keep disabled to prevent premature cutoffs
      },
    };
    
    if (endingGreeting) {
      updatePayload.endCallFunctionEnabled = true;
    } else {
      updatePayload.endCallFunctionEnabled = false;
    }
    
    // Make API call - Use PATCH (VAPI standard for updates)
    console.log(`[VAPI Rebuild] ========== UPDATING ASSISTANT ==========`);
    console.log(`[VAPI Rebuild] Assistant ID: ${assistantId}`);
    console.log(`[VAPI Rebuild] Model being set: ${updatePayload.model.model}`);
    console.log(`[VAPI Rebuild] Voice provider being set: ${updatePayload.voice.provider}`);
    console.log(`[VAPI Rebuild] Voice ID being set: ${updatePayload.voice.voiceId}`);
    console.log(`[VAPI Rebuild] Clean update payload (no read-only fields):`, JSON.stringify(updatePayload, null, 2));
    
    const response = await getVapiClient().patch(`/assistant/${assistantId}`, updatePayload);
    console.log(`[VAPI Rebuild] ✅ PATCH successful! Status: ${response.status}`);
    console.log(`[VAPI Rebuild] PATCH response data:`, JSON.stringify(response.data, null, 2));
    
    // Verify the update by fetching the assistant
    console.log(`[VAPI Rebuild] ========== VERIFYING UPDATE ==========`);
    const verifyResponse = await getVapiClient().get(`/assistant/${assistantId}`);
    const updatedAssistant = verifyResponse.data;
    
    console.log(`[VAPI Rebuild] ✅ Assistant updated successfully!`);
    console.log(`[VAPI Rebuild] ========== VERIFIED CONFIGURATION ==========`);
    console.log(`[VAPI Rebuild] Model: ${updatedAssistant.model?.model || 'unknown'}`);
    console.log(`[VAPI Rebuild] Voice Provider: ${updatedAssistant.voice?.provider || 'unknown'}`);
    console.log(`[VAPI Rebuild] Voice ID: ${updatedAssistant.voice?.voiceId || 'unknown'}`);
    console.log(`[VAPI Rebuild] Webhook URL (serverUrl): ${updatedAssistant.serverUrl || 'NOT SET!'}`);
    console.log(`[VAPI Rebuild] Expected webhook URL: ${updatePayload.serverUrl}`);
    if (updatedAssistant.serverUrl !== updatePayload.serverUrl) {
      console.error(`[VAPI Rebuild] ❌❌❌ CRITICAL: Webhook URL mismatch!`);
      console.error(`[VAPI Rebuild] Expected: ${updatePayload.serverUrl}`);
      console.error(`[VAPI Rebuild] Actual: ${updatedAssistant.serverUrl || 'NOT SET'}`);
    } else {
      console.log(`[VAPI Rebuild] ✅ Webhook URL matches expected value`);
    }
    console.log(`[VAPI Rebuild] Server Messages (serverMessages): ${JSON.stringify(updatedAssistant.serverMessages || 'NOT SET')}`);
    console.log(`[VAPI Rebuild] Expected serverMessages: ${JSON.stringify(updatePayload.serverMessages)}`);
    if (!updatedAssistant.serverMessages || updatedAssistant.serverMessages.length === 0) {
      console.error(`[VAPI Rebuild] ❌❌❌ CRITICAL: serverMessages is NOT SET! This will prevent webhooks from being sent!`);
    } else {
      console.log(`[VAPI Rebuild] ✅ serverMessages is configured: ${JSON.stringify(updatedAssistant.serverMessages)}`);
    }
    console.log(`[VAPI Rebuild] Full assistant config:`, JSON.stringify({
      model: updatedAssistant.model,
      voice: updatedAssistant.voice,
      serverUrl: updatedAssistant.serverUrl,
    }, null, 2));
    
    // Check if update actually worked
    if (updatedAssistant.model?.model !== 'gpt-4o-mini') {
      console.warn(`[VAPI Rebuild] ⚠️ WARNING: Model is still ${updatedAssistant.model?.model}, expected gpt-4o-mini`);
    }
    if (updatedAssistant.voice?.provider !== 'openai') {
      console.warn(`[VAPI Rebuild] ⚠️ WARNING: Voice provider is still ${updatedAssistant.voice?.provider}, expected openai`);
    }
    if (!updatedAssistant.serverUrl || updatedAssistant.serverUrl !== updatePayload.serverUrl) {
      console.error(`[VAPI Rebuild] ❌❌❌ CRITICAL WARNING: Webhook URL not set correctly!`);
      console.error(`[VAPI Rebuild] This will prevent call tracking, usage recording, and message creation!`);
    }
    
    return response.data;
  } catch (err) {
    // Wrap error to ensure we never reference undefined variables
    const errorMessage = err?.message || 'Unknown error';
    const errorStack = err?.stack || 'No stack trace';
    console.error(`[VAPI Rebuild] ERROR: ${errorMessage}`);
    console.error(`[VAPI Rebuild] Stack: ${errorStack}`);
    throw new Error(`Failed to rebuild assistant: ${errorMessage}`);
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

