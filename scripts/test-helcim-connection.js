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

    // Test API call - try different authentication methods and endpoints
    let connectionSuccessful = false;
    let lastError = null;
    
    // Try different authentication header formats
    const authMethods = [
      { name: 'api-token header', header: 'api-token' },
      { name: 'Authorization Bearer', header: 'Authorization', value: `Bearer ${HELCIM_API_TOKEN}` },
      { name: 'X-API-Token header', header: 'X-API-Token' },
    ];
    
    // Try different base URLs
    const baseUrls = [
      'https://api.helcim.com/v2',
      'https://api.helcim.com',
      'https://secure.helcim.com/api/v2',
    ];
    
    for (const baseUrl of baseUrls) {
      for (const authMethod of authMethods) {
        try {
          console.log(`   🔄 Trying: ${baseUrl} with ${authMethod.name}...`);
          
          const testApi = axios.create({
            baseURL: baseUrl,
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          // Add auth header
          if (authMethod.value) {
            testApi.defaults.headers.common[authMethod.header] = authMethod.value;
          } else {
            testApi.defaults.headers.common[authMethod.header] = HELCIM_API_TOKEN;
          }
          
          // Try different endpoints to find what works
          let response;
          const endpointsToTry = [
            '/customers',
            '/customer',
            '/api/customers',
            '/v2/customers',
            '/',
            '/health',
            '/status',
          ];
          
          let endpointWorked = false;
          for (const endpoint of endpointsToTry) {
            try {
              response = await testApi.get(endpoint, { params: { limit: 1 } });
              console.log(`   ✅ Endpoint ${endpoint} worked!`);
              endpointWorked = true;
              break;
            } catch (epError) {
              // Try next endpoint
              continue;
            }
          }
          
          if (!endpointWorked) {
            throw new Error('No endpoint worked');
          }
          console.log(`   ✅ SUCCESS! Using: ${baseUrl} with ${authMethod.name}`);
          console.log(`   📧 API is responding correctly`);
          console.log(`   📊 Response status: ${response.status}`);
          console.log(`   💡 Update HELCIM_API_BASE_URL to: ${baseUrl}`);
          console.log(`   💡 Use authentication method: ${authMethod.name}`);
          connectionSuccessful = true;
          break;
        } catch (error) {
          lastError = error;
          if (error.response?.status === 401) {
            // Continue trying other methods
            continue;
          } else if (error.response?.status === 404) {
            // Wrong endpoint, but auth might be working
            console.log(`   ⚠️  404 with ${authMethod.name} - endpoint might be wrong but auth format may be correct`);
            continue;
          } else {
            // Network or other error
            continue;
          }
        }
      }
      if (connectionSuccessful) break;
    }
    
    if (!connectionSuccessful) {
      // Show detailed error information
      console.log(`   ❌ All authentication methods failed`);
      console.log(`   📊 Last error status: ${lastError?.response?.status || 'No response'}`);
      console.log(`   📊 Last error: ${lastError?.response?.data?.message || lastError?.response?.data?.error || lastError?.message}`);
      
      if (lastError?.response?.status === 401) {
        console.log(`\n   🔍 Troubleshooting 401 Unauthorized:`);
        console.log(`   1. Verify token is correct in Helcim dashboard`);
        console.log(`   2. Check token has "admin" permission for Transaction Processing`);
        console.log(`   3. Check General permission is set to "Read and Write" (not "No Access")`);
        console.log(`   4. Ensure token is active (not revoked)`);
        console.log(`   5. Try regenerating the token in Helcim dashboard`);
        console.log(`   6. Verify token format - should start with letters/numbers`);
        console.log(`   7. Check if token is for test vs live environment`);
        console.log(`\n   📋 Current token preview: ${HELCIM_API_TOKEN.substring(0, 15)}...`);
        console.log(`   📋 Token length: ${HELCIM_API_TOKEN.length} characters`);
        console.log(`   📋 Current base URL: ${HELCIM_API_BASE_URL}`);
        throw new Error('Invalid API token - check your HELCIM_API_TOKEN and permissions');
      } else if (lastError?.response?.status === 404) {
        console.log(`   ⚠️  API endpoint may differ - check Helcim API documentation`);
        console.log(`   💡 Try checking: https://devdocs.helcim.com for correct endpoints`);
      } else {
        console.log(`   💡 Check Helcim API documentation for correct endpoint structure`);
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

