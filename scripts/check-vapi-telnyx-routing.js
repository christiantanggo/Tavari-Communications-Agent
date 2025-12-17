// scripts/check-vapi-telnyx-routing.js
// Check how VAPI expects Telnyx to be configured

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { supabaseClient } from "../config/database.js";

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

async function checkRouting() {
  try {
    console.log("🔍 Checking VAPI Phone Number Routing Configuration...\n");

    // Get business
    const { data: businesses } = await supabaseClient
      .from("businesses")
      .select("id, name, vapi_phone_number, vapi_assistant_id")
      .not("vapi_phone_number", "is", null)
      .limit(1);

    if (businesses.length === 0) {
      console.log("❌ No businesses with phone numbers found");
      return;
    }

    const business = businesses[0];
    const phoneNumber = business.vapi_phone_number;

    // Get phone number from VAPI
    const phoneRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneRes.data) ? phoneRes.data : phoneRes.data?.data || [];
    
    const vapiPhone = phoneNumbers.find(
      (pn) =>
        pn.number === phoneNumber ||
        pn.phoneNumber === phoneNumber ||
        pn.phone_number === phoneNumber
    );

    if (!vapiPhone) {
      console.log("❌ Phone number not found in VAPI!");
      return;
    }

    console.log("✅ VAPI Phone Number Configuration:");
    console.log(`   Number: ${vapiPhone.number || vapiPhone.phoneNumber || vapiPhone.phone_number}`);
    console.log(`   ID: ${vapiPhone.id}`);
    console.log(`   Status: ${vapiPhone.status || "unknown"}`);
    console.log(`   Provider: ${vapiPhone.provider || "unknown"}`);
    console.log(`   Credential ID: ${vapiPhone.credentialId || vapiPhone.credential_id || "NOT SET"}`);
    console.log(`   Assistant ID: ${vapiPhone.assistantId || vapiPhone.assistant?.id || "NOT SET"}\n`);

    // Check if there's any routing information
    console.log("📋 Full VAPI Phone Number Data:");
    console.log(JSON.stringify(vapiPhone, null, 2));

    console.log("\n" + "=".repeat(60));
    console.log("💡 SOLUTION FOR TELNYX VOICE API APPLICATION:");
    console.log("=".repeat(60));
    console.log("When using VAPI with Telnyx:");
    console.log("");
    console.log("Option 1: Remove phone number from Voice API Application");
    console.log("  1. Go to Telnyx → Numbers → Your Number → Voice tab");
    console.log("  2. Set 'SIP Connection/Application' to 'None'");
    console.log("  3. Save");
    console.log("  (VAPI should manage routing directly)");
    console.log("");
    console.log("Option 2: Keep Voice API Application but route to VAPI");
    console.log("  VAPI may provide a webhook URL for Telnyx to use.");
    console.log("  Check VAPI Dashboard → Phone Numbers → Your Number");
    console.log("  Look for 'Telnyx Webhook URL' or similar");
    console.log("");
    console.log("Option 3: Use a dummy webhook URL");
    console.log("  Set webhook to: https://api.vapi.ai/webhook (if VAPI provides this)");
    console.log("  OR set to your server but don't use it");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

checkRouting();

