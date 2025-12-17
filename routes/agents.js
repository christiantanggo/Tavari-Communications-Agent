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
    const {
      name,
      greeting_text,
      business_hours,
      faqs,
      message_settings,
      voice_settings,
      system_instructions,
    } = req.body;
    
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
    if (business_hours !== undefined) updateData.business_hours = business_hours;
    if (faqs !== undefined) updateData.faqs = faqs;
    if (message_settings !== undefined) updateData.message_settings = message_settings;
    if (voice_settings !== undefined) updateData.voice_settings = voice_settings;
    if (system_instructions !== undefined) updateData.system_instructions = system_instructions;
    
    const agent = await AIAgent.update(req.businessId, updateData);
    
    // Update VAPI assistant if FAQs or business hours changed
    if (faqs !== undefined || business_hours !== undefined) {
      try {
        const business = await Business.findById(req.businessId);
        if (business.vapi_assistant_id) {
          const { updateAssistant } = await import('../services/vapi.js');
          const { generateAssistantPrompt } = await import('../templates/vapi-assistant-template.js');
          
          const updatedPrompt = generateAssistantPrompt({
            name: business.name,
            public_phone_number: business.public_phone_number || '',
            timezone: business.timezone,
            business_hours: agent.business_hours,
            faqs: agent.faqs,
            contact_email: business.email,
            address: business.address || '',
            allow_call_transfer: business.allow_call_transfer ?? true,
          });
          
          await updateAssistant(business.vapi_assistant_id, {
            systemPrompt: updatedPrompt,
          });
        }
      } catch (vapiError) {
        console.error('Error updating VAPI assistant:', vapiError);
        // Don't fail the request if VAPI update fails
      }
    }
    
    res.json({ agent });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent config' });
  }
});

export default router;

