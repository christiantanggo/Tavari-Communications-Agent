// scripts/test-telnyx-verification-api.js
// Test script to check if Telnyx supports automatic toll-free verification via API

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = 'https://api.telnyx.com/v2';

if (!TELNYX_API_KEY) {
  console.error('❌ TELNYX_API_KEY not set in environment variables');
  process.exit(1);
}

async function testVerificationAPI() {
  console.log('🔍 Testing Telnyx Toll-Free Verification API...\n');

  try {
    // Step 1: Get a toll-free number from your account
    console.log('1️⃣  Fetching toll-free numbers from your Telnyx account...');
    const numbersResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'filter[phone_number_type]': 'toll-free',
        'page[size]': '5',
      },
    });

    const tollFreeNumbers = numbersResponse.data?.data || [];
    
    if (tollFreeNumbers.length === 0) {
      console.log('⚠️  No toll-free numbers found in your account.');
      console.log('   You can still test the API endpoints below.\n');
    } else {
      console.log(`✅ Found ${tollFreeNumbers.length} toll-free number(s):`);
      tollFreeNumbers.forEach((num, idx) => {
        console.log(`   ${idx + 1}. ${num.phone_number} (ID: ${num.id})`);
        console.log(`      Status: ${num.status || 'unknown'}`);
        console.log(`      Verification Status: ${num.verification_status || num.toll_free_verification_status || 'unknown'}`);
      });
      console.log('');
    }

    // Step 2: Test the official Toll-Free Verification API endpoint
    console.log('2️⃣  Testing official Toll-Free Verification API endpoint...\n');
    console.log('   Endpoint: POST /v2/toll_free_verifications\n');

    if (tollFreeNumbers.length > 0) {
      const testNumber = tollFreeNumbers[0];
      console.log(`   Testing with number: ${testNumber.phone_number}\n`);

      try {
        const verifyResponse = await axios.post(
          `${TELNYX_API_BASE_URL}/toll_free_verifications`,
          {
            phone_number: testNumber.phone_number,
            use_case: 'Marketing and promotional messages',
            business_name: 'Test Business',
            website: 'https://example.com',
            // Optional but recommended (mandatory after Jan 1, 2026)
            business_registration_number: '12-3456789', // Example EIN
            business_registration_type: 'PRIVATE_PROFIT',
            business_registration_country: 'US',
          },
          {
            headers: {
              Authorization: `Bearer ${TELNYX_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        console.log(`   ✅ SUCCESS! Endpoint exists and accepts requests!`);
        console.log(`   📋 Response:`, JSON.stringify(verifyResponse.data, null, 2));
        console.log(`\n   💡 Automatic verification via API IS AVAILABLE!`);
        console.log(`   💡 You can use POST /v2/toll_free_verifications to verify numbers programmatically\n`);
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`   ❌ Endpoint does NOT exist (404 Not Found)`);
          console.log(`   💡 Automatic verification via API is NOT available`);
          console.log(`   💡 Manual verification required through Telnyx portal`);
          console.log(`   💡 Portal: https://portal.telnyx.com/#/app/numbers\n`);
        } else if (error.response?.status === 501) {
          console.log(`   ❌ Endpoint not implemented (501 Not Implemented)`);
          console.log(`   💡 Automatic verification via API is NOT available\n`);
        } else if (error.response?.status === 400 || error.response?.status === 422) {
          console.log(`   ✅ Endpoint EXISTS but returned validation error`);
          console.log(`   💡 This means the API endpoint IS AVAILABLE!`);
          console.log(`   📋 Error details:`, JSON.stringify(error.response.data, null, 2));
          console.log(`\n   💡 Automatic verification via API IS AVAILABLE!`);
          console.log(`   💡 Fix the validation errors above to use it successfully\n`);
        } else if (error.response?.status === 409) {
          console.log(`   ⚠️  Conflict (409) - Number may already be verified or verification in progress`);
          console.log(`   💡 This means the API endpoint IS AVAILABLE!`);
          console.log(`   📋 Response:`, JSON.stringify(error.response.data, null, 2));
          console.log(`\n   💡 Automatic verification via API IS AVAILABLE!\n`);
        } else {
          console.log(`   ⚠️  Unexpected error: ${error.response?.status} ${error.response?.statusText || error.message}`);
          console.log(`   📋 Response:`, error.response?.data || error.message);
          console.log(`\n   💡 Check the error above to determine if API is available\n`);
        }
      }
    } else {
      console.log(`   ⏭️  Skipped (no toll-free numbers to test)`);
      console.log(`   💡 You can still test by manually providing a phone number\n`);
    }

    // Step 3: Check phone number details for verification status
    console.log('3️⃣  Checking phone number details endpoint...\n');
    if (tollFreeNumbers.length > 0) {
      const testNumber = tollFreeNumbers[0];
      try {
        const detailResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers/${testNumber.id}`, {
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
          },
        });
        
        console.log(`   ✅ Endpoint exists`);
        
        // Check for verification-related fields
        const data = detailResponse.data.data || {};
        const verificationFields = Object.keys(data).filter(key => 
          key.toLowerCase().includes('verif') || 
          key.toLowerCase().includes('verify') ||
          key.toLowerCase().includes('status')
        );
        
        if (verificationFields.length > 0) {
          console.log(`   📊 Verification-related fields found:`);
          verificationFields.forEach(field => {
            console.log(`      - ${field}: ${data[field]}`);
          });
        } else {
          console.log(`   ⚠️  No verification-related fields found in response`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.response?.status} ${error.response?.statusText || error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Summary:\n');
    
    console.log('To check if automatic verification is available:');
    console.log('1. Run this script: npm run test:verification');
    console.log('2. Look for "✅ SUCCESS!" or "✅ Endpoint EXISTS" messages');
    console.log('3. If you see those, automatic verification IS available via API');
    console.log('4. If you see "❌ Endpoint does NOT exist", manual verification is required\n');
    
    console.log('Official Telnyx API endpoint:');
    console.log('  POST /v2/toll_free_verifications');
    console.log('  Documentation: https://developers.telnyx.com/api-reference/toll-free-verifications\n');

  } catch (error) {
    console.error('\n❌ Error testing verification API:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testVerificationAPI()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
