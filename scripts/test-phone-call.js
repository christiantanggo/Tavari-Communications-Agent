// scripts/test-phone-call.js
// Test if phone number is receiving calls and check Telnyx configuration

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  console.log("\nTo check Telnyx configuration:");
  console.log("1. Go to portal.telnyx.com");
  console.log("2. Get your API key");
  console.log("3. Add to Railway: TELNYX_API_KEY=your_key");
  process.exit(1);
}

async function checkTelnyxNumber() {
  try {
    console.log("📞 Checking Telnyx Phone Number Configuration...\n");

    const phoneNumber = "+16692407730";
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");

    console.log(`Looking up: ${phoneNumber}\n`);

    // Get phone number from Telnyx
    const response = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const numbers = response.data?.data || [];
    if (numbers.length === 0) {
      console.log("❌ Phone number not found in Telnyx account!");
      console.log("   This number might not be purchased in Telnyx.");
      return;
    }

    const telnyxNumber = numbers[0];
    console.log("✅ Phone Number Found in Telnyx:");
    console.log(`   Number: ${telnyxNumber.phone_number}`);
    console.log(`   Status: ${telnyxNumber.status || "unknown"}`);
    console.log(`   Voice Enabled: ${telnyxNumber.features?.voice?.enabled || false}`);
    console.log(`   SMS Enabled: ${telnyxNumber.features?.sms?.enabled || false}`);
    console.log(`   Voice Application ID: ${telnyxNumber.connection_name || telnyxNumber.voice?.connection_name || "NOT SET"}`);
    console.log(`   Messaging Profile ID: ${telnyxNumber.messaging_profile_id || "NOT SET"}\n`);

    // Check if voice is enabled
    if (!telnyxNumber.features?.voice?.enabled) {
      console.log("⚠️  WARNING: Voice is NOT enabled for this number!");
      console.log("   Enable it in Telnyx dashboard → Phone Numbers → Your Number → Features");
    }

    // Check connection/application
    if (!telnyxNumber.connection_name && !telnyxNumber.voice?.connection_name) {
      console.log("⚠️  WARNING: No Voice Application configured!");
      console.log("   This number needs to be linked to a Voice API Application.");
      console.log("   VAPI should handle this, but you may need to configure it manually.");
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔧 IF CALLS DON'T ANSWER:");
    console.log("=".repeat(60));
    console.log("1. Check VAPI Dashboard → Phone Numbers");
    console.log("2. Verify the number shows as 'active'");
    console.log("3. Check Telnyx Dashboard → Phone Numbers");
    console.log("4. Verify Voice is enabled");
    console.log("5. Check that VAPI has proper Telnyx credentials");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error("\n⚠️  Authentication failed. Check your TELNYX_API_KEY.");
    }
  }
}

checkTelnyxNumber();

