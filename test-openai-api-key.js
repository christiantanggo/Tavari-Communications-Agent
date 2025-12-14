/**
 * Test OpenAI API Key and Realtime API Access
 * Run this to verify your API key works with OpenAI Realtime API
 */

import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('=== Testing OpenAI API Key ===\n');

// Check 1: API Key exists
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is NOT SET');
  console.error('   Set it in Railway: Variables → Add → OPENAI_API_KEY');
  process.exit(1);
}

console.log('✅ API Key is set');
console.log('   Length:', OPENAI_API_KEY.length);
console.log('   Starts with:', OPENAI_API_KEY.substring(0, 7));
console.log('   Format check:', OPENAI_API_KEY.startsWith('sk-') ? '✅ Valid format' : '❌ Invalid format (should start with sk-)');
console.log('');

// Check 2: Test Realtime API connection
console.log('=== Testing OpenAI Realtime API Connection ===\n');

const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;

console.log('Connecting to:', url);
console.log('Using Authorization header with Bearer token');
console.log('');

const ws = new WebSocket(url, {
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`
  }
});

let connectionTimeout;
let sessionTimeout;

ws.on('open', () => {
  console.log('✅ WebSocket connection opened!');
  console.log('✅ ReadyState:', ws.readyState, '(1 = OPEN)');
  console.log('');
  console.log('Waiting for session.created from OpenAI...');
  console.log('');
});

let sessionCreated = false;

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📥 Message from OpenAI:', JSON.stringify(message, null, 2));
    console.log('');
    
    if (message.type === 'session.created') {
      console.log('✅ session.created received!');
      sessionCreated = true;
      
      // Now send session.update
      console.log('Sending session.update...');
      const sessionConfig = {
        type: 'session.update',
        session: {
          instructions: 'You are a helpful assistant.',
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
        },
      };
      
      ws.send(JSON.stringify(sessionConfig));
      console.log('✅ session.update sent');
      console.log('');
      
    } else if (message.type === 'session.updated') {
      console.log('✅ session.updated received!');
      console.log('✅ OpenAI Realtime API is working correctly!');
      clearTimeout(sessionTimeout);
      ws.close();
      process.exit(0);
    } else if (message.type === 'error' || message.type === 'error.event') {
      // Only fail on error if we haven't created session yet
      if (!sessionCreated && message.error?.code !== 'missing_required_parameter') {
        console.error('❌ Error from OpenAI:', JSON.stringify(message, null, 2));
        clearTimeout(sessionTimeout);
        ws.close();
        process.exit(1);
      } else if (sessionCreated) {
        console.warn('⚠️ Error after session created (may be from update):', JSON.stringify(message, null, 2));
        // Session is created, that's good enough
        console.log('✅ Session is created, proceeding...');
        clearTimeout(sessionTimeout);
        ws.close();
        process.exit(0);
      }
    }
  } catch (error) {
    console.log('📥 Binary data received (audio)');
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.error('   This usually means:');
  console.error('   1. API key is invalid');
  console.error('   2. API key does not have Realtime API access');
  console.error('   3. Network/firewall issue');
  clearTimeout(connectionTimeout);
  clearTimeout(sessionTimeout);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  const reasonStr = reason?.toString() || 'No reason';
  console.error('');
  console.error('❌ WebSocket closed');
  console.error('   Code:', code);
  console.error('   Reason:', reasonStr);
  console.error('');
  
  if (code === 3000) {
    console.error('❌ ERROR CODE 3000: invalid_request_error');
    console.error('   Possible causes:');
    console.error('   1. API key is invalid or expired');
    console.error('   2. API key does not have Realtime API access (requires special access)');
    console.error('   3. Model name is incorrect');
    console.error('   4. Account does not have billing enabled');
  } else if (code === 4000) {
    console.error('❌ ERROR CODE 4000: Invalid API Key');
  } else if (code === 1006) {
    console.error('❌ ERROR CODE 1006: Abnormal closure');
    console.error('   Network issue or OpenAI server error');
  }
  
  clearTimeout(connectionTimeout);
  clearTimeout(sessionTimeout);
  process.exit(1);
});

// Connection timeout
connectionTimeout = setTimeout(() => {
  console.error('❌ Connection timeout (10 seconds)');
  console.error('   OpenAI did not respond to connection attempt');
  ws.close();
  process.exit(1);
}, 10000);

console.log('Waiting for connection...');
console.log('');

