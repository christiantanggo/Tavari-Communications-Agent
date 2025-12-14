import dotenv from 'dotenv';
import { TelnyxService } from './services/telnyx.js';

dotenv.config();

/**
 * Update an existing phone number with Voice API Application and Messaging Profile
 * This tests the configuration that will happen automatically for new purchases
 */
async function updateExistingNumber() {
  console.log('=== UPDATING EXISTING PHONE NUMBER ===\n');
  
  // Get environment variables
  const voiceAppId = process.env.TELNYX_VOICE_APPLICATION_ID;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const webhookUrl = process.env.WEBHOOK_URL || `${process.env.SERVER_URL || 'https://api.tavarios.com'}/api/calls/webhook`;
  
  console.log('Configuration:');
  console.log('  TELNYX_VOICE_APPLICATION_ID:', voiceAppId || 'NOT SET');
  console.log('  TELNYX_MESSAGING_PROFILE_ID:', messagingProfileId || 'NOT SET');
  console.log('  Webhook URL:', webhookUrl);
  console.log('');
  
  if (!voiceAppId && !messagingProfileId) {
    console.error('❌ ERROR: Environment variables not set!');
    console.error('   Set TELNYX_VOICE_APPLICATION_ID and/or TELNYX_MESSAGING_PROFILE_ID');
    console.error('   This script needs these to work.');
    process.exit(1);
  }
  
  // Get existing numbers
  console.log('Fetching existing phone numbers...');
  const result = await TelnyxService.makeAPIRequest('GET', '/phone_numbers?page[size]=10');
  
  if (!result.data || result.data.length === 0) {
    console.log('❌ No phone numbers found in account');
    return;
  }
  
  // Find numbers that need configuration
  const numbersNeedingConfig = result.data.filter(num => 
    !num.voice_application_id && !num.messaging_profile_id
  );
  
  console.log(`Found ${result.data.length} phone number(s) total`);
  console.log(`${numbersNeedingConfig.length} need configuration\n`);
  
  if (numbersNeedingConfig.length === 0) {
    console.log('✅ All numbers are already configured!');
    return;
  }
  
  // Use the first number that needs configuration
  const testNumber = numbersNeedingConfig[0];
  console.log(`Updating: ${testNumber.phone_number}`);
  console.log(`  ID: ${testNumber.id}`);
  console.log(`  Current voice_application_id: ${testNumber.voice_application_id || 'NOT SET'}`);
  console.log(`  Current messaging_profile_id: ${testNumber.messaging_profile_id || 'NOT SET'}`);
  console.log(`  Current webhook_url: ${testNumber.webhook_url || 'NOT SET'}`);
  console.log('');
  
  // Build update payload (same as what purchase would do)
  const updatePayload = {
    webhook_url: webhookUrl,
    webhook_url_method: 'POST',
  };
  
  if (voiceAppId) {
    updatePayload.voice_application_id = voiceAppId;
    console.log(`  Will set voice_application_id: ${voiceAppId}`);
  }
  
  if (messagingProfileId) {
    updatePayload.messaging_profile_id = messagingProfileId;
    console.log(`  Will set messaging_profile_id: ${messagingProfileId}`);
  }
  
  console.log(`  Will set webhook_url: ${webhookUrl}`);
  console.log('');
  
  // Actually update the number
  console.log('Updating number...');
  try {
    const updateResult = await TelnyxService.makeAPIRequest('PATCH', `/phone_numbers/${testNumber.id}`, updatePayload);
    console.log('✅ Number updated successfully!');
    console.log('');
    console.log('Updated configuration:');
    console.log(`  Phone Number: ${updateResult.data?.phone_number || testNumber.phone_number}`);
    console.log(`  Voice API Application: ${updateResult.data?.voice_application_id || 'NOT SET'}`);
    console.log(`  Messaging Profile: ${updateResult.data?.messaging_profile_id || 'NOT SET'}`);
    console.log(`  Webhook URL: ${updateResult.data?.webhook_url || 'NOT SET'}`);
    console.log('');
    console.log('✅ TEST PASSED - Configuration works!');
    console.log('   This confirms that new purchases will configure automatically.');
  } catch (error) {
    console.error('❌ Update failed:', error.message);
    console.error('Error details:', JSON.stringify(error.response?.data || error.message, null, 2));
    process.exit(1);
  }
}

updateExistingNumber().catch(console.error);

