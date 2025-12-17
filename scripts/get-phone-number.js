// scripts/get-phone-number.js
// Get the VAPI phone number for testing

import dotenv from "dotenv";
dotenv.config();

import { supabaseClient } from "../config/database.js";

async function getPhoneNumber() {
  try {
    console.log("📞 Finding VAPI phone numbers...\n");

    // Get all businesses with VAPI phone numbers
    const { data: businesses, error } = await supabaseClient
      .from("businesses")
      .select("id, name, vapi_phone_number, vapi_assistant_id")
      .not("vapi_phone_number", "is", null)
      .is("deleted_at", null);

    if (error) {
      console.error("❌ Database error:", error.message);
      process.exit(1);
    }

    if (!businesses || businesses.length === 0) {
      console.log("⚠️  No businesses with VAPI phone numbers found.");
      console.log("\nTo set up a phone number:");
      console.log("1. Go to your dashboard");
      console.log("2. Complete the setup wizard");
      console.log("3. Purchase a phone number");
      process.exit(0);
    }

    console.log(`✅ Found ${businesses.length} business(es) with phone numbers:\n`);

    businesses.forEach((business, index) => {
      console.log(`${index + 1}. ${business.name || "Unnamed Business"}`);
      console.log(`   Phone Number: ${business.vapi_phone_number}`);
      console.log(`   Assistant ID: ${business.vapi_assistant_id || "Not set"}`);
      console.log(`   Business ID: ${business.id}`);
      console.log("");
    });

    // Show the first phone number prominently
    if (businesses.length > 0) {
      const firstBusiness = businesses[0];
      console.log("=".repeat(60));
      console.log("📱 CALL THIS NUMBER TO TEST:");
      console.log(`   ${firstBusiness.vapi_phone_number}`);
      console.log("=".repeat(60));
      console.log("\nThis number is linked to:", firstBusiness.name || "Unnamed Business");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

getPhoneNumber();

