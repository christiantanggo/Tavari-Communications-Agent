// scripts/delete-and-reprovision-vapi-phone.js
// Delete phone number from VAPI and re-provision it to fix routing

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

async function deleteAndReprovision() {
  try {
    console.log("🔄 Deleting and Re-provisioning Phone Number in VAPI...\n");

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

    if (!assistantId) {
      console.log("❌ No assistant ID found. Cannot re-provision.");
      return;
    }

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
      return;
    }

    const phoneNumberId = vapiPhone.id;
    console.log(`✅ Found phone number in VAPI:`);
    console.log(`   ID: ${phoneNumberId}\n`);

    console.log("⚠️  WARNING: This will delete the phone number from VAPI.");
    console.log("   The number will remain in Telnyx, but VAPI routing will be removed.");
    console.log("   We'll then re-provision it to fix the routing.\n");

    // Delete the phone number from VAPI
    console.log("🗑️  Deleting phone number from VAPI...");
    try {
      await vapiClient.delete(`/phone-number/${phoneNumberId}`);
      console.log("✅ Phone number deleted from VAPI\n");
    } catch (deleteError) {
      if (deleteError.response?.status === 404) {
        console.log("⚠️  Phone number not found in VAPI (may already be deleted)\n");
      } else {
        throw deleteError;
      }
    }

    // Wait a moment
    console.log("⏳ Waiting 2 seconds...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Re-provision the number
    console.log("📞 Re-provisioning phone number in VAPI...");
    const { provisionPhoneNumber, linkAssistantToNumber } = await import("../services/vapi.js");
    
    const vapiPhoneNumber = await provisionPhoneNumber(phoneNumber, business.public_phone_number);
    console.log("✅ Phone number re-provisioned!");
    console.log(`   VAPI Phone Number ID: ${vapiPhoneNumber.id}\n`);

    // Link assistant
    console.log("🔗 Linking assistant to phone number...");
    await linkAssistantToNumber(assistantId, vapiPhoneNumber.id);
    console.log("✅ Assistant linked!\n");

    console.log("=".repeat(60));
    console.log("✅ RE-PROVISIONING COMPLETE!");
    console.log("=".repeat(60));
    console.log("1. Wait 2-3 minutes for changes to propagate");
    console.log("2. In Telnyx → Numbers → Your Number → Voice tab:");
    console.log("   - Set 'SIP Connection/Application' to 'None' (if possible)");
    console.log("   - OR leave it as 'Tavari-Voice-Agent' but ensure webhook is set correctly");
    console.log("3. Try calling: " + phoneNumber);
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.response?.data) {
      console.error("   Details:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

deleteAndReprovision();

