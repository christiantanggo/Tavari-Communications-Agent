import express from 'express';
import { VoximplantService } from '../services/voximplant.js';
import { TelnyxService } from '../services/telnyx.js';
import { AIProcessor } from '../services/aiProcessor.js';
import { CallSession } from '../models/CallSession.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// SIMPLE TEST MODE: Set to true to test basic call flow without streaming/AI
const SIMPLE_TEST_MODE = process.env.SIMPLE_TEST_MODE === 'true';

// Test endpoint to verify webhook URL is accessible
router.get('/webhook/test', (req, res) => {
  const timestamp = new Date().toISOString();
  process.stdout.write(`\n✅ Webhook test endpoint hit at ${timestamp}\n`);
  console.log('✅ Webhook test endpoint hit at', timestamp);
  res.json({ 
    status: 'ok', 
    message: 'Webhook endpoint is accessible',
    timestamp,
    url: '/api/calls/webhook'
  });
});

// Unified webhook for call events (supports both Voximplant and Telnyx)
router.post('/webhook', async (req, res) => {
  const timestamp = new Date().toISOString();
  const requestId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // VERY VISIBLE LOGGING - Force output immediately
  process.stdout.write(`\n\n${'='.repeat(80)}\n`);
  process.stdout.write(`🔔 WEBHOOK RECEIVED [${requestId}] at ${timestamp}\n`);
  process.stdout.write(`${'='.repeat(80)}\n`);
  console.log(`🔔 WEBHOOK RECEIVED [${requestId}] at ${timestamp}`);
  console.log(`🔔 Request method: ${req.method}`);
  console.log(`🔔 Request URL: ${req.url}`);
  console.log(`🔔 Request headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`🔔 Request body:`, JSON.stringify(req.body, null, 2));
  process.stdout.write(`🔔 END WEBHOOK LOG [${requestId}]\n\n`);
  
  try {
    // Detect provider by webhook format
    const isTelnyx = req.body.data?.event_type || req.body.event_type;
    const isVoximplant = req.body.event || req.body.type;
    
    console.log(`[${requestId}] Webhook received:`, { 
      isTelnyx: !!isTelnyx, 
      isVoximplant: !!isVoximplant,
      body: req.body 
    });
    
    // Handle Telnyx webhook
    if (isTelnyx) {
      const eventType = req.body.data?.event_type || req.body.event_type;
      process.stdout.write(`\n🔵 [${requestId}] TELNYX WEBHOOK EVENT: ${eventType}\n`);
      console.log(`[${requestId}] Telnyx webhook event:`, eventType);
      
      if (eventType === 'call.initiated') {
        process.stdout.write(`\n🔵 [${requestId}] CALL.INITIATED EVENT\n`);
        console.log(`[${requestId}] Call initiated event received`);
        
        const callData = TelnyxService.parseInboundCall(req);
        const callControlId = req.body.data?.payload?.call_control_id || 
                             req.body.payload?.call_control_id ||
                             callData.telnyx_call_id;
        
        process.stdout.write(`\n🔵 [${requestId}] Call Control ID: ${callControlId}\n`);
        console.log(`[${requestId}] Call initiated, call_control_id:`, callControlId);
        
        if (!callControlId) {
          process.stdout.write(`\n❌ [${requestId}] CRITICAL: No call_control_id found! Cannot answer call.\n`);
          console.error(`[${requestId}] ❌ CRITICAL: No call_control_id found in webhook payload`);
          res.status(200).json({ status: 'error', message: 'No call_control_id' });
          return;
        }
        
        // STEP 1: Answer the call IMMEDIATELY
        process.stdout.write(`\n🔵 [${requestId}] STEP 1: Answering call IMMEDIATELY...\n`);
        console.log(`[${requestId}] STEP 1: Answering call via POST /calls/${callControlId}/actions/answer`);
        try {
          const encodedCallControlId = encodeURIComponent(callControlId);
          const answerResponse = await TelnyxService.makeAPIRequest('POST', `/calls/${encodedCallControlId}/actions/answer`, {});
          process.stdout.write(`\n✅ [${requestId}] STEP 1 COMPLETE: Call answered successfully\n`);
          console.log(`[${requestId}] ✅ Call answered successfully:`, JSON.stringify(answerResponse, null, 2));
        } catch (answerError) {
          process.stdout.write(`\n❌ [${requestId}] CRITICAL ERROR: Failed to answer call\n`);
          process.stdout.write(`❌ [${requestId}] Error: ${answerError.message}\n`);
          console.error(`[${requestId}] ❌ CRITICAL ERROR: Failed to answer call`);
          console.error(`[${requestId}] Error message:`, answerError.message);
          console.error(`[${requestId}] Error response:`, answerError.response?.data || answerError.response || 'No response data');
          res.status(200).json({ status: 'error', message: answerError.message });
          return;
        }
        
        // STEP 2: Create call session
        process.stdout.write(`\n🔵 [${requestId}] STEP 2: Creating call session...\n`);
        console.log(`[${requestId}] STEP 2: Creating call session and handling business logic`);
        try {
          const result = await TelnyxService.handleCallStart(callData, callControlId);
          process.stdout.write(`\n✅ [${requestId}] STEP 2 COMPLETE: Call session created: ${result.callSession?.id}\n`);
          console.log(`[${requestId}] ✅ Call session created:`, result.callSession?.id);
        } catch (sessionError) {
          process.stdout.write(`\n⚠️ [${requestId}] WARNING: Call session creation failed (non-critical)\n`);
          console.warn(`[${requestId}] ⚠️ Call session creation failed:`, sessionError.message);
        }
        
        // Return 200 OK - Telnyx just needs acknowledgment
        process.stdout.write(`\n✅ [${requestId}] Sending 200 OK response to Telnyx\n`);
        console.log(`[${requestId}] Sending 200 OK response to Telnyx`);
        res.json({ status: 'ok' });
      } else if (eventType === 'call.answered') {
        process.stdout.write(`\n🔵 [${requestId}] CALL.ANSWERED EVENT\n`);
        console.log(`[${requestId}] Call answered event received`);
        
        const callData = TelnyxService.parseInboundCall(req);
        const callControlId = req.body.data?.payload?.call_control_id || 
                             req.body.payload?.call_control_id ||
                             callData.telnyx_call_id;
        
        process.stdout.write(`\n🔵 [${requestId}] Call Control ID: ${callControlId}\n`);
        console.log(`[${requestId}] Call answered, call_control_id:`, callControlId);
        
        if (SIMPLE_TEST_MODE) {
          // SIMPLE TEST MODE: Just speak a greeting, no streaming, no AI
          process.stdout.write(`\n🧪 [${requestId}] SIMPLE TEST MODE: Speaking greeting only (NO STREAMING, NO AI)\n`);
          console.log(`[${requestId}] 🧪 SIMPLE TEST MODE: Just speaking greeting to test basic call flow`);
          
          try {
            const encodedCallControlId = encodeURIComponent(callControlId);
            await TelnyxService.makeAPIRequest('POST', `/calls/${encodedCallControlId}/actions/speak`, {
              payload: 'Hello! This is a test. Can you hear me? If you can hear this, the basic call flow is working.',
              voice: 'female',
              language: 'en-US'
            });
            process.stdout.write(`\n✅ [${requestId}] SIMPLE TEST: Greeting spoken successfully\n`);
            console.log(`[${requestId}] ✅ SIMPLE TEST: Greeting spoken - if caller hears this, basic call flow works!`);
          } catch (speakError) {
            process.stdout.write(`\n❌ [${requestId}] SIMPLE TEST: Failed to speak greeting\n`);
            console.error(`[${requestId}] ❌ SIMPLE TEST: Failed to speak:`, speakError.message);
          }
        } else {
          // NORMAL MODE: Start media stream and AI
          process.stdout.write(`\n🔵 [${requestId}] Starting media stream and AI...\n`);
          console.log(`[${requestId}] Call answered - starting media stream and AI...`);
          
          if (callControlId) {
            let retries = 0;
            const maxRetries = 5;
            let success = false;
            
            while (retries < maxRetries && !success) {
              try {
                await TelnyxService.startMediaStream(callControlId);
                process.stdout.write(`\n✅ [${requestId}] Media stream started successfully\n`);
                console.log(`[${requestId}] ✅ Media stream started successfully`);
                success = true;
              } catch (error) {
                if (error.message?.includes('Call session not found')) {
                  retries++;
                  if (retries < maxRetries) {
                    const waitTime = Math.min(1000 * Math.pow(2, retries - 1), 5000);
                    process.stdout.write(`\n⚠️ [${requestId}] Session not found, retrying in ${waitTime}ms (attempt ${retries}/${maxRetries})...\n`);
                    console.log(`[${requestId}] ⚠️ Session not found, waiting ${waitTime}ms before retry ${retries}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                  } else {
                    process.stdout.write(`\n⚠️ [${requestId}] Session still not found after ${maxRetries} retries, creating session now...\n`);
                    console.log(`[${requestId}] ⚠️ Session still not found, creating it now...`);
                    try {
                      const result = await TelnyxService.handleCallStart(callData, callControlId);
                      process.stdout.write(`\n✅ [${requestId}] Session created: ${result.callSession?.id}\n`);
                      console.log(`[${requestId}] ✅ Session created:`, result.callSession?.id);
                      await TelnyxService.startMediaStream(callControlId);
                      process.stdout.write(`\n✅ [${requestId}] Media stream started successfully after creating session\n`);
                      console.log(`[${requestId}] ✅ Media stream started successfully`);
                      success = true;
                    } catch (createError) {
                      process.stdout.write(`\n❌ [${requestId}] Failed to create session and start stream\n`);
                      console.error(`[${requestId}] ❌ Failed to create session:`, createError.message);
                    }
                  }
                } else {
                  process.stdout.write(`\n❌ [${requestId}] Failed to start media stream: ${error.message}\n`);
                  console.error(`[${requestId}] ❌ Failed to start media stream:`, error.message);
                  break;
                }
              }
            }
            
            if (!success) {
              process.stdout.write(`\n❌ [${requestId}] Failed to start media stream after ${maxRetries} retries\n`);
              console.error(`[${requestId}] ❌ Failed to start media stream after all retries`);
            }
          } else {
            console.error(`[${requestId}] ❌ No callControlId found in call.answered event`);
            process.stdout.write(`\n❌ [${requestId}] No callControlId found\n`);
          }
        }
        
        res.json({ status: 'ok' });
      } else if (eventType === 'streaming.started') {
        process.stdout.write(`\n🔵 [${requestId}] STREAMING.STARTED EVENT - Telnyx should connect to WebSocket now\n`);
        console.log(`[${requestId}] Streaming started - Telnyx should connect to WebSocket now`);
        const streamUrl = req.body.data?.payload?.stream_params?.stream_url;
        const callControlId = req.body.data?.payload?.call_control_id;
        console.log(`[${requestId}] Stream URL from Telnyx:`, streamUrl);
        console.log(`[${requestId}] Call Control ID:`, callControlId);
        process.stdout.write(`\n🔵 [${requestId}] Expected WebSocket URL: ${streamUrl}\n`);
        process.stdout.write(`\n⚠️  [${requestId}] If you don't see WebSocket connection logs next, Telnyx cannot reach the WebSocket server\n`);
        res.json({ status: 'ok' });
      } else if (eventType === 'streaming.stopped') {
        process.stdout.write(`\n🔴 [${requestId}] STREAMING.STOPPED EVENT\n`);
        console.log(`[${requestId}] Streaming stopped`);
        const streamUrl = req.body.data?.payload?.stream_params?.stream_url;
        const reason = req.body.data?.payload?.reason || 'unknown';
        console.log(`[${requestId}] Stream URL:`, streamUrl);
        console.log(`[${requestId}] Reason:`, reason);
        process.stdout.write(`\n🔴 [${requestId}] Streaming stopped - Reason: ${reason}\n`);
        res.json({ status: 'ok' });
      } else if (eventType === 'call.hangup' || eventType === 'call.ended') {
        const callData = TelnyxService.parseInboundCall(req);
        const duration = req.body.data?.payload?.duration_seconds || 0;
        await TelnyxService.handleCallEnd(callData.telnyx_call_id, duration);
        res.json({ status: 'ok' });
      } else {
        console.log(`[${requestId}] Unhandled Telnyx event:`, eventType);
        res.json({ status: 'ok', message: 'Event not handled' });
      }
    }
    // Handle Voximplant webhook
    else if (isVoximplant) {
      const event = req.body.event || req.body.type;
      console.log('Voximplant webhook event:', event);
      
      if (event === 'InboundCall' || event === 'CallStart') {
        const callData = VoximplantService.parseInboundCall(req);
        const { callSession, business, scenario } = await VoximplantService.handleCallStart(callData);
        
        // Return scenario XML for Voximplant
        res.set('Content-Type', 'application/xml');
        res.send(scenario);
      } else if (event === 'CallEnd' || event === 'CallFinished') {
        const callData = VoximplantService.parseInboundCall(req);
        const duration = req.body.duration || 0;
        await VoximplantService.handleCallEnd(callData.voximplant_call_id, duration);
        res.json({ status: 'ok' });
      } else {
        res.json({ status: 'ok', message: 'Event not handled' });
      }
    } else {
      console.warn('Unknown webhook format:', req.body);
      res.status(400).json({ error: 'Unknown webhook format' });
    }
  } catch (error) {
    process.stdout.write(`\n❌ [${requestId}] WEBHOOK ERROR:\n`);
    process.stdout.write(`❌ [${requestId}] Error message: ${error.message}\n`);
    process.stdout.write(`❌ [${requestId}] Error stack: ${error.stack}\n`);
    console.error(`[${requestId}] Webhook error:`, error);
    console.error(`[${requestId}] Error stack:`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Get call sessions for authenticated business
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const calls = await CallSession.findByBusinessId(req.businessId, limit);
    res.json({ calls });
  } catch (error) {
    console.error('Get calls error:', error);
    res.status(500).json({ error: 'Failed to get calls' });
  }
});

// Get specific call session
router.get('/:callId', authenticate, async (req, res) => {
  try {
    const call = await CallSession.findByVoximplantCallId(req.params.callId);
    
    if (!call || call.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    res.json({ call });
  } catch (error) {
    console.error('Get call error:', error);
    res.status(500).json({ error: 'Failed to get call' });
  }
});

export default router;
