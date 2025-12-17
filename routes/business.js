// routes/business.js
// Business settings management routes

import express from "express";
import { authenticate } from "../middleware/auth.js";
import { Business } from "../models/Business.js";
import { updateAssistant } from "../services/vapi.js";
import { generateAssistantPrompt } from "../templates/vapi-assistant-template.js";
import { AIAgent } from "../models/AIAgent.js";

const router = express.Router();

// Update business settings
router.put("/settings", authenticate, async (req, res) => {
  let updateData = {};
  try {
    const {
      ai_enabled,
      call_forward_rings,
      after_hours_behavior,
      allow_call_transfer,
      email_ai_answered,
      email_missed_calls,
      sms_enabled,
      sms_notification_number,
      minutes_exhausted_behavior,
      overage_billing_enabled,
      overage_cap_minutes,
    } = req.body;

    updateData = {};
    if (ai_enabled !== undefined) updateData.ai_enabled = ai_enabled;
    if (call_forward_rings !== undefined) updateData.call_forward_rings = call_forward_rings;
    if (after_hours_behavior !== undefined) updateData.after_hours_behavior = after_hours_behavior;
    if (allow_call_transfer !== undefined) updateData.allow_call_transfer = allow_call_transfer;
    if (email_ai_answered !== undefined) updateData.email_ai_answered = email_ai_answered;
    if (email_missed_calls !== undefined) updateData.email_missed_calls = email_missed_calls;
    if (sms_enabled !== undefined) updateData.sms_enabled = sms_enabled;
    if (sms_notification_number !== undefined) updateData.sms_notification_number = sms_notification_number;
    if (minutes_exhausted_behavior !== undefined) updateData.minutes_exhausted_behavior = minutes_exhausted_behavior;
    if (overage_billing_enabled !== undefined) updateData.overage_billing_enabled = overage_billing_enabled;
    if (overage_cap_minutes !== undefined) updateData.overage_cap_minutes = overage_cap_minutes;

    // Update business settings in database
    const updatedBusiness = await Business.update(req.businessId, updateData);
    if (!updatedBusiness) {
      return res.status(404).json({ error: "Business not found" });
    }

    // If AI settings changed, update VAPI assistant (non-blocking)
    if (ai_enabled !== undefined || allow_call_transfer !== undefined || after_hours_behavior !== undefined) {
      // Run VAPI update asynchronously - don't block the response
      (async () => {
        try {
          const business = await Business.findById(req.businessId);
          if (!business || !business.vapi_assistant_id) {
            console.log("[Business Settings] No VAPI assistant ID, skipping update");
            return;
          }

          const agent = await AIAgent.findByBusinessId(req.businessId);
          const updatedPrompt = generateAssistantPrompt({
            name: business.name,
            public_phone_number: business.public_phone_number || "",
            timezone: business.timezone,
            business_hours: agent?.business_hours || {},
            faqs: agent?.faqs || [],
            contact_email: business.email,
            address: business.address || "",
            allow_call_transfer: business.allow_call_transfer ?? true,
            after_hours_behavior: business.after_hours_behavior || "take_message",
          });

          await updateAssistant(business.vapi_assistant_id, {
            model: {
              messages: [
                {
                  role: "system",
                  content: updatedPrompt,
                },
              ],
            },
          });
          console.log("[Business Settings] VAPI assistant updated successfully");
        } catch (vapiError) {
          console.error("[Business Settings] Error updating VAPI assistant (non-blocking):", {
            message: vapiError.message,
            stack: vapiError.stack,
          });
          // Don't fail the request if VAPI update fails
        }
      })();
    }

    res.json({ success: true });
  } catch (error) {
    // Log full error details to console
    const errorDetails = {
      message: error?.message || String(error),
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
      businessId: req.businessId,
      updateData: updateData,
      errorType: error?.constructor?.name,
    };
    
    console.error("=== Update settings error ===");
    console.error("Error details:", errorDetails);
    console.error("Full error object:", JSON.stringify(errorDetails, null, 2));
    console.error("Error message:", error?.message);
    console.error("Error code:", error?.code);
    console.error("Error hint:", error?.hint);
    console.error("===========================");
    
    // Provide more helpful error messages
    let errorMessage = error?.message || error?.details || String(error) || "Failed to update settings";
    
    // Handle specific Supabase/PostgreSQL error codes
    if (error?.code === 'PGRST116') {
      errorMessage = "Business not found";
    } else if (error?.code === '23505') {
      errorMessage = "A setting with this value already exists";
    } else if (error?.code === '42703') {
      errorMessage = `Invalid field name in settings: ${error?.hint || 'Unknown field'}`;
    } else if (error?.code === '23502') {
      errorMessage = `Required field is missing: ${error?.hint || 'Unknown field'}`;
    } else if (error?.code === '42P01') {
      errorMessage = "Database table not found - migrations may not have been run";
    } else if (error?.code === 'PGRST201') {
      errorMessage = `Column not found: ${error?.hint || 'Unknown column'}. Please run database migrations.`;
    }
    
    // Always return the actual error message in development
    const isDevelopment = process.env.NODE_ENV !== "production";
    
    // Send response directly - don't let error handler override it
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: errorMessage,
        code: error?.code,
        ...(isDevelopment && {
          details: {
            message: error?.message,
            hint: error?.hint,
            code: error?.code,
            updateData: updateData,
          },
        }),
      });
    }
  }
});

// Search for available phone numbers
router.get("/phone-numbers/search", authenticate, async (req, res) => {
  try {
    const { countryCode = 'US', phoneType = 'local', limit = 20, areaCode } = req.query;
    const { searchAvailablePhoneNumbers } = await import("../services/vapi.js");
    
    const numbers = await searchAvailablePhoneNumbers(
      countryCode,
      phoneType,
      parseInt(limit),
      areaCode || null
    );
    
    res.json({ numbers });
  } catch (error) {
    console.error("Search phone numbers error:", error);
    res.status(500).json({ error: error.message || "Failed to search phone numbers" });
  }
});

// Provision selected phone number
router.post("/phone-numbers/provision", authenticate, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // If phone number already exists, return it
    if (business.vapi_phone_number) {
      return res.json({
        success: true,
        phone_number: business.vapi_phone_number,
        message: "Phone number already provisioned",
      });
    }

    // Create VAPI assistant if it doesn't exist
    const { createAssistant, provisionPhoneNumber, linkAssistantToNumber, purchaseTelnyxNumber } = await import("../services/vapi.js");
    const { initializeBillingCycle } = await import("../services/billing.js");
    const { AIAgent } = await import("../models/AIAgent.js");
    const agent = await AIAgent.findByBusinessId(req.businessId);

    let assistant;
    if (!business.vapi_assistant_id) {
      // Create VAPI assistant
      assistant = await createAssistant({
        name: business.name,
        public_phone_number: business.public_phone_number || "",
        timezone: business.timezone || "America/New_York",
        business_hours: agent?.business_hours || {},
        faqs: agent?.faqs || [],
        contact_email: business.email,
        address: business.address || "",
        allow_call_transfer: business.allow_call_transfer ?? true,
        after_hours_behavior: business.after_hours_behavior || "take_message",
        opening_greeting: agent?.opening_greeting,
        ending_greeting: agent?.ending_greeting,
        personality: agent?.personality || 'professional',
        voice_provider: agent?.voice_provider || '11labs',
        voice_id: agent?.voice_id || '21m00Tcm4TlvDq8ikWAM',
      });
      
      // Store assistant ID
      await Business.update(req.businessId, { vapi_assistant_id: assistant.id });
    } else {
      // Fetch existing assistant
      const { getVapiClient } = await import("../services/vapi.js");
      const vapiClient = getVapiClient();
      const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
      assistant = assistantResponse.data;
    }

    // Purchase the selected phone number from Telnyx first
    const telnyxNumber = await purchaseTelnyxNumber(phoneNumber);
    
    // Provision phone number to VAPI (this will use the purchased Telnyx number)
    const vapiPhoneNumber = await provisionPhoneNumber(
      phoneNumber, // Use the selected number (already purchased from Telnyx)
      business.public_phone_number // Business phone for area code matching
    );

    // Extract phone number from response
    const provisionedNumber =
      vapiPhoneNumber.phoneNumber ||
      vapiPhoneNumber.phone_number ||
      vapiPhoneNumber.number ||
      phoneNumber;

    // Link assistant to number
    try {
      await linkAssistantToNumber(assistant.id, vapiPhoneNumber.id);
      console.log(`[Business Provision] ✅ Assistant ${assistant.id} linked to phone number ${vapiPhoneNumber.id}`);
    } catch (linkError) {
      console.error(`[Business Provision] ⚠️  Failed to link assistant to number:`, linkError.message);
      // Don't fail the whole provisioning if linking fails - user can manually link in VAPI dashboard
      console.log(`[Business Provision] Phone number provisioned but not linked. Please link manually in VAPI dashboard.`);
    }

    // Store VAPI phone number in database
    await Business.update(req.businessId, { 
      vapi_phone_number: provisionedNumber,
      vapi_assistant_id: assistant.id, // Make sure assistant ID is stored
    });

    // Initialize billing cycle if not already done
    if (!business.next_billing_date) {
      await initializeBillingCycle(req.businessId, new Date());
    }

    // Mark onboarding as complete
    await Business.setOnboardingComplete(req.businessId);

    res.json({
      success: true,
      phone_number: provisionedNumber,
      message: "Phone number provisioned successfully",
    });
  } catch (error) {
    console.error("Provision phone number error:", error);
    let errorMessage = error.message;
    if (error.message.includes("credentialId") || error.response?.data?.message?.includes("credentialId")) {
      errorMessage = "VAPI phone provisioning requires a Telnyx credential. Please contact support.";
    } else if (error.response?.data?.message) {
      errorMessage = `VAPI error: ${error.response.data.message}`;
    }
    res.status(500).json({ error: errorMessage });
  }
});

// Manually link assistant to phone number (if linking failed during provisioning)
router.post("/link-assistant", authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    if (!business.vapi_assistant_id) {
      return res.status(400).json({ error: "No VAPI assistant found. Please create an assistant first." });
    }

    if (!business.vapi_phone_number) {
      return res.status(400).json({ error: "No VAPI phone number found. Please provision a phone number first." });
    }

    // Get the phone number ID from VAPI
    const { getVapiClient } = await import("../services/vapi.js");
    const vapiClient = getVapiClient();
    
    // List phone numbers to find the one matching our stored number
    const phoneNumbersRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneNumbersRes.data) ? phoneNumbersRes.data : (phoneNumbersRes.data?.data || []);
    
    const matchingNumber = phoneNumbers.find(
      pn => (pn.number === business.vapi_phone_number) || 
            (pn.phoneNumber === business.vapi_phone_number) ||
            (pn.phone_number === business.vapi_phone_number)
    );

    if (!matchingNumber) {
      return res.status(404).json({ 
        error: `Phone number ${business.vapi_phone_number} not found in VAPI. Please check VAPI dashboard.` 
      });
    }

    // Link assistant to number
    const { linkAssistantToNumber } = await import("../services/vapi.js");
    try {
      await linkAssistantToNumber(business.vapi_assistant_id, matchingNumber.id);
      
      res.json({
        success: true,
        message: "Assistant successfully linked to phone number",
        assistant_id: business.vapi_assistant_id,
        phone_number_id: matchingNumber.id,
        phone_number: business.vapi_phone_number,
      });
    } catch (linkError) {
      console.error(`[Link Assistant] Failed to link:`, linkError);
      res.status(500).json({
        error: linkError.message || "Failed to link assistant to phone number",
        assistant_id: business.vapi_assistant_id,
        phone_number_id: matchingNumber.id,
        phone_number: business.vapi_phone_number,
        details: linkError.response?.data,
      });
    }
  } catch (error) {
    console.error("Link assistant error:", error);
    res.status(500).json({ 
      error: error.message || "Failed to link assistant to phone number",
      details: error.response?.data,
    });
  }
});

// Retry phone number activation (customer-facing) - DEPRECATED, use /phone-numbers/provision instead
router.post("/retry-activation", authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // If phone number already exists, return it
    if (business.vapi_phone_number) {
      return res.json({
        success: true,
        phone_number: business.vapi_phone_number,
        message: "Phone number already provisioned",
      });
    }

    // Retry VAPI activation
    const { createAssistant, provisionPhoneNumber, linkAssistantToNumber } = await import("../services/vapi.js");
    const { initializeBillingCycle } = await import("../services/billing.js");
    const { AIAgent } = await import("../models/AIAgent.js");
    const agent = await AIAgent.findByBusinessId(req.businessId);

    // Create VAPI assistant
    const assistant = await createAssistant({
      name: business.name,
      public_phone_number: business.public_phone_number || "",
      timezone: business.timezone || "America/New_York",
      business_hours: agent?.business_hours || {},
      faqs: agent?.faqs || [],
      contact_email: business.email,
      address: business.address || "",
      allow_call_transfer: business.allow_call_transfer ?? true,
      after_hours_behavior: business.after_hours_behavior || "take_message",
    });

    // Provision phone number
    const phoneNumber = await provisionPhoneNumber(
      null, // No existing number
      business.public_phone_number // Business phone for area code matching
    );

    // Extract phone number from response
    const provisionedNumber =
      phoneNumber.phoneNumber ||
      phoneNumber.phone_number ||
      phoneNumber.number ||
      phoneNumber.id;

    if (!provisionedNumber) {
      throw new Error("Phone number was provisioned but no phone number value was returned from VAPI");
    }

    // Link assistant to number
    await linkAssistantToNumber(assistant.id, phoneNumber.id);

    // Store VAPI IDs in database
    await Business.setVapiAssistant(req.businessId, assistant.id, provisionedNumber);

    // Initialize billing cycle if not already done
    if (!business.next_billing_date) {
      await initializeBillingCycle(req.businessId, new Date());
    }

    // Mark onboarding as complete
    await Business.setOnboardingComplete(req.businessId);

    res.json({
      success: true,
      phone_number: provisionedNumber,
      message: "Phone number provisioned successfully",
    });
  } catch (error) {
    console.error("Retry activation error:", error);
    let errorMessage = error.message;
    if (error.message.includes("credentialId") || error.response?.data?.message?.includes("credentialId")) {
      errorMessage = "VAPI phone provisioning requires a Telnyx credential. Please contact support.";
    } else if (error.response?.data?.message) {
      errorMessage = `VAPI error: ${error.response.data.message}`;
    }
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

