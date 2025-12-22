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

    // Step 2: Test multiple possible Toll-Free Verification API endpoints
    console.log('2️⃣  Testing Toll-Free Verification API endpoints...\n');

    if (tollFreeNumbers.length > 0) {
      const testNumber = tollFreeNumbers[0];
      console.log(`   Testing with number: ${testNumber.phone_number}\n`);

      // Try multiple possible endpoint paths
      const endpointsToTest = [
        {
          path: '/toll_free_verifications',
          description: 'POST /v2/toll_free_verifications (official endpoint)',
        },
        {
          path: `/phone_numbers/${testNumber.id}/toll_free_verification`,
          description: `POST /v2/phone_numbers/{id}/toll_free_verification`,
        },
        {
          path: `/phone_numbers/${testNumber.id}/verification`,
          description: `POST /v2/phone_numbers/{id}/verification`,
        },
        {
          path: `/toll_free_numbers/${testNumber.id}/verification`,
          description: `POST /v2/toll_free_numbers/{id}/verification`,
        },
      ];

      let foundWorkingEndpoint = false;

      for (const endpoint of endpointsToTest) {
        console.log(`   Testing: ${endpoint.description}`);
        try {
          const verifyResponse = await axios.post(
            `${TELNYX_API_BASE_URL}${endpoint.path}`,
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
          
          console.log(`      ✅ SUCCESS! Endpoint exists and accepts requests!`);
          console.log(`      📋 Response:`, JSON.stringify(verifyResponse.data, null, 2));
          console.log(`\n   💡 Automatic verification via API IS AVAILABLE!`);
          console.log(`   💡 Use: POST ${endpoint.path}\n`);
          foundWorkingEndpoint = true;
          break;
        } catch (error) {
          if (error.response?.status === 404) {
            console.log(`      ❌ Not found (404)`);
          } else if (error.response?.status === 501) {
            console.log(`      ❌ Not implemented (501)`);
          } else if (error.response?.status === 400 || error.response?.status === 422) {
            console.log(`      ✅ EXISTS! Validation error (endpoint is available)`);
            console.log(`      📋 Error:`, JSON.stringify(error.response.data, null, 2));
            console.log(`\n   💡 Automatic verification via API IS AVAILABLE!`);
            console.log(`   💡 Use: POST ${endpoint.path}`);
            console.log(`   💡 Fix validation errors to use it successfully\n`);
            foundWorkingEndpoint = true;
            break;
          } else if (error.response?.status === 409) {
            console.log(`      ✅ EXISTS! Conflict (409) - verification may already exist`);
            console.log(`      📋 Response:`, JSON.stringify(error.response.data, null, 2));
            console.log(`\n   💡 Automatic verification via API IS AVAILABLE!`);
            console.log(`   💡 Use: POST ${endpoint.path}\n`);
            foundWorkingEndpoint = true;
            break;
          } else {
            console.log(`      ⚠️  Error ${error.response?.status}: ${error.response?.statusText || error.message}`);
          }
        }
      }

      if (!foundWorkingEndpoint) {
        console.log(`\n   ❌ No working API endpoint found`);
        console.log(`   💡 Automatic verification via API is NOT available`);
        console.log(`   💡 Manual verification required through Telnyx portal`);
        console.log(`   💡 Portal: https://portal.telnyx.com/#/app/numbers`);
        console.log(`\n   📝 Note: You have ${tollFreeNumbers.length} toll-free number(s), but the API endpoint is not available.`);
        console.log(`   📝 This could mean:`);
        console.log(`      - The API requires special account permissions`);
        console.log(`      - The API is behind a feature flag`);
        console.log(`      - Manual verification is the only option for your account`);
        console.log(`   📝 Contact Telnyx support to enable API access if needed\n`);
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
        console.log(`   📋 Full phone number data keys:`, Object.keys(data).join(', '));
        
        const verificationFields = Object.keys(data).filter(key => 
          key.toLowerCase().includes('verif') || 
          key.toLowerCase().includes('verify') ||
          key.toLowerCase().includes('toll') ||
          key.toLowerCase().includes('messaging')
        );
        
        if (verificationFields.length > 0) {
          console.log(`   📊 Verification/messaging-related fields found:`);
          verificationFields.forEach(field => {
            console.log(`      - ${field}: ${JSON.stringify(data[field])}`);
          });
        } else {
          console.log(`   ⚠️  No verification-related fields found in response`);
        }
        
        // Check messaging profile which might contain verification info
        if (data.messaging_profile_id) {
          console.log(`   📱 Messaging Profile ID: ${data.messaging_profile_id}`);
          try {
            const profileResponse = await axios.get(
              `${TELNYX_API_BASE_URL}/messaging_profiles/${data.messaging_profile_id}`,
              {
                headers: {
                  Authorization: `Bearer ${TELNYX_API_KEY}`,
                },
              }
            );
            console.log(`   📋 Messaging Profile data:`, JSON.stringify(profileResponse.data.data, null, 2));
          } catch (profileError) {
            console.log(`   ⚠️  Could not fetch messaging profile: ${profileError.message}`);
          }
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
