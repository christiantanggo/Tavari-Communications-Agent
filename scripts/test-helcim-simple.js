// scripts/test-helcim-simple.js
// Simple Helcim API connection test with minimal output

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const HELCIM_API_TOKEN = process.env.HELCIM_API_TOKEN?.trim();

if (!HELCIM_API_TOKEN) {
  console.error('❌ HELCIM_API_TOKEN not found in environment variables');
  console.error('💡 Make sure it\'s set in your .env file or environment');
  process.exit(1);
}

console.log('🔍 Testing Helcim API Token...');
console.log(`📊 Token length: ${HELCIM_API_TOKEN.length} characters`);
console.log(`📊 Token preview: ${HELCIM_API_TOKEN.substring(0, 10)}...${HELCIM_API_TOKEN.substring(HELCIM_API_TOKEN.length - 5)}`);
console.log(`📊 Token has whitespace: ${HELCIM_API_TOKEN !== HELCIM_API_TOKEN.trim() ? 'YES (will be trimmed)' : 'NO'}\n`);

// Test with the most common configuration
const testApi = axios.create({
  baseURL: 'https://api.helcim.com/v2',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'api-token': HELCIM_API_TOKEN,
  },
});

// Try connection test endpoint
testApi.get('/connection-test')
  .then((response) => {
    console.log('✅ SUCCESS! API token is valid and working.');
    console.log('📊 Response:', response.data);
    console.log('\n💡 Your API token has the correct permissions.');
    process.exit(0);
  })
  .catch((error) => {
    const status = error.response?.status;
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
    
    console.log(`❌ API call failed`);
    console.log(`📊 Status: ${status || 'No response'}`);
    console.log(`📊 Error: ${errorMessage}`);
    
    if (status === 401) {
      console.log('\n🔍 Issue: Invalid API token');
      console.log('💡 Solution:');
      console.log('   1. Verify token is correct in Helcim dashboard');
      console.log('   2. Check token is active (not revoked)');
      console.log('   3. Try regenerating the token');
    } else if (status === 403) {
      console.log('\n🔍 Issue: Token lacks permissions');
      console.log('💡 Solution:');
      console.log('   1. Go to Helcim Dashboard → API Access Configurations');
      console.log('   2. Check your token permissions');
      console.log('   3. Ensure all permissions are set (not "No Access")');
      console.log('   4. Account may still be under review (contact Helcim support)');
    } else if (status === 404) {
      console.log('\n🔍 Issue: Endpoint not found');
      console.log('💡 The API structure might be different');
      console.log('💡 Check Helcim API documentation for correct endpoints');
    } else {
      console.log('\n🔍 Issue: Unknown error');
      console.log('💡 Check Helcim account status and contact support if needed');
    }
    
    process.exit(1);
  });

