import WebSocket from 'ws';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not set in environment');
  process.exit(1);
}

console.log('🔵 Testing OpenAI Realtime API access...');
console.log('🔵 API Key starts with:', OPENAI_API_KEY.substring(0, 10) + '...');

const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;

console.log('🔵 Connecting to:', url);

const ws = new WebSocket(url, {
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY.trim()}`
  },
  handshakeTimeout: 10000
});

let connected = false;

ws.on('open', () => {
  console.log('✅✅✅ CONNECTION SUCCESSFUL - You have Realtime API access! ✅✅✅');
  connected = true;
  ws.close();
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    console.error('❌ API key is invalid or expired');
  } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
    console.error('❌ API key does not have Realtime API access');
    console.error('❌ You need to request access from OpenAI');
  } else {
    console.error('❌ Error details:', error);
  }
  process.exit(1);
});

ws.on('close', (code, reason) => {
  if (!connected) {
    console.error('❌ Connection closed before opening');
    console.error('❌ Close code:', code);
    console.error('❌ Reason:', reason?.toString() || 'No reason');
    
    if (code === 1006) {
      console.error('❌ Abnormal closure - likely no Realtime API access');
      console.error('❌ Request access at: https://platform.openai.com/docs/guides/realtime');
    } else if (code === 3000) {
      console.error('❌ Invalid request - check API key and model name');
    } else if (code === 4000) {
      console.error('❌ Invalid API key');
    }
    process.exit(1);
  }
});

setTimeout(() => {
  if (!connected) {
    console.error('❌ Connection timeout after 10 seconds');
    console.error('❌ This usually means no Realtime API access');
    ws.close();
    process.exit(1);
  }
}, 10000);






