import express from 'express';
import { VoximplantService } from '../services/voximplant.js';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';

const router = express.Router();

// Search for available phone numbers
router.get('/search', authenticate, async (req, res) => {
  try {
    const { countryCode = 'US', phoneCategoryName = 'GEOGRAPHIC', count = 10 } = req.query;
    
    console.log('Phone number search request:', { countryCode, phoneCategoryName, count });
    
    const numbers = await VoximplantService.searchPhoneNumbers(
      countryCode,
      phoneCategoryName,
      parseInt(count)
    );
    
    console.log('Phone numbers found:', numbers.length);
    res.json({ numbers });
  } catch (error) {
    console.error('Search phone numbers error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to search phone numbers',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Purchase and assign phone number to business
router.post('/purchase', authenticate, async (req, res) => {
  try {
    const { phoneNumber, countryCode = 'US' } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Check if business already has a phone number
    const business = await Business.findById(req.businessId);
    
    if (business.voximplant_number) {
      return res.status(400).json({ 
        error: 'Business already has a phone number assigned. Please contact support to change it or add additional numbers.' 
      });
    }
    
    // Purchase and assign the phone number
    console.log('Purchasing phone number:', phoneNumber, 'for business:', req.businessId, 'country:', countryCode);
    const result = await VoximplantService.purchaseAndAssignPhoneNumber(
      req.businessId,
      phoneNumber,
      countryCode
    );
    
    console.log('Phone number purchase result:', result);
    
    // Verify the business was updated
    const updatedBusiness = await Business.findById(req.businessId);
    console.log('Business after purchase:', {
      id: updatedBusiness.id,
      voximplant_number: updatedBusiness.voximplant_number,
    });
    
    res.json({
      success: true,
      phone_number: result.phone_number,
      message: 'Phone number purchased and assigned successfully',
    });
  } catch (error) {
    console.error('Purchase phone number error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
    });
    
    // Return more specific error messages
    const errorMessage = error.message || 'Failed to purchase phone number';
    const statusCode = error.message?.includes('Insufficient funds') ? 402 : 500; // 402 Payment Required
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get current phone number info
router.get('/current', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    if (!business.voximplant_number) {
      return res.json({ phone_number: null });
    }
    
    // Optionally get detailed info from Voximplant
    try {
      const info = await VoximplantService.getPhoneNumberInfo(business.voximplant_number);
      res.json({
        phone_number: business.voximplant_number,
        info: info || null,
      });
    } catch (error) {
      // If we can't get info, just return the number
      res.json({
        phone_number: business.voximplant_number,
        info: null,
      });
    }
  } catch (error) {
    console.error('Get current phone number error:', error);
    res.status(500).json({ error: 'Failed to get phone number info' });
  }
});

export default router;

