// scripts/check-telnyx-number-status.js
// Check detailed Telnyx number status

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function checkNumberStatus() {
  try {
    console.log("🔍 Checking Telnyx Number Status...\n");

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
      console.log("❌ Phone number not found in Telnyx account!");
      console.log("   This means the number may have been removed or never purchased.");
      return;
    }

    const telnyxNumber = numbers[0];
    
    console.log("=".repeat(60));
    console.log("📱 TELNYX NUMBER DETAILS:");
    console.log("=".repeat(60));
    console.log(`Number: ${telnyxNumber.phone_number}`);
    console.log(`Status: ${telnyxNumber.status}`);
    console.log(`Phone Number ID: ${telnyxNumber.id}`);
    console.log(``);
    console.log(`Features:`);
    console.log(`  Voice Enabled: ${telnyxNumber.features?.voice?.enabled || telnyxNumber.voice_enabled || false}`);
    console.log(`  SMS Enabled: ${telnyxNumber.features?.sms?.enabled || telnyxNumber.sms_enabled || false}`);
    console.log(``);
    console.log(`Routing:`);
    console.log(`  Connection ID: ${telnyxNumber.connection_id || "NONE"}`);
    console.log(`  Connection Name: ${telnyxNumber.connection_name || "NONE"}`);
    console.log(`  Voice Application ID: ${telnyxNumber.voice?.application_id || telnyxNumber.voice_application_id || "NONE"}`);
    console.log(`  Messaging Profile ID: ${telnyxNumber.messaging_profile_id || "NONE"}`);
    console.log("=".repeat(60));

    if (telnyxNumber.status !== "active") {
      console.log("\n⚠️  WARNING: Number status is NOT 'active'!");
      console.log(`   Current status: ${telnyxNumber.status}`);
      console.log("   This may cause 'out of service' messages.");
    }

    if (!telnyxNumber.features?.voice?.enabled && !telnyxNumber.voice_enabled) {
      console.log("\n⚠️  WARNING: Voice feature is NOT enabled!");
      console.log("   This will prevent calls from working.");
    }

    if (telnyxNumber.connection_id || telnyxNumber.voice?.application_id || telnyxNumber.voice_application_id) {
      console.log("\n⚠️  WARNING: Number is assigned to a Connection/Application!");
      console.log("   For VAPI, the number should NOT have a connection assigned.");
      console.log("   VAPI manages routing directly.");
    }

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

checkNumberStatus();

