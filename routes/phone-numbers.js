// routes/phone-numbers.js
// Phone number management routes for customers and admins

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { Business } from '../models/Business.js';
import { AIAgent } from '../models/AIAgent.js';
import { AdminActivityLog } from '../models/AdminActivityLog.js';
import { 
  findUnassignedTelnyxNumbers,
  searchAvailablePhoneNumbers,
  purchaseTelnyxNumber,
  provisionPhoneNumber,
  checkIfNumberProvisionedInVAPI,
  createAssistant,
  rebuildAssistant,
  linkAssistantToNumber,
} from '../services/vapi.js';
import { acquirePhoneLock, releasePhoneLock } from '../utils/phoneLock.js';
import { canAssignPhoneNumber } from '../utils/phonePreflight.js';

const router = express.Router();

// Get available phone numbers for selection (customer)
router.get('/available', authenticate, async (req, res) => {
  try {
    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
        details: preflightCheck.details,
      });
    }

    const { areaCode } = req.query;
    
    // Get unassigned numbers
    const unassignedNumbers = await findUnassignedTelnyxNumbers(areaCode || null);
    
    // Also search for available numbers to purchase
    const availableToPurchase = await searchAvailablePhoneNumbers('US', 'local', 10, areaCode || null);
    
    res.json({
      unassigned: unassignedNumbers.map(num => ({
        phone_number: num.phoneNumber || num.phone_number || num.number,
        source: 'existing',
        cost: 0, // Already purchased
      })),
      available: availableToPurchase.map(num => ({
        phone_number: num.phone_number,
        source: 'purchase',
        cost: num.phone_price || 0,
        region: num.region_information,
      })),
    });
  } catch (error) {
    console.error('Get available phone numbers error:', error);
    res.status(500).json({ error: 'Failed to get available phone numbers' });
  }
});

// Assign a phone number (customer)
router.post('/assign', authenticate, async (req, res) => {
  try {
    const { phone_number, purchase_new } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
      });
    }

    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Normalize phone number
    let phoneNumberE164 = phone_number.replace(/[^0-9+]/g, '');
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Acquire lock
    const lockAcquired = await acquirePhoneLock(phoneNumberE164, 60000);
    if (!lockAcquired) {
      return res.status(409).json({ 
        error: 'This phone number is currently being assigned to another account. Please try again in a moment.' 
      });
    }

    try {
      // If purchasing new, purchase from Telnyx first
      if (purchase_new) {
        console.log(`[Phone Assign] Purchasing new number ${phoneNumberE164}...`);
        await purchaseTelnyxNumber(phoneNumberE164);
        console.log(`[Phone Assign] ✅ Number purchased from Telnyx`);
      }

      // Check if already in VAPI
      let phoneNumberId = null;
      const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
      
      if (existingVapiNumber) {
        phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
        console.log(`[Phone Assign] Number already in VAPI, reusing ID: ${phoneNumberId}`);
      } else {
        // Provision to VAPI
        console.log(`[Phone Assign] Provisioning number to VAPI...`);
        const provisionedNumber = await provisionPhoneNumber(phoneNumberE164, business.public_phone_number);
        phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
        
        if (!phoneNumberId) {
          const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
          if (vapiCheck) {
            phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
          }
        }
      }

      // Get or create assistant
      let assistant = null;
      if (business.vapi_assistant_id) {
        // Assistant exists, we'll link to it
        console.log(`[Phone Assign] Using existing assistant: ${business.vapi_assistant_id}`);
      } else {
        // Create new assistant
        const agent = await AIAgent.findByBusinessId(business.id);
        console.log(`[Phone Assign] Creating new assistant...`);
        assistant = await createAssistant({
          name: business.name,
          public_phone_number: business.public_phone_number || '',
          timezone: business.timezone,
          business_hours: agent?.business_hours || {},
          faqs: agent?.faqs || [],
          contact_email: business.email,
          address: business.address || '',
          allow_call_transfer: business.allow_call_transfer ?? true,
          opening_greeting: agent?.greeting_text,
          voice_settings: agent?.voice_settings || {},
        });
      }

      const assistantId = assistant?.id || business.vapi_assistant_id;

      // Link assistant to phone number
      if (phoneNumberId && assistantId) {
        console.log(`[Phone Assign] Linking assistant ${assistantId} to phone number ${phoneNumberId}...`);
        await linkAssistantToNumber(assistantId, phoneNumberId);
      }

      // Update business
      await Business.update(business.id, {
        vapi_phone_number: phoneNumberE164,
        vapi_assistant_id: assistantId,
      });

      // Rebuild assistant to ensure it's up to date
      if (assistantId) {
        try {
          await rebuildAssistant(business.id);
        } catch (rebuildError) {
          console.warn('[Phone Assign] Assistant rebuild failed (non-critical):', rebuildError.message);
        }
      }

      releasePhoneLock(phoneNumberE164);

      res.json({
        success: true,
        phone_number: phoneNumberE164,
        assistant_id: assistantId,
      });
    } catch (error) {
      releasePhoneLock(phoneNumberE164);
      throw error;
    }
  } catch (error) {
    console.error('Assign phone number error:', error);
    res.status(500).json({ error: error.message || 'Failed to assign phone number' });
  }
});

// Admin: Assign phone number to business
router.post('/admin/assign/:businessId', authenticateAdmin, async (req, res) => {
  try {
    const { phone_number, purchase_new } = req.body;
    const { businessId } = req.params;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Normalize phone number
    let phoneNumberE164 = phone_number.replace(/[^0-9+]/g, '');
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Acquire lock
    const lockAcquired = await acquirePhoneLock(phoneNumberE164, 60000);
    if (!lockAcquired) {
      return res.status(409).json({ 
        error: 'This phone number is currently being assigned. Please try again in a moment.' 
      });
    }

    try {
      // If purchasing new, purchase from Telnyx first
      if (purchase_new) {
        console.log(`[Admin Phone Assign] Purchasing new number ${phoneNumberE164}...`);
        await purchaseTelnyxNumber(phoneNumberE164);
      }

      // Check if already in VAPI
      let phoneNumberId = null;
      const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
      
      if (existingVapiNumber) {
        phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
      } else {
        const provisionedNumber = await provisionPhoneNumber(phoneNumberE164, business.public_phone_number);
        phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
        
        if (!phoneNumberId) {
          const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
          if (vapiCheck) {
            phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
          }
        }
      }

      // Get or create assistant
      let assistant = null;
      if (business.vapi_assistant_id) {
        // Rebuild existing assistant
        await rebuildAssistant(business.id);
        assistant = { id: business.vapi_assistant_id };
      } else {
        const agent = await AIAgent.findByBusinessId(business.id);
        assistant = await createAssistant({
          name: business.name,
          public_phone_number: business.public_phone_number || '',
          timezone: business.timezone,
          business_hours: agent?.business_hours || {},
          faqs: agent?.faqs || [],
          contact_email: business.email,
          address: business.address || '',
          allow_call_transfer: business.allow_call_transfer ?? true,
          opening_greeting: agent?.greeting_text,
          voice_settings: agent?.voice_settings || {},
        });
      }

      const assistantId = assistant.id;

      // Link assistant to phone number
      if (phoneNumberId && assistantId) {
        await linkAssistantToNumber(assistantId, phoneNumberId);
      }

      // Update business
      await Business.update(business.id, {
        vapi_phone_number: phoneNumberE164,
        vapi_assistant_id: assistantId,
      });

      // Log admin activity
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: businessId,
        action: 'assign_phone_number',
        details: { 
          phone_number: phoneNumberE164,
          purchased_new: purchase_new || false,
        },
      });

      releasePhoneLock(phoneNumberE164);

      res.json({
        success: true,
        phone_number: phoneNumberE164,
        assistant_id: assistantId,
      });
    } catch (error) {
      releasePhoneLock(phoneNumberE164);
      throw error;
    }
  } catch (error) {
    console.error('Admin assign phone number error:', error);
    res.status(500).json({ error: error.message || 'Failed to assign phone number' });
  }
});

// Admin: Change phone number for business
router.post('/admin/change/:businessId', authenticateAdmin, async (req, res) => {
  try {
    const { phone_number, purchase_new } = req.body;
    const { businessId } = req.params;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const preflightCheck = await canAssignPhoneNumber();
    if (!preflightCheck.canAssign) {
      return res.status(503).json({
        error: 'Phone number assignment is currently unavailable',
        reason: preflightCheck.reason,
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const oldPhoneNumber = business.vapi_phone_number;

    // Normalize new phone number
    let phoneNumberE164 = phone_number.replace(/[^0-9+]/g, '');
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Acquire lock for new number
    const lockAcquired = await acquirePhoneLock(phoneNumberE164, 60000);
    if (!lockAcquired) {
      return res.status(409).json({ 
        error: 'This phone number is currently being assigned. Please try again in a moment.' 
      });
    }

    try {
      // If purchasing new, purchase from Telnyx first
      if (purchase_new) {
        console.log(`[Admin Phone Change] Purchasing new number ${phoneNumberE164}...`);
        await purchaseTelnyxNumber(phoneNumberE164);
      }

      // Check if already in VAPI
      let phoneNumberId = null;
      const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
      
      if (existingVapiNumber) {
        phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
      } else {
        const provisionedNumber = await provisionPhoneNumber(phoneNumberE164, business.public_phone_number);
        phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
        
        if (!phoneNumberId) {
          const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumberE164);
          if (vapiCheck) {
            phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
          }
        }
      }

      // Get or create assistant
      let assistant = null;
      if (business.vapi_assistant_id) {
        assistant = { id: business.vapi_assistant_id };
      } else {
        const agent = await AIAgent.findByBusinessId(business.id);
        assistant = await createAssistant({
          name: business.name,
          public_phone_number: business.public_phone_number || '',
          timezone: business.timezone,
          business_hours: agent?.business_hours || {},
          faqs: agent?.faqs || [],
          contact_email: business.email,
          address: business.address || '',
          allow_call_transfer: business.allow_call_transfer ?? true,
          opening_greeting: agent?.greeting_text,
          voice_settings: agent?.voice_settings || {},
        });
      }

      const assistantId = assistant.id;

      // Link assistant to new phone number
      if (phoneNumberId && assistantId) {
        await linkAssistantToNumber(assistantId, phoneNumberId);
      }

      // Update business
      await Business.update(business.id, {
        vapi_phone_number: phoneNumberE164,
        vapi_assistant_id: assistantId,
      });

      // Rebuild assistant
      try {
        await rebuildAssistant(business.id);
      } catch (rebuildError) {
        console.warn('[Admin Phone Change] Assistant rebuild failed (non-critical):', rebuildError.message);
      }

      // Log admin activity
      await AdminActivityLog.create({
        admin_user_id: req.adminId,
        business_id: businessId,
        action: 'change_phone_number',
        details: { 
          old_phone_number: oldPhoneNumber,
          new_phone_number: phoneNumberE164,
          purchased_new: purchase_new || false,
        },
      });

      releasePhoneLock(phoneNumberE164);

      res.json({
        success: true,
        old_phone_number: oldPhoneNumber,
        new_phone_number: phoneNumberE164,
        assistant_id: assistantId,
      });
    } catch (error) {
      releasePhoneLock(phoneNumberE164);
      throw error;
    }
  } catch (error) {
    console.error('Admin change phone number error:', error);
    res.status(500).json({ error: error.message || 'Failed to change phone number' });
  }
});

// Admin: Get available phone numbers
router.get('/admin/available', authenticateAdmin, async (req, res) => {
  try {
    const { areaCode } = req.query;
    
    const unassignedNumbers = await findUnassignedTelnyxNumbers(areaCode || null);
    const availableToPurchase = await searchAvailablePhoneNumbers('US', 'local', 20, areaCode || null);
    
    res.json({
      unassigned: unassignedNumbers.map(num => ({
        phone_number: num.phoneNumber || num.phone_number || num.number,
        source: 'existing',
        cost: 0,
      })),
      available: availableToPurchase.map(num => ({
        phone_number: num.phone_number,
        source: 'purchase',
        cost: num.phone_price || 0,
        region: num.region_information,
      })),
    });
  } catch (error) {
    console.error('Admin get available phone numbers error:', error);
    res.status(500).json({ error: 'Failed to get available phone numbers' });
  }
});

export default router;


