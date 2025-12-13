import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const VOXIMPLANT_ACCOUNT_ID = process.env.VOXIMPLANT_ACCOUNT_ID;
const VOXIMPLANT_API_KEY = process.env.VOXIMPLANT_API_KEY;
const VOXIMPLANT_APPLICATION_ID = process.env.VOXIMPLANT_APPLICATION_ID;
const VOXIMPLANT_APPLICATION_NAME = 'tavari-voice.christiantanggo.voximplant.com';
const VOXIMPLANT_API_URL = 'https://api.voximplant.com/platform_api';

// Your backend webhook URL
// For local testing, use ngrok: https://your-ngrok-url.ngrok.io/api/calls/webhook
// For production, use your actual domain
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:5001/api/calls/webhook';

console.log('🔧 Setting Voximplant Webhook URL\n');
console.log(`Application ID: ${VOXIMPLANT_APPLICATION_ID}`);
console.log(`Application Name: ${VOXIMPLANT_APPLICATION_NAME}`);
console.log(`Webhook URL: ${WEBHOOK_URL}\n`);

console.log('⚠️  NOTE: For localhost to work, you need ngrok or similar tunnel service.');
console.log('   Voximplant cannot reach localhost directly.\n');

try {
  const response = await axios.post(
    `${VOXIMPLANT_API_URL}?cmd=SetApplicationInfo`,
    new URLSearchParams({
      account_id: VOXIMPLANT_ACCOUNT_ID,
      api_key: VOXIMPLANT_API_KEY,
      application_id: VOXIMPLANT_APPLICATION_ID,
      application_name: VOXIMPLANT_APPLICATION_NAME,
      incoming_call_notification_url: WEBHOOK_URL,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      validateStatus: () => true,
    }
  );
  
  console.log('Response:', JSON.stringify(response.data, null, 2));
  
  if (response.data?.result === 1) {
    console.log('\n✅ Webhook URL set successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Make sure your backend is running on port 5001');
    console.log('2. For local testing, set up ngrok: ngrok http 5001');
    console.log('3. Update WEBHOOK_URL in .env with your ngrok URL');
    console.log('4. Run this script again with the ngrok URL');
    console.log('5. Test by calling your number: +1 (201) 484-0333');
  } else if (response.data?.error) {
    console.log(`\n❌ Error: ${response.data.error.msg} (code: ${response.data.error.code})`);
    if (response.data.error.code === 134) {
      console.log('\n💡 Try setting it manually in the Voximplant dashboard:');
      console.log('   Applications → Your App → Settings → HTTP API Callbacks');
    }
  }
} catch (error) {
  console.log(`\n❌ Exception: ${error.message}`);
}

console.log('\n');

