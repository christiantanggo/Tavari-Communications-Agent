// Assign Messaging Profile to an existing phone number
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const phoneNumber = process.argv[2]; // Phone number to assign (e.g., +16692407730)
const MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

if (!phoneNumber) {
  console.error('Usage: node scripts/assign-messaging-profile.js <phone-number>');
  console.error('Example: node scripts/assign-messaging-profile.js +16692407730');
  process.exit(1);
}

if (!MESSAGING_PROFILE_ID) {
  console.error('❌ TELNYX_MESSAGING_PROFILE_ID not set in environment variables');
  process.exit(1);
}

if (!TELNYX_API_KEY) {
  console.error('❌ TELNYX_API_KEY not set in environment variables');
  process.exit(1);
}

async function assignMessagingProfile() {
  try {
    console.log(`\n🔍 Assigning Messaging Profile to ${phoneNumber}...\n`);

    // Get phone number ID from Telnyx
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");
    console.log(`Step 1: Looking up phone number in Telnyx...`);
    
    const telnyxResponse = await axios.get(
      `${TELNYX_API_BASE_URL}/phone_numbers?filter[phone_number]=${encodeURIComponent(cleanNumber)}`,
      {
        headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
      }
    );
    
    const telnyxNumbers = telnyxResponse.data?.data || [];
    if (telnyxNumbers.length === 0) {
      console.error(`❌ Phone number ${phoneNumber} not found in Telnyx`);
      process.exit(1);
    }

    const telnyxNumberId = telnyxNumbers[0].id;
    console.log(`✅ Found phone number ID: ${telnyxNumberId}`);

    // Check current messaging profile
    const currentNumber = telnyxNumbers[0];
    console.log(`\nStep 2: Checking current messaging profile...`);
    console.log(`Current messaging profile: ${currentNumber.messaging_profile_id || 'None'}`);

    // Assign Messaging Profile
    console.log(`\nStep 3: Assigning Messaging Profile ${MESSAGING_PROFILE_ID}...`);
    await axios.patch(
      `${TELNYX_API_BASE_URL}/phone_numbers/${telnyxNumberId}/messaging`,
      { messaging_profile_id: MESSAGING_PROFILE_ID },
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Successfully assigned Messaging Profile to ${phoneNumber}`);
    console.log(`\n📱 SMS should now work for this number!\n`);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

assignMessagingProfile();

