// scripts/check-vapi-credential-config.js
// Check VAPI Telnyx credential configuration

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

async function checkCredential() {
  try {
    console.log("🔍 Checking VAPI Telnyx Credential Configuration...\n");

    // Get all credentials
    let response;
    try {
      response = await vapiClient.get("/credential");
    } catch (error) {
      if (error.response?.status === 404) {
        response = await vapiClient.get("/credentials");
      } else {
        throw error;
      }
    }
    
    const allCredentials = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    const telnyxCreds = allCredentials.filter(cred => cred.provider === "telnyx");
    
    console.log(`Found ${telnyxCreds.length} Telnyx credential(s)\n`);
    
    for (const cred of telnyxCreds) {
      console.log("=".repeat(60));
      console.log("📋 CREDENTIAL DETAILS:");
      console.log("=".repeat(60));
      console.log(`ID: ${cred.id}`);
      console.log(`Provider: ${cred.provider}`);
      console.log(`Name: ${cred.name || "N/A"}`);
      console.log(`Status: ${cred.status || "N/A"}`);
      console.log(`Created: ${cred.createdAt || "N/A"}`);
      console.log(`Updated: ${cred.updatedAt || "N/A"}`);
      console.log("");
      console.log("Full credential object:");
      console.log(JSON.stringify(cred, null, 2));
      console.log("=".repeat(60));
    }

    // Check phone number
    console.log("\n📞 Checking Phone Number Configuration...\n");
    const phoneRes = await vapiClient.get("/phone-number");
    const phoneNumbers = Array.isArray(phoneRes.data) ? phoneRes.data : phoneRes.data?.data || [];
    
    const phoneNumber = phoneNumbers.find(pn => 
      pn.number === "+16692407730" || 
      pn.phoneNumber === "+16692407730" ||
      pn.phone_number === "+16692407730"
    );

    if (phoneNumber) {
      console.log("Phone Number in VAPI:");
      console.log(JSON.stringify(phoneNumber, null, 2));
      console.log(`Credential ID: ${phoneNumber.credentialId}`);
      console.log(`Status: ${phoneNumber.status}`);
    }

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("Full error:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkCredential();

