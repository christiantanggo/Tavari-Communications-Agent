import { CallSession } from '../models/CallSession.js';
import { AIAgent } from '../models/AIAgent.js';
import { AIRealtimeService } from './aiRealtime.js';
import { UsageMinutes } from '../models/UsageMinutes.js';
import { Business } from '../models/Business.js';

export class CallHandler {
  constructor(voximplantCallId, businessId) {
    this.voximplantCallId = voximplantCallId;
    this.businessId = businessId;
    this.callSessionDbId = null;
    this.aiService = null;
    this.agentConfig = null;
    this.startTime = null;
    this.audioWebSocket = null;
  }
  
  // Initialize call handler
  async initialize() {
    console.log('=== CallHandler.initialize() called ===');
    console.log('voximplantCallId:', this.voximplantCallId);
    console.log('businessId:', this.businessId);
    
    // Check usage limits first
    const usageCheck = await this.checkUsageLimits();
    if (!usageCheck.allowed) {
      console.error('Usage limit check failed:', usageCheck.reason);
      throw new Error(usageCheck.reason || 'Usage limit reached');
    }
    console.log('Usage limit check passed');
    
    // Get call session - try database ID first, then voximplant_call_id
    let callSession = null;
    
    // Check if voximplantCallId is a UUID (database ID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.voximplantCallId);
    console.log('Is UUID?', isUUID);
    
    if (isUUID) {
      // It's a database ID, fetch directly
      const { supabaseClient } = await import('../config/database.js');
      const { data, error } = await supabaseClient
        .from('call_sessions')
        .select('*')
        .eq('id', this.voximplantCallId)
        .single();
      
      if (!error && data) {
        callSession = data;
        console.log('Found call session by UUID:', callSession.id);
      } else {
        console.log('Not found by UUID, error:', error);
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
    console.log('Fetching AI agent config for business:', this.businessId);
    this.agentConfig = await AIAgent.findByBusinessId(this.businessId);
    if (!this.agentConfig) {
      console.error('AI agent not configured for business:', this.businessId);
      throw new Error('AI agent not configured');
    }
    console.log('AI agent config found');
    
    // Initialize AI Realtime service
    console.log('Creating AIRealtimeService...');
    this.aiService = new AIRealtimeService(
      this.callSessionDbId,
      this.businessId,
      this.agentConfig
    );
    
    // Connect to OpenAI
    console.log('Connecting to OpenAI Realtime API...');
    try {
      await this.aiService.connect();
      console.log('✅ Successfully connected to OpenAI Realtime API');
    } catch (error) {
      console.error('❌ Failed to connect to OpenAI Realtime API:', error);
      console.error('Error details:', error.message, error.stack);
      throw error;
    }
    
    // Set up audio output handler
    this.aiService.onAudioOutput = (audio) => {
      this.sendAudioToVoximplant(audio);
    };
    
    this.startTime = new Date();
    console.log('=== CallHandler initialized successfully ===');
    
    return true;
  }
  
  // Handle incoming audio from Voximplant
  handleIncomingAudio(audioData) {
    if (this.aiService) {
      // Convert audio format if needed and send to OpenAI
      this.aiService.sendAudio(audioData);
    }
  }
  
  // Send audio to Voximplant
  sendAudioToVoximplant(audioData) {
    if (this.audioWebSocket && this.audioWebSocket.readyState === 1) {
      this.audioWebSocket.send(audioData);
    }
  }
  
  // Set the WebSocket connection for audio streaming
  setAudioWebSocket(ws) {
    this.audioWebSocket = ws;
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

