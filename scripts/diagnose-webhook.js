// Comprehensive webhook diagnostic script
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { supabaseClient } from '../config/database.js';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error('❌ VAPI_API_KEY not set in .env file');
  process.exit(1);
}

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const backendUrl = process.env.BACKEND_URL || 
                   process.env.RAILWAY_PUBLIC_DOMAIN || 
                   process.env.VERCEL_URL ||
                   'http://localhost:5001';

const expectedWebhookUrl = `${backendUrl}/api/vapi/webhook`;

console.log('🔍 VAPI Webhook Diagnostic Tool\n');
console.log('=' .repeat(60));
console.log(`Expected Webhook URL: ${expectedWebhookUrl}`);
console.log(`Backend URL: ${backendUrl}`);
console.log('=' .repeat(60));
console.log('');

// Test 1: Check if webhook endpoint is accessible
async function testWebhookEndpoint() {
  console.log('1️⃣ Testing Webhook Endpoint Accessibility...\n');
  
  // Test POST endpoint (this is what VAPI actually uses)
  try {
    const testEvent = {
      type: "call-start",
      call: {
        id: "diagnostic-test-call",
        assistant: {
          id: "test-assistant",
        },
        customer: {
          number: "+15551234567",
        },
      },
    };

    const postResponse = await axios.post(expectedWebhookUrl, testEvent, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });
    console.log('✅ POST endpoint is accessible');
    console.log(`   Status: ${postResponse.status}`);
    console.log(`   Response: ${JSON.stringify(postResponse.data)}\n`);
  } catch (error) {
    if (error.response) {
      console.log(`⚠️  POST endpoint returned ${error.response.status}`);
      if (error.response.status === 404) {
        console.log('   ❌ 404 Error - Route not found!');
        console.log('   Check server.js route mounting\n');
      } else {
        console.log(`   Response: ${JSON.stringify(error.response.data)}\n`);
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to server');
      console.log('   Server may not be running or URL is incorrect\n');
    } else {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }

  // Note: GET endpoint may return 404, but POST is what matters for webhooks
  console.log('💡 Note: GET endpoint may not be available, but POST (webhook) is what VAPI uses\n');
}

// Test 2: Check all assistants' webhook configuration
async function checkAssistants() {
  console.log('2️⃣ Checking Assistant Webhook Configurations...\n');

  try {
    // Get all businesses with assistants
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, vapi_assistant_id')
      .not('vapi_assistant_id', 'is', null);

    if (error) throw error;

    if (businesses.length === 0) {
      console.log('⚠️  No businesses with assistants found\n');
      return;
    }

    console.log(`Found ${businesses.length} business(es) with assistants:\n`);

    let issuesFound = 0;

    for (const business of businesses) {
      console.log(`📋 Business: ${business.name}`);
      console.log(`   Assistant ID: ${business.vapi_assistant_id}`);

      try {
        // Get assistant from VAPI
        const assistantRes = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
        const assistant = assistantRes.data;

        const currentWebhookUrl = assistant.serverUrl || 'NOT SET';
        const webhookSecret = assistant.serverUrlSecret ? 'SET' : 'NOT SET';

        console.log(`   Current Webhook URL: ${currentWebhookUrl}`);
        console.log(`   Webhook Secret: ${webhookSecret}`);

        // Check if webhook URL matches expected
        if (currentWebhookUrl === expectedWebhookUrl) {
          console.log(`   ✅ Webhook URL is correct\n`);
        } else if (currentWebhookUrl === 'NOT SET') {
          console.log(`   ❌ Webhook URL is NOT SET\n`);
          issuesFound++;
        } else {
          console.log(`   ⚠️  Webhook URL mismatch!`);
          console.log(`      Expected: ${expectedWebhookUrl}`);
          console.log(`      Current:  ${currentWebhookUrl}\n`);
          issuesFound++;
        }
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`   ❌ Assistant not found in VAPI\n`);
          issuesFound++;
        } else {
          console.log(`   ❌ Error fetching assistant: ${error.message}\n`);
          issuesFound++;
        }
      }
    }

    if (issuesFound > 0) {
      console.log(`\n⚠️  Found ${issuesFound} issue(s) that need fixing`);
      console.log('   Run: npm run fix:webhook\n');
    } else {
      console.log('\n✅ All assistants have correct webhook configuration!\n');
    }

  } catch (error) {
    console.error('❌ Error checking assistants:', error.message);
  }
}

// Test 3: Check environment variables
function checkEnvironment() {
  console.log('3️⃣ Checking Environment Variables...\n');

  const required = {
    'VAPI_API_KEY': process.env.VAPI_API_KEY,
    'BACKEND_URL': process.env.BACKEND_URL || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL_URL,
  };

  const optional = {
    'VAPI_WEBHOOK_SECRET': process.env.VAPI_WEBHOOK_SECRET,
  };

  console.log('Required:');
  for (const [key, value] of Object.entries(required)) {
    if (value) {
      console.log(`   ✅ ${key}: ${value.substring(0, 20)}...`);
    } else {
      console.log(`   ❌ ${key}: NOT SET`);
    }
  }

  console.log('\nOptional:');
  for (const [key, value] of Object.entries(optional)) {
    if (value) {
      console.log(`   ✅ ${key}: SET`);
    } else {
      console.log(`   ⚠️  ${key}: NOT SET (recommended for security)`);
    }
  }

  console.log('');
}

// Run all diagnostics
async function runDiagnostics() {
  checkEnvironment();
  await testWebhookEndpoint();
  await checkAssistants();

  console.log('=' .repeat(60));
  console.log('📝 Summary:');
  console.log('   1. If webhook endpoint is not accessible, check:');
  console.log('      - Server is running');
  console.log('      - BACKEND_URL is set correctly');
  console.log('      - Route is mounted in server.js');
  console.log('');
  console.log('   2. If assistants have wrong webhook URL, run:');
  console.log('      npm run fix:webhook');
  console.log('');
  console.log('   3. Test webhook with:');
  console.log('      npm run test:webhook');
  console.log('=' .repeat(60));
}

runDiagnostics().catch(console.error);

