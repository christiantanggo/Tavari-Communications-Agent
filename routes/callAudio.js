import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { CallHandler, getCallHandler, setCallHandler, removeCallHandler } from '../services/callHandler.js';
import { CallSession } from '../models/CallSession.js';

const router = express.Router();

// WebSocket endpoint for audio streaming
export const setupCallAudioWebSocket = (server) => {
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Only handle audio streaming paths
    if (!url.pathname.startsWith('/api/calls/') || !url.pathname.endsWith('/audio')) {
      ws.close(1008, 'Invalid path');
      return;
    }
    
    const callSessionId = url.pathname.split('/')[3]; // /api/calls/{id}/audio
    
    console.log(`Audio WebSocket connected for call: ${callSessionId}`);
    
    try {
      // Get or create call handler
      let handler = getCallHandler(callSessionId);
      
      if (!handler) {
        // Get call session to find business_id
        // Try both Voximplant and Telnyx call ID formats
        let callSession = await CallSession.findByVoximplantCallId(callSessionId);
        if (!callSession) {
          // Try finding by database ID if callSessionId is a UUID
          const { supabaseClient } = await import('../config/database.js');
          const { data } = await supabaseClient
            .from('call_sessions')
            .select('*')
            .eq('id', callSessionId)
            .single();
          callSession = data;
        }
        
        if (!callSession) {
          console.error('Call session not found for:', callSessionId);
          ws.close(1008, 'Call session not found');
          return;
        }
        
        // Create new handler
        handler = new CallHandler(callSessionId, callSession.business_id);
        await handler.initialize();
        handler.setAudioWebSocket(ws);
        setCallHandler(callSessionId, handler);
      } else {
        handler.setAudioWebSocket(ws);
      }
      
      // Handle incoming audio from Voximplant
      ws.on('message', async (data) => {
        if (handler) {
          handler.handleIncomingAudio(data);
        }
      });
      
      // Handle WebSocket close
      ws.on('close', async () => {
        console.log(`Audio WebSocket closed for call: ${callSessionId}`);
        if (handler) {
          try {
            await handler.endCall();
          } catch (error) {
            console.error('Error ending call:', error);
          }
          removeCallHandler(callSessionId);
        }
      });
      
      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for call ${callSessionId}:`, error);
      });
      
    } catch (error) {
      console.error(`Error setting up call handler for ${callSessionId}:`, error);
      ws.close(1011, 'Internal server error');
    }
  });
  
  return wss;
};

export default router;

