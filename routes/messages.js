import express from 'express';
import { Message } from '../models/Message.js';
import { authenticate } from '../middleware/auth.js';
import { TelnyxService } from '../services/telnyx.js';

const router = express.Router();

// Webhook for incoming SMS messages (Telnyx)
router.post('/webhook', async (req, res) => {
  try {
    console.log('Messaging webhook received:', JSON.stringify(req.body, null, 2));
    
    // Telnyx messaging webhook format
    const eventType = req.body.data?.event_type || req.body.event_type;
    
    if (eventType === 'message.received' || eventType === 'message.finalized') {
      const payload = req.body.data?.payload || req.body.payload || {};
      const fromNumber = payload.from?.phone_number || payload.from;
      const toNumber = payload.to?.[0]?.phone_number || payload.to || payload.to_number;
      const messageText = payload.text || payload.body || '';
      
      console.log('Incoming SMS:', { fromNumber, toNumber, messageText });
      
      // Find business by the number that received the message
      const business = await TelnyxService.findBusinessByNumber(toNumber);
      
      if (business) {
        // Create a message record
        await Message.create({
          business_id: business.id,
          caller_phone: fromNumber,
          message_text: messageText,
        });
        
        console.log('Message saved for business:', business.id);
      } else {
        console.log('Business not found for number:', toNumber);
      }
    }
    
    // Always return 200 to acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    console.error('Messaging webhook error:', error);
    // Still return 200 to prevent Telnyx from retrying
    res.json({ received: true, error: error.message });
  }
});

// Get messages
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const messages = await Message.findByBusinessId(req.businessId, limit);
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Mark message as read
router.patch('/:messageId/read', authenticate, async (req, res) => {
  try {
    const message = await Message.markAsRead(req.params.messageId);
    res.json({ message });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

export default router;

