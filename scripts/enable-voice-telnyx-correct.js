// scripts/enable-voice-telnyx-correct.js
// Try ALL possible ways to enable voice in Telnyx

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
    console.log("🔧 Attempting to enable voice using ALL possible methods...\n");

    const phoneNumber = "+16692407730";
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");

    // Get phone number
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
    const phoneNumberId = telnyxNumber.id;

    console.log(`Phone Number ID: ${phoneNumberId}\n`);

    // Method 1: Direct PATCH with features object
    console.log("Method 1: PATCH /phone_numbers/{id} with features.voice.enabled");
    try {
      const response = await axios.patch(
        `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
        {
          features: {
            voice: {
              enabled: true
            }
          }
        },
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ Response:", JSON.stringify(response.data, null, 2));
    } catch (e) {
      console.log(`❌ Failed: ${e.response?.data?.errors?.[0]?.detail || e.message}`);
    }

    // Method 2: Voice endpoint
    console.log("\nMethod 2: PATCH /phone_numbers/{id}/voice");
    try {
      const response = await axios.patch(
        `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}/voice`,
        {
          enabled: true
        },
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ Response:", JSON.stringify(response.data, null, 2));
    } catch (e) {
      console.log(`❌ Failed: ${e.response?.data?.errors?.[0]?.detail || e.message}`);
    }

    // Method 3: Set connection (which should enable voice)
    console.log("\nMethod 3: Assign to Voice API Application (should auto-enable voice)");
    const voiceAppId = "2852388221130639218"; // The new application
    try {
      const response = await axios.patch(
        `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}/voice`,
        {
          connection_id: voiceAppId
        },
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ Response:", JSON.stringify(response.data, null, 2));
    } catch (e) {
      console.log(`❌ Failed: ${e.response?.data?.errors?.[0]?.detail || e.message}`);
    }

    // Wait and verify
    console.log("\n⏳ Waiting 3 seconds...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("\n🔍 Verifying voice status...");
    const verifyResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const verified = verifyResponse.data?.data || verifyResponse.data;
    console.log(`Voice Enabled: ${verified.features?.voice?.enabled || verified.voice_enabled || "unknown"}`);
    console.log(`Connection: ${verified.connection_name || verified.voice?.connection_name || "NONE"}`);

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

enableVoice();

