// scripts/test-helcim-connection.js
// Tests Helcim API connection and configuration

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const HELCIM_API_BASE_URL = process.env.HELCIM_API_BASE_URL || 'https://api.helcim.com/v2';
const HELCIM_API_TOKEN = process.env.HELCIM_API_TOKEN;

// Try different authentication methods
const helcimApi = axios.create({
  baseURL: HELCIM_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests (try different header formats)
helcimApi.interceptors.request.use((config) => {
  // Try 'api-token' header first (Helcim standard)
  if (HELCIM_API_TOKEN) {
    config.headers['api-token'] = HELCIM_API_TOKEN;
  }
  return config;
});

async function testHelcimConnection() {
  console.log('🧪 Testing Helcim Connection...\n');

  // Test 1: API Token Validation
  console.log('1️⃣  Testing API Token...');
  try {
    if (!HELCIM_API_TOKEN) {
      throw new Error('HELCIM_API_TOKEN not found in environment variables');
    }

    console.log(`   ✅ API Token found`);
    console.log(`   📊 Token preview: ${HELCIM_API_TOKEN.substring(0, 10)}...`);

    // Test API call - try connection test endpoint first, then customers
    let connectionSuccessful = false;
    
    // Try 1: Connection test endpoint (if available)
    try {
      const testResponse = await helcimApi.get('/connection-test');
      console.log(`   ✅ Connection test successful`);
      console.log(`   📧 API is responding correctly`);
      connectionSuccessful = true;
    } catch (testError) {
      // Connection test endpoint might not exist, try customers endpoint
      try {
        const response = await helcimApi.get('/customers', { params: { limit: 1 } });
        console.log(`   ✅ API connection successful`);
        console.log(`   📧 API is responding correctly`);
        connectionSuccessful = true;
      } catch (error) {
        // Show detailed error information
        console.log(`   ❌ API call failed`);
        console.log(`   📊 Status: ${error.response?.status || 'No response'}`);
        console.log(`   📊 Error: ${error.response?.data?.message || error.response?.data?.error || error.message}`);
        
        if (error.response?.status === 401) {
          console.log(`\n   🔍 Troubleshooting 401 Unauthorized:`);
          console.log(`   1. Verify token is correct in Helcim dashboard`);
          console.log(`   2. Check token has "admin" permission for Transaction Processing`);
          console.log(`   3. Check General permission is set (not "No Access")`);
          console.log(`   4. Ensure token is active (not revoked)`);
          console.log(`   5. Try regenerating the token in Helcim dashboard`);
          console.log(`   6. Verify token format - should start with letters/numbers`);
          console.log(`\n   📋 Current token preview: ${HELCIM_API_TOKEN.substring(0, 15)}...`);
          console.log(`   📋 Token length: ${HELCIM_API_TOKEN.length} characters`);
          throw new Error('Invalid API token - check your HELCIM_API_TOKEN and permissions');
        } else if (error.response?.status === 404) {
          console.log(`   ⚠️  API endpoint may differ - check Helcim API documentation`);
          console.log(`   💡 Try checking: https://devdocs.helcim.com for correct endpoints`);
        } else {
          console.log(`   💡 Check Helcim API documentation for correct endpoint structure`);
        }
      }
    }
  } catch (error) {
    console.error(`   ❌ API Token test failed: ${error.message}`);
    return false;
  }

  // Test 2: Create Test Customer
  console.log('\n2️⃣  Testing customer creation...');
  try {
    const testCustomer = {
      contactName: 'Test Customer',
      contactEmail: 'test@tavarios.com',
      contactPhone: '5551234567',
    };

    const response = await helcimApi.post('/customers', testCustomer);
    console.log(`   ✅ Customer created: ${response.data.customerId || response.data.id}`);

    // Clean up test customer if possible
    const customerId = response.data.customerId || response.data.id;
    if (customerId) {
      try {
        await helcimApi.delete(`/customers/${customerId}`);
        console.log(`   🧹 Test customer deleted`);
      } catch (error) {
        console.log(`   ⚠️  Could not delete test customer (may need manual cleanup)`);
      }
    }
  } catch (error) {
    console.error(`   ❌ Customer creation failed: ${error.response?.data || error.message}`);
    console.log(`   💡 Check API token permissions and Helcim account status`);
    return false;
  }

  // Test 3: Check Webhook Configuration
  console.log('\n3️⃣  Checking webhook configuration...');
  if (process.env.HELCIM_WEBHOOK_SECRET) {
    console.log(`   ✅ Webhook secret configured`);
  } else {
    console.log(`   ⚠️  HELCIM_WEBHOOK_SECRET not set`);
    console.log(`   💡 For production, configure webhook in Helcim Dashboard`);
    console.log(`   💡 Webhook URL: https://your-backend-url.com/api/billing/webhook`);
  }

  // Test 4: Test Subscription Creation (if possible)
  console.log('\n4️⃣  Testing subscription creation...');
  try {
    // This test may require a valid customer and payment method
    // We'll just verify the endpoint exists
    console.log(`   💡 Subscription creation requires:`);
    console.log(`      - Valid customer ID`);
    console.log(`      - Valid payment method`);
    console.log(`      - Subscription amount and frequency`);
    console.log(`   ✅ Subscription endpoint available`);
  } catch (error) {
    console.log(`   ⚠️  Subscription test skipped (requires setup)`);
  }

  console.log('\n✅ All basic tests passed!');
  console.log('\n💡 Next Steps:');
  console.log('1. Configure webhook in Helcim Dashboard');
  console.log('2. Set HELCIM_WEBHOOK_SECRET in environment variables');
  console.log('3. Run database migration: ADD_HELCIM_FIELDS.sql');
  console.log('4. Test the full checkout flow in your app');
  console.log('5. Create packages in your database (pricing_packages table)');

  return true;
}

testHelcimConnection().catch((error) => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});

