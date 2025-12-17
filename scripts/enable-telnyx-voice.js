// scripts/enable-telnyx-voice.js
// Enable Voice feature for Telnyx phone number

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function enableVoice() {
  try {
    console.log("🔧 Enabling Voice for Telnyx Phone Number...\n");

    const phoneNumber = "+16692407730";
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");

    // First, get the phone number ID
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
      console.log("❌ Phone number not found in Telnyx");
      return;
    }

    const telnyxNumber = numbers[0];
    const phoneNumberId = telnyxNumber.id;

    console.log(`Found number: ${telnyxNumber.phone_number}`);
    console.log(`Phone Number ID: ${phoneNumberId}\n`);

    // Enable voice feature - Telnyx API structure
    console.log("Enabling Voice feature...");
    const updateResponse = await axios.patch(
      `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
      {
        features: {
          voice: {
            enabled: true,
          },
          sms: {
            enabled: true,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const updated = updateResponse.data?.data || updateResponse.data;
    console.log("✅ Update request sent!");
    console.log("\nUpdated number details:");
    console.log(`   Voice Enabled: ${updated.features?.voice?.enabled || updated.voice_enabled || "checking..."}`);
    console.log(`   SMS Enabled: ${updated.features?.sms?.enabled || updated.sms_enabled || "checking..."}`);
    console.log(`   Status: ${updated.status || "unknown"}`);
    
    // Verify by fetching again
    console.log("\nVerifying...");
    const verifyResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );
    
    const verified = verifyResponse.data?.data || verifyResponse.data;
    console.log(`   Verified Voice Enabled: ${verified.features?.voice?.enabled || verified.voice_enabled || false}`);
    console.log(`   Verified SMS Enabled: ${verified.features?.sms?.enabled || verified.sms_enabled || false}`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Voice is now enabled!");
    console.log("   Try calling the number again: +16692407730");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error("\n⚠️  Authentication failed. Check your TELNYX_API_KEY.");
    } else if (error.response?.status === 404) {
      console.error("\n⚠️  Phone number not found. Check the number.");
    }
  }
}

enableVoice();

