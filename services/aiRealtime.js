import WebSocket from 'ws';

// In production (Railway), env vars are already available via process.env
// dotenv.config() is only needed for local development
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class AIRealtimeService {
  constructor(callSessionId, businessId, agentConfig) {
    this.callSessionId = callSessionId;
    this.businessId = businessId;
    this.agentConfig = agentConfig;
    this.ws = null;
    this.audioBuffer = [];
    this.transcript = '';
    this.isResponding = false;
    this.responseLock = false;
    this.sessionConfigured = false;
  }
  
  // Connect to OpenAI Realtime API
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        // Verify API key is set
        if (!OPENAI_API_KEY) {
          const error = new Error('OPENAI_API_KEY environment variable is not set');
          console.error('❌', error.message);
          reject(error);
          return;
        }
        
        // OpenAI Realtime API requires Authorization header with Bearer token
        // Format: wss://api.openai.com/v1/realtime?model=MODEL
        // Headers: Authorization: Bearer sk-...
        const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        
        console.log('🔵 Connecting to OpenAI Realtime API...');
        console.log('🔵 API Key present:', !!OPENAI_API_KEY);
        console.log('🔵 API Key length:', OPENAI_API_KEY?.length || 0);
        console.log('🔵 API Key starts with:', OPENAI_API_KEY?.substring(0, 7) || 'N/A');
        console.log('🔵 Using Authorization header (OpenAI Realtime API standard)');
        
        // Set Authorization header for WebSocket connection
        this.ws = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          }
        });
        
        this.ws.on('open', () => {
          process.stdout.write('\n✅ OPENAI WEBSOCKET CONNECTED\n');
          console.log('✅ Connected to OpenAI Realtime API');
          console.log('✅ OpenAI WebSocket readyState:', this.ws.readyState);
          
          // Wait for session.created - session is automatically created by OpenAI
          const sessionCreatedHandler = (message) => {
            if (message.type === 'session.created') {
              process.stdout.write('\n✅ OPENAI SESSION CREATED - Ready to receive audio\n');
              console.log('✅ Session created by OpenAI');
              console.log('✅ OpenAI session is ready');
              this.sessionConfigured = true;
              this.ws.removeListener('message', sessionCreatedHandler);
              
              // Optionally update instructions (session already has good defaults)
              try {
                const sessionConfig = {
                  type: 'session.update',
                  session: {
                    instructions: this.buildSystemInstructions(),
                  },
                };
                
                console.log('Updating session instructions...');
                this.ws.send(JSON.stringify(sessionConfig));
                // Don't wait for response - proceed immediately
              } catch (error) {
                console.warn('Could not update instructions, proceeding anyway:', error.message);
              }
              
              resolve(true);
            } else if (message.type === 'error' && message.error?.code !== 'missing_required_parameter') {
              // Ignore missing_required_parameter errors (from session.update attempts)
              console.error('Error during session creation:', JSON.stringify(message, null, 2));
              this.ws.removeListener('message', sessionCreatedHandler);
              reject(new Error('Session creation failed: ' + JSON.stringify(message)));
            }
          };
          
          // Listen for session.created
          this.ws.on('message', sessionCreatedHandler);
          
          // Timeout after 5 seconds if no session.created
          setTimeout(() => {
            this.ws.removeListener('message', sessionCreatedHandler);
            if (!this.sessionConfigured) {
              console.warn('Session creation timeout - proceeding anyway');
              this.sessionConfigured = true;
              resolve(true);
            }
          }, 5000);
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            // Log ALL messages from OpenAI for debugging
            console.log('🔵 OpenAI message received:', JSON.stringify(message, null, 2));
            
            // Log errors prominently
            if (message.type === 'error' || message.type === 'error.event') {
              process.stdout.write(`\n❌ OPENAI ERROR MESSAGE:\n`);
              console.error('❌ OpenAI Realtime error message received:', JSON.stringify(message, null, 2));
            }
            
            // Log session.updated prominently
            if (message.type === 'session.updated') {
              process.stdout.write(`\n✅ OPENAI SESSION.UPDATED RECEIVED\n`);
              console.log('✅ OpenAI session.updated event received:', JSON.stringify(message, null, 2));
            }
            
            this.handleMessage(message);
          } catch (error) {
            // Handle binary audio data
            if (Buffer.isBuffer(data)) {
              this.handleAudioOutput(data);
            } else {
              console.error('Error parsing OpenAI message:', error, 'Data:', data.toString().substring(0, 200));
            }
          }
        });
        
        this.ws.on('error', (error) => {
          console.error('OpenAI Realtime WebSocket error:', error);
          reject(error);
        });
        
        this.ws.on('close', (code, reason) => {
          const reasonStr = reason?.toString() || 'No reason provided';
          // Use multiple stdout writes to ensure it's not dropped
          process.stdout.write(`\n\n\n`);
          process.stdout.write(`❌❌❌ OPENAI WEBSOCKET CLOSED ❌❌❌\n`);
          process.stdout.write(`CODE: ${code}\n`);
          process.stdout.write(`REASON: ${reasonStr}\n`);
          process.stdout.write(`READYSTATE: ${this.ws.readyState}\n`);
          process.stdout.write(`SESSION_CONFIGURED: ${this.sessionConfigured}\n`);
          process.stdout.write(`❌❌❌ END CLOSE EVENT ❌❌❌\n\n\n`);
          console.error('❌ OpenAI Realtime WebSocket closed', { code, reason: reasonStr });
          console.error('❌ WebSocket readyState:', this.ws.readyState);
          console.error('❌ Session configured:', this.sessionConfigured);
          
          // Log specific error codes with helpful messages
          if (code === 3000) {
            console.error('❌ ERROR CODE 3000: invalid_request_error');
            console.error('❌ Possible causes:');
            console.error('   1. API key is invalid, expired, or missing');
            console.error('   2. API key does not have access to Realtime API (requires special access)');
            console.error('   3. Connection URL format is incorrect');
            console.error('   4. Model name is incorrect or not available');
            console.error('   5. Account does not have billing enabled (Realtime API requires paid account)');
          } else if (code === 4000) {
            console.error('❌ ERROR CODE 4000: Invalid API Key');
            console.error('❌ Your OpenAI API key is invalid or does not have Realtime API access');
          } else if (code === 1006) {
            console.error('❌ ERROR CODE 1006: Abnormal closure (no close frame)');
            console.error('❌ This usually means network/connection issue or server-side error');
            console.error('❌ OpenAI may have rejected the connection immediately');
          } else if (code !== 1000) {
            console.error(`❌ ERROR CODE ${code}: Unexpected closure`);
            console.error('❌ Check OpenAI API status and your account access');
          }
        });
        
      } catch (error) {
        console.error('Failed to connect to OpenAI Realtime:', error);
        reject(error);
      }
    });
  }
  
  // Handle incoming messages from OpenAI
  handleMessage(message) {
    switch (message.type) {
      case 'response.audio_transcript.delta':
        if (message.delta) {
          this.transcript += message.delta;
        }
        break;
        
      case 'response.audio_transcript.done':
        this.isResponding = false;
        this.responseLock = false;
        break;
        
      case 'response.audio.delta':
        // Audio chunks come as base64
        if (message.delta) {
          const audioBuffer = Buffer.from(message.delta, 'base64');
          this.handleAudioOutput(audioBuffer);
        }
        break;
        
      case 'session.updated':
        console.log('Session updated event received');
        this.sessionConfigured = true;
        break;
        
      case 'session.updated':
        console.log('Session updated event received');
        this.sessionConfigured = true;
        break;
        
      case 'response.done':
        this.isResponding = false;
        this.responseLock = false;
        break;
        
      case 'error':
        console.error('OpenAI Realtime error:', JSON.stringify(message, null, 2));
        if (message.error) {
          console.error('Error details:', JSON.stringify(message.error, null, 2));
        }
        if (message.message) {
          console.error('Error message:', message.message);
        }
        if (message.code) {
          console.error('Error code:', message.code);
        }
        // Log the full message object
        console.error('Full error object:', message);
        break;
    }
  }
  
  // Build system instructions
  buildSystemInstructions() {
    const { greeting_text, faqs, business_hours, message_settings } = this.agentConfig;
    
    let instructions = `You are a helpful AI phone assistant. `;
    
    if (greeting_text) {
      instructions += `Start with this greeting: "${greeting_text}" `;
    }
    
    instructions += `\n\nBusiness hours: ${JSON.stringify(business_hours)}`;
    
    if (faqs && faqs.length > 0) {
      instructions += `\n\nFrequently Asked Questions:\n`;
      faqs.forEach((faq, index) => {
        instructions += `${index + 1}. Q: ${faq.question}\n   A: ${faq.answer}\n`;
      });
    }
    
    if (message_settings) {
      instructions += `\n\nWhen taking a message, collect: `;
      if (message_settings.ask_name) instructions += `caller's name, `;
      if (message_settings.ask_phone) instructions += `phone number, `;
      if (message_settings.ask_email) instructions += `email address, `;
      if (message_settings.ask_reason) instructions += `reason for calling. `;
    }
    
    instructions += `\n\nKeep responses concise and natural. If you can't answer a question, offer to take a message.`;
    
    return instructions;
  }
  
  // Send audio input to OpenAI
  sendAudio(audioData) {
    if (!this.ws) {
      console.warn('⚠️ OpenAI WebSocket not initialized, cannot send audio');
      return;
    }
    
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ OpenAI WebSocket not open (readyState:', this.ws.readyState, '), cannot send audio');
      return;
    }
    
    try {
      // Convert audio to base64 if it's a buffer
      const base64Audio = Buffer.isBuffer(audioData) 
        ? audioData.toString('base64')
        : audioData;
      
      const audioSize = Buffer.isBuffer(audioData) ? audioData.length : (typeof audioData === 'string' ? audioData.length : 'unknown');
      console.log('🔵 Sending audio to OpenAI Realtime API, size:', audioSize, 'bytes, base64 length:', base64Audio.length);
      
      this.ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio,
      }));
      
      console.log('✅ Audio sent to OpenAI successfully');
    } catch (error) {
      console.error('❌ Error sending audio to OpenAI:', error);
      console.error('Error stack:', error.stack);
    }
  }
  
  // Handle audio output from OpenAI
  handleAudioOutput(audio) {
    // This will be called by the WebSocket handler
    // Audio will be streamed back to Voximplant
    if (this.onAudioOutput) {
      this.onAudioOutput(audio);
    }
  }
  
  // Get full transcript
  getTranscript() {
    return this.transcript.trim();
  }
  
  // Close connection
  async close() {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'session.update', session: { modalities: [] } }));
          this.ws.close();
        }
      } catch (error) {
        console.error('Error closing OpenAI connection:', error);
      }
    }
  }
  
  // Prevent overlapping responses
  async waitForResponse() {
    while (this.responseLock) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.responseLock = true;
  }
  
  // Handle interruption
  async interrupt() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isResponding) {
      try {
        this.ws.send(JSON.stringify({ type: 'response.create_interruption' }));
        this.isResponding = false;
        this.responseLock = false;
      } catch (error) {
        console.error('Error interrupting response:', error);
      }
    }
  }
}

