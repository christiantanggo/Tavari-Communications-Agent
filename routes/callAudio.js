import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { CallHandler, getCallHandler, setCallHandler, removeCallHandler } from '../services/callHandler.js';
import { CallSession } from '../models/CallSession.js';
import { supabaseClient } from '../config/database.js';

const router = express.Router();

// WebSocket endpoint for audio streaming
export const setupCallAudioWebSocket = (server) => {
  console.log('🔵 Setting up WebSocket server for audio streaming...');
  const wss = new WebSocketServer({ 
    server,
    // No path option - WebSocketServer doesn't support path patterns
    // We'll accept all connections and validate path in handler
  });
  console.log('✅ WebSocket server created and attached to HTTP server');
  console.log('🔵 WebSocket server will accept all connections, path validation happens in handler');
  
  // Log when server is ready
  wss.on('listening', () => {
    console.log('✅ WebSocket server is listening for connections');
  });
  
  // Log upgrade requests (before connection)
  server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    process.stdout.write(`\n🔵 HTTP UPGRADE REQUEST: ${url}\n`);
    console.log('🔵 HTTP Upgrade request received:', url);
    console.log('🔵 Upgrade headers:', JSON.stringify(request.headers, null, 2));
  });
  
  wss.on('connection', async (ws, req) => {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    process.stdout.write(`\n=== WS_CONN [${connectionId}] ===\n`);
    console.log(`=== WebSocket connection received [${connectionId}] ===`);
    
    // CRITICAL: Check path IMMEDIATELY - WebSocketServer doesn't support wildcards
    const url = req.url || '';
    console.log(`[${connectionId}] 🔵 WebSocket connection URL:`, url);
    
    // Simple path validation - must be /api/calls/{uuid}/audio
    if (!url.startsWith('/api/calls/') || !url.endsWith('/audio')) {
      console.log(`[${connectionId}] ❌ Invalid WebSocket path, closing:`, url);
      ws.close(1008, 'Invalid path');
      return;
    }
    
    console.log(`[${connectionId}] ✅ Valid WebSocket path:`, url);
    
    // Extract callSessionId from path: /api/calls/{uuid}/audio
    const pathParts = url.split('/');
    const callSessionId = pathParts[3]; // /api/calls/{id}/audio
    console.log(`[${connectionId}] ✅ Extracted callSessionId:`, callSessionId);
    
    // Wrap everything in a try-catch to catch any unhandled errors
    try {
      // Log request info safely with extensive error handling
      console.log(`[${connectionId}] Step 0: Starting request info logging...`);
      process.stdout.write(`[${connectionId}] STEP_0_START\n`);
      try {
        console.log(`[${connectionId}] Step 0: Logging request info...`);
        process.stdout.write(`[${connectionId}] STEP_0_INSIDE_TRY\n`);
        console.log(`[${connectionId}] Request object exists:`, !!req);
        
        // Force flush and add delay to see if it's a timing issue
        process.stdout.write(`[${connectionId}] FLUSH TEST 1\n`);
        
        console.log(`[${connectionId}] Request object type:`, typeof req);
        process.stdout.write(`[${connectionId}] FLUSH TEST 2\n`);
        
        // Try to get keys safely
        let requestKeys = 'N/A';
        try {
          if (req) {
            requestKeys = Object.keys(req);
            console.log(`[${connectionId}] Request object keys:`, requestKeys);
          } else {
            console.log(`[${connectionId}] Request object is null/undefined, cannot get keys`);
          }
        } catch (keysError) {
          console.error(`[${connectionId}] ❌ Error getting request keys:`, keysError);
          requestKeys = 'ERROR';
        }
        process.stdout.write(`[${connectionId}] FLUSH TEST 3\n`);
        
        // Try to access req.url safely
        let requestUrl = 'undefined';
        try {
          if (req && 'url' in req) {
            requestUrl = req.url || 'undefined';
            console.log(`[${connectionId}] Request URL (direct access):`, requestUrl);
          } else {
            console.log(`[${connectionId}] ⚠️ req.url property does not exist`);
            try {
              requestUrl = req?.url || 'undefined';
              console.log(`[${connectionId}] Request URL (optional chaining):`, requestUrl);
            } catch (urlError) {
              console.error(`[${connectionId}] ❌ Error accessing req.url:`, urlError);
            }
          }
        } catch (urlAccessError) {
          console.error(`[${connectionId}] ❌ Exception accessing req.url:`, urlAccessError);
          console.error(`[${connectionId}] URL access error message:`, urlAccessError.message);
          console.error(`[${connectionId}] URL access error stack:`, urlAccessError.stack);
        }
        
        // Try to access req.method safely
        let requestMethod = 'undefined';
        try {
          if (req && 'method' in req) {
            requestMethod = req.method || 'undefined';
            console.log(`[${connectionId}] Request method (direct access):`, requestMethod);
          } else {
            console.log(`[${connectionId}] ⚠️ req.method property does not exist`);
            try {
              requestMethod = req?.method || 'undefined';
              console.log(`[${connectionId}] Request method (optional chaining):`, requestMethod);
            } catch (methodError) {
              console.error(`[${connectionId}] ❌ Error accessing req.method:`, methodError);
            }
          }
        } catch (methodAccessError) {
          console.error(`[${connectionId}] ❌ Exception accessing req.method:`, methodAccessError);
          console.error(`[${connectionId}] Method access error message:`, methodAccessError.message);
          console.error(`[${connectionId}] Method access error stack:`, methodAccessError.stack);
        }
        
        // Try to access req.headers safely
        try {
          console.log(`[${connectionId}] Attempting to access req.headers...`);
          if (req && 'headers' in req) {
            console.log(`[${connectionId}] Request headers exist:`, !!req.headers);
            if (req.headers) {
              console.log(`[${connectionId}] Request headers host:`, req.headers.host || 'undefined');
              console.log(`[${connectionId}] Request headers keys:`, Object.keys(req.headers || {}));
            } else {
              console.log(`[${connectionId}] ⚠️ Request headers are null/undefined`);
            }
          } else {
            console.log(`[${connectionId}] ⚠️ req.headers property does not exist`);
            try {
              const headers = req?.headers;
              console.log(`[${connectionId}] Request headers (optional chaining):`, headers ? 'exists' : 'undefined');
            } catch (headersError) {
              console.error(`[${connectionId}] ❌ Error accessing req.headers:`, headersError);
            }
          }
        } catch (headerAccessError) {
          console.error(`[${connectionId}] ❌ Exception accessing headers:`, headerAccessError);
          console.error(`[${connectionId}] Header access error message:`, headerAccessError.message);
          console.error(`[${connectionId}] Header access error stack:`, headerAccessError.stack);
        }
        
        console.log(`[${connectionId}] ✅ Request info logged successfully`);
      } catch (headerError) {
        console.error(`[${connectionId}] ❌ Error logging request info:`, headerError);
        console.error(`[${connectionId}] Header error message:`, headerError.message);
        console.error(`[${connectionId}] Header error stack:`, headerError.stack);
        throw headerError; // Re-throw to be caught by outer catch
      }
      
      // Path validation and callSessionId extraction already done at top of handler
      // callSessionId is already available from the early path check
      
      // CRITICAL: Set up message handler IMMEDIATELY to receive audio from Telnyx
      // This must happen BEFORE any async operations to avoid missing early audio chunks
      console.log(`[${connectionId}] 🔵 CRITICAL: Setting up message handler IMMEDIATELY...`);
      process.stdout.write(`[${connectionId}] SETUP_MESSAGE_HANDLER_IMMEDIATE\n`);
      
      let handler = null; // Will be set later
      let audioChunkCount = 0;
      const audioBuffer = []; // Buffer audio until handler is ready
      
      ws.on('message', async (data) => {
        audioChunkCount++;
        if (audioChunkCount % 100 === 0) {
          console.log(`[${connectionId}] 📥 Received ${audioChunkCount} audio chunks (handler ready: ${!!handler}, AI ready: ${handler?.aiService?.ws?.readyState === 1})`);
        }
        
        if (handler && handler.aiService && handler.aiService.ws && handler.aiService.ws.readyState === 1) {
          // Handler and AI service are ready, process immediately
          try {
            handler.handleIncomingAudio(data);
          } catch (audioError) {
            console.error(`[${connectionId}] ❌ Error processing audio:`, audioError);
          }
        } else {
          // Buffer audio until handler and AI service are ready
          audioBuffer.push(data);
          if (audioBuffer.length === 1) {
            console.log(`[${connectionId}] ⏳ Buffering audio (handler: ${!!handler}, AI: ${handler?.aiService ? 'exists' : 'none'})...`);
          }
        }
      });
      console.log(`[${connectionId}] ✅ Message handler registered (will process audio once handler is ready)`);
      
      try {
      console.log(`[${connectionId}] === WebSocket connection handler ===`);
      console.log(`[${connectionId}] callSessionId:`, callSessionId);
      
      // Get or create call handler (handler variable already declared above)
      handler = getCallHandler(callSessionId);
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
            console.log(`[${connectionId}] callSessionId is a UUID, querying database directly...`);
            try {
              console.log(`[${connectionId}] Using pre-imported Supabase client...`);
              console.log(`[${connectionId}] Supabase client exists:`, !!supabaseClient);
              console.log(`[${connectionId}] Querying call_sessions table...`);
              console.log(`[${connectionId}] Query: SELECT * FROM call_sessions WHERE id = '${callSessionId}'`);
              
              console.log(`[${connectionId}] Executing Supabase query (with 5 second timeout)...`);
              const queryStartTime = Date.now();
              
              // Create a timeout that rejects
              let timeoutId;
              const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                  reject(new Error('Database query timeout after 5 seconds'));
                }, 5000); // 5 second timeout
              });
              
              // Create the query promise
              const queryPromise = supabaseClient
                .from('call_sessions')
                .select('*')
                .eq('id', callSessionId)
                .single()
                .then(result => {
                  clearTimeout(timeoutId);
                  return result;
                })
                .catch(err => {
                  clearTimeout(timeoutId);
                  throw err;
                });
              
              console.log(`[${connectionId}] Waiting for query result (max 5 seconds)...`);
              let queryResult;
              try {
                queryResult = await Promise.race([queryPromise, timeoutPromise]);
              } catch (raceError) {
                clearTimeout(timeoutId);
                throw raceError;
              }
              
              const { data, error } = queryResult;
              
              const queryDuration = Date.now() - queryStartTime;
              console.log(`[${connectionId}] ✅ Database query completed in ${queryDuration}ms`);
              console.log(`[${connectionId}] Query result data:`, data ? 'Found' : 'Not found');
              console.log(`[${connectionId}] Query result error:`, error ? 'Error occurred' : 'No error');
              
              if (error) {
                console.error(`[${connectionId}] ❌ Database query error:`, error);
                console.error(`[${connectionId}] Error code:`, error.code);
                console.error(`[${connectionId}] Error message:`, error.message);
                console.error(`[${connectionId}] Error details:`, error.details);
                console.error(`[${connectionId}] Error hint:`, error.hint);
              } else if (data) {
                callSession = data;
                console.log(`[${connectionId}] ✅ Found call session by database ID:`, callSession.id);
                console.log(`[${connectionId}] Call session business_id:`, callSession.business_id);
                console.log(`[${connectionId}] Call session status:`, callSession.status);
              } else {
                console.log(`[${connectionId}] ⚠️ No call session found by database ID (data is null)`);
              }
            } catch (dbError) {
              console.error(`[${connectionId}] ❌ Exception during database query:`, dbError);
              console.error(`[${connectionId}] DB error name:`, dbError.name);
              console.error(`[${connectionId}] DB error message:`, dbError.message);
              console.error(`[${connectionId}] DB error stack:`, dbError.stack);
              
              // Check if it's a timeout
              if (dbError.message && dbError.message.includes('timeout')) {
                console.error(`[${connectionId}] ⚠️ Database query timed out - this may indicate a connection issue`);
              }
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
        
        // Process any buffered audio (only if AI service is ready)
        const bufferLength = audioBuffer.length;
        if (bufferLength > 0) {
          console.log(`[${connectionId}] 🔵 Processing ${bufferLength} buffered audio chunks...`);
          console.log(`[${connectionId}] Checking if AI service is ready...`);
          console.log(`[${connectionId}] AI service exists:`, !!handler.aiService);
          console.log(`[${connectionId}] AI service WebSocket ready:`, handler.aiService?.ws?.readyState === 1);
          
          let processedCount = 0;
          for (const bufferedData of audioBuffer) {
            try {
              // Only process if AI service is ready
              if (handler.aiService && handler.aiService.ws && handler.aiService.ws.readyState === 1) {
                handler.handleIncomingAudio(bufferedData);
                processedCount++;
              } else {
                // If not ready, keep buffering (will be processed by real-time handler)
                console.log(`[${connectionId}] ⏳ AI service not ready yet, skipping buffered chunk`);
              }
            } catch (audioError) {
              console.error(`[${connectionId}] ❌ Error processing buffered audio:`, audioError);
            }
          }
          audioBuffer.length = 0; // Clear buffer
          console.log(`[${connectionId}] ✅ Processed ${processedCount} of ${bufferLength} buffered audio chunks`);
        }
      } else {
        console.log('✅ Existing handler found, reusing it...');
        console.log(`Handler callSessionId: ${handler.voximplantCallId || 'N/A'}`);
        console.log(`Handler businessId: ${handler.businessId || 'N/A'}`);
        console.log('Setting audio WebSocket on existing handler...');
        try {
          handler.setAudioWebSocket(ws);
          console.log('✅ Audio WebSocket set on existing handler');
          
          // Process any buffered audio (only if AI service is ready)
          const bufferLength = audioBuffer.length;
          if (bufferLength > 0) {
            console.log(`[${connectionId}] 🔵 Processing ${bufferLength} buffered audio chunks...`);
            console.log(`[${connectionId}] Checking if AI service is ready...`);
            console.log(`[${connectionId}] AI service exists:`, !!handler.aiService);
            console.log(`[${connectionId}] AI service WebSocket ready:`, handler.aiService?.ws?.readyState === 1);
            
            let processedCount = 0;
            for (const bufferedData of audioBuffer) {
              try {
                // Only process if AI service is ready
                if (handler.aiService && handler.aiService.ws && handler.aiService.ws.readyState === 1) {
                  handler.handleIncomingAudio(bufferedData);
                  processedCount++;
                } else {
                  console.log(`[${connectionId}] ⏳ AI service not ready yet, skipping buffered chunk`);
                }
              } catch (audioError) {
                console.error(`[${connectionId}] ❌ Error processing buffered audio:`, audioError);
              }
            }
            audioBuffer.length = 0; // Clear buffer
            console.log(`[${connectionId}] ✅ Processed ${processedCount} of ${bufferLength} buffered audio chunks`);
          }
        } catch (setWsError) {
          console.error('❌ Error setting audio WebSocket on existing handler:', setWsError);
          throw setWsError;
        }
      }
      
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
      process.stdout.write(`[${connectionId}] HANDLER_COMPLETE\n`);
      process.stdout.write(`[${connectionId}] WS_READY\n`);
      
      } catch (error) {
        process.stdout.write(`[${connectionId}] HANDLER_ERROR\n`);
        console.error(`[${connectionId}] ❌ Error setting up call handler for ${callSessionId}:`, error);
        console.error(`[${connectionId}] Error name:`, error.name);
        console.error(`[${connectionId}] Error message:`, error.message);
        console.error(`[${connectionId}] Error stack:`, error.stack);
        try {
          console.error(`[${connectionId}] Error details:`, JSON.stringify(error, null, 2));
        } catch (jsonError) {
          console.error(`[${connectionId}] Could not stringify error:`, jsonError);
        }
        console.error(`[${connectionId}] Closing WebSocket due to handler setup error...`);
        try {
          ws.close(1011, 'Internal server error');
        } catch (closeError) {
          console.error(`[${connectionId}] Error closing WebSocket:`, closeError);
        }
      }
    } catch (outerError) {
      console.error(`[${connectionId}] ❌ OUTER CATCH: Error in WebSocket connection handler:`, outerError);
      console.error(`[${connectionId}] OUTER CATCH: Error name:`, outerError.name);
      console.error(`[${connectionId}] OUTER CATCH: Error message:`, outerError.message);
      console.error(`[${connectionId}] OUTER CATCH: Error stack:`, outerError.stack);
      try {
        console.error(`[${connectionId}] OUTER CATCH: Error details:`, JSON.stringify(outerError, null, 2));
      } catch (jsonError) {
        console.error(`[${connectionId}] OUTER CATCH: Could not stringify error:`, jsonError);
      }
      console.error(`[${connectionId}] OUTER CATCH: Closing WebSocket due to outer catch error...`);
      try {
        ws.close(1011, 'Invalid request');
      } catch (closeError) {
        console.error(`[${connectionId}] OUTER CATCH: Error closing WebSocket:`, closeError);
      }
    }
    
    console.log(`[${connectionId}] Connection handler execution completed`);
  });
  
  return wss;
};

export default router;

