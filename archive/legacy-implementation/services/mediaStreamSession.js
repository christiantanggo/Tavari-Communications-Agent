/**
 * Media Stream Session Manager
 * Manages bidirectional audio streaming between Telnyx and OpenAI Realtime API
 * 
 * This is the core of the VAPI-style architecture:
 * - Telnyx Media Streaming (bidirectional RTP over WebSocket)
 * - OpenAI Realtime API (streaming ASR + LLM + TTS)
 * - Continuous, low-latency, interruptible audio
 */

import { AIRealtimeService } from './aiRealtime.js';
import { convertOpenAIToTelnyx } from '../utils/audioConverter.js';
import log from '../utils/logHelper.js';

export class MediaStreamSession {
  constructor(callId, callSessionId, businessId, agentConfig) {
    this.callId = callId; // Telnyx call_control_id
    this.callSessionId = callSessionId; // Database call session ID
    this.businessId = businessId;
    this.agentConfig = agentConfig;
    
    // WebSocket connections
    this.telnyxWs = null; // Telnyx Media Streaming WebSocket
    this.openaiService = null; // OpenAI Realtime Service (manages its own WebSocket)
    
    // State
    this.isActive = false;
    this.startTime = null;
    
    // Audio stats
    this.audioFramesFromTelnyx = 0;
    this.audioFramesToOpenAI = 0;
    this.audioFramesFromOpenAI = 0;
    this.audioFramesToTelnyx = 0;
  }
  
  /**
   * Initialize the session - connect to OpenAI Realtime API
   */
  async initialize() {
    try {
      log.info(`[${this.callId}] Initializing media stream session...`);
      
      // Create OpenAI Realtime service
      this.openaiService = new AIRealtimeService(
        this.callSessionId,
        this.businessId,
        this.agentConfig
      );
      
      // Set up audio output callback - forward immediately to Telnyx
      this.openaiService.onAudioOutput = (audioData) => {
        this.sendAudioToTelnyx(audioData);
      };
      
      // Connect to OpenAI
      log.info(`[${this.callId}] Connecting to OpenAI Realtime API...`);
      await this.openaiService.connect();
      log.success(`[${this.callId}] ✅ OpenAI Realtime API connected`);
      
      this.isActive = true;
      this.startTime = new Date();
      
      log.success(`[${this.callId}] ✅ Media stream session initialized`);
      return true;
    } catch (error) {
      log.error(`[${this.callId}] ❌ Failed to initialize session:`, error);
      throw error;
    }
  }
  
  /**
   * Set the Telnyx WebSocket connection
   */
  setTelnyxWebSocket(ws) {
    this.telnyxWs = ws;
    log.info(`[${this.callId}] ✅ Telnyx WebSocket set`);
    
    // Monitor WebSocket state
    if (ws) {
      ws.on('close', () => {
        log.warn(`[${this.callId}] 🔴 Telnyx WebSocket closed`);
        this.cleanup();
      });
      
      ws.on('error', (error) => {
        log.error(`[${this.callId}] ❌ Telnyx WebSocket error:`, error);
      });
    }
  }
  
  /**
   * Handle incoming audio from Telnyx
   * Telnyx sends JSON messages with base64-encoded RTP payloads
   */
  handleTelnyxMessage(message) {
    try {
      // Telnyx Media Streaming sends JSON messages
      if (typeof message === 'string') {
        const data = JSON.parse(message);
        
        // Handle media events
        if (data.event === 'media' && data.media && data.media.payload) {
          this.audioFramesFromTelnyx++;
          
          // Log first few frames
          if (this.audioFramesFromTelnyx <= 3) {
            log.info(`[${this.callId}] 🎧 Audio frame #${this.audioFramesFromTelnyx} received from Telnyx`);
          }
          
          // Decode base64 RTP payload (this is PCMU 8kHz audio)
          const rtpPayload = Buffer.from(data.media.payload, 'base64');
          
          // Forward to OpenAI immediately
          // sendAudio will handle conversion from PCMU 8kHz to PCM16 24kHz
          this.sendAudioToOpenAI(rtpPayload);
        }
      }
    } catch (error) {
      log.error(`[${this.callId}] ❌ Error handling Telnyx message:`, error);
    }
  }
  
  /**
   * Send audio to OpenAI Realtime API
   * audioData should be raw Telnyx audio (PCMU 8kHz)
   * sendAudio will handle the conversion
   */
  sendAudioToOpenAI(audioData) {
    if (!this.openaiService || !this.openaiService.ws || this.openaiService.ws.readyState !== 1) {
      // OpenAI not ready, skip silently (will be ready soon)
      return;
    }
    
    try {
      this.audioFramesToOpenAI++;
      
      // Log first few frames
      if (this.audioFramesToOpenAI <= 3) {
        log.info(`[${this.callId}] 📤 Audio frame #${this.audioFramesToOpenAI} sent to OpenAI`);
      }
      
      // Send to OpenAI - sendAudio handles conversion from PCMU 8kHz to PCM16 24kHz
      this.openaiService.sendAudio(audioData);
    } catch (error) {
      log.error(`[${this.callId}] ❌ Error sending audio to OpenAI:`, error);
    }
  }
  
  /**
   * Send audio back to Telnyx
   * Called by OpenAI audio output callback
   */
  sendAudioToTelnyx(audioData) {
    if (!this.telnyxWs || this.telnyxWs.readyState !== 1) {
      // Telnyx WebSocket not ready
      return;
    }
    
    try {
      this.audioFramesFromOpenAI++;
      
      // Log first few frames
      if (this.audioFramesFromOpenAI <= 3) {
        log.info(`[${this.callId}] 🔊 Audio frame #${this.audioFramesFromOpenAI} received from OpenAI`);
      }
      
      // Convert OpenAI audio (PCM16 24kHz) to Telnyx format (PCMU 8kHz)
      const telnyxAudio = convertOpenAIToTelnyx(audioData);
      
      // Encode as base64 for Telnyx Media Streaming format
      const base64Payload = telnyxAudio.toString('base64');
      
      // Send to Telnyx in Media Streaming format
      const message = {
        event: 'media',
        media: {
          payload: base64Payload
        }
      };
      
      this.telnyxWs.send(JSON.stringify(message));
      this.audioFramesToTelnyx++;
      
      // Log first few frames
      if (this.audioFramesToTelnyx <= 3) {
        log.info(`[${this.callId}] 📤 Audio frame #${this.audioFramesToTelnyx} sent to Telnyx`);
      }
    } catch (error) {
      log.error(`[${this.callId}] ❌ Error sending audio to Telnyx:`, error);
    }
  }
  
  /**
   * Cleanup session - close all connections and update call session
   */
  async cleanup() {
    if (!this.isActive) return;
    
    log.info(`[${this.callId}] Cleaning up media stream session...`);
    
    this.isActive = false;
    
    // Calculate call duration
    const endTime = new Date();
    const durationSeconds = this.startTime ? Math.floor((endTime - this.startTime) / 1000) : 0;
    
    // Get transcript from OpenAI service
    const transcript = this.openaiService ? this.openaiService.getTranscript() : '';
    
    // Update call session in database and track usage
    try {
      const { CallSession } = await import('../models/CallSession.js');
      const { UsageMinutes } = await import('../models/UsageMinutes.js');
      
      await CallSession.endCall(
        this.callSessionId,
        durationSeconds,
        transcript,
        'general', // intent
        false // messageTaken
      );
      log.info(`[${this.callId}] ✅ Call session updated in database`);
      
      // Track usage minutes
      const minutesUsed = durationSeconds / 60;
      const now = new Date();
      await UsageMinutes.create({
        business_id: this.businessId,
        call_session_id: this.callSessionId,
        minutes_used: minutesUsed,
        date: now.toISOString().split('T')[0],
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });
      log.info(`[${this.callId}] ✅ Usage tracked: ${minutesUsed.toFixed(2)} minutes`);
    } catch (error) {
      log.error(`[${this.callId}] ❌ Error updating call session or usage:`, error);
    }
    
    // Close OpenAI connection
    if (this.openaiService) {
      try {
        await this.openaiService.close();
      } catch (error) {
        log.error(`[${this.callId}] Error closing OpenAI connection:`, error);
      }
    }
    
    // Close Telnyx WebSocket
    if (this.telnyxWs && this.telnyxWs.readyState === 1) {
      try {
        this.telnyxWs.close();
      } catch (error) {
        log.error(`[${this.callId}] Error closing Telnyx WebSocket:`, error);
      }
    }
    
    // Log stats
    log.info(`[${this.callId}] Session stats:`);
    log.info(`  - Duration: ${durationSeconds}s`);
    log.info(`  - Audio frames from Telnyx: ${this.audioFramesFromTelnyx}`);
    log.info(`  - Audio frames to OpenAI: ${this.audioFramesToOpenAI}`);
    log.info(`  - Audio frames from OpenAI: ${this.audioFramesFromOpenAI}`);
    log.info(`  - Audio frames to Telnyx: ${this.audioFramesToTelnyx}`);
    
    log.success(`[${this.callId}] ✅ Session cleaned up`);
  }
}

// Session registry
const activeSessions = new Map();

export function getSession(callId) {
  return activeSessions.get(callId);
}

export function setSession(callId, session) {
  activeSessions.set(callId, session);
}

export function removeSession(callId) {
  activeSessions.delete(callId);
}

