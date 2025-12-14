import WebSocket from 'ws';
import { convertTelnyxToOpenAI } from '../utils/audioConverter.js';

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
        
        // Clean API key - remove any whitespace, newlines, or invalid characters
        const cleanApiKey = OPENAI_API_KEY?.trim().replace(/\s+/g, '') || '';
        
        console.log('🔵 Connecting to OpenAI Realtime API...');
        console.log('🔵 API Key present:', !!cleanApiKey);
        console.log('🔵 API Key length:', cleanApiKey.length);
        console.log('🔵 API Key starts with:', cleanApiKey.substring(0, 7) || 'N/A');
        console.log('🔵 Using Authorization header (OpenAI Realtime API standard)');
        
        if (!cleanApiKey) {
          const error = new Error('OPENAI_API_KEY is empty after cleaning');
          console.error('❌', error.message);
          reject(error);
          return;
        }
        
        // Set Authorization header for WebSocket connection
        this.ws = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${cleanApiKey}`
          }
        });
        
        this.ws.on('open', () => {
          process.stdout.write('\n✅ OPENAI WEBSOCKET CONNECTED\n');
          console.log('✅ Connected to OpenAI Realtime API');
          console.log('✅ OpenAI WebSocket readyState:', this.ws.readyState);
          
          // Wait for session.created first, then send session.update
          // OpenAI creates session automatically on connect, but we should wait for confirmation
          const sessionReadyHandler = (message) => {
            if (message.type === 'session.created') {
              process.stdout.write('\n✅ OPENAI SESSION CREATED - Configuring session...\n');
              console.log('✅ OpenAI session.created event received');
              
              // Now send session.update to configure audio format
              try {
                const sessionConfig = {
                  type: 'session.update',
                  session: {
                    instructions: this.buildSystemInstructions(),
                    input_audio_format: 'pcm16', // OpenAI REQUIRES PCM16 at 24kHz - we'll convert from Telnyx
                    output_audio_format: 'pcm16', // OpenAI outputs PCM16 at 24kHz
                    modalities: ['text', 'audio'],
                    voice: 'alloy',
                    temperature: 0.8,
                    max_response_output_tokens: 4096,
                  },
                };
                
                console.log('🔵 Configuring session for PCM16 at 24kHz (will convert from Telnyx G.711 μ-law)...');
                console.log('🔵 Session config:', JSON.stringify(sessionConfig, null, 2));
                this.ws.send(JSON.stringify(sessionConfig));
              } catch (error) {
                console.error('❌ Error sending session config:', error);
              }
            } else if (message.type === 'session.updated') {
              process.stdout.write('\n✅ OPENAI SESSION READY - Ready to receive audio\n');
              console.log('✅ OpenAI session.updated event received - session configured');
              this.sessionConfigured = true;
              this.ws.removeListener('message', sessionReadyHandler);
              resolve(true);
            } else if (message.type === 'error') {
              console.error('❌ OpenAI session error:', JSON.stringify(message, null, 2));
              // Don't reject on error - might be recoverable
            }
          };
          
          // Listen for session events
          this.ws.on('message', sessionReadyHandler);
          
          // Timeout after 5 seconds - proceed anyway if no confirmation
          setTimeout(() => {
            this.ws.removeListener('message', sessionReadyHandler);
            if (!this.sessionConfigured) {
              console.warn('⚠️ Session confirmation timeout - proceeding anyway (session may still work)');
              this.sessionConfigured = true;
              resolve(true);
            }
          }, 5000);
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // Log only important messages (reduce noise)
            if (message.type === 'error' || message.type === 'error.event') {
              process.stdout.write(`\n❌ OPENAI ERROR MESSAGE:\n`);
              console.error('❌ OpenAI Realtime error:', JSON.stringify(message, null, 2));
            } else if (message.type?.startsWith('response.')) {
              // Log response events (transcript, audio) - but not every delta
              if (message.type === 'response.audio_transcript.delta' || message.type === 'response.audio.delta') {
                // Only log every 10th delta to reduce noise
                if (!this._deltaCount) this._deltaCount = 0;
                this._deltaCount++;
                if (this._deltaCount % 10 === 0) {
                  console.log('🔵 OpenAI response:', message.type, message.delta ? `(delta: ${message.delta.substring(0, 50)}...)` : '');
                }
              } else {
                // Log non-delta response events
                console.log('🔵 OpenAI response:', message.type);
              }
            } else if (message.type === 'session.updated' || message.type === 'session.created') {
              process.stdout.write(`\n✅ OPENAI ${message.type.toUpperCase()}\n`);
              console.log('✅ OpenAI session event:', message.type);
            }
            // Don't log other message types - too verbose
            
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
          console.log('🔵 OpenAI transcript delta:', message.delta);
        }
        break;
        
      case 'response.audio_transcript.done':
        this.isResponding = false;
        this.responseLock = false;
        console.log('✅ OpenAI transcript done. Full transcript:', this.transcript);
        break;
        
      case 'response.audio.delta':
        // Audio chunks come as base64
        if (message.delta) {
          console.log('🔵 OpenAI audio response received, size:', message.delta.length, 'bytes (base64)');
          const audioBuffer = Buffer.from(message.delta, 'base64');
          this.handleAudioOutput(audioBuffer);
        }
        break;
        
      case 'response.audio.done':
        console.log('✅ OpenAI audio response complete');
        break;
        
      case 'response.done':
        console.log('✅ OpenAI response complete');
        this.isResponding = false;
        this.responseLock = false;
        break;
        
      case 'session.updated':
        console.log('✅ OpenAI session.updated event received');
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
    
    // Don't send audio until session is configured
    if (!this.sessionConfigured) {
      // Only log first few times to avoid spam
      if (!this._sessionWarningCount) this._sessionWarningCount = 0;
      this._sessionWarningCount++;
      if (this._sessionWarningCount <= 3) {
        console.warn('⚠️ Session not configured yet, skipping audio (this is normal during startup)');
      }
      return;
    }
    
    try {
      // OpenAI REQUIRES PCM16 at 24kHz - convert from Telnyx PCMU (G.711 μ-law at 8kHz)
      if (!Buffer.isBuffer(audioData)) {
        console.error('❌ Audio data is not a Buffer, got type:', typeof audioData);
        return;
      }
      
      // Log first conversion to verify it's working
      if (!this._firstConversionLogged) {
        console.log('🔵 Converting audio: Telnyx PCMU (G.711 μ-law) 8kHz → OpenAI PCM16 24kHz');
        console.log('🔵 Input size:', audioData.length, 'bytes');
        this._firstConversionLogged = true;
      }
      
      let convertedAudio;
      try {
        convertedAudio = convertTelnyxToOpenAI(audioData);
        if (!this._firstOutputLogged) {
          console.log('🔵 Converted audio size:', convertedAudio.length, 'bytes (PCM16 24kHz)');
          console.log('🔵 Expected size ratio: 6x (8kHz→24kHz, 1 byte→2 bytes)');
          console.log('🔵 Actual ratio:', (convertedAudio.length / audioData.length).toFixed(2));
          this._firstOutputLogged = true;
        }
      } catch (conversionError) {
        console.error('❌ Audio conversion error:', conversionError);
        console.error('Conversion error stack:', conversionError.stack);
        return; // Don't send invalid audio
      }
      
      // Convert to base64
      const base64Audio = convertedAudio.toString('base64');
      
      // Verify base64 is valid
      if (!base64Audio || base64Audio.length === 0) {
        console.error('❌ Base64 encoding produced empty string');
        return;
      }
      
      // Send audio to OpenAI
      const payload = {
        type: 'input_audio_buffer.append',
        audio: base64Audio,
      };
      
      this.ws.send(JSON.stringify(payload));
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

