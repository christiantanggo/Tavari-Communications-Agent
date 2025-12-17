// scripts/force-enable-telnyx-voice.js
// Force enable voice feature using Telnyx API

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function forceEnableVoice() {
  try {
    console.log("🔧 Force Enabling Voice Feature...\n");

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

    // Try different API endpoints to enable voice
    console.log("Method 1: Updating phone number directly...");
    try {
      const update1 = await axios.patch(
        `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
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
      console.log("✅ Update sent via phone_numbers endpoint");
    } catch (e) {
      console.log("⚠️  Method 1 failed:", e.response?.data?.errors?.[0]?.title || e.message);
    }

    console.log("\nMethod 2: Updating via voice endpoint...");
    try {
      const update2 = await axios.patch(
        `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}/voice`,
        {},
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ Update sent via voice endpoint");
    } catch (e) {
      console.log("⚠️  Method 2 failed:", e.response?.data?.errors?.[0]?.title || e.message);
    }

    // Verify
    console.log("\n🔍 Verifying...");
    const verifyResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const verified = verifyResponse.data?.data || verifyResponse.data;
    console.log(`   Voice Enabled: ${verified.features?.voice?.enabled || verified.voice_enabled || false}`);
    console.log(`   Connection: ${verified.connection_name || verified.voice?.connection_name || "NONE"}`);
    console.log(`   Status: ${verified.status || "unknown"}`);

    console.log("\n" + "=".repeat(60));
    console.log("📱 IMPORTANT:");
    console.log("=".repeat(60));
    console.log("When using VAPI:");
    console.log("- VAPI should manage Telnyx routing automatically");
    console.log("- The phone number should NOT have a SIP Connection set");
    console.log("- Voice should be enabled (VAPI may enable it automatically)");
    console.log("");
    console.log("If voice is still disabled, VAPI may enable it when it provisions the number.");
    console.log("Wait 2-3 minutes after re-provisioning, then try calling again.");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

forceEnableVoice();

