// scripts/check-voice-app-webhook-url.js
// Check the Voice API Application webhook URL

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY not set");
  process.exit(1);
}

async function checkWebhook() {
  try {
    const voiceAppId = "2852388221130639218";

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
    console.log("📞 VOICE API APPLICATION WEBHOOK:");
    console.log("=".repeat(60));
    console.log(`Application ID: ${app.id}`);
    console.log(`Name: ${app.application_name || app.name}`);
    console.log(`Webhook URL: ${app.webhook_url || "NOT SET"}`);
    console.log("=".repeat(60));
    
    if (app.webhook_url && app.webhook_url !== "https://api.vapi.ai/webhook") {
      console.log("\n⚠️  PROBLEM FOUND!");
      console.log(`   Current webhook: ${app.webhook_url}`);
      console.log(`   Should be: https://api.vapi.ai/webhook`);
      console.log("\n   VAPI needs to receive calls first, then sends events to your server.");
      console.log("   Update the webhook URL in Telnyx dashboard.");
    } else if (!app.webhook_url) {
      console.log("\n⚠️  Webhook URL is NOT SET!");
      console.log("   Set it to: https://api.vapi.ai/webhook");
    } else {
      console.log("\n✅ Webhook URL is correct!");
    }

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

checkWebhook();

