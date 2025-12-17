// routes/calls.js
// Call session routes (VAPI-based)

import express from 'express';
import { CallSession } from '../models/CallSession.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

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
    // Try VAPI call ID first, then voximplant (legacy)
    let call = await CallSession.findByVapiCallId(req.params.callId);
    if (!call) {
      call = await CallSession.findByVoximplantCallId(req.params.callId);
    }
    
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
