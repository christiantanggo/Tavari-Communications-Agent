/**
 * Media Streaming WebSocket Endpoint
 * Handles bidirectional audio streaming from Telnyx Media Streaming
 * 
 * Endpoint: /media-stream-ws?call_id={callId}
 * 
 * This is the VAPI-style architecture:
 * - Telnyx connects to this WebSocket with bidirectional RTP
 * - We forward audio to OpenAI Realtime API
 * - We forward audio back to Telnyx through the same WebSocket
 */

import { WebSocketServer } from 'ws';
import { MediaStreamSession, getSession, setSession, removeSession } from '../services/mediaStreamSession.js';
import { CallSession } from '../models/CallSession.js';
import { AIAgent } from '../models/AIAgent.js';
import log from '../utils/logHelper.js';

export function setupMediaStreamWebSocket(server) {
  console.log('🔵 Setting up Media Streaming WebSocket server...');
  
  const wss = new WebSocketServer({ 
    noServer: true,
  });
  
  console.log('✅ Media Streaming WebSocket server created');
  
  // Handle HTTP upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    
    // Must be /media-stream-ws with call_id query parameter
    if (url.pathname !== '/media-stream-ws') {
      log.warn(`❌ Invalid WebSocket path: ${url.pathname}`);
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    
    const callId = url.searchParams.get('call_id');
    if (!callId) {
      log.warn('❌ Missing call_id query parameter');
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    
    log.info(`✅ Media Streaming WebSocket upgrade: call_id=${callId}`);
    
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
  
  wss.on('connection', async (ws, req) => {
    const connectionId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const callId = url.searchParams.get('call_id');
    
    console.log(`🔵 [${connectionId}] Media Streaming WebSocket connected - call_id: ${callId}`);
    log.info(`[${connectionId}] Telnyx Media Streaming WebSocket connected`);
    
    if (!callId) {
      console.error(`[${connectionId}] ❌ No call_id in query string`);
      ws.close(1008, 'Missing call_id parameter');
      return;
    }
    
    try {
      // Get or create session
      let session = getSession(callId);
      
      if (!session) {
        console.log(`[${connectionId}] Creating new media stream session for call: ${callId}`);
        
        // Find call session by call_control_id (stored in voximplant_call_id field)
        let callSession = await CallSession.findByVoximplantCallId(callId);
        
        if (!callSession) {
          console.error(`[${connectionId}] ❌ Call session not found for call_id: ${callId}`);
          ws.close(1008, 'Call session not found');
          return;
        }
        
        console.log(`[${connectionId}] ✅ Call session found: ${callSession.id}`);
        
        // Get AI agent config
        const agentConfig = await AIAgent.findByBusinessId(callSession.business_id);
        if (!agentConfig) {
          console.error(`[${connectionId}] ❌ AI agent not configured for business: ${callSession.business_id}`);
          ws.close(1008, 'AI agent not configured');
          return;
        }
        
        // Create media stream session
        session = new MediaStreamSession(
          callId,
          callSession.id,
          callSession.business_id,
          agentConfig
        );
        
        // Initialize session (connects to OpenAI)
        try {
          await session.initialize();
          console.log(`[${connectionId}] ✅ Session initialized`);
        } catch (initError) {
          console.error(`[${connectionId}] ❌ Failed to initialize session:`, initError);
          ws.close(1011, 'Session initialization failed');
          return;
        }
        
        // Store session
        setSession(callId, session);
        console.log(`[${connectionId}] ✅ Session stored`);
      } else {
        console.log(`[${connectionId}] Reusing existing session for call: ${callId}`);
      }
      
      // Set Telnyx WebSocket on session
      session.setTelnyxWebSocket(ws);
      console.log(`[${connectionId}] ✅ Telnyx WebSocket set on session`);
      
      // Handle incoming messages from Telnyx
      ws.on('message', (data) => {
        try {
          // Telnyx sends JSON messages with base64-encoded RTP payloads
          const message = data.toString();
          session.handleTelnyxMessage(message);
        } catch (error) {
          console.error(`[${connectionId}] ❌ Error handling Telnyx message:`, error);
        }
      });
      
      // Handle WebSocket close
      ws.on('close', async (code, reason) => {
        console.log(`[${connectionId}] 🔴 Telnyx WebSocket closed (code: ${code}, reason: ${reason?.toString() || 'N/A'})`);
        log.warn(`[${connectionId}] Telnyx WebSocket closed`);
        
        // Cleanup session
        if (session) {
          await session.cleanup();
          removeSession(callId);
        }
      });
      
      // Handle errors
      ws.on('error', (error) => {
        console.error(`[${connectionId}] ❌ Telnyx WebSocket error:`, error);
        log.error(`[${connectionId}] Telnyx WebSocket error:`, error);
      });
      
      console.log(`[${connectionId}] ✅ Media Streaming WebSocket fully configured`);
      log.success(`[${connectionId}] Media Streaming WebSocket ready`);
      
    } catch (error) {
      console.error(`[${connectionId}] ❌ Error setting up Media Streaming:`, error);
      log.error(`[${connectionId}] Error:`, error);
      ws.close(1011, 'Internal server error');
    }
  });
  
  return wss;
}

