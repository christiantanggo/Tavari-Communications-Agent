// scripts/update-vapi-phone.js
// Update existing phone number in VAPI to refresh routing

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { supabaseClient } from "../config/database.js";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error("❌ VAPI_API_KEY not set");
  process.exit(1);
}

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

async function updatePhone() {
  try {
    console.log("🔧 Updating Phone Number in VAPI...\n");

    // Get business
    const { data: businesses } = await supabaseClient
      .from("businesses")
      .select("id, name, vapi_phone_number, vapi_assistant_id")
      .not("vapi_phone_number", "is", null)
      .limit(1);

    if (businesses.length === 0) {
      console.log("❌ No businesses with phone numbers found");
      return;
    }

    const business = businesses[0];
    const phoneNumber = business.vapi_phone_number;
    const assistantId = business.vapi_assistant_id;

    console.log(`📋 Business: ${business.name}`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Assistant ID: ${assistantId}\n`);

    // Get phone number from VAPI
    const phoneRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneRes.data) ? phoneRes.data : phoneRes.data?.data || [];
    
    const vapiPhone = phoneNumbers.find(
      (pn) =>
        pn.number === phoneNumber ||
        pn.phoneNumber === phoneNumber ||
        pn.phone_number === phoneNumber
    );

    if (!vapiPhone) {
      console.log("❌ Phone number not found in VAPI!");
      return;
    }

    const phoneNumberId = vapiPhone.id;
    console.log(`✅ Found phone number in VAPI:`);
    console.log(`   ID: ${phoneNumberId}`);
    console.log(`   Current Status: ${vapiPhone.status || "unknown"}\n`);

    // Update the phone number - this should refresh the routing
    console.log("🔄 Updating phone number configuration...");
    const updatePayload = {
      assistantId: assistantId,
      // Force VAPI to refresh the Telnyx configuration
    };

    try {
      const updateResponse = await vapiClient.patch(`/phone-number/${phoneNumberId}`, updatePayload);
      console.log("✅ Phone number updated!");
      console.log(`   Response:`, JSON.stringify(updateResponse.data, null, 2));
    } catch (patchError) {
      // Try PUT if PATCH fails
      if (patchError.response?.status === 405 || patchError.response?.status === 404) {
        console.log("   Trying PUT method...");
        const updateResponse = await vapiClient.put(`/phone-number/${phoneNumberId}`, updatePayload);
        console.log("✅ Phone number updated!");
      } else {
        throw patchError;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📱 SOLUTION:");
    console.log("=".repeat(60));
    console.log("The phone number needs a SIP Connection in Telnyx for routing.");
    console.log("But VAPI should manage this automatically.");
    console.log("");
    console.log("Try this:");
    console.log("1. Go to Telnyx Dashboard → Numbers → Your Number → Voice tab");
    console.log("2. Set 'SIP Connection/Application' back to 'Tavari-Voice-Agent'");
    console.log("3. BUT - Check the Voice API Application settings:");
    console.log("   - Go to Telnyx → Voice → Voice API Applications → Tavari-Voice-Agent");
    console.log("   - Make sure the webhook URL is set correctly");
    console.log("   - OR remove the connection and let VAPI manage it");
    console.log("");
    console.log("Alternatively:");
    console.log("4. Go to VAPI Dashboard → Phone Numbers");
    console.log("5. Check if there's a 'Refresh' or 'Reconfigure' option");
    console.log("6. Or delete the number in VAPI and re-provision it");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

updatePhone();

