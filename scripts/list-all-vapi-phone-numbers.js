// scripts/list-all-vapi-phone-numbers.js
// List all phone numbers in VAPI to find what's using the credential

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

async function listAllPhoneNumbers() {
  try {
    console.log("🔍 Listing all phone numbers in VAPI...\n");

    const phoneRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneRes.data) ? phoneRes.data : phoneRes.data?.data || [];
    
    console.log(`Found ${phoneNumbers.length} phone number(s) in VAPI:\n`);
    
    for (const phone of phoneNumbers) {
      console.log("=".repeat(60));
      console.log(`Number: ${phone.number || phone.phoneNumber || phone.phone_number}`);
      console.log(`ID: ${phone.id}`);
      console.log(`Status: ${phone.status}`);
      console.log(`Credential ID: ${phone.credentialId || "NONE"}`);
      console.log(`Assistant ID: ${phone.assistantId || "NONE"}`);
      console.log(`Provider: ${phone.provider}`);
      console.log("=".repeat(60));
      console.log("");
    }

    if (phoneNumbers.length === 0) {
      console.log("✅ No phone numbers found in VAPI");
      console.log("   The credential should be deletable now.");
    } else {
      console.log(`⚠️  Found ${phoneNumbers.length} phone number(s) still in VAPI`);
      console.log("   You need to delete these before you can delete the credential.");
    }

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

listAllPhoneNumbers();

