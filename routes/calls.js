import express from 'express';
import { VoximplantService } from '../services/voximplant.js';
import { TelnyxService } from '../services/telnyx.js';
import { AIProcessor } from '../services/aiProcessor.js';
import { CallSession } from '../models/CallSession.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Unified webhook for call events (supports both Voximplant and Telnyx)
router.post('/webhook', async (req, res) => {
  try {
    // Detect provider by webhook format
    const isTelnyx = req.body.data?.event_type || req.body.event_type;
    const isVoximplant = req.body.event || req.body.type;
    
    console.log('Webhook received:', { 
      isTelnyx: !!isTelnyx, 
      isVoximplant: !!isVoximplant,
      body: req.body 
    });
    
    // Handle Telnyx webhook
    if (isTelnyx) {
      const eventType = req.body.data?.event_type || req.body.event_type;
      console.log('Telnyx webhook event:', eventType);
      
      if (eventType === 'call.initiated') {
        const callData = TelnyxService.parseInboundCall(req);
        // Extract call_control_id from webhook payload
        const callControlId = req.body.data?.payload?.call_control_id || 
                             req.body.payload?.call_control_id ||
                             callData.telnyx_call_id;
        
        console.log('Call initiated, call_control_id:', callControlId);
        console.log('Webhook payload:', JSON.stringify(req.body, null, 2));
        
        // Handle call start (this will answer the call via API)
        await TelnyxService.handleCallStart(callData, callControlId);
        
        // Return 200 OK - Telnyx just needs acknowledgment
        // The actual answer command is sent via Call Control API
        res.json({ status: 'ok' });
      } else if (eventType === 'call.answered') {
        // Call was answered, speak greeting
        const callControlId = req.body.data?.payload?.call_control_id || req.body.payload?.call_control_id;
        const toNumber = req.body.data?.payload?.to;
        
        await TelnyxService.handleCallAnswered(callControlId, toNumber);
        res.json({ status: 'ok' });
      } else if (eventType === 'call.speak.ended') {
        // Greeting finished, start gathering speech
        const callControlId = req.body.data?.payload?.call_control_id || req.body.payload?.call_control_id;
        const clientStateBase64 = req.body.data?.payload?.client_state;
        
        await TelnyxService.handleSpeakEnded(callControlId, clientStateBase64);
        res.json({ status: 'ok' });
      } else if (eventType === 'call.ai.gathered' || eventType === 'call.ai_gather.ended') {
        // Speech was gathered, process with AI
        const callControlId = req.body.data?.payload?.call_control_id || req.body.payload?.call_control_id;
        const clientStateBase64 = req.body.data?.payload?.client_state;
        const speechResult = req.body.data?.payload?.result?.user_speech || 
                           req.body.data?.payload?.parameters?.user_speech ||
                           req.body.data?.payload?.user_speech || '';
        
        await TelnyxService.handleSpeechGathered(callControlId, clientStateBase64, speechResult);
        res.json({ status: 'ok' });
      } else if (eventType === 'call.hangup' || eventType === 'call.ended') {
        const callData = TelnyxService.parseInboundCall(req);
        const duration = req.body.data?.payload?.duration_seconds || 0;
        await TelnyxService.handleCallEnd(callData.telnyx_call_id, duration);
        res.json({ status: 'ok' });
      } else {
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
    console.error('Webhook error:', error);
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

