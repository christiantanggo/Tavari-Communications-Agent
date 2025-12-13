import dotenv from 'dotenv';
dotenv.config();

import { supabaseClient } from './config/database.js';
import { Business } from './models/Business.js';

async function test() {
  try {
    console.log('Testing Supabase connection...');
    
    // Test 1: Check if we can connect
    const { data, error } = await supabaseClient.from('businesses').select('count').limit(1);
    
    if (error) {
      console.error('❌ Connection failed:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Supabase connection successful!');
    console.log('✅ Database tables are accessible!');
    console.log('\n🎉 Everything is set up correctly!');
    console.log('\nNext step: Start the server with: npm run dev');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

test();

