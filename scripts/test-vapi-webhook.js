// Test if VAPI webhook endpoint is accessible
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const webhookUrl = process.env.BACKEND_URL || 
                   process.env.RAILWAY_PUBLIC_DOMAIN || 
                   process.env.VERCEL_URL ||
                   'http://localhost:5001';

const testUrl = `${webhookUrl}/api/vapi/webhook`;

console.log('🧪 Testing VAPI Webhook Endpoint...\n');
console.log(`Base URL: ${webhookUrl}`);
console.log(`Webhook URL: ${testUrl}\n`);

// Test 1: GET endpoint (test route accessibility)
console.log('1️⃣ Testing GET endpoint (route accessibility)...');
try {
  const getResponse = await axios.get(testUrl, {
    timeout: 10000,
  });
  console.log('✅ GET endpoint is accessible!');
  console.log(`Status: ${getResponse.status}`);
  console.log(`Response:`, JSON.stringify(getResponse.data, null, 2));
  console.log('');
} catch (error) {
  if (error.response) {
    console.error(`❌ GET test failed: ${error.response.status}`);
    console.error(`Response:`, error.response.data);
  } else if (error.request) {
    console.error('❌ GET test failed: No response received');
    console.error('   Server may not be running or URL is incorrect');
  } else {
    console.error(`❌ GET test failed: ${error.message}`);
  }
  console.log('');
}

// Test 2: POST endpoint (actual webhook)
console.log('2️⃣ Testing POST endpoint (webhook handler)...');

// Test webhook with a mock call-start event
const testEvent = {
  type: "call-start",
  call: {
    id: "test-call-123",
    assistant: {
      id: "test-assistant-id",
      metadata: {
        businessId: "test-business-id",
      },
    },
    customer: {
      number: "+15551234567",
    },
  },
};

try {
  console.log('📤 Sending test webhook event...');
  const response = await axios.post(testUrl, testEvent, {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
  
  console.log('✅ Webhook POST responded successfully!');
  console.log(`Status: ${response.status}`);
  console.log(`Response:`, JSON.stringify(response.data, null, 2));
} catch (error) {
  console.error('❌ Webhook POST test failed!');
  if (error.response) {
    console.error(`Status: ${error.response.status}`);
    console.error(`Response:`, error.response.data);
    
    if (error.response.status === 404) {
      console.error('\n💡 404 Error - Possible causes:');
      console.error('   - Route not properly mounted in server.js');
      console.error('   - URL path mismatch');
      console.error('   - Server routing issue');
    }
  } else if (error.request) {
    console.error('No response received. Possible issues:');
    console.error('  - Webhook URL is incorrect');
    console.error('  - Server is not running');
    console.error('  - Firewall blocking the request');
    console.error('  - Network connectivity issue');
  } else {
    console.error('Error:', error.message);
  }
}

console.log('\n📝 Next steps:');
console.log('   1. Check server logs for webhook requests');
console.log('   2. Verify BACKEND_URL environment variable is set correctly');
console.log('   3. Ensure server is running and accessible');
console.log('   4. Check VAPI dashboard webhook URL configuration');

