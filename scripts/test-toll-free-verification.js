// scripts/test-toll-free-verification.js
// Test toll-free verification for a specific number or all toll-free numbers

import axios from 'axios';
import dotenv from 'dotenv';
import { isTollFree } from '../utils/phoneFormatter.js';

// Load environment variables first
dotenv.config();

// Verify API key is loaded
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = 'https://api.telnyx.com/v2';

if (!TELNYX_API_KEY) {
  console.error('❌ TELNYX_API_KEY not set in environment variables');
  console.error('   Make sure you have a .env file with TELNYX_API_KEY=your_key');
  process.exit(1);
}

// Import services after env is loaded
const { autoVerifyAfterPurchase, getVerificationStatus, submitTollFreeVerification } = await import('../services/telnyxVerification.js');

async function testTollFreeVerification() {
  console.log('🔍 Testing Toll-Free Verification for Your Purchased Number...\n');

  try {
    // Step 1: Get all phone numbers and find toll-free ones
    console.log('1️⃣  Fetching all phone numbers from your Telnyx account...');
    const numbersResponse = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'page[size]': '50',
      },
    });

    const allNumbers = numbersResponse.data?.data || [];
    
    // Filter to only actual toll-free numbers
    const tollFreeNumbers = allNumbers.filter(num => {
      if (!num.phone_number) return false;
      return isTollFree(num.phone_number);
    });
    
    console.log(`   📊 Found ${allNumbers.length} total phone number(s)`);
    console.log(`   🔍 Found ${tollFreeNumbers.length} toll-free number(s)\n`);
    
    if (tollFreeNumbers.length === 0) {
      console.log('❌ No toll-free numbers found in your account.');
      console.log('   Make sure you purchased a number with area code: 800, 833, 844, 855, 866, 877, 888\n');
      process.exit(1);
    }

    // Step 2: Show toll-free numbers
    console.log('2️⃣  Your Toll-Free Numbers:\n');
    tollFreeNumbers.forEach((num, idx) => {
      console.log(`   ${idx + 1}. ${num.phone_number} (ID: ${num.id})`);
      console.log(`      Status: ${num.status || 'unknown'}`);
      console.log(`      Phone Type: ${num.phone_number_type || 'unknown'}`);
      console.log(`      Created: ${num.created_at || 'unknown'}`);
    });
    console.log('');

    // Step 3: Test verification for each toll-free number
    console.log('3️⃣  Testing Verification API for Each Number...\n');
    
    for (const number of tollFreeNumbers) {
      console.log(`   Testing: ${number.phone_number}`);
      console.log(`   ──────────────────────────────────────────`);
      
      // Test 1: Check current verification status
      try {
        const status = await getVerificationStatus(number.phone_number);
        
        console.log(`   📊 Current Status:`);
        console.log(`      Verified: ${status.verified ? '✅ YES' : '❌ NO'}`);
        console.log(`      Is Toll-Free: ${status.is_toll_free ? '✅ YES' : '❌ NO'}`);
        console.log(`      Verification Status: ${status.verification_status || 'unknown'}`);
        console.log(`      Can Verify: ${status.can_verify ? '✅ YES' : '❌ NO'}`);
      } catch (statusError) {
        console.log(`   ⚠️  Could not check status: ${statusError.message}`);
      }
      
      // Test 2: Try to submit verification
      console.log(`\n   🧪 Attempting Automatic Verification...`);
      try {
        // Get a business for testing (use first business or create dummy data)
        const testBusinessInfo = {
          name: 'Test Business',
          website: 'https://example.com',
          use_case: 'Marketing and promotional messages',
        };
        
        const result = await autoVerifyAfterPurchase(number.phone_number, testBusinessInfo);
        
        console.log(`   📋 Result:`);
        console.log(`      Success: ${result.verified ? '✅ YES' : '❌ NO'}`);
        console.log(`      Verification Submitted: ${result.verification_submitted ? '✅ YES' : '❌ NO'}`);
        console.log(`      Manual Required: ${result.manual_verification_required ? '⚠️  YES' : '✅ NO'}`);
        
        if (result.result) {
          console.log(`      API Available: ${result.result.api_available ? '✅ YES' : '❌ NO'}`);
          if (result.result.endpoint_used) {
            console.log(`      Endpoint Used: ${result.result.endpoint_used}`);
          }
          if (result.result.validation_error) {
            console.log(`      ⚠️  Validation Error:`, JSON.stringify(result.result.validation_error, null, 2));
          }
        }
        
        if (result.error) {
          console.log(`      ❌ Error: ${result.error}`);
        }
      } catch (verifyError) {
        console.log(`   ❌ Verification attempt failed: ${verifyError.message}`);
        if (verifyError.response) {
          console.log(`      Status: ${verifyError.response.status}`);
          console.log(`      Response:`, JSON.stringify(verifyError.response.data, null, 2));
        }
      }
      
      console.log(`\n`);
    }

    // Step 4: Summary
    console.log('4️⃣  Summary:\n');
    console.log('   If you see "✅ API Available: YES":');
    console.log('      → Automatic verification via API IS WORKING!');
    console.log('      → Your toll-free number will be verified automatically\n');
    
    console.log('   If you see "❌ API Available: NO" or "⚠️  Manual Required: YES":');
    console.log('      → Automatic verification via API is NOT available');
    console.log('      → You need to verify manually in Telnyx portal');
    console.log('      → Portal: https://portal.telnyx.com/#/app/numbers\n');
    
    console.log('   If you see validation errors:');
    console.log('      → The API endpoint EXISTS but needs correct data');
    console.log('      → Check the error details above for required fields\n');

  } catch (error) {
    console.error('\n❌ Error testing verification:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testTollFreeVerification()
  .then(() => {
    console.log('✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

