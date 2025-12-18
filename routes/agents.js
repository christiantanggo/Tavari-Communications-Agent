import express from 'express';
import { AIAgent } from '../models/AIAgent.js';
import { Business } from '../models/Business.js';
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
    console.log('[Agent Settings] ========== SAVE REQUEST START ==========');
    console.log('[Agent Settings] Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      name,
      greeting_text,
      opening_greeting,
      ending_greeting,
      business_hours,
      faqs,
      holiday_hours,
      message_settings,
      voice_settings,
      system_instructions,
    } = req.body;
    
    console.log('[Agent Settings] Extracted values:', {
      opening_greeting,
      ending_greeting,
      faqs_count: faqs?.length || 0,
    });
    
    // Validate FAQ limits
    if (faqs !== undefined) {
      const { validateFaqLimit, validateFaqContent, updateFaqCount } = await import('../services/faqValidation.js');
      const business = await Business.findById(req.businessId);
      const currentFaqCount = business.faq_count || 0;
      
      // Validate each FAQ
      for (const faq of faqs) {
        const contentValidation = validateFaqContent(faq);
        if (!contentValidation.valid) {
          return res.status(400).json({ error: contentValidation.error });
        }
      }
      
      // Validate FAQ limit
      const limitValidation = await validateFaqLimit(req.businessId, currentFaqCount, faqs.length);
      if (!limitValidation.valid) {
        return res.status(400).json({ error: limitValidation.message });
      }
      
      // Update FAQ count
      await updateFaqCount(req.businessId, faqs.length);
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (greeting_text !== undefined) updateData.greeting_text = greeting_text;
    if (opening_greeting !== undefined) updateData.opening_greeting = opening_greeting;
    if (ending_greeting !== undefined) updateData.ending_greeting = ending_greeting;
    if (business_hours !== undefined) updateData.business_hours = business_hours;
    if (faqs !== undefined) updateData.faqs = faqs;
    if (holiday_hours !== undefined) updateData.holiday_hours = holiday_hours;
    if (message_settings !== undefined) updateData.message_settings = message_settings;
    if (voice_settings !== undefined) updateData.voice_settings = voice_settings;
    if (system_instructions !== undefined) updateData.system_instructions = system_instructions;
    
    console.log('[Agent Settings] Updating with data:', updateData);
    const agent = await AIAgent.update(req.businessId, updateData);
    console.log('[Agent Settings] Updated agent:', {
      id: agent.id,
      opening_greeting: agent.opening_greeting,
      ending_greeting: agent.ending_greeting,
      faqs_count: agent.faqs?.length || 0,
    });
    
    // ALWAYS rebuild VAPI assistant when agent settings change
    // This ensures the assistant has the latest data (FAQs, hours, greetings, etc.)
    console.log('[Agent Settings] 🔄 Triggering VAPI assistant rebuild...');
    (async () => {
      try {
        console.log('[Agent Settings] Starting async rebuild process...');
        const { rebuildAssistant } = await import('../services/vapi.js');
        console.log('[Agent Settings] Rebuild function imported, calling rebuildAssistant...');
        await rebuildAssistant(req.businessId);
        console.log('[Agent Settings] ✅ VAPI assistant rebuilt successfully');
      } catch (vapiError) {
        console.error('[Agent Settings] ❌❌❌ ERROR rebuilding VAPI assistant (non-blocking):', {
          message: vapiError.message,
          stack: vapiError.stack,
          code: vapiError.code,
          response: vapiError.response?.data,
        });
        // Don't fail the request if VAPI update fails
      }
    })();
    
    res.json({ agent });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent config' });
  }
});

// Rebuild VAPI assistant (manual trigger)
router.post('/rebuild', authenticate, async (req, res) => {
  try {
    console.log('[Agent Rebuild] ========== MANUAL REBUILD REQUEST ==========');
    console.log('[Agent Rebuild] Business ID:', req.businessId);
    
    const { rebuildAssistant } = await import('../services/vapi.js');
    await rebuildAssistant(req.businessId);
    
    console.log('[Agent Rebuild] ✅ Manual rebuild completed successfully');
    res.json({ success: true, message: 'AI agent rebuilt successfully' });
  } catch (error) {
    console.error('[Agent Rebuild] ❌ Error during manual rebuild:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to rebuild agent' 
    });
  }
});

export default router;

