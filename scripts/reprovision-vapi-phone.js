// scripts/reprovision-vapi-phone.js
// Re-provision phone number through VAPI to fix routing

import dotenv from "dotenv";
dotenv.config();

import { supabaseClient } from "../config/database.js";
import { provisionPhoneNumber, linkAssistantToNumber } from "../services/vapi.js";

async function reprovisionPhone() {
  try {
    console.log("🔧 Re-provisioning Phone Number through VAPI...\n");

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

    console.log("⚠️  WARNING: This will re-provision the phone number in VAPI.");
    console.log("   This should fix the routing issue.\n");

    // Re-provision the number (VAPI will handle Telnyx configuration)
    console.log("📞 Re-provisioning phone number in VAPI...");
    const vapiPhoneNumber = await provisionPhoneNumber(phoneNumber, business.public_phone_number);
    
    console.log("✅ Phone number re-provisioned!");
    console.log(`   VAPI Phone Number ID: ${vapiPhoneNumber.id}`);
    console.log(`   Status: ${vapiPhoneNumber.status || "unknown"}\n`);

    // Link assistant to the number
    console.log("🔗 Linking assistant to phone number...");
    await linkAssistantToNumber(assistantId, vapiPhoneNumber.id);
    console.log("✅ Assistant linked!\n");

    // Update database with new phone number ID if it changed
    if (vapiPhoneNumber.id) {
      console.log("💾 Updating database...");
      // Note: We don't have a field for vapi_phone_number_id, but the number itself should be the same
      console.log("✅ Database update not needed (phone number unchanged)\n");
    }

    console.log("=".repeat(60));
    console.log("✅ RE-PROVISIONING COMPLETE!");
    console.log("=".repeat(60));
    console.log("1. Wait 2-3 minutes for changes to propagate");
    console.log("2. Try calling: " + phoneNumber);
    console.log("3. The VAPI assistant should now answer");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.response?.data) {
      console.error("   Details:", JSON.stringify(error.response.data, null, 2));
    }
    console.log("\n💡 If provisioning fails, you may need to:");
    console.log("   1. Check VAPI Dashboard → Credentials (Telnyx credential must be set)");
    console.log("   2. Verify the phone number exists in Telnyx");
    console.log("   3. Check VAPI API key is valid");
  }
}

reprovisionPhone();

