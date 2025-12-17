// scripts/create-voice-app-for-vapi.js
// Create a new Voice API Application for VAPI

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function createVoiceApp() {
  try {
    console.log("🔧 Creating Voice API Application for VAPI...\n");

    // Create Voice API Application
    // For VAPI, the webhook should point to VAPI's infrastructure
    // VAPI manages routing, so we use a placeholder or VAPI's webhook
    const appPayload = {
      application_name: "Tavari-VAPI-Routing",
      webhook_url: "https://api.vapi.ai/webhook", // VAPI's webhook endpoint
      webhook_event_filters: ["call.initiated", "call.answered", "call.hangup"],
    };

    console.log("Creating application with payload:");
    console.log(JSON.stringify(appPayload, null, 2));
    console.log("");

    const createResponse = await axios.post(
      `${TELNYX_API_BASE_URL}/applications`,
      appPayload,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const newApp = createResponse.data?.data || createResponse.data;
    
    console.log("=".repeat(60));
    console.log("✅ VOICE API APPLICATION CREATED:");
    console.log("=".repeat(60));
    console.log(`ID: ${newApp.id}`);
    console.log(`Name: ${newApp.application_name || newApp.name}`);
    console.log(`Webhook URL: ${newApp.webhook_url || "NOT SET"}`);
    console.log("=".repeat(60));

    console.log("\n📝 NEXT STEPS:");
    console.log("1. Update VAPI credential to use this application ID: " + newApp.id);
    console.log("2. Assign phone number to this application");
    console.log("3. Re-provision number in VAPI");
    console.log("");
    console.log("⚠️  NOTE: You may need to update the VAPI credential in VAPI dashboard");
    console.log("   or delete and recreate it with the new application ID.");

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("Full error:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

createVoiceApp();

