import { CallSession } from '../models/CallSession.js';
import { AIAgent } from '../models/AIAgent.js';
import { AIRealtimeService } from './aiRealtime.js';
import { UsageMinutes } from '../models/UsageMinutes.js';
import { Business } from '../models/Business.js';
import { supabaseClient } from '../config/database.js';
import { convertOpenAIToTelnyx } from '../utils/audioConverter.js';

export class CallHandler {
  constructor(voximplantCallId, businessId) {
    this.voximplantCallId = voximplantCallId;
    this.businessId = businessId;
    this.callSessionDbId = null;
    this.aiService = null;
    this.agentConfig = null;
    this.startTime = null;
    this.audioWebSocket = null;
    this.audioSentCount = 0; // Track successful audio sends via WebSocket
    this.lastTranscript = ''; // Store last transcript for fallback
  }
  
  // Initialize call handler
  async initialize() {
    console.log('=== CallHandler.initialize() called ===');
    console.log('voximplantCallId:', this.voximplantCallId);
    console.log('businessId:', this.businessId);
    process.stdout.write('🔵 INIT_START\n');
    
    // Check usage limits first
    console.log('🔵 Step: Checking usage limits...');
    process.stdout.write('🔵 BEFORE_USAGE_CHECK\n');
    try {
      const usageCheck = await this.checkUsageLimits();
      process.stdout.write('🔵 AFTER_USAGE_CHECK\n');
      if (!usageCheck.allowed) {
        console.error('❌ Usage limit check failed:', usageCheck.reason);
        throw new Error(usageCheck.reason || 'Usage limit reached');
      }
      console.log('✅ Usage limit check passed');
    } catch (usageError) {
      console.error('❌ Error in usage check:', usageError);
      throw usageError;
    }
    
    // Get call session - try database ID first, then voximplant_call_id
    let callSession = null;
    
    // Check if voximplantCallId is a UUID (database ID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.voximplantCallId);
    console.log('Is UUID?', isUUID);
    
    if (isUUID) {
      // It's a database ID, fetch directly
      try {
        console.log('Fetching call session by UUID from database...');
        console.log('Using pre-imported Supabase client');
        const { data, error } = await supabaseClient
          .from('call_sessions')
          .select('*')
          .eq('id', this.voximplantCallId)
          .single();
        
        if (error) {
          console.error('Database query error:', error);
          console.error('Error code:', error.code);
          console.error('Error message:', error.message);
          console.error('Error details:', JSON.stringify(error, null, 2));
        } else if (data) {
          callSession = data;
          console.log('✅ Found call session by UUID:', callSession.id);
          console.log('Call session data:', JSON.stringify(callSession, null, 2));
        } else {
          console.log('⚠️ No data returned from database query (but no error)');
        }
      } catch (dbError) {
        console.error('❌ Exception during database query:', dbError);
        console.error('Exception stack:', dbError.stack);
      }
    }
    
    // If not found by ID, try by voximplant_call_id
    if (!callSession) {
      console.log('Trying to find by voximplant_call_id...');
      callSession = await CallSession.findByVoximplantCallId(this.voximplantCallId);
      if (callSession) {
        console.log('Found call session by voximplant_call_id:', callSession.id);
      } else {
        console.log('Not found by voximplant_call_id either');
      }
    }
    
    if (!callSession) {
      console.error('Call session not found for:', this.voximplantCallId);
      throw new Error('Call session not found');
    }
    
    this.callSessionDbId = callSession.id;
    console.log('Call session DB ID:', this.callSessionDbId);
    
    // Get AI agent config
    console.log('🔵 Step: Fetching AI agent config for business:', this.businessId);
    console.log('🔵 Calling AIAgent.findByBusinessId()...');
    process.stdout.write('🔵 BEFORE_AI_AGENT_QUERY\n');
    const agentConfigStartTime = Date.now();
    try {
      this.agentConfig = await AIAgent.findByBusinessId(this.businessId);
      process.stdout.write('🔵 AFTER_AI_AGENT_QUERY\n');
      const agentConfigDuration = Date.now() - agentConfigStartTime;
      console.log(`✅ AIAgent.findByBusinessId() completed in ${agentConfigDuration}ms`);
      
      if (!this.agentConfig) {
        console.error('❌ AI agent not configured for business:', this.businessId);
        throw new Error('AI agent not configured');
      }
      console.log('✅ AI agent config found');
      console.log('AI agent config keys:', Object.keys(this.agentConfig || {}));
    } catch (agentConfigError) {
      console.error('❌ Error fetching AI agent config:', agentConfigError);
      console.error('Agent config error message:', agentConfigError.message);
      console.error('Agent config error stack:', agentConfigError.stack);
      throw agentConfigError;
    }
    
    // Initialize AI Realtime service
    console.log('🔵 Step: Creating AIRealtimeService...');
    console.log('🔵 CallSessionDbId:', this.callSessionDbId);
    console.log('🔵 BusinessId:', this.businessId);
    console.log('🔵 AgentConfig exists:', !!this.agentConfig);
    
    this.aiService = new AIRealtimeService(
      this.callSessionDbId,
      this.businessId,
      this.agentConfig
    );
    console.log('✅ AIRealtimeService created');
    
    // Connect to OpenAI
    process.stdout.write('\n🔵 STEP: Connecting to OpenAI Realtime API...\n');
    console.log('🔵 Connecting to OpenAI Realtime API...');
    console.log('🔵 Step: About to connect to OpenAI Realtime API...');
    console.log('🔵 OPENAI_API_KEY check:', !!process.env.OPENAI_API_KEY);
    try {
      console.log('🔵 Calling aiService.connect()...');
      await this.aiService.connect();
      process.stdout.write('\n✅ OPENAI CONNECTION SUCCESSFUL\n');
      console.log('✅ Successfully connected to OpenAI Realtime API');
      console.log('✅ OpenAI WebSocket readyState:', this.aiService.ws?.readyState);
      console.log('✅ OpenAI session configured:', this.aiService.sessionConfigured);
    } catch (error) {
      process.stdout.write('\n❌ OPENAI CONNECTION FAILED\n');
      console.error('❌ Failed to connect to OpenAI Realtime API:', error);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
    
    // Set up audio output handler
    this.aiService.onAudioOutput = (audio) => {
      this.sendAudioToVoximplant(audio);
    };
    
    // Set up transcript handler - use Telnyx speak API as fallback if WebSocket audio fails
    this.aiService.onTranscriptComplete = async (transcript) => {
      this.lastTranscript = transcript;
      
      process.stdout.write(`\n📝 TRANSCRIPT COMPLETE - Length: ${transcript.length} chars, Audio sent: ${this.audioSentCount} chunks\n`);
      console.log(`📝 Transcript complete: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
      console.log(`📝 Total audio chunks sent via WebSocket: ${this.audioSentCount}`);
      console.log(`📝 Total send attempts: ${this._sendAttemptCount || 0}`);
      
      // If we haven't successfully sent audio via WebSocket, use Telnyx speak API as fallback
      if (this.audioSentCount === 0 && transcript && transcript.trim().length > 0) {
        process.stdout.write(`\n⚠️ FALLBACK: No audio sent via WebSocket, using Telnyx speak API\n`);
        console.log('⚠️ No audio sent via WebSocket, using Telnyx speak API fallback');
        console.log('🔵 Transcript to speak:', transcript.substring(0, 100) + '...');
        await this.speakViaTelnyx(transcript);
      } else if (this.audioSentCount > 0) {
        process.stdout.write(`\n✅ PRIMARY: Audio sent successfully via WebSocket (${this.audioSentCount} chunks)\n`);
        console.log(`✅ Audio sent successfully via WebSocket (${this.audioSentCount} chunks), transcript available for logging`);
      } else {
        console.warn('⚠️ No audio sent and no transcript available - caller may not hear response');
      }
    };
    
    this.startTime = new Date();
    console.log('=== CallHandler initialized successfully ===');
    
    return true;
  }
  
  // Handle incoming audio from Telnyx
  handleIncomingAudio(audioData) {
    // CRITICAL: Log to confirm continuous audio processing
    if (!this._audioProcessCount) this._audioProcessCount = 0;
    this._audioProcessCount++;
    
    if (this._audioProcessCount <= 10 || this._audioProcessCount % 100 === 0) {
      process.stdout.write(`\n🎧 PROCESSING AUDIO #${this._audioProcessCount} (size: ${audioData.length} bytes)\n`);
      console.log(`🎧 Processing audio chunk #${this._audioProcessCount} (size: ${audioData.length} bytes)`);
    }
    
    if (!this.aiService) {
      console.warn('⚠️ AI service not initialized, cannot send audio to OpenAI');
      return;
    }
    
    // Check if OpenAI WebSocket is connected
    if (!this.aiService.ws || this.aiService.ws.readyState !== 1) {
      console.warn('⚠️ OpenAI WebSocket not connected (readyState:', this.aiService.ws?.readyState, '), cannot send audio');
      return;
    }
    
    // Send audio to OpenAI continuously (this should never stop)
    this.aiService.sendAudio(audioData);
  }
  
  // Send audio to Telnyx (via WebSocket)
  // Converts OpenAI PCM16 24kHz → Telnyx PCMU 8kHz
  sendAudioToVoximplant(audioData) {
    // Track all attempts
    if (!this._sendAttemptCount) this._sendAttemptCount = 0;
    this._sendAttemptCount++;
    
    // Check WebSocket state
    const wsReady = this.audioWebSocket && this.audioWebSocket.readyState === 1;
    
    // Log WebSocket state (first few and periodically)
    if (this._sendAttemptCount <= 5 || this._sendAttemptCount % 50 === 0) {
      const wsState = this.audioWebSocket ? this.audioWebSocket.readyState : 'null';
      const wsStateName = wsState === 0 ? 'CONNECTING' : wsState === 1 ? 'OPEN' : wsState === 2 ? 'CLOSING' : wsState === 3 ? 'CLOSED' : 'NULL';
      process.stdout.write(`\n📤 SEND ATTEMPT #${this._sendAttemptCount} - WebSocket state: ${wsStateName} (${wsState})\n`);
      console.log(`📤 Send attempt #${this._sendAttemptCount}, WebSocket readyState: ${wsStateName} (${wsState}), ready: ${wsReady}`);
    }
    
    if (!wsReady) {
      if (this._sendAttemptCount <= 5) {
        console.warn(`⚠️ Audio WebSocket not ready (state: ${this.audioWebSocket?.readyState}), cannot send audio to Telnyx`);
      }
      // WebSocket not ready - will use speak API fallback when transcript is ready
      return;
    }
    
    try {
      // Convert OpenAI PCM16 24kHz → Telnyx PCMU 8kHz
      const telnyxAudio = convertOpenAIToTelnyx(audioData);
      
      // Log first conversion to verify it's working
      if (!this._firstOutputConversionLogged) {
        process.stdout.write(`\n🔄 FIRST AUDIO CONVERSION - Input: ${audioData.length} bytes (PCM16 24kHz) → Output: ${telnyxAudio.length} bytes (PCMU 8kHz)\n`);
        console.log('🔄 Converting audio: OpenAI PCM16 24kHz → Telnyx PCMU 8kHz');
        console.log('🔄 Input size:', audioData.length, 'bytes (PCM16 24kHz)');
        console.log('🔄 Output size:', telnyxAudio.length, 'bytes (PCMU 8kHz)');
        console.log('🔄 Compression ratio:', (telnyxAudio.length / audioData.length).toFixed(2), 'x');
        this._firstOutputConversionLogged = true;
      }
      
      // Send audio via WebSocket
      this.audioWebSocket.send(telnyxAudio);
      this.audioSentCount++; // Track successful sends
      
      // Log successful sends (first few and periodically)
      if (this.audioSentCount <= 5 || this.audioSentCount % 50 === 0) {
        process.stdout.write(`\n✅ AUDIO SENT TO TELNYX #${this.audioSentCount} - Size: ${telnyxAudio.length} bytes\n`);
        console.log(`✅ Audio sent to Telnyx #${this.audioSentCount}, size: ${telnyxAudio.length} bytes (PCMU 8kHz)`);
      }
    } catch (error) {
      console.error(`❌ Error converting/sending audio to Telnyx (attempt #${this._sendAttemptCount}):`, error);
      console.error('Error stack:', error.stack);
      // Error sending - will use speak API fallback when transcript is ready
    }
  }
  
  // Send text response via Telnyx speak API (fallback when WebSocket audio fails)
  async speakViaTelnyx(text) {
    if (!text || text.trim().length === 0) {
      console.warn('⚠️ Cannot speak empty text via Telnyx');
      return;
    }
    
    // voximplantCallId is actually call_control_id for Telnyx
    const callControlId = this.voximplantCallId;
    
    if (!callControlId) {
      console.error('❌ Cannot speak via Telnyx: call_control_id not available');
      return;
    }
    
    try {
      console.log('🔵 Sending text to Telnyx speak API:', text.substring(0, 100) + '...');
      console.log('🔵 Call Control ID:', callControlId);
      
      // Use Telnyx speak API to send the text response
      await TelnyxService.makeAPIRequest('POST', `/calls/${callControlId}/actions/speak`, {
        payload: text,
        voice: 'Polly.Joanna',
        language: 'en-US',
        premium: true,
      });
      
      console.log('✅ Text sent to caller via Telnyx speak API');
    } catch (error) {
      console.error('❌ Failed to send text via Telnyx speak API:', error);
      console.error('Error details:', error.response?.data || error.message);
    }
  }
  
  // Set the WebSocket connection for audio streaming
  setAudioWebSocket(ws) {
    this.audioWebSocket = ws;
    const wsState = ws ? ws.readyState : 'null';
    const wsStateName = wsState === 0 ? 'CONNECTING' : wsState === 1 ? 'OPEN' : wsState === 2 ? 'CLOSING' : wsState === 3 ? 'CLOSED' : 'NULL';
    process.stdout.write(`\n🔌 AUDIO WEBSOCKET SET - State: ${wsStateName} (${wsState})\n`);
    console.log(`🔌 Audio WebSocket set, readyState: ${wsStateName} (${wsState})`);
    
    // Monitor WebSocket state changes
    if (ws) {
      ws.on('open', () => {
        process.stdout.write(`\n✅ TELNYX AUDIO WEBSOCKET OPENED\n`);
        console.log('✅ Telnyx audio WebSocket opened - ready to send audio');
      });
      
      ws.on('close', (code, reason) => {
        process.stdout.write(`\n🔴 TELNYX AUDIO WEBSOCKET CLOSED - Code: ${code}, Reason: ${reason}\n`);
        console.log(`🔴 Telnyx audio WebSocket closed - code: ${code}, reason: ${reason}`);
      });
      
      ws.on('error', (error) => {
        process.stdout.write(`\n❌ TELNYX AUDIO WEBSOCKET ERROR: ${error.message}\n`);
        console.error('❌ Telnyx audio WebSocket error:', error);
      });
    }
  }
  
  // Handle call end
  async endCall() {
    try {
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime - this.startTime) / 1000);
      const minutesUsed = durationSeconds / 60;
      
      // Get transcript
      const transcript = this.aiService ? this.aiService.getTranscript() : '';
      
      // Detect intent (simplified - could be enhanced)
      const intent = this.detectIntent(transcript);
      const messageTaken = intent === 'message';
      
      // Update call session
      await CallSession.endCall(
        this.callSessionDbId,
        durationSeconds,
        transcript,
        intent,
        messageTaken
      );
      
      // Log usage
      const now = new Date();
      await UsageMinutes.create({
        business_id: this.businessId,
        call_session_id: this.callSessionDbId,
        minutes_used: minutesUsed,
        date: now.toISOString().split('T')[0],
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });
      
      // Close AI connection
      if (this.aiService) {
        await this.aiService.close();
      }
      
      return { durationSeconds, transcript, intent, messageTaken };
    } catch (error) {
      console.error('Error ending call:', error);
      throw error;
    }
  }
  
  // Detect intent from transcript
  detectIntent(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    if (lowerTranscript.includes('message') || lowerTranscript.includes('leave a message')) {
      return 'message';
    }
    
    // Check if any FAQ was answered
    if (this.agentConfig && this.agentConfig.faqs) {
      for (const faq of this.agentConfig.faqs) {
        if (lowerTranscript.includes(faq.question.toLowerCase())) {
          return 'faq';
        }
      }
    }
    
    return 'general';
  }
  
  // Check usage limits
  async checkUsageLimits() {
    const business = await Business.findById(this.businessId);
    const currentUsage = await UsageMinutes.getCurrentMonthUsage(this.businessId);
    
    if (currentUsage >= business.usage_limit_minutes) {
      return { allowed: false, reason: 'Usage limit reached' };
    }
    
    if (currentUsage >= business.usage_limit_minutes * 0.8) {
      return { allowed: true, warning: true, usage: currentUsage, limit: business.usage_limit_minutes };
    }
    
    return { allowed: true, usage: currentUsage, limit: business.usage_limit_minutes };
  }
}

// Store active call handlers
const activeCalls = new Map();

export const getCallHandler = (callSessionId) => {
  return activeCalls.get(callSessionId);
};

export const setCallHandler = (callSessionId, handler) => {
  activeCalls.set(callSessionId, handler);
};

export const removeCallHandler = (callSessionId) => {
  activeCalls.delete(callSessionId);
};

