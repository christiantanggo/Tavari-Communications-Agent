// Fix assistant transcriber settings to make it respond properly
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { supabaseClient } from '../config/database.js';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  console.error('❌ VAPI_API_KEY not set in .env file');
  process.exit(1);
}

const vapiClient = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    Authorization: `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  },
});

async function fixTranscriber() {
  try {
    console.log('🔧 Fixing Assistant Transcriber Settings...\n');

    // Get business with assistant
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, vapi_assistant_id')
      .not('vapi_assistant_id', 'is', null)
      .limit(1);

    if (error) throw error;

    if (businesses.length === 0) {
      console.log('❌ No businesses with assistants found');
      return;
    }

    const business = businesses[0];
    console.log(`📋 Business: ${business.name}`);
    console.log(`   Assistant ID: ${business.vapi_assistant_id}\n`);

    // Get current assistant
    const assistantRes = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
    const assistant = assistantRes.data;

    console.log('🔍 Current Configuration:');
    console.log(`   Transcriber: ${JSON.stringify(assistant.transcriber || 'NOT SET')}`);
    console.log(`   Start Speaking Plan: ${JSON.stringify(assistant.startSpeakingPlan || 'NOT SET')}`);
    console.log(`   Voicemail Detection: ${assistant.voicemailDetection !== undefined ? assistant.voicemailDetection : 'NOT SET'}\n`);

    // Update assistant with transcriber settings
    const updatePayload = {
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US",
      },
      startSpeakingPlan: {
        waitSeconds: 0.8,
        smartEndpointingEnabled: false,
      },
    };

    console.log('🔧 Updating assistant with:');
    console.log(JSON.stringify(updatePayload, null, 2));
    console.log('');

    const updateRes = await vapiClient.patch(`/assistant/${business.vapi_assistant_id}`, updatePayload);
    
    console.log('✅ Assistant updated successfully!\n');
    console.log('📋 Updated Configuration:');
    console.log(`   Transcriber: ${JSON.stringify(updateRes.data.transcriber || 'NOT SET')}`);
    console.log(`   Start Speaking Plan: ${JSON.stringify(updateRes.data.startSpeakingPlan || 'NOT SET')}\n`);

    console.log('✅ Transcriber fix complete!');
    console.log('\n💡 The assistant should now respond properly after the greeting.');
    console.log('💡 Test a call now - it should work!');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.error('\n⚠️  Assistant not found in VAPI.');
    } else if (error.response?.status === 401) {
      console.error('\n⚠️  Authentication failed. Check your VAPI_API_KEY.');
    }
  }
}

fixTranscriber();

