// scripts/verify-vapi-phone-active.js
// Verify phone number is active and properly configured in VAPI

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

async function verifyPhone() {
  try {
    console.log("🔍 Verifying VAPI Phone Number Configuration...\n");

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

    console.log(`📋 Business: ${business.name}`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Assistant ID: ${business.vapi_assistant_id}\n`);

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

    console.log("✅ Phone Number in VAPI:");
    console.log(`   Number: ${vapiPhone.number || vapiPhone.phoneNumber || vapiPhone.phone_number}`);
    console.log(`   ID: ${vapiPhone.id}`);
    console.log(`   Status: ${vapiPhone.status || "unknown"}`);
    console.log(`   Provider: ${vapiPhone.provider || "unknown"}`);
    console.log(`   Assistant ID: ${vapiPhone.assistantId || vapiPhone.assistant?.id || "NOT LINKED"}\n`);

    // Check if properly linked
    if (
      vapiPhone.assistantId === business.vapi_assistant_id ||
      vapiPhone.assistant?.id === business.vapi_assistant_id
    ) {
      console.log("✅ Phone number IS linked to assistant");
    } else {
      console.log("❌ Phone number is NOT linked to assistant!");
      console.log(`   Expected: ${business.vapi_assistant_id}`);
      console.log(`   Actual: ${vapiPhone.assistantId || vapiPhone.assistant?.id || "NONE"}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔧 SOLUTION:");
    console.log("=".repeat(60));
    console.log("The phone number has a Telnyx SIP Connection set.");
    console.log("For VAPI to work, you need to:");
    console.log("");
    console.log("Option 1: Remove SIP Connection in Telnyx");
    console.log("  1. Go to Telnyx → Numbers → Your Number → Voice tab");
    console.log("  2. Set 'SIP Connection/Application' to 'None' or unassign it");
    console.log("  3. Save");
    console.log("");
    console.log("Option 2: Re-provision through VAPI");
    console.log("  VAPI should manage the routing automatically.");
    console.log("  The Telnyx connection might be interfering.");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

verifyPhone();

