// scripts/remove-connection-completely.js
// Completely remove SIP Connection from Telnyx number for VAPI

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function removeConnection() {
  try {
    console.log("🔧 Removing SIP Connection from Telnyx Number...\n");

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

    console.log(`Current Connection: ${telnyxNumber.connection_name || "NONE"}`);
    console.log(`Connection ID: ${telnyxNumber.connection_id || "NONE"}\n`);

    // Method 1: Update phone number directly (remove connection_id)
    console.log("Method 1: Removing connection via phone_numbers endpoint...");
    try {
      const update1 = await axios.patch(
        `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
        {
          connection_id: null,
        },
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ Update sent");
    } catch (e) {
      console.log(`⚠️  Method 1 failed: ${e.response?.data?.errors?.[0]?.title || e.message}`);
    }

    // Method 2: Update via voice endpoint
    console.log("\nMethod 2: Removing connection via voice endpoint...");
    try {
      const update2 = await axios.patch(
        `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}/voice`,
        {
          connection_id: null,
        },
        {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ Update sent");
    } catch (e) {
      console.log(`⚠️  Method 2 failed: ${e.response?.data?.errors?.[0]?.title || e.message}`);
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify
    console.log("\n🔍 Verifying removal...");
    const verifyResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers/${phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const verified = verifyResponse.data?.data || verifyResponse.data;
    const connectionName = verified.connection_name || verified.voice?.connection_name || "NONE";
    const connectionId = verified.connection_id || verified.voice?.connection_id || "NONE";

    console.log(`   Connection Name: ${connectionName}`);
    console.log(`   Connection ID: ${connectionId}`);

    if (connectionName === "NONE" || !connectionId || connectionId === "NONE") {
      console.log("\n✅ SUCCESS: Connection removed!");
      console.log("   VAPI can now manage routing directly.");
    } else {
      console.log("\n⚠️  Connection still assigned!");
      console.log("   You may need to remove it manually in Telnyx dashboard:");
      console.log("   1. Go to Numbers → Your Number");
      console.log("   2. Voice tab → Set SIP Connection/Application to 'None'");
      console.log("   3. Save");
    }

    console.log("\n" + "=".repeat(60));
    console.log("📱 NEXT STEPS:");
    console.log("=".repeat(60));
    console.log("1. Wait 2-3 minutes for changes to propagate");
    console.log("2. Try calling: " + phoneNumber);
    console.log("3. If it still doesn't work, check VAPI dashboard");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

removeConnection();

