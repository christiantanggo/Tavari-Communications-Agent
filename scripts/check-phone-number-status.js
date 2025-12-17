// scripts/check-phone-number-status.js
// Check if phone number is properly configured in VAPI and Telnyx

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

async function checkPhoneNumberStatus() {
  try {
    console.log("📞 Checking Phone Number Status...\n");

    // Get business with phone number
    const { data: businesses, error } = await supabaseClient
      .from("businesses")
      .select("id, name, vapi_phone_number, vapi_assistant_id")
      .not("vapi_phone_number", "is", null)
      .limit(1);

    if (error) throw error;

    if (businesses.length === 0) {
      console.log("❌ No businesses with phone numbers found");
      return;
    }

    const business = businesses[0];
    const phoneNumber = business.vapi_phone_number;
    console.log(`📋 Business: ${business.name}`);
    console.log(`   Phone Number: ${phoneNumber}\n`);

    // Get phone number details from VAPI
    console.log("🔍 Fetching phone number details from VAPI...\n");
    const phoneNumbersRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneNumbersRes.data)
      ? phoneNumbersRes.data
      : phoneNumbersRes.data?.data || [];

    const matchingNumber = phoneNumbers.find(
      (pn) =>
        pn.number === phoneNumber ||
        pn.phoneNumber === phoneNumber ||
        pn.phone_number === phoneNumber
    );

    if (!matchingNumber) {
      console.log("❌ Phone number not found in VAPI!");
      console.log("   This means the number isn't provisioned in VAPI.");
      console.log("   You need to provision it using the setup wizard or admin panel.\n");
      return;
    }

    console.log("✅ Phone Number Found in VAPI:");
    console.log(`   Number: ${matchingNumber.number || matchingNumber.phoneNumber || matchingNumber.phone_number}`);
    console.log(`   ID: ${matchingNumber.id}`);
    console.log(`   Status: ${matchingNumber.status || "unknown"}`);
    console.log(`   Assistant ID: ${matchingNumber.assistantId || matchingNumber.assistant?.id || "NOT LINKED"}`);
    console.log(`   Provider: ${matchingNumber.provider || "unknown"}`);
    console.log(`   Credential ID: ${matchingNumber.credentialId || matchingNumber.credential_id || "NOT SET"}\n`);

    // Check if linked to assistant
    if (
      matchingNumber.assistantId === business.vapi_assistant_id ||
      matchingNumber.assistant?.id === business.vapi_assistant_id
    ) {
      console.log("✅ Phone number IS linked to assistant");
    } else {
      console.log("❌ Phone number is NOT linked to assistant!");
      console.log(`   Expected Assistant ID: ${business.vapi_assistant_id}`);
      console.log(`   Actual Assistant ID: ${matchingNumber.assistantId || matchingNumber.assistant?.id || "NONE"}`);
      console.log("\n   You need to link the assistant to the phone number.");
    }

    // Check credential
    if (!matchingNumber.credentialId && !matchingNumber.credential_id) {
      console.log("\n⚠️  WARNING: No Telnyx credential ID set!");
      console.log("   VAPI needs a Telnyx credential to route calls.");
      console.log("   Check VAPI dashboard → Settings → Credentials");
    }

    console.log("\n" + "=".repeat(60));
    console.log("📱 TO FIX IF CALLS DON'T ANSWER:");
    console.log("=".repeat(60));
    console.log("1. Go to VAPI Dashboard: https://dashboard.vapi.ai");
    console.log("2. Go to Phone Numbers");
    console.log(`3. Find: ${phoneNumber}`);
    console.log("4. Check that it's linked to assistant:", business.vapi_assistant_id);
    console.log("5. Check that Telnyx credential is set");
    console.log("6. Verify the number status is 'active'");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error("\n⚠️  Authentication failed. Check your VAPI_API_KEY.");
    }
  }
}

checkPhoneNumberStatus();

