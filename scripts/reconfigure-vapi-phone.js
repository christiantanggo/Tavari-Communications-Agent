// scripts/reconfigure-vapi-phone.js
// Reconfigure phone number in VAPI to ensure proper routing

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

async function reconfigurePhone() {
  try {
    console.log("🔧 Reconfiguring Phone Number in VAPI...\n");

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
    const assistantId = business.vapi_assistant_id;

    console.log(`📋 Business: ${business.name}`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Assistant ID: ${assistantId}\n`);

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
      console.log("   You may need to provision it first.");
      return;
    }

    const phoneNumberId = vapiPhone.id;
    console.log(`✅ Found phone number in VAPI:`);
    console.log(`   ID: ${phoneNumberId}`);
    console.log(`   Current Status: ${vapiPhone.status || "unknown"}`);
    console.log(`   Current Assistant: ${vapiPhone.assistantId || vapiPhone.assistant?.id || "NONE"}\n`);

    // Re-link the assistant to ensure proper configuration
    console.log("🔗 Re-linking assistant to phone number...");
    try {
      const linkResponse = await vapiClient.patch(`/phone-number/${phoneNumberId}`, {
        assistantId: assistantId,
      });
      console.log("✅ Successfully re-linked assistant!");
    } catch (patchError) {
      // Try PUT if PATCH fails
      if (patchError.response?.status === 405 || patchError.response?.status === 404) {
        console.log("   Trying PUT method...");
        const linkResponse = await vapiClient.put(`/phone-number/${phoneNumberId}`, {
          assistantId: assistantId,
        });
        console.log("✅ Successfully re-linked assistant!");
      } else {
        throw patchError;
      }
    }

    // Verify the link
    console.log("\n🔍 Verifying configuration...");
    const verifyRes = await vapiClient.get(`/phone-number/${phoneNumberId}`);
    const verified = verifyRes.data;
    
    console.log(`   Status: ${verified.status || "unknown"}`);
    console.log(`   Assistant ID: ${verified.assistantId || verified.assistant?.id || "NOT SET"}`);
    console.log(`   Provider: ${verified.provider || "unknown"}`);
    console.log(`   Number: ${verified.number || verified.phoneNumber || verified.phone_number}`);

    if (verified.assistantId === assistantId || verified.assistant?.id === assistantId) {
      console.log("\n✅ Phone number is properly configured!");
      console.log("\n" + "=".repeat(60));
      console.log("📱 NEXT STEPS:");
      console.log("=".repeat(60));
      console.log("1. Wait 1-2 minutes for changes to propagate");
      console.log("2. Try calling: " + phoneNumber);
      console.log("3. If it still says 'out of service', check:");
      console.log("   - VAPI Dashboard → Phone Numbers → Check status");
      console.log("   - Telnyx Dashboard → Ensure number is active");
      console.log("=".repeat(60));
    } else {
      console.log("\n⚠️  Warning: Assistant link verification failed");
      console.log(`   Expected: ${assistantId}`);
      console.log(`   Got: ${verified.assistantId || verified.assistant?.id || "NONE"}`);
    }

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error("\n⚠️  Authentication failed. Check your VAPI_API_KEY.");
    } else if (error.response?.status === 404) {
      console.error("\n⚠️  Phone number or assistant not found in VAPI.");
    }
  }
}

reconfigurePhone();

