// scripts/check-telnyx-vapi-routing.js
// Check if Telnyx number is properly configured for VAPI routing

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function checkRouting() {
  try {
    console.log("🔍 Checking Telnyx Number Configuration for VAPI...\n");

    const phoneNumber = "+16692407730";
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");

    // Get phone number details
    const getResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const numbers = getResponse.data?.data || [];
    if (numbers.length === 0) {
      console.log("❌ Phone number not found");
      return;
    }

    const telnyxNumber = numbers[0];
    
    console.log("=".repeat(60));
    console.log("📱 TELNYX NUMBER CONFIGURATION:");
    console.log("=".repeat(60));
    console.log(`Number: ${telnyxNumber.phone_number}`);
    console.log(`Status: ${telnyxNumber.status}`);
    console.log(`Voice Enabled: ${telnyxNumber.features?.voice?.enabled || telnyxNumber.voice_enabled || "unknown"}`);
    console.log(`Connection Name: ${telnyxNumber.connection_name || "NONE"}`);
    console.log(`Connection ID: ${telnyxNumber.connection_id || "NONE"}`);
    console.log(`Voice Application ID: ${telnyxNumber.voice?.application_id || telnyxNumber.voice_application_id || "NONE"}`);
    console.log(`Voice Application Name: ${telnyxNumber.voice?.application_name || "NONE"}`);
    console.log("");

    // Check Voice API Application details if assigned
    if (telnyxNumber.voice?.application_id || telnyxNumber.voice_application_id) {
      const appId = telnyxNumber.voice?.application_id || telnyxNumber.voice_application_id;
      console.log("🔍 Checking Voice API Application...");
      
      try {
        const appResponse = await axios.get(
          `${TELNYX_API_BASE_URL}/applications/${appId}`,
          {
            headers: {
              Authorization: `Bearer ${TELNYX_API_KEY}`,
            },
          }
        );
        
        const app = appResponse.data?.data || appResponse.data;
        console.log(`   Application Name: ${app.name || "N/A"}`);
        console.log(`   Webhook URL: ${app.webhook_url || app.webhook_api_version || "NOT SET"}`);
        console.log(`   Webhook Event Filters: ${app.webhook_event_filters?.join(", ") || "ALL"}`);
      } catch (e) {
        console.log(`   ⚠️  Could not fetch application details: ${e.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔧 VAPI REQUIREMENTS:");
    console.log("=".repeat(60));
    console.log("When using VAPI, the phone number should:");
    console.log("  ✅ Be active in Telnyx");
    console.log("  ✅ Have voice enabled (VAPI may enable this automatically)");
    console.log("  ⚠️  NOT be assigned to a Voice API Application");
    console.log("  ⚠️  NOT have a SIP Connection assigned");
    console.log("");
    console.log("VAPI manages routing through its own infrastructure.");
    console.log("If a Voice API Application is assigned, it may intercept calls.");
    console.log("=".repeat(60));

    // Check if there's a conflict
    if (telnyxNumber.connection_id || telnyxNumber.voice?.application_id || telnyxNumber.voice_application_id) {
      console.log("\n⚠️  WARNING: Number is assigned to a Connection/Application!");
      console.log("   This may prevent VAPI from managing routing.");
      console.log("   Consider removing the assignment and letting VAPI handle it.");
    } else {
      console.log("\n✅ Number is NOT assigned to a Connection/Application");
      console.log("   VAPI should be able to manage routing.");
    }

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

checkRouting();

