import WebSocket from 'ws';
import { convertTelnyxToOpenAI } from '../utils/audioConverter.js';
import log from '../utils/logHelper.js';

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
    this.onAudioOutput = null;
    this.onTranscriptComplete = null;
  }
  
  // Connect to OpenAI Realtime API
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        log.verbose('🔵 Connecting to OpenAI Realtime API...');
        
        // Verify API key is set
        if (!OPENAI_API_KEY) {
          const error = new Error('OPENAI_API_KEY environment variable is not set');
          log.error('❌ OPENAI API KEY NOT SET');
          reject(error);
          return;
        }
        
        const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        const cleanApiKey = OPENAI_API_KEY?.trim().replace(/\s+/g, '') || '';
        
        if (!cleanApiKey) {
          const error = new Error('OPENAI_API_KEY is empty after cleaning');
          log.error('❌ OPENAI API KEY EMPTY');
          reject(error);
          return;
        }
        
        // Create WebSocket with error handling
        try {
          this.ws = new WebSocket(url, {
            headers: {
              'Authorization': `Bearer ${cleanApiKey}`
            },
            handshakeTimeout: 15000,
          });
        } catch (createError) {
          log.error('❌ Failed to create WebSocket:', createError);
          reject(createError);
          return;
        }
        
        // Set up error handler
        this.ws.on('error', (error) => {
          log.error('❌ OpenAI WebSocket error:', error);
          reject(error);
        });
        
        this.ws.on('open', () => {
          log.success('✅ Connected to OpenAI Realtime API');
          
          // Wait for session.created first, then send session.update
          // OpenAI creates session automatically on connect, but we should wait for confirmation
          const sessionReadyHandler = (data) => {
            try {
              const message = JSON.parse(data.toString());
              log.verbose(`🔵 [OPENAI] Session handler: ${message.type}`);
              
              if (message.type === 'session.created') {
              console.log('✅ [OPENAI] Session created - configuring...');
              
              // Now send session.update to configure audio format
              try {
                // ABSOLUTE MINIMUM - Only parameters valid for session.update
                // temperature and max_output_tokens are NOT valid for session.update (only for session creation)
                const sessionConfig = {
                  type: 'session.update',
                  session: {
                    type: 'realtime',
                    instructions: this.buildSystemInstructions(),
                    // CRITICAL: output_audio_format must be inside session object (not at top level)
                    output_audio_format: 'pcm16',
                  },
                };
                
                console.log('🔵 [OPENAI] Configuring session for PCM16 at 24kHz');
                log.verbose('🔵 [OPENAI] Session config:', JSON.stringify(sessionConfig, null, 2));
                this.ws.send(JSON.stringify(sessionConfig));
              } catch (error) {
                console.error('❌ Error sending session config:', error);
              }
            } else if (message.type === 'session.updated') {
              console.log('✅ [OPENAI] Session configured successfully');
              log.verbose('✅ [OPENAI] Session config response:', JSON.stringify(message, null, 2));
              this.sessionConfigured = true;
              this.ws.removeListener('message', sessionReadyHandler);
              
              // Send initial greeting immediately - AI should greet the caller right away
              setTimeout(() => {
                try {
                  const greetingText = this.agentConfig?.greeting_text || 'Hello! Thank you for calling. How can I help you today?';
                  
                  console.log(`🔵 [OPENAI] Sending initial greeting: "${greetingText}"`);
                  
                  // Create response with explicit greeting instructions
                  // This ensures the AI speaks the greeting immediately when answering
                  const greetingResponse = {
                    type: 'response.create',
                    response: {
                      instructions: `You are answering the phone for a business. The call has just been answered. You MUST immediately greet the caller with this greeting: "${greetingText}". Speak naturally and be friendly. Do not wait - greet them right now.`,
                    },
                  };
                  
                  this.ws.send(JSON.stringify(greetingResponse));
                  console.log('✅ [OPENAI] Initial greeting sent');
                } catch (error) {
                  console.error('❌ [OPENAI] Error sending initial greeting:', error.message);
                }
              }, 1000); // Wait 1 second after session is configured to ensure it's ready
              
              resolve(true);
              } else if (message.type === 'error') {
                // OpenAI errors can be nested in message.error OR at top level
                const errorObj = message.error || message;
                const errorMsg = errorObj.message || message.message || 'Unknown error';
                const errorCode = errorObj.code || message.code || 'N/A';
                const errorParam = errorObj.param || message.param;
                
                console.error(`❌ [OPENAI] Session configuration error: ${errorMsg} (code: ${errorCode}${errorParam ? `, param: ${errorParam}` : ''})`);
                console.error(`❌ [OPENAI] Full error object:`, JSON.stringify(message, null, 2));
                
                // Log full error details for debugging
                if (errorParam) {
                  console.error(`❌ [OPENAI] CRITICAL: Unknown parameter '${errorParam}' in session configuration`);
                  console.error(`❌ [OPENAI] Check OpenAI Realtime API documentation for valid parameters`);
                }
              }
            } catch (error) {
              console.error('❌ [OPENAI] Error in sessionReadyHandler:', error.message);
            }
          };
          
          // Listen for session events - use 'message' event directly
          // We'll remove this handler once session is configured
          this.ws.on('message', sessionReadyHandler);
          console.log('🔵 [OPENAI] Waiting for session.created...');
          
          // Timeout after 10 seconds - if no confirmation, assume session is ready anyway
          // This is a workaround for cases where session.updated doesn't arrive
          setTimeout(() => {
            this.ws.removeListener('message', sessionReadyHandler);
            if (!this.sessionConfigured) {
              console.warn('⚠️ [OPENAI] Session confirmation timeout after 10 seconds');
              console.warn('⚠️ [OPENAI] WARNING: Did not receive session.updated confirmation');
              console.warn('⚠️ [OPENAI] PROCEEDING ANYWAY - Setting sessionConfigured=true to allow audio');
              console.warn('⚠️ [OPENAI] This may cause issues if OpenAI is not actually ready');
              // Set sessionConfigured anyway so audio can be sent
              // This is a workaround - ideally we'd wait for confirmation
              this.sessionConfigured = true;
              this._sessionTimeoutProceeded = true;
              
              // Try to send greeting anyway
              setTimeout(() => {
                try {
                  const greetingText = this.agentConfig?.greeting_text || 'Hello! Thank you for calling. How can I help you today?';
                  console.log(`🔵 [OPENAI] Sending greeting after timeout: "${greetingText}"`);
                  const greetingResponse = {
                    type: 'response.create',
                    response: {
                      instructions: `You are answering the phone for a business. The call has just been answered. You MUST immediately greet the caller with this greeting: "${greetingText}". Speak naturally and be friendly. Do not wait - greet them right now.`,
                    },
                  };
                  this.ws.send(JSON.stringify(greetingResponse));
                  console.log('✅ [OPENAI] Greeting sent after timeout');
                } catch (error) {
                  console.error('❌ Error sending greeting after timeout:', error);
                }
              }, 500);
              
              // Still resolve so initialization doesn't hang
              resolve(true);
            }
          }, 10000);
        });
        
        // Main message handler - processes all messages after session is configured
        // NOTE: session.created/updated are handled by sessionReadyHandler above
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // Skip session events in main handler - they're handled by sessionReadyHandler
            if (message.type === 'session.created' || message.type === 'session.updated') {
              // These are handled by sessionReadyHandler
              if (message.type === 'session.updated' && !this.sessionConfigured) {
                log.verbose('🔵 [OPENAI] Got session.updated in main handler, configuring...');
                this.sessionConfigured = true;
              }
              return; // Don't process further in main handler
            }
            
            // Log only critical messages to reduce noise
            if (message.type === 'error' || message.type === 'error.event') {
              const errorObj = message.error || message;
              const errorMsg = errorObj.message || message.message || 'Unknown error';
              const errorCode = errorObj.code || message.code || 'N/A';
              const errorParam = errorObj.param || message.param;
              console.error(`❌ [OPENAI] Session error: ${errorMsg} (code: ${errorCode}${errorParam ? `, param: ${errorParam}` : ''})`);
              console.error('❌ [OPENAI] Full error:', JSON.stringify(message, null, 2));
            } else if (message.type === 'response.created') {
              console.log('🔵 [OPENAI] Response created - AI will start speaking');
            } else if (message.type === 'response.done') {
              console.log('✅ [OPENAI] Response complete - session ready for next input');
            } else if (message.type === 'input_audio_buffer.speech_started') {
              console.log('🔵 [OPENAI] Speech started detected');
            } else if (message.type === 'input_audio_buffer.speech_stopped') {
              console.log('🔵 [OPENAI] Speech stopped - AI should respond');
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
        
        // Add connection timeout
        const connectionTimeout = setTimeout(() => {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('❌ [OPENAI] Connection timeout after 15 seconds');
            this.ws?.close();
            reject(new Error('OpenAI WebSocket connection timeout - connection never opened'));
          }
        }, 15000);
        
        // Clear timeout and interval on successful connection
        this.ws.once('open', () => {
          clearTimeout(connectionTimeout);
          clearInterval(stateCheckInterval);
        });
        
        this.ws.on('close', (code, reason) => {
          const reasonStr = reason?.toString() || 'No reason provided';
          console.error(`❌ [OPENAI] WebSocket closed (code: ${code}, reason: ${reasonStr})`);
          console.error('❌ [OPENAI] WebSocket readyState:', this.ws.readyState);
          console.error('❌ [OPENAI] Session configured:', this.sessionConfigured);
          
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
        console.log('🔵 [OPENAI] Speech started detected');
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log('🔵 [OPENAI] Speech stopped - triggering response.create');
        
        // CRITICAL: OpenAI detects speech boundaries but does NOT automatically create responses
        // We MUST explicitly send response.create after speech stops
        if (!this.isResponding && !this.responseLock) {
          this.responseLock = true;
          
          // First, commit the audio buffer to finalize the input
          try {
            this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
            process.stdout.write(`\n🟢 Committed audio buffer\n`);
            console.log('🟢 Sent input_audio_buffer.commit');
            
            // Then explicitly trigger a response
            this.ws.send(JSON.stringify({
              type: 'response.create',
              response: {
                instructions: 'Respond naturally to what the caller just said.'
              }
            }));
            
            console.log('🔵 [OPENAI] Triggering response.create after speech stopped');
          } catch (error) {
            console.error('❌ [OPENAI] Error triggering response.create:', error.message);
            this.responseLock = false; // Reset lock on error
          }
        } else {
          console.log('⚠️ [OPENAI] Skipping response.create - already responding or locked');
        }
        break;
        
      case 'response.created':
        console.log('🔵 [OPENAI] Response created - AI will speak now');
        this.isResponding = true;
        break;
        
      case 'response.audio_transcript.delta':
        if (message.delta) {
          this.transcript += message.delta;
          // Log first transcript to verify AI is responding
          if (!this._firstTranscriptLogged) {
            console.log(`🔵 [OPENAI] Transcript started: "${message.delta}"`);
            this._firstTranscriptLogged = true;
          }
        }
        break;
        
      case 'response.audio_transcript.done':
        this.isResponding = false;
        this.responseLock = false;
        // Notify callback if transcript is available
        if (this.onTranscriptComplete && this.transcript && this.transcript.trim().length > 0) {
          this.onTranscriptComplete(this.transcript);
          this.transcript = ''; // Reset for next response
        }
        break;
        
      case 'response.audio.delta':
        // Clear timeout since we're receiving audio
        if (this._audioDeltaTimeout) {
          clearTimeout(this._audioDeltaTimeout);
          this._audioDeltaTimeout = null;
        }
        
        // Audio chunks come as base64
        if (message.delta) {
          if (!this._audioDeltaCount) this._audioDeltaCount = 0;
          this._audioDeltaCount++;
          
          // Log first few to verify audio is coming from OpenAI
          if (this._audioDeltaCount <= 3) {
            console.log(`🔊 [OPENAI] Audio delta #${this._audioDeltaCount} received (base64: ${message.delta.length} bytes)`);
          }
          
          const audioBuffer = Buffer.from(message.delta, 'base64');
          
          if (this._audioDeltaCount <= 3) {
            console.log(`🔊 [OPENAI] Decoded to ${audioBuffer.length} bytes (PCM16 24kHz)`);
          }
          
          this.handleAudioOutput(audioBuffer);
        } else {
          console.warn('⚠️ [OPENAI] response.audio.delta received but delta is empty');
        }
        break;
        
      case 'response.audio.done':
        const totalDeltas = this._audioDeltaCount || 0;
        console.log(`✅ [OPENAI] Audio response complete (${totalDeltas} chunks sent)`);
        break;
        
      case 'response.done':
        // Clear timeout if still set
        if (this._audioDeltaTimeout) {
          clearTimeout(this._audioDeltaTimeout);
          this._audioDeltaTimeout = null;
        }
        
        const audioDeltasReceived = this._audioDeltaCount || 0;
        if (audioDeltasReceived === 0) {
          console.error('❌ [OPENAI] CRITICAL: response.done but NO audio deltas were received!');
          console.error('❌ [OPENAI] OpenAI created a response but did not generate any audio.');
          console.error('❌ [OPENAI] Check session configuration - audio.output may not be enabled.');
        } else {
          console.log(`✅ [OPENAI] Response complete - ${audioDeltasReceived} audio chunks received`);
        }
        this.isResponding = false;
        this.responseLock = false;
        break;
        
      case 'session.updated':
        console.log('✅ OpenAI session.updated event received');
        this.sessionConfigured = true;
        break;
        
      case 'error':
        // OpenAI errors can be nested in message.error OR at top level
        const errorObj = message.error || message;
        const errorMsg = errorObj.message || message.message || 'Unknown error';
        const errorCode = errorObj.code || message.code || 'N/A';
        const errorParam = errorObj.param || message.param;
        console.error(`❌ [OPENAI] Session error: ${errorMsg} (code: ${errorCode}${errorParam ? `, param: ${errorParam}` : ''})`);
        console.error('❌ [OPENAI] Full error:', JSON.stringify(message, null, 2));
        if (errorParam) {
          console.error(`❌ [OPENAI] CRITICAL: Unknown parameter '${errorParam}' - check session configuration`);
        }
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
    
    let instructions = `You are a helpful AI phone assistant answering calls for a business. `;
    
    // Make greeting instruction more explicit and urgent
    if (greeting_text) {
      instructions += `\n\nIMPORTANT: When you first start speaking (when the call is answered), you MUST immediately greet the caller with this exact greeting: "${greeting_text}". Do not wait for the caller to speak first - you are answering the phone, so greet them immediately. `;
    } else {
      instructions += `\n\nIMPORTANT: When you first start speaking (when the call is answered), you MUST immediately greet the caller. Do not wait for the caller to speak first - you are answering the phone, so greet them immediately. `;
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
      if (!this._sendErrorCount) this._sendErrorCount = 0;
      this._sendErrorCount++;
      if (this._sendErrorCount <= 3) {
        console.error('❌ [OPENAI IN] WebSocket not initialized');
      }
      return;
    }
    
    if (this.ws.readyState !== WebSocket.OPEN) {
      if (!this._sendErrorCount) this._sendErrorCount = 0;
      this._sendErrorCount++;
      if (this._sendErrorCount <= 3) {
        console.error(`❌ [OPENAI IN] WebSocket not open (state: ${this.ws.readyState})`);
      }
      return;
    }
    
    // Don't send audio until session is configured
    if (!this.sessionConfigured && !this._sessionTimeoutProceeded) {
      if (!this._sessionWarningCount) this._sessionWarningCount = 0;
      this._sessionWarningCount++;
      if (this._sessionWarningCount <= 3) {
        console.warn(`⚠️ [OPENAI IN] Session not configured yet, skipping audio (normal during startup)`);
      }
      return;
    }
    
    // If we proceeded without session confirmation, log a warning on first audio send
    if (this._sessionTimeoutProceeded && !this._timeoutWarningLogged) {
      console.warn('⚠️ [OPENAI IN] WARNING: Sending audio without session.updated confirmation');
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
        console.log(`🔵 [OPENAI IN] First audio conversion: ${audioData.length} bytes (PCMU 8kHz) → PCM16 24kHz`);
        this._firstConversionLogged = true;
      }
      
      let convertedAudio;
      try {
        convertedAudio = convertTelnyxToOpenAI(audioData);
        if (!this._firstOutputLogged) {
          // Check if audio is silence (all zeros or very low amplitude)
          let maxAmplitude = 0;
          let nonZeroSamples = 0;
          for (let i = 0; i < convertedAudio.length; i += 2) {
            const sample = Math.abs(convertedAudio.readInt16LE(i));
            if (sample > 0) nonZeroSamples++;
            if (sample > maxAmplitude) maxAmplitude = sample;
          }
          const silenceRatio = 1 - (nonZeroSamples / (convertedAudio.length / 2));
          
          console.log(`🔵 [OPENAI IN] First conversion: ${audioData.length} → ${convertedAudio.length} bytes (ratio: ${(convertedAudio.length / audioData.length).toFixed(1)}x)`);
          
          if (silenceRatio > 0.95) {
            console.error(`❌ [OPENAI IN] WARNING: Audio appears to be silence (${(silenceRatio * 100).toFixed(1)}% zeros, max amplitude: ${maxAmplitude})`);
          }
          
          this._firstOutputLogged = true;
        }
      } catch (conversionError) {
        console.error('❌ [OPENAI IN] Audio conversion error:', conversionError.message);
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
      if (this._audioSendCount <= 3 || this._audioSendCount % 100 === 0) {
        log.verbose(`🔵 [OPENAI IN] Sending audio chunk #${this._audioSendCount} (${base64Audio.length} base64 bytes)`);
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
    // Audio will be streamed back to Telnyx
    if (!this._audioOutputCount) this._audioOutputCount = 0;
    this._audioOutputCount++;
    
    // Log first few to verify callback is working
    if (this._audioOutputCount <= 3) {
      console.log(`🔊 [OPENAI OUT] Audio chunk #${this._audioOutputCount} from OpenAI (${audio.length} bytes), callback: ${!!this.onAudioOutput}`);
    }
    
    if (this.onAudioOutput) {
      this.onAudioOutput(audio);
    } else {
      if (this._audioOutputCount <= 3) {
        console.error(`❌ [OPENAI OUT] onAudioOutput callback NOT SET! Audio will be lost`);
      }
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

