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
        
        // OpenAI Realtime API requires api_key in query parameter
        // Format: wss://api.openai.com/v1/realtime?model=MODEL&api_key=KEY
        const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01&api_key=${OPENAI_API_KEY}`;
        
        console.log('🔵 Connecting to OpenAI Realtime API...');
        console.log('🔵 API Key present:', !!OPENAI_API_KEY);
        console.log('🔵 API Key length:', OPENAI_API_KEY?.length || 0);
        console.log('🔵 API Key starts with:', OPENAI_API_KEY?.substring(0, 7) || 'N/A');
        console.log('🔵 Using api_key query parameter (OpenAI Realtime API standard)');
        
        this.ws = new WebSocket(url);
        
        this.ws.on('open', () => {
          console.log('Connected to OpenAI Realtime API');
          
          // Wait a moment before sending session configuration
          setTimeout(() => {
            try {
              // Send session configuration
              const sessionConfig = {
                type: 'session.update',
                session: {
                  modalities: ['text', 'audio'],
                  instructions: this.buildSystemInstructions(),
                  voice: 'alloy',
                  input_audio_format: 'pcm16',
                  output_audio_format: 'pcm16',
                  temperature: 0.8,
                  max_response_output_tokens: 4096,
                },
              };
              
              console.log('Sending session.update:', JSON.stringify(sessionConfig, null, 2));
              this.ws.send(JSON.stringify(sessionConfig));
              
              // Wait for session.updated event before resolving
              // This ensures the session is configured before we start sending audio
              const sessionUpdatedHandler = (message) => {
                if (message.type === 'session.updated') {
                  console.log('Session updated successfully');
                  this.ws.removeListener('message', sessionUpdatedHandler);
                  resolve(true);
                } else if (message.type === 'error') {
                  console.error('Error during session update:', JSON.stringify(message, null, 2));
                  this.ws.removeListener('message', sessionUpdatedHandler);
                  reject(new Error('Session update failed: ' + JSON.stringify(message)));
                }
              };
              
              // Listen for session.updated or error
              this.ws.on('message', sessionUpdatedHandler);
              
              // Timeout after 5 seconds if no response
              setTimeout(() => {
                this.ws.removeListener('message', sessionUpdatedHandler);
                if (!this.sessionConfigured) {
                  console.warn('Session update timeout - proceeding anyway');
                  resolve(true); // Proceed even if we don't get confirmation
                }
              }, 5000);
              
            } catch (error) {
              console.error('Error sending session.update:', error);
              reject(error);
            }
          }, 100);
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            // Log all messages for debugging
            if (message.type === 'error' || message.type === 'error.event') {
              console.error('OpenAI Realtime error message received:', JSON.stringify(message, null, 2));
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
          console.log('⚠️ OpenAI Realtime WebSocket closed', { code, reason: reasonStr });
          
          // Log specific error codes with helpful messages
          if (code === 3000) {
            console.error('❌ ERROR CODE 3000: invalid_request_error');
            console.error('❌ Possible causes:');
            console.error('   1. API key is invalid, expired, or missing');
            console.error('   2. API key does not have access to Realtime API (requires special access)');
            console.error('   3. Connection URL format is incorrect');
            console.error('   4. Model name is incorrect or not available');
            console.error('   5. Account does not have billing enabled (Realtime API requires paid account)');
          } else if (code === 1006) {
            console.error('❌ ERROR CODE 1006: Abnormal closure (no close frame)');
            console.error('❌ This usually means network/connection issue or server-side error');
          } else if (code !== 1000) {
            console.error(`❌ ERROR CODE ${code}: Unexpected closure`);
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Convert audio to base64 if it's a buffer
        const base64Audio = Buffer.isBuffer(audioData) 
          ? audioData.toString('base64')
          : audioData;
        
        this.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio,
        }));
      } catch (error) {
        console.error('Error sending audio to OpenAI:', error);
      }
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

