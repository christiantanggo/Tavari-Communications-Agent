import express from 'express';
import { AIAgent } from '../models/AIAgent.js';
import { authenticate, ensureBusinessAccess } from '../middleware/auth.js';

const router = express.Router();

// Get AI agent config
router.get('/', authenticate, async (req, res) => {
  try {
    const agent = await AIAgent.findByBusinessId(req.businessId);
    
    if (!agent) {
      return res.status(404).json({ error: 'AI agent not found' });
    }
    
    res.json({ agent });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: 'Failed to get agent config' });
  }
});

// Update AI agent config
router.put('/', authenticate, async (req, res) => {
  try {
    const {
      name,
      greeting_text,
      business_hours,
      faqs,
      message_settings,
      voice_settings,
      system_instructions,
    } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (greeting_text !== undefined) updateData.greeting_text = greeting_text;
    if (business_hours !== undefined) updateData.business_hours = business_hours;
    if (faqs !== undefined) updateData.faqs = faqs;
    if (message_settings !== undefined) updateData.message_settings = message_settings;
    if (voice_settings !== undefined) updateData.voice_settings = voice_settings;
    if (system_instructions !== undefined) updateData.system_instructions = system_instructions;
    
    const agent = await AIAgent.update(req.businessId, updateData);
    
    res.json({ agent });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent config' });
  }
});

export default router;

