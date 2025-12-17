// Check which business owns which phone number
import dotenv from 'dotenv';
dotenv.config();

import { supabaseClient } from '../config/database.js';

async function checkMapping() {
  try {
    console.log('🔍 Checking Business ↔ Phone Number Mapping...\n');

    // Get all businesses with VAPI phone numbers
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, public_phone_number, vapi_phone_number, vapi_assistant_id, email')
      .not('vapi_phone_number', 'is', null)
      .order('name');

    if (error) throw error;

    console.log(`Found ${businesses.length} business(es) with VAPI phone numbers:\n`);

    for (const business of businesses) {
      console.log(`📋 Business: ${business.name}`);
      console.log(`   ID: ${business.id}`);
      console.log(`   Email: ${business.email}`);
      console.log(`   Public Phone: ${business.public_phone_number || 'N/A'}`);
      console.log(`   VAPI Phone: ${business.vapi_phone_number || 'N/A'}`);
      console.log(`   VAPI Assistant ID: ${business.vapi_assistant_id || '❌ NOT SET'}`);
      console.log('');
    }

    // Check for businesses without phone numbers
    const { data: noPhoneBusinesses, error: noPhoneError } = await supabaseClient
      .from('businesses')
      .select('id, name, email')
      .is('vapi_phone_number', null)
      .order('name');

    if (noPhoneError) throw noPhoneError;

    if (noPhoneBusinesses.length > 0) {
      console.log(`\n⚠️  ${noPhoneBusinesses.length} business(es) without VAPI phone numbers:\n`);
      for (const business of noPhoneBusinesses) {
        console.log(`   - ${business.name} (${business.email})`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMapping();

