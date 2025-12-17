// scripts/reprovision-vapi-with-voice.js
// Delete and re-provision phone number in VAPI to enable voice

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { supabaseClient } from "../config/database.js";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!VAPI_API_KEY) {
  console.error("❌ VAPI_API_KEY not set");
  process.exit(1);
}

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

async function reprovisionWithVoice() {
  try {
    console.log("🔄 Re-provisioning Phone Number with Voice Enabled...\n");

    // Get business
    const { data: businesses } = await supabaseClient
      .from("businesses")
      .select("id, name, vapi_phone_number, vapi_assistant_id, public_phone_number")
      .not("vapi_phone_number", "is", null)
      .limit(1);

    if (businesses.length === 0) {
      console.log("❌ No businesses with phone numbers found");
      return;
    }

    const business = businesses[0];
    const phoneNumber = business.vapi_phone_number;
    const assistantId = business.vapi_assistant_id;

    if (!assistantId) {
      console.log("❌ No assistant ID found");
      return;
    }

    console.log(`📋 Business: ${business.name}`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Assistant ID: ${assistantId}\n`);

    // Step 1: Enable voice in Telnyx FIRST
    console.log("Step 1: Enabling Voice in Telnyx...");
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");
    
    const telnyxGet = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const telnyxNumbers = telnyxGet.data?.data || [];
    if (telnyxNumbers.length === 0) {
      console.log("❌ Phone number not found in Telnyx");
      return;
    }

    const telnyxNumberId = telnyxNumbers[0].id;
    
    // Try to enable voice
    try {
      await axios.patch(
        `${TELNYX_API_BASE_URL}/phone_numbers/${telnyxNumberId}`,
        {
          features: {
            voice: { enabled: true },
            sms: { enabled: true },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ Voice enable request sent to Telnyx");
    } catch (e) {
      console.log(`⚠️  Could not enable voice via API: ${e.response?.data?.errors?.[0]?.title || e.message}`);
      console.log("   You may need to enable it manually in Telnyx dashboard");
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Delete phone number from VAPI
    console.log("\nStep 2: Deleting phone number from VAPI...");
    const phoneRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneRes.data) ? phoneRes.data : phoneRes.data?.data || [];
    
    const vapiPhone = phoneNumbers.find(
      (pn) =>
        pn.number === phoneNumber ||
        pn.phoneNumber === phoneNumber ||
        pn.phone_number === phoneNumber
    );

    if (vapiPhone) {
      try {
        await vapiClient.delete(`/phone-number/${vapiPhone.id}`);
        console.log("✅ Phone number deleted from VAPI");
      } catch (deleteError) {
        if (deleteError.response?.status !== 404) {
          throw deleteError;
        }
        console.log("⚠️  Phone number not found in VAPI (may already be deleted)");
      }
    } else {
      console.log("⚠️  Phone number not found in VAPI");
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Re-provision in VAPI
    console.log("\nStep 3: Re-provisioning phone number in VAPI...");
    console.log("   Using credential: c978be20-580b-435d-a03a-51ad7bfdfa1c");
    console.log("   (If you created a new credential, update this script with the new credential ID)");
    
    const { provisionPhoneNumber, linkAssistantToNumber } = await import("../services/vapi.js");
    
    const vapiPhoneNumber = await provisionPhoneNumber(phoneNumber, business.public_phone_number);
    console.log("✅ Phone number re-provisioned!");
    console.log(`   VAPI Phone Number ID: ${vapiPhoneNumber.id}\n`);

    // Step 4: Link assistant
    console.log("Step 4: Linking assistant to phone number...");
    await linkAssistantToNumber(assistantId, vapiPhoneNumber.id);
    console.log("✅ Assistant linked!\n");

    console.log("=".repeat(60));
    console.log("✅ RE-PROVISIONING COMPLETE!");
    console.log("=".repeat(60));
    console.log("IMPORTANT: If voice is still disabled in Telnyx:");
    console.log("1. Go to Telnyx Dashboard → Numbers → Your Number");
    console.log("2. Go to Settings tab");
    console.log("3. Enable 'Voice' feature");
    console.log("4. Save");
    console.log("");
    console.log("Then wait 2-3 minutes and try calling: " + phoneNumber);
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.response?.data) {
      console.error("   Details:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

reprovisionWithVoice();

