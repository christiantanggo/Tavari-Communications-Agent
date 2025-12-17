// scripts/test-vapi-connection.js
// Quick test script to verify VAPI connection and functionality

import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_API_URL = "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error("❌ VAPI_API_KEY not found in environment variables");
  process.exit(1);
}

console.log("🧪 Testing VAPI Connection...\n");

// Test 1: Verify API Key
async function testAPIKey() {
  console.log("1️⃣ Testing API Key...");
  try {
    const response = await axios.get(`${VAPI_API_URL}/assistant`, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
      },
    });
    console.log("   ✅ API Key is valid");
    console.log(`   📊 Found ${response.data?.length || 0} assistants\n`);
    return true;
  } catch (error) {
    console.error("   ❌ API Key test failed:", error.response?.data?.message || error.message);
    return false;
  }
}

// Test 2: Create a test assistant
async function testCreateAssistant() {
  console.log("2️⃣ Testing Assistant Creation...");
  try {
    // Use the same structure as the actual service
    const { createAssistant } = await import("../services/vapi.js");
    
    const testAssistant = await createAssistant({
      name: "Tavari Test Assistant",
      public_phone_number: "",
      timezone: "America/New_York",
      business_hours: {},
      faqs: [],
      contact_email: "test@tavari.com",
      address: "",
      allow_call_transfer: false,
      after_hours_behavior: "take_message",
    });

    console.log("   ✅ Assistant created successfully");
    console.log(`   📝 Assistant ID: ${testAssistant.id}\n`);
    return testAssistant.id;
  } catch (error) {
    console.error("   ❌ Assistant creation failed:", error.response?.data?.message || error.message);
    return null;
  }
}

// Test 3: List Telnyx credentials
async function testListCredentials() {
  console.log("3️⃣ Testing Telnyx Credentials...");
  try {
    const response = await axios.get(`${VAPI_API_URL}/credential`, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
      },
    });
    const allCredentials = response.data || [];
    const telnyxCredentials = allCredentials.filter(cred => cred.provider === "telnyx");
    console.log("   ✅ Credentials retrieved");
    console.log(`   🔑 Found ${telnyxCredentials.length} Telnyx credential(s) out of ${allCredentials.length} total`);
    if (telnyxCredentials.length > 0) {
      console.log(`   📝 First credential ID: ${telnyxCredentials[0].id}`);
      console.log(`   💡 Add to .env: VAPI_TELNYX_CREDENTIAL_ID=${telnyxCredentials[0].id}\n`);
    } else {
      console.log("   ⚠️  No Telnyx credentials found. You may need to add one in VAPI dashboard.\n");
    }
    return telnyxCredentials;
  } catch (error) {
    console.error("   ❌ Credential listing failed:", error.response?.data?.message || error.message);
    return [];
  }
}

// Test 4: List phone numbers
async function testListPhoneNumbers() {
  console.log("4️⃣ Testing Phone Number Listing...");
  try {
    const response = await axios.get(`${VAPI_API_URL}/phone-number`, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
      },
    });
    console.log("   ✅ Phone numbers retrieved");
    console.log(`   📞 Found ${response.data?.length || 0} phone numbers\n`);
    return response.data || [];
  } catch (error) {
    console.error("   ❌ Phone number listing failed:", error.response?.data?.message || error.message);
    return [];
  }
}

// Test 5: Test webhook endpoint (if server is running)
async function testWebhook() {
  console.log("4️⃣ Testing Webhook Endpoint...");
  const webhookUrl = process.env.BACKEND_URL || process.env.VAPI_WEBHOOK_URL || "http://localhost:5001";
  const fullWebhookUrl = `${webhookUrl}/api/vapi/webhook`;
  
  try {
    const testEvent = {
      type: "call-start",
      call: {
        id: "test-call-id",
        assistant: {
          id: "test-assistant-id",
          metadata: {
            businessId: "test-business-id",
          },
        },
        customer: {
          number: "+1234567890",
        },
      },
    };

    const response = await axios.post(fullWebhookUrl, testEvent, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });

    if (response.status === 200) {
      console.log("   ✅ Webhook endpoint is reachable");
      console.log(`   🌐 Webhook URL: ${fullWebhookUrl}\n`);
      return true;
    }
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ECONNRESET") {
      console.log("   ⚠️  Webhook endpoint not reachable (server may not be running)");
      console.log(`   💡 Start server with: npm start`);
      console.log(`   💡 Or set BACKEND_URL in .env if server is running elsewhere\n`);
    } else {
      console.log(`   ⚠️  Webhook test failed: ${error.message}`);
      console.log(`   💡 This is OK if server is not running - webhook will work when server is active\n`);
    }
    return false;
  }
}

// Test 6: Create a test call (if phone number available)
async function testCreateCall(assistantId, phoneNumberId) {
  console.log("5️⃣ Testing Call Creation...");
  
  if (!phoneNumberId) {
    console.log("   ⚠️  No phone number available, skipping call test");
    console.log("   💡 Provision a phone number first\n");
    return false;
  }

  try {
    const testCall = {
      assistantId: assistantId,
      phoneNumberId: phoneNumberId,
      customer: {
        number: process.env.TEST_PHONE_NUMBER || "+1234567890", // Replace with test number
      },
    };

    console.log("   ⚠️  This would create a real call!");
    console.log("   💡 Uncomment the code below to test actual call creation\n");
    
    // Uncomment to actually make a test call:
    /*
    const response = await axios.post(
      `${VAPI_API_URL}/call`,
      testCall,
      {
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("   ✅ Test call created");
    console.log(`   📞 Call ID: ${response.data.id}\n`);
    return true;
    */
    
    return false;
  } catch (error) {
    console.error("   ❌ Call creation failed:", error.response?.data?.message || error.message);
    return false;
  }
}

// Test 7: Cleanup test assistant
async function cleanupTestAssistant(assistantId) {
  if (!assistantId) return;
  
  console.log("6️⃣ Cleaning up test assistant...");
  try {
    await axios.delete(`${VAPI_API_URL}/assistant/${assistantId}`, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
      },
    });
    console.log("   ✅ Test assistant deleted\n");
  } catch (error) {
    console.error("   ⚠️  Failed to delete test assistant:", error.message);
    console.log(`   💡 Manual cleanup: Delete assistant ${assistantId}\n`);
  }
}

// Run all tests
async function runTests() {
  console.log("=".repeat(50));
  console.log("VAPI Connection Test Suite");
  console.log("=".repeat(50) + "\n");

  const results = {
    apiKey: false,
    assistant: false,
    phoneNumbers: false,
    webhook: false,
    call: false,
  };

  // Test 1: API Key
  results.apiKey = await testAPIKey();
  if (!results.apiKey) {
    console.log("❌ API Key test failed. Cannot continue.\n");
    process.exit(1);
  }

  // Test 2: Create Assistant
  const assistantId = await testCreateAssistant();
  results.assistant = assistantId !== null;

  // Test 3: List Telnyx Credentials
  const credentials = await testListCredentials();
  results.credentials = credentials.length > 0;

  // Test 4: List Phone Numbers
  const phoneNumbers = await testListPhoneNumbers();
  results.phoneNumbers = phoneNumbers.length > 0;
  const phoneNumberId = phoneNumbers.length > 0 ? phoneNumbers[0].id : null;

  // Test 5: Webhook
  results.webhook = await testWebhook();

  // Test 6: Create Call (optional)
  if (assistantId && phoneNumberId) {
    results.call = await testCreateCall(assistantId, phoneNumberId);
  }

  // Cleanup
  if (assistantId) {
    await cleanupTestAssistant(assistantId);
  }

  // Summary
  console.log("=".repeat(50));
  console.log("Test Summary");
  console.log("=".repeat(50));
  console.log(`API Key:        ${results.apiKey ? "✅" : "❌"}`);
  console.log(`Assistant:      ${results.assistant ? "✅" : "❌"}`);
  console.log(`Credentials:    ${results.credentials ? "✅" : "❌"}`);
  console.log(`Phone Numbers:  ${results.phoneNumbers ? "✅" : "❌"}`);
  console.log(`Webhook:        ${results.webhook ? "✅" : "❌"}`);
  console.log(`Call Creation:  ${results.call ? "✅" : "⚠️  (skipped)"}`);
  console.log("=".repeat(50) + "\n");

  const allCritical = results.apiKey && results.assistant;
  if (allCritical) {
    if (!results.credentials) {
      console.log("⚠️  Warning: No Telnyx credentials found. Phone provisioning may fail.");
      console.log("   💡 Add a Telnyx credential in VAPI dashboard or set VAPI_TELNYX_CREDENTIAL_ID\n");
    }
    console.log("✅ Critical tests passed! VAPI is connected and working.\n");
  } else {
    console.log("❌ Some critical tests failed. Please check your configuration.\n");
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

