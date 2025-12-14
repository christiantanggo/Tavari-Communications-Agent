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
    
    // Log request info safely
    try {
      console.log('Request URL:', req.url || 'undefined');
      console.log('Request method:', req.method || 'undefined');
      console.log('Request headers host:', req.headers?.host || 'undefined');
    } catch (headerError) {
      console.error('Error logging request info:', headerError);
    }
    
    try {
      // Handle WebSocket URL parsing - Telnyx might send full URL or just path
      let url;
      try {
        const requestUrl = req.url || '/';
        console.log('Attempting to parse URL:', requestUrl);
        
        if (requestUrl.startsWith('http://') || requestUrl.startsWith('https://') || requestUrl.startsWith('ws://') || requestUrl.startsWith('wss://')) {
          url = new URL(requestUrl);
          console.log('Parsed as absolute URL');
        } else {
          // It's just a path, construct full URL
          const protocol = req.headers['x-forwarded-proto'] === 'https' || req.connection?.encrypted ? 'https' : 'http';
          const host = req.headers?.host || req.headers?.['x-forwarded-host'] || 'localhost:5001';
          const baseUrl = `${protocol}://${host}`;
          console.log('Constructing URL from path, base:', baseUrl);
          url = new URL(requestUrl, baseUrl);
          console.log('Parsed as relative URL');
        }
        console.log('✅ Parsed URL pathname:', url.pathname);
        console.log('✅ Full parsed URL:', url.toString());
      } catch (urlError) {
        console.error('❌ Error parsing URL:', urlError);
        console.error('Error message:', urlError.message);
        console.error('Error stack:', urlError.stack);
        console.error('Request URL was:', req.url);
        console.error('Headers host:', req.headers?.host);
        ws.close(1011, 'Invalid URL');
        return;
      }
      
      // Only handle audio streaming paths
      console.log('Checking path validity...');
      console.log('Path starts with /api/calls/?', url.pathname.startsWith('/api/calls/'));
      console.log('Path ends with /audio?', url.pathname.endsWith('/audio'));
      
      if (!url.pathname.startsWith('/api/calls/') || !url.pathname.endsWith('/audio')) {
        console.log('❌ Invalid path, closing connection:', url.pathname);
        ws.close(1008, 'Invalid path');
        return;
      }
      
      console.log('✅ Path is valid, extracting callSessionId...');
      const pathParts = url.pathname.split('/');
      console.log('Path parts:', pathParts);
      const callSessionId = pathParts[3]; // /api/calls/{id}/audio
      console.log(`✅ Audio WebSocket connected for call: ${callSessionId}`);
      
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
        console.log('🔍 Step 1: Looking up call session...');
        console.log(`Searching for callSessionId: ${callSessionId}`);
        console.log(`callSessionId type: ${typeof callSessionId}`);
        console.log(`callSessionId length: ${callSessionId?.length || 'N/A'}`);
        
        console.log('🔍 Step 1a: Trying to find call session by voximplant_call_id...');
        let callSession;
        try {
          callSession = await CallSession.findByVoximplantCallId(callSessionId);
          console.log('✅ findByVoximplantCallId completed');
          console.log('Found by voximplant_call_id?', !!callSession);
          if (callSession) {
            console.log('Call session data:', JSON.stringify(callSession, null, 2));
          }
        } catch (findError) {
          console.error('❌ Error in findByVoximplantCallId:', findError);
          console.error('Find error message:', findError.message);
          console.error('Find error stack:', findError.stack);
          callSession = null;
        }
        
        if (!callSession) {
          // Try finding by database ID if callSessionId is a UUID
          console.log('🔍 Step 1b: Trying to find call session by database ID (UUID)...');
          console.log('Checking if callSessionId is a UUID...');
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callSessionId);
          console.log(`Is UUID? ${isUUID}`);
          
          if (isUUID) {
            console.log('callSessionId is a UUID, querying database directly...');
            try {
              const { supabaseClient } = await import('../config/database.js');
              console.log('Supabase client imported, querying call_sessions table...');
              console.log(`Query: SELECT * FROM call_sessions WHERE id = '${callSessionId}'`);
              
              const { data, error } = await supabaseClient
                .from('call_sessions')
                .select('*')
                .eq('id', callSessionId)
                .single();
              
              console.log('Database query completed');
              console.log('Query result data:', data ? 'Found' : 'Not found');
              console.log('Query result error:', error ? 'Error occurred' : 'No error');
              
              if (error) {
                console.error('❌ Database query error:', error);
                console.error('Error code:', error.code);
                console.error('Error message:', error.message);
                console.error('Error details:', error.details);
                console.error('Error hint:', error.hint);
              } else if (data) {
                callSession = data;
                console.log('✅ Found call session by database ID:', callSession.id);
                console.log('Call session business_id:', callSession.business_id);
                console.log('Call session status:', callSession.status);
              } else {
                console.log('⚠️ No call session found by database ID (data is null)');
              }
            } catch (dbError) {
              console.error('❌ Exception during database query:', dbError);
              console.error('DB error message:', dbError.message);
              console.error('DB error stack:', dbError.stack);
            }
          } else {
            console.log('⚠️ callSessionId is not a UUID, skipping database ID lookup');
          }
        } else {
          console.log('✅ Found call session by voximplant_call_id:', callSession.id);
          console.log('Call session business_id:', callSession.business_id);
          console.log('Call session status:', callSession.status);
        }
        
        if (!callSession) {
          console.error('❌ Call session not found for:', callSessionId);
          ws.close(1008, 'Call session not found');
          return;
        }
        
        console.log('✅ Call session found!');
        console.log('Call session details:');
        console.log(`  - ID: ${callSession.id}`);
        console.log(`  - Business ID: ${callSession.business_id}`);
        console.log(`  - Status: ${callSession.status}`);
        console.log(`  - Caller Number: ${callSession.caller_number}`);
        console.log(`  - Voximplant Call ID: ${callSession.voximplant_call_id}`);
        
        // Create new handler
        console.log('🔧 Step 2: Creating CallHandler instance...');
        console.log(`CallHandler constructor params: callSessionId=${callSessionId}, businessId=${callSession.business_id}`);
        try {
          handler = new CallHandler(callSessionId, callSession.business_id);
          console.log('✅ CallHandler instance created');
        } catch (constructorError) {
          console.error('❌ Error creating CallHandler:', constructorError);
          console.error('Constructor error message:', constructorError.message);
          console.error('Constructor error stack:', constructorError.stack);
          throw constructorError;
        }
        
        console.log('🔧 Step 3: Initializing CallHandler...');
        try {
          console.log('Calling handler.initialize()...');
          const initResult = await handler.initialize();
          console.log('✅ handler.initialize() completed');
          console.log('Initialize result:', initResult);
        } catch (initError) {
          console.error('❌ Error initializing CallHandler:', initError);
          console.error('Init error message:', initError.message);
          console.error('Init error stack:', initError.stack);
          console.error('Init error details:', JSON.stringify(initError, null, 2));
          throw initError;
        }
        console.log('✅ CallHandler initialized successfully');
        
        console.log('🔧 Step 4: Setting audio WebSocket on handler...');
        try {
          handler.setAudioWebSocket(ws);
          console.log('✅ Audio WebSocket set on handler');
        } catch (setWsError) {
          console.error('❌ Error setting audio WebSocket:', setWsError);
          throw setWsError;
        }
        
        console.log('🔧 Step 5: Registering handler in call handler registry...');
        try {
          setCallHandler(callSessionId, handler);
          console.log('✅ CallHandler registered in registry');
        } catch (registryError) {
          console.error('❌ Error registering handler:', registryError);
          throw registryError;
        }
        
        console.log('✅ CallHandler fully set up and ready');
      } else {
        console.log('✅ Existing handler found, reusing it...');
        console.log(`Handler callSessionId: ${handler.voximplantCallId || 'N/A'}`);
        console.log(`Handler businessId: ${handler.businessId || 'N/A'}`);
        console.log('Setting audio WebSocket on existing handler...');
        try {
          handler.setAudioWebSocket(ws);
          console.log('✅ Audio WebSocket set on existing handler');
        } catch (setWsError) {
          console.error('❌ Error setting audio WebSocket on existing handler:', setWsError);
          throw setWsError;
        }
      }
      
      // Handle incoming audio from Voximplant
      console.log('Setting up WebSocket message handler...');
      ws.on('message', async (data) => {
        console.log(`📥 WebSocket message received for call: ${callSessionId}`);
        console.log(`Message data type: ${typeof data}, isBuffer: ${Buffer.isBuffer(data)}, length: ${data?.length || 'N/A'}`);
        
        if (handler) {
          console.log('Handler exists, processing incoming audio...');
          try {
            handler.handleIncomingAudio(data);
            console.log('✅ Audio data processed successfully');
          } catch (audioError) {
            console.error('❌ Error processing incoming audio:', audioError);
            console.error('Audio error message:', audioError.message);
            console.error('Audio error stack:', audioError.stack);
          }
        } else {
          console.warn('⚠️ No handler available for incoming audio');
        }
      });
      console.log('✅ Message handler registered');
      
      // Handle WebSocket close
      console.log('Setting up WebSocket close handler...');
      ws.on('close', async (code, reason) => {
        console.log(`🔌 Audio WebSocket closed for call: ${callSessionId}`);
        console.log(`Close code: ${code}, reason: ${reason?.toString() || 'N/A'}`);
        
        if (handler) {
          console.log('Handler exists, ending call...');
          try {
            console.log('Calling handler.endCall()...');
            await handler.endCall();
            console.log('✅ Call ended successfully');
          } catch (error) {
            console.error('❌ Error ending call:', error);
            console.error('End call error message:', error.message);
            console.error('End call error stack:', error.stack);
          }
          
          console.log('Removing call handler from registry...');
          try {
            removeCallHandler(callSessionId);
            console.log('✅ Call handler removed from registry');
          } catch (removeError) {
            console.error('❌ Error removing call handler:', removeError);
          }
        } else {
          console.warn('⚠️ No handler available when closing WebSocket');
        }
      });
      console.log('✅ Close handler registered');
      
      // Handle errors
      console.log('Setting up WebSocket error handler...');
      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for call ${callSessionId}:`, error);
        console.error('WebSocket error message:', error.message);
        console.error('WebSocket error stack:', error.stack);
        console.error('WebSocket error details:', JSON.stringify(error, null, 2));
      });
      console.log('✅ Error handler registered');
      
      console.log('✅ All WebSocket event handlers registered successfully');
      console.log(`✅ WebSocket connection fully established for call: ${callSessionId}`);
      
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

