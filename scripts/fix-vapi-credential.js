// scripts/fix-vapi-credential.js
// Check if we can update VAPI credential or need to recreate it

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

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

async function fixCredential() {
  try {
    console.log("🔧 Checking VAPI Credential Configuration...\n");

    const credentialId = "c978be20-580b-435d-a03a-51ad7bfdfa1c";

    // Get current credential
    const getResponse = await vapiClient.get(`/credential/${credentialId}`);
    const credential = getResponse.data;

    console.log("Current credential:");
    console.log(JSON.stringify(credential, null, 2));
    console.log("");

    // Check if we can update it
    console.log("Attempting to update credential (remove telnyxApplicationId)...");
    try {
      const updateResponse = await vapiClient.patch(`/credential/${credentialId}`, {
        // Try removing telnyxApplicationId or setting it to null
        telnyxApplicationId: null,
      });
      console.log("✅ Credential updated!");
      console.log(JSON.stringify(updateResponse.data, null, 2));
    } catch (updateError) {
      console.log("❌ Cannot update credential via API");
      console.log("   Error:", updateError.response?.data || updateError.message);
      console.log("");
      console.log("⚠️  You may need to:");
      console.log("   1. Delete the credential in VAPI dashboard");
      console.log("   2. Create a new Telnyx credential WITHOUT Voice API Application");
      console.log("   3. Re-provision the phone number with the new credential");
    }

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

fixCredential();

