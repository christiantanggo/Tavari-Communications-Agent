import express from 'express';
import { Business } from '../models/Business.js';
import { AIAgent } from '../models/AIAgent.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get onboarding status
router.get('/status', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    res.json({
      onboarding_complete: business.onboarding_complete,
      voximplant_number: business.voximplant_number,
    });
  } catch (error) {
    console.error('Get setup status error:', error);
    res.status(500).json({ error: 'Failed to get setup status' });
  }
});

// Get all setup data (business + agent)
router.get('/data', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    const agent = await AIAgent.findByBusinessId(req.businessId);
    
    res.json({
      business: {
        name: business.name,
        phone: business.phone,
        address: business.address,
        timezone: business.timezone,
        onboarding_complete: business.onboarding_complete,
        voximplant_number: business.voximplant_number,
      },
      agent: agent || null,
    });
  } catch (error) {
    console.error('Get setup data error:', error);
    res.status(500).json({ error: 'Failed to get setup data' });
  }
});

// Update step 1: Business info
router.post('/step1', authenticate, async (req, res) => {
  try {
    const { name, phone, address, timezone } = req.body;
    
    await Business.update(req.businessId, {
      name,
      phone,
      address,
      timezone,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 1 error:', error);
    res.status(500).json({ error: 'Failed to update business info' });
  }
});

// Update step 2: Greeting
router.post('/step2', authenticate, async (req, res) => {
  try {
    const { greeting_text } = req.body;
    
    await AIAgent.update(req.businessId, {
      greeting_text,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 2 error:', error);
    res.status(500).json({ error: 'Failed to update greeting' });
  }
});

// Update step 3: Business hours
router.post('/step3', authenticate, async (req, res) => {
  try {
    const { business_hours } = req.body;
    
    await AIAgent.update(req.businessId, {
      business_hours,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 3 error:', error);
    res.status(500).json({ error: 'Failed to update business hours' });
  }
});

// Update step 4: FAQs
router.post('/step4', authenticate, async (req, res) => {
  try {
    const { faqs } = req.body;
    
    // Validate max 5 FAQs
    if (faqs && faqs.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 FAQs allowed' });
    }
    
    await AIAgent.update(req.businessId, {
      faqs,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 4 error:', error);
    res.status(500).json({ error: 'Failed to update FAQs' });
  }
});

// Update step 5: Message settings
router.post('/step5', authenticate, async (req, res) => {
  try {
    const { message_settings } = req.body;
    
    await AIAgent.update(req.businessId, {
      message_settings,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Step 5 error:', error);
    res.status(500).json({ error: 'Failed to update message settings' });
  }
});

// Finalize setup
router.post('/finalize', authenticate, async (req, res) => {
  try {
    // Mark onboarding as complete
    await Business.setOnboardingComplete(req.businessId);
    
    // Check if phone number was provided and purchase it
    const { phoneNumber, countryCode } = req.body;
    
    if (phoneNumber) {
      try {
        const { VoximplantService } = await import('../services/voximplant.js');
        await VoximplantService.purchaseAndAssignPhoneNumber(
          req.businessId,
          phoneNumber,
          countryCode || 'US'
        );
      } catch (phoneError) {
        console.error('Phone number purchase error:', phoneError);
        // Don't fail setup if phone purchase fails - user can add it later
        console.warn('Setup finalized but phone number purchase failed. User can add phone number later.');
      }
    }
    
    const business = await Business.findById(req.businessId);
    
    res.json({
      success: true,
      onboarding_complete: true,
      voximplant_number: business.voximplant_number,
    });
  } catch (error) {
    console.error('Finalize setup error:', error);
    res.status(500).json({ error: 'Failed to finalize setup' });
  }
});

export default router;

