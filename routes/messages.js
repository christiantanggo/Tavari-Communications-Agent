import express from 'express';
import { Message } from '../models/Message.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

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

