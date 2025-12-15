import express from 'express';
import { VoximplantService } from '../services/voximplant.js';
import { TelnyxService } from '../services/telnyx.js';
import { AIProcessor } from '../services/aiProcessor.js';
import { CallSession } from '../models/CallSession.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

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
        process.stdout.write(`\n🔵 [${requestId}] CALL.INITIATED EVENT - Processing...\n`);
        console.log(`[${requestId}] Call initiated event received`);
        
        const callData = TelnyxService.parseInboundCall(req);
        // Extract call_control_id from webhook payload
        const callControlId = req.body.data?.payload?.call_control_id || 
                             req.body.payload?.call_control_id ||
                             callData.telnyx_call_id;
        
        process.stdout.write(`\n🔵 [${requestId}] Call Control ID: ${callControlId}\n`);
        console.log(`[${requestId}] Call initiated, call_control_id:`, callControlId);
        console.log(`[${requestId}] Webhook payload:`, JSON.stringify(req.body, null, 2));
        
        // Handle call start (this will answer the call via API)
        // Streaming will be started when call.answered event is received
        process.stdout.write(`\n🔵 [${requestId}] Calling TelnyxService.handleCallStart()...\n`);
        console.log(`[${requestId}] Calling TelnyxService.handleCallStart()...`);
        try {
          const result = await TelnyxService.handleCallStart(callData, callControlId);
          process.stdout.write(`\n✅ [${requestId}] TelnyxService.handleCallStart() completed\n`);
          console.log(`[${requestId}] TelnyxService.handleCallStart() completed`);
          console.log(`[${requestId}] Result:`, JSON.stringify(result, null, 2));
          process.stdout.write(`\n✅ [${requestId}] Call session created: ${result.callSession?.id}\n`);
          process.stdout.write(`\n✅ [${requestId}] Call answered, waiting for call.answered event...\n`);
        } catch (error) {
          process.stdout.write(`\n❌ [${requestId}] CRITICAL ERROR in handleCallStart\n`);
          console.error(`[${requestId}] ❌ ERROR in handleCallStart:`, error);
          console.error(`[${requestId}] Error message:`, error.message);
          console.error(`[${requestId}] Error stack:`, error.stack);
          console.error(`[${requestId}] Error response:`, error.response?.data || error.response || 'No response data');
          process.stdout.write(`\n❌ [${requestId}] Error message: ${error.message}\n`);
          process.stdout.write(`\n❌ [${requestId}] Error response: ${JSON.stringify(error.response?.data || {}, null, 2)}\n`);
          // Don't throw - still return 200 to Telnyx to acknowledge webhook
          // But log extensively so we can see what went wrong
        }
        
        // Return 200 OK - Telnyx just needs acknowledgment
        // The actual answer command is sent via Call Control API
        process.stdout.write(`\n✅ [${requestId}] Sending 200 OK response to Telnyx\n`);
        console.log(`[${requestId}] Sending 200 OK response to Telnyx`);
        res.json({ status: 'ok' });
      } else if (eventType === 'call.answered') {
        // Call was answered - NOW start the media stream
        // Telnyx requires the call to be in "answered" state before streaming can start
        process.stdout.write(`\n🔵 [${requestId}] CALL.ANSWERED EVENT - Starting media stream...\n`);
        console.log(`[${requestId}] Call answered - starting media stream...`);
        
        const callData = TelnyxService.parseInboundCall(req);
        const callControlId = req.body.data?.payload?.call_control_id || 
                             req.body.payload?.call_control_id ||
                             callData.telnyx_call_id;
        
        process.stdout.write(`\n🔵 [${requestId}] Call Control ID: ${callControlId}\n`);
        console.log(`[${requestId}] Call answered, call_control_id:`, callControlId);
        
        if (callControlId) {
          // Start streaming after call is answered
          // This will find the call session and start streaming with the correct session ID
          process.stdout.write(`\n🔵 [${requestId}] Calling TelnyxService.startMediaStream()...\n`);
          console.log(`[${requestId}] Starting media stream for call_control_id:`, callControlId);
          
          try {
            await TelnyxService.startMediaStream(callControlId);
            process.stdout.write(`\n✅ [${requestId}] Media stream started successfully\n`);
            console.log(`[${requestId}] ✅ Media stream started successfully`);
          } catch (error) {
            process.stdout.write(`\n❌ [${requestId}] Failed to start media stream\n`);
            console.error(`[${requestId}] ❌ Failed to start media stream after call.answered:`, error);
            console.error(`[${requestId}] Error message:`, error.message);
            console.error(`[${requestId}] Error stack:`, error.stack);
            console.error(`[${requestId}] Error response:`, error.response?.data || error.response || 'No response data');
            // Don't throw - still return 200 to Telnyx, but log the error
          }
        } else {
          console.error(`[${requestId}] ❌ No callControlId found in call.answered event`);
          process.stdout.write(`\n❌ [${requestId}] No callControlId found\n`);
        }
        
        res.json({ status: 'ok' });
      } else if (eventType === 'streaming.started') {
        // Telnyx has started streaming and should connect to our WebSocket
        console.log(`[${requestId}] Streaming started - Telnyx should connect to WebSocket now`);
        const streamUrl = req.body.data?.payload?.stream_params?.stream_url;
        console.log(`[${requestId}] Stream URL from Telnyx:`, streamUrl);
        res.json({ status: 'ok' });
      } else if (eventType === 'streaming.stopped') {
        // Streaming stopped - call may be ending
        console.log(`[${requestId}] Streaming stopped`);
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

