// scripts/check-voice-app-webhook-vapi.js
// Check Voice API Application webhook for VAPI compatibility

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function checkVoiceApp() {
  try {
    console.log("🔍 Checking Telnyx Voice API Application for VAPI...\n");

    // The VAPI credential uses this application ID
    const voiceAppId = "2843154782451926416";

    // Get Voice API Application
    const appResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/applications/${voiceAppId}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const app = appResponse.data?.data || appResponse.data;
    
    console.log("=".repeat(60));
    console.log("📞 VOICE API APPLICATION DETAILS:");
    console.log("=".repeat(60));
    console.log(`ID: ${app.id}`);
    console.log(`Name: ${app.name || "N/A"}`);
    console.log(`Webhook URL: ${app.webhook_url || app.webhook_api_version || "NOT SET"}`);
    console.log(`Webhook Event Filters: ${app.webhook_event_filters?.join(", ") || "ALL"}`);
    console.log(`Active: ${app.active !== false ? "Yes" : "No"}`);
    console.log("=".repeat(60));

    // Check if number is assigned to this app
    const phoneNumber = "+16692407730";
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");

    const phoneResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`,
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
        },
      }
    );

    const numbers = phoneResponse.data?.data || [];
    if (numbers.length > 0) {
      const telnyxNumber = numbers[0];
      const isAssigned = telnyxNumber.connection_id === voiceAppId || 
                        telnyxNumber.voice?.application_id === voiceAppId ||
                        telnyxNumber.voice_application_id === voiceAppId;
      
      console.log("\n📱 PHONE NUMBER ASSIGNMENT:");
      console.log(`   Assigned to this Voice App: ${isAssigned ? "✅ YES" : "❌ NO"}`);
      console.log(`   Current Connection ID: ${telnyxNumber.connection_id || "NONE"}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔧 VAPI REQUIREMENTS:");
    console.log("=".repeat(60));
    console.log("When using VAPI with Telnyx:");
    console.log("1. VAPI credential references Voice API Application: " + voiceAppId);
    console.log("2. Phone number SHOULD be assigned to this application");
    console.log("3. Voice API Application webhook should route to VAPI");
    console.log("4. OR webhook should be a placeholder (VAPI manages routing)");
    console.log("");
    console.log("Current webhook: " + (app.webhook_url || "NOT SET"));
    console.log("");
    console.log("If webhook is set to your server, it may conflict with VAPI routing.");
    console.log("VAPI should handle routing, so webhook might need to be:");
    console.log("  - https://api.vapi.ai/webhook (VAPI's webhook)");
    console.log("  - OR left empty/unset");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.error("\n⚠️  Voice API Application not found!");
      console.error("   This might be why calls aren't working.");
    }
  }
}

checkVoiceApp();

