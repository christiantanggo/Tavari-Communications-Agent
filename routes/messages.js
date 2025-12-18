import express from 'express';
import { Message } from '../models/Message.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Note: SMS webhook handling moved to VAPI or can be added here if needed

// Get messages
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    console.log('[Messages API] ========== GET MESSAGES START ==========');
    console.log('[Messages API] businessId:', req.businessId, 'limit:', limit);
    
    if (!req.businessId) {
      console.error('[Messages API] No businessId in request');
      return res.status(400).json({ error: 'Business ID required' });
    }
    
    const messages = await Message.findByBusinessId(req.businessId, limit);
    console.log('[Messages API] Found messages:', messages?.length || 0);
    console.log('[Messages API] ========== GET MESSAGES SUCCESS ==========');
    
    // Ensure we always return an array
    res.json({ messages: messages || [] });
  } catch (error) {
    console.error('[Messages API] ========== GET MESSAGES ERROR ==========');
    console.error('[Messages API] Get messages error:', error);
    console.error('[Messages API] Error message:', error.message);
    console.error('[Messages API] Error stack:', error.stack);
    
    // Return empty array instead of error to prevent dashboard from breaking
    res.status(200).json({ messages: [] });
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

// Mark message as follow up
router.patch('/:messageId/follow-up', authenticate, async (req, res) => {
  try {
    const message = await Message.markAsFollowUp(req.params.messageId);
    res.json({ message });
  } catch (error) {
    console.error('Mark message follow up error:', error);
    res.status(500).json({ error: 'Failed to mark message as follow up' });
  }
});

export default router;

