// scripts/create-voice-app-correct.js
// Create Voice API Application using correct Telnyx endpoint

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

    // Try different endpoints
    const endpoints = [
      "/call_control_applications",
      "/applications", 
      "/voice/applications",
    ];

    const appPayload = {
      application_name: "Tavari-VAPI-Routing",
      webhook_url: "https://api.vapi.ai/webhook",
      webhook_event_filters: ["call.initiated", "call.answered", "call.hangup"],
    };

    for (const endpoint of endpoints) {
      try {
        console.log(`Trying endpoint: ${endpoint}...`);
        const createResponse = await axios.post(
          `${TELNYX_API_BASE_URL}${endpoint}`,
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
        return newApp;
      } catch (error) {
        if (error.response?.status !== 404) {
          console.log(`❌ Error with ${endpoint}:`, error.response?.data || error.message);
        }
        // Try next endpoint
      }
    }

    console.log("\n❌ Could not create Voice API Application with any endpoint.");
    console.log("   You may need to create it manually in Telnyx dashboard:");
    console.log("   1. Go to Voice → Voice API Applications");
    console.log("   2. Create new application");
    console.log("   3. Set webhook to: https://api.vapi.ai/webhook");
    console.log("   4. Note the Application ID");

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

createVoiceApp();

