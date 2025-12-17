// scripts/delete-all-vapi-phone-numbers.js
// Delete all phone numbers from VAPI

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

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

async function deleteAllPhoneNumbers() {
  try {
    console.log("🔍 Finding all phone numbers in VAPI...\n");

    const phoneRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneRes.data) ? phoneRes.data : phoneRes.data?.data || [];
    
    console.log(`Found ${phoneNumbers.length} phone number(s)\n`);

    if (phoneNumbers.length === 0) {
      console.log("✅ No phone numbers to delete");
      return;
    }

    for (const phone of phoneNumbers) {
      const phoneNumber = phone.number || phone.phoneNumber || phone.phone_number;
      const phoneId = phone.id;
      
      console.log(`Deleting: ${phoneNumber} (ID: ${phoneId})...`);
      
      try {
        await vapiClient.delete(`/phone-number/${phoneId}`);
        console.log(`✅ Deleted: ${phoneNumber}\n`);
      } catch (error) {
        console.error(`❌ Failed to delete ${phoneNumber}:`, error.response?.data || error.message);
      }
    }

    console.log("=".repeat(60));
    console.log("✅ All phone numbers deleted!");
    console.log("   You can now delete the credential in VAPI dashboard");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

deleteAllPhoneNumbers();

