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
                    turn_detection: {
                      type: 'semantic_vad', // Use semantic VAD - more reliable than server_vad
                      eagerness: 0.7, // Increased from 0.5 to be more responsive (0.0-1.0, higher = respond faster)
                    },
                    input_audio_transcription: {
                      model: 'whisper-1', // Enable transcription to help with speech detection
                    },
                  },
                };
                
                console.log('🔵 Configuring session for PCM16 at 24kHz (will convert from Telnyx G.711 μ-law)...');
                console.log('🔵 Session config:', JSON.stringify(sessionConfig, null, 2));
                this.ws.send(JSON.stringify(sessionConfig));
              } catch (error) {
                console.error('❌ Error sending session config:', error);
              }
            } else if (message.type === 'session.updated') {
              process.stdout.write('\n✅✅✅ OPENAI SESSION.updated RECEIVED - SESSION FULLY CONFIGURED ✅✅✅\n');
              console.log('✅ OpenAI session.updated event received - session configured');
              console.log('✅ Session config response:', JSON.stringify(message, null, 2));
              this.sessionConfigured = true;
              this.ws.removeListener('message', sessionReadyHandler);
              
              // Send initial greeting to trigger AI to speak
              // This helps ensure the AI is ready and will respond immediately
              setTimeout(() => {
                try {
                  process.stdout.write(`\n🔵 SENDING INITIAL GREETING TRIGGER TO OPENAI\n`);
                  console.log('🔵 Sending response.create to trigger initial greeting...');
                  const greetingTrigger = { type: 'response.create' };
                  console.log('🔵 Greeting trigger payload:', JSON.stringify(greetingTrigger));
                  this.ws.send(JSON.stringify(greetingTrigger));
                  process.stdout.write(`\n✅ INITIAL GREETING TRIGGER SENT\n`);
                } catch (error) {
                  process.stdout.write(`\n❌ ERROR SENDING GREETING TRIGGER\n`);
                  console.error('❌ Error sending initial greeting trigger:', error);
                  console.error('Error stack:', error.stack);
                }
              }, 1000); // Wait 1 second after session is configured to ensure it's ready
              
              resolve(true);
            } else if (message.type === 'error') {
              console.error('❌ OpenAI session error:', JSON.stringify(message, null, 2));
              // Don't reject on error - might be recoverable
            }
          };
          
          // Listen for session events
          this.ws.on('message', sessionReadyHandler);
          
          // Timeout after 15 seconds - but log warning if no confirmation
          setTimeout(() => {
            this.ws.removeListener('message', sessionReadyHandler);
            if (!this.sessionConfigured) {
              process.stdout.write(`\n⚠️⚠️⚠️ SESSION CONFIGURATION TIMEOUT - NO session.updated RECEIVED ⚠️⚠️⚠️\n`);
              console.warn('⚠️ Session confirmation timeout after 15 seconds');
              console.warn('⚠️ WARNING: OpenAI may not be ready to receive audio without session.updated confirmation');
              console.warn('⚠️ Proceeding anyway - session might still work, but audio may be ignored');
              // Set a flag to indicate we're proceeding without confirmation
              this._sessionTimeoutProceeded = true;
              // Still resolve so initialization doesn't hang
              resolve(true);
            }
          }, 15000);
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // Log ALL message types for debugging (we can filter later)
            if (!this._messageTypeCounts) this._messageTypeCounts = {};
            if (!this._messageTypeCounts[message.type]) {
              this._messageTypeCounts[message.type] = 0;
              // Log first occurrence of each message type
              process.stdout.write(`\n🔵 OPENAI MESSAGE TYPE: ${message.type}\n`);
              console.log(`🔵 OpenAI message type received: ${message.type}`);
            }
            this._messageTypeCounts[message.type]++;
            
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
            } else if (message.type === 'input_audio_buffer.speech_started') {
              process.stdout.write(`\n🔵 OPENAI: Speech started detected\n`);
              console.log('🔵 OpenAI detected speech started');
            } else if (message.type === 'input_audio_buffer.speech_stopped') {
              process.stdout.write(`\n🔵 OPENAI: Speech stopped - should trigger response\n`);
              console.log('🔵 OpenAI detected speech stopped - response should be generated');
            } else if (message.type === 'response.created') {
              process.stdout.write(`\n🔵 OPENAI: Response created\n`);
              console.log('🔵 OpenAI response created');
            } else if (message.type === 'response.audio_transcript.delta' || message.type === 'response.audio.delta') {
              // Log first few deltas to verify responses
              if (!this._responseDeltaCount) this._responseDeltaCount = 0;
              this._responseDeltaCount++;
              if (this._responseDeltaCount <= 5) {
                process.stdout.write(`\n🔵 OPENAI RESPONSE DELTA #${this._responseDeltaCount}: ${message.type}\n`);
                console.log(`🔵 OpenAI response delta #${this._responseDeltaCount}:`, message.type);
              }
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
      case 'input_audio_buffer.speech_started':
        process.stdout.write(`\n🔵 OPENAI: Speech started - user is speaking\n`);
        console.log('🔵 OpenAI detected speech started');
        break;
        
      case 'input_audio_buffer.speech_stopped':
        process.stdout.write(`\n🔵 OPENAI: Speech stopped - creating response...\n`);
        console.log('🔵 OpenAI detected speech stopped - response should be generated automatically');
        // With server_vad, OpenAI should auto-create response, but let's verify
        break;
        
      case 'response.created':
        process.stdout.write(`\n🔵 OPENAI: Response created - AI will speak now\n`);
        console.log('🔵 OpenAI response created');
        this.isResponding = true;
        break;
        
      case 'response.audio_transcript.delta':
        if (message.delta) {
          this.transcript += message.delta;
          // Log first transcript to verify AI is responding
          if (!this._firstTranscriptLogged) {
            process.stdout.write(`\n🔵 OPENAI TRANSCRIPT STARTED: "${message.delta}"\n`);
            console.log('🔵 OpenAI transcript delta:', message.delta);
            this._firstTranscriptLogged = true;
          } else if (this.transcript.length < 100) {
            // Log first 100 chars of transcript
            console.log('🔵 OpenAI transcript so far:', this.transcript.substring(0, 100));
          }
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
          // Log first few to verify responses are coming
          if (!this._firstAudioResponseLogged) {
            process.stdout.write(`\n🔵 OPENAI AUDIO RESPONSE RECEIVED - SIZE: ${message.delta.length} bytes\n`);
            console.log('🔵 OpenAI audio response received, size:', message.delta.length, 'bytes (base64)');
            this._firstAudioResponseLogged = true;
          }
          const audioBuffer = Buffer.from(message.delta, 'base64');
          this.handleAudioOutput(audioBuffer);
        } else {
          console.warn('⚠️ response.audio.delta received but delta is empty');
        }
        break;
        
      case 'response.audio.done':
        console.log('✅ OpenAI audio response complete');
        break;
        
      case 'response.done':
        process.stdout.write(`\n✅ OPENAI RESPONSE COMPLETE\n`);
        console.log('✅ OpenAI response complete');
        this.isResponding = false;
        this.responseLock = false;
        break;
        
      case 'session.updated':
        console.log('✅ OpenAI session.updated event received');
        this.sessionConfigured = true;
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
        
      default:
        // Log any other message types we're not handling - might be important
        if (message.type && !message.type.startsWith('conversation.') && message.type !== 'ping') {
          console.log('🔵 OpenAI message (unhandled):', message.type);
        }
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
    
    // Don't send audio until session is configured (unless we timed out and are proceeding anyway)
    if (!this.sessionConfigured && !this._sessionTimeoutProceeded) {
      // Only log first few times to avoid spam
      if (!this._sessionWarningCount) this._sessionWarningCount = 0;
      this._sessionWarningCount++;
      if (this._sessionWarningCount <= 5) {
        process.stdout.write(`\n⚠️ SESSION NOT CONFIGURED - SKIPPING AUDIO #${this._sessionWarningCount}\n`);
        console.warn(`⚠️ Session not configured yet, skipping audio chunk #${this._sessionWarningCount} (this is normal during startup)`);
      }
      return;
    }
    
    // If we proceeded without session confirmation, log a warning on first audio send
    if (this._sessionTimeoutProceeded && !this._timeoutWarningLogged) {
      process.stdout.write(`\n⚠️ SENDING AUDIO WITHOUT session.updated CONFIRMATION (proceeding after timeout)\n`);
      console.warn('⚠️ WARNING: Sending audio to OpenAI without session.updated confirmation');
      console.warn('⚠️ OpenAI may ignore this audio if session is not fully configured');
      this._timeoutWarningLogged = true;
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
          
          // Check if audio is silence (all zeros or very low amplitude)
          let maxAmplitude = 0;
          let nonZeroSamples = 0;
          for (let i = 0; i < convertedAudio.length; i += 2) {
            const sample = Math.abs(convertedAudio.readInt16LE(i));
            if (sample > 0) nonZeroSamples++;
            if (sample > maxAmplitude) maxAmplitude = sample;
          }
          const silenceRatio = 1 - (nonZeroSamples / (convertedAudio.length / 2));
          console.log('🔵 Audio statistics:');
          console.log('   - Max amplitude:', maxAmplitude);
          console.log('   - Non-zero samples:', nonZeroSamples, 'of', convertedAudio.length / 2);
          console.log('   - Silence ratio:', (silenceRatio * 100).toFixed(1) + '%');
          if (silenceRatio > 0.95) {
            process.stdout.write(`\n⚠️⚠️⚠️ WARNING: AUDIO APPEARS TO BE SILENCE (${(silenceRatio * 100).toFixed(1)}% zeros) ⚠️⚠️⚠️\n`);
            console.warn('⚠️ WARNING: Converted audio appears to be mostly silence');
            console.warn('⚠️ OpenAI may not detect speech if audio is silence');
          }
          
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
      
      // Log first few sends to verify audio is being transmitted
      if (!this._audioSendCount) this._audioSendCount = 0;
      this._audioSendCount++;
      if (this._audioSendCount <= 5 || this._audioSendCount % 50 === 0) {
        process.stdout.write(`\n🔵 SENDING AUDIO TO OPENAI #${this._audioSendCount} (${base64Audio.length} base64 bytes)\n`);
        console.log(`🔵 Sending audio chunk #${this._audioSendCount} to OpenAI (${base64Audio.length} base64 bytes, ${convertedAudio.length} raw bytes)`);
      }
      
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

