// scripts/remove-phone-from-voice-app.js
// Remove phone number from Telnyx Voice API Application so VAPI can manage it

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function removeFromVoiceApp() {
  try {
    console.log("🔧 Removing Phone Number from Voice API Application...\n");

    const phoneNumber = "+16692407730";
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");

    // Get phone number from Telnyx
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
    console.log(`Phone Number ID: ${phoneNumberId}`);
    console.log(`Current Connection: ${telnyxNumber.connection_name || telnyxNumber.voice?.connection_name || "NOT SET"}\n`);

    // Remove the connection (set to null)
    console.log("🔗 Removing SIP Connection/Application...");
    const updateResponse = await axios.patch(
      `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}/voice`,
      {
        connection_id: null, // Remove connection
      },
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Connection removed!");
    
    // Verify
    const verifyResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const verified = verifyResponse.data?.data || verifyResponse.data;
    console.log(`\n✅ Verified:`);
    console.log(`   Connection: ${verified.connection_name || verified.voice?.connection_name || "NONE (removed)"}`);
    console.log(`   Voice Enabled: ${verified.features?.voice?.enabled || false}`);

    console.log("\n" + "=".repeat(60));
    console.log("📱 NEXT STEPS:");
    console.log("=".repeat(60));
    console.log("1. VAPI should now manage routing directly");
    console.log("2. Wait 2-3 minutes for changes to propagate");
    console.log("3. Try calling: " + phoneNumber);
    console.log("4. If it still doesn't work, VAPI may need to re-provision the number");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error("\n⚠️  Authentication failed. Check your TELNYX_API_KEY.");
    }
  }
}

removeFromVoiceApp();

