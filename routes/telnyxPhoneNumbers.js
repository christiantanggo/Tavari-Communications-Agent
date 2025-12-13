import express from 'express';
import { TelnyxService } from '../services/telnyx.js';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';

const router = express.Router();

// Search for available phone numbers
router.get('/search', authenticate, async (req, res) => {
  try {
    const { countryCode = 'US', phoneType = 'local', limit = 20, locality, administrativeArea, areaCode, phoneNumber } = req.query;
    
    console.log('Telnyx phone number search request:', { countryCode, phoneType, limit, locality, administrativeArea, areaCode, phoneNumber });

    const numbers = await TelnyxService.searchPhoneNumbers(
      countryCode,
      phoneType,
      parseInt(limit),
      locality || null,
      administrativeArea || null,
      areaCode || null,
      phoneNumber || null
    );
    
    res.json({ numbers });
  } catch (error) {
    console.error('Search phone numbers error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      response: error.response?.data,
      status: error.response?.status,
    });
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
    
    if (business.telnyx_number) {
      return res.status(400).json({ 
        error: 'Business already has a Telnyx phone number assigned. Please contact support to change it.' 
      });
    }
    
    // Purchase and assign the phone number
    console.log('Purchasing Telnyx phone number:', phoneNumber, 'for business:', req.businessId);
    const result = await TelnyxService.purchaseAndAssignPhoneNumber(
      req.businessId,
      phoneNumber,
      countryCode
    );
    
    console.log('Telnyx phone number purchase result:', result);
    
    // Verify the business was updated
    const updatedBusiness = await Business.findById(req.businessId);
    console.log('Business after purchase:', {
      id: updatedBusiness.id,
      telnyx_number: updatedBusiness.telnyx_number,
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
    
    const errorMessage = error.message || 'Failed to purchase phone number';
    const statusCode = error.message?.includes('Insufficient funds') ? 402 : 500;
    
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
    
    if (!business.telnyx_number) {
      return res.json({ phone_number: null });
    }
    
    // Optionally get detailed info from Telnyx
    try {
      const info = await TelnyxService.getPhoneNumberInfo(business.telnyx_number);
      res.json({
        phone_number: business.telnyx_number,
        info: info || null,
      });
    } catch (error) {
      // If we can't get info, just return the number
      res.json({
        phone_number: business.telnyx_number,
        info: null,
      });
    }
  } catch (error) {
    console.error('Get current phone number error:', error);
    res.status(500).json({ error: 'Failed to get phone number info' });
  }
});

export default router;

