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
    console.log('=== WebSocket connection received ===');
    console.log('Request URL:', req.url);
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      console.log('Parsed URL pathname:', url.pathname);
      
      // Only handle audio streaming paths
      if (!url.pathname.startsWith('/api/calls/') || !url.pathname.endsWith('/audio')) {
        console.log('Invalid path, closing connection:', url.pathname);
        ws.close(1008, 'Invalid path');
        return;
      }
      
      const callSessionId = url.pathname.split('/')[3]; // /api/calls/{id}/audio
      console.log(`Audio WebSocket connected for call: ${callSessionId}`);
      
      try {
      console.log('=== WebSocket connection handler ===');
      console.log('callSessionId:', callSessionId);
      
      // Get or create call handler
      let handler = getCallHandler(callSessionId);
      console.log('Existing handler found?', !!handler);
      
      if (!handler) {
        console.log('No existing handler, creating new one...');
        
        // Get call session to find business_id
        // Try both Voximplant and Telnyx call ID formats
        console.log('Trying to find call session by voximplant_call_id...');
        let callSession = await CallSession.findByVoximplantCallId(callSessionId);
        console.log('Found by voximplant_call_id?', !!callSession);
        
        if (!callSession) {
          // Try finding by database ID if callSessionId is a UUID
          console.log('Trying to find call session by database ID (UUID)...');
          const { supabaseClient } = await import('../config/database.js');
          const { data, error } = await supabaseClient
            .from('call_sessions')
            .select('*')
            .eq('id', callSessionId)
            .single();
          
          if (error) {
            console.error('Database query error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
          } else if (data) {
            callSession = data;
            console.log('✅ Found call session by database ID:', callSession.id);
          } else {
            console.log('⚠️ No call session found by database ID');
          }
        } else {
          console.log('✅ Found call session by voximplant_call_id:', callSession.id);
        }
        
        if (!callSession) {
          console.error('❌ Call session not found for:', callSessionId);
          ws.close(1008, 'Call session not found');
          return;
        }
        
        console.log('Call session found, business_id:', callSession.business_id);
        
        // Create new handler
        console.log('Creating CallHandler...');
        handler = new CallHandler(callSessionId, callSession.business_id);
        
        console.log('Initializing CallHandler...');
        await handler.initialize();
        console.log('CallHandler initialized successfully');
        
        handler.setAudioWebSocket(ws);
        setCallHandler(callSessionId, handler);
        console.log('CallHandler set and ready');
      } else {
        console.log('Using existing handler');
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
        console.error('Error stack:', error.stack);
        console.error('Error details:', JSON.stringify(error, null, 2));
        ws.close(1011, 'Internal server error');
      }
    } catch (urlError) {
      console.error('Error parsing URL or setting up WebSocket:', urlError);
      console.error('URL error stack:', urlError.stack);
      ws.close(1011, 'Invalid request');
    }
  });
  
  return wss;
};

export default router;

