import express from 'express';
import { Business } from '../models/Business.js';
import { User } from '../models/User.js';
import { AIAgent } from '../models/AIAgent.js';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      name, 
      phone, 
      public_phone_number,
      address, 
      first_name, 
      last_name,
      timezone,
      business_hours,
      contact_email
    } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and business name are required' });
    }
    
    // Validate and format phone number to E.164
    let formattedPhone = public_phone_number || phone;
    if (formattedPhone) {
      const { formatPhoneNumberE164, validatePhoneNumber } = await import('../utils/phoneFormatter.js');
      const e164 = formatPhoneNumberE164(formattedPhone);
      if (!e164 || !validatePhoneNumber(e164)) {
        return res.status(400).json({ 
          error: 'Invalid phone number format. Please include country code (e.g., +1 for US/Canada)' 
        });
      }
      formattedPhone = e164;
    }
    
    // Check if business email already exists
    const existingBusiness = await Business.findByEmail(email);
    let business;
    
    if (existingBusiness) {
      // Check if there's already a user for this business
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        // Account fully exists - redirect to login
        return res.status(400).json({ 
          error: 'An account with this email already exists. Please log in instead.',
          code: 'ACCOUNT_EXISTS'
        });
      }
      // Business exists but no user - incomplete signup, allow completion
      console.log(`[Signup] Found incomplete signup for ${email}, completing signup...`);
      // Update existing business with new data
      business = await Business.update(existingBusiness.id, {
        name,
        email: contact_email || email,
        phone: formattedPhone,
        address: address || '',
        timezone: timezone || 'America/New_York',
        public_phone_number: formattedPhone,
      });
      business = await Business.findById(existingBusiness.id);
    } else {
      // Create new business
      business = await Business.create({
        name,
        email: contact_email || email,
        phone: formattedPhone,
        address: address || '',
        timezone: timezone || 'America/New_York',
        public_phone_number: formattedPhone,
      });
    }
    
    // Hash password
    const password_hash = await hashPassword(password);
    
    // Create user
    const user = await User.create({
      business_id: business.id,
      email,
      password_hash,
      first_name,
      last_name,
      role: 'owner',
    });
    
    // Create default AI agent
    await AIAgent.create({
      business_id: business.id,
      greeting_text: `Hello! Thank you for calling ${name}. How can I help you today?`,
      business_hours: {
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { closed: true },
        sunday: { closed: true },
      },
      faqs: [],
      message_settings: {
        ask_name: true,
        ask_phone: true,
        ask_email: false,
        ask_reason: true,
      },
      system_instructions: `You are a helpful AI assistant for ${name}. Answer questions politely and take messages when needed.`,
    });

    // Phone number provisioning is now done separately via the phone selection page
    // No automatic provisioning during signup
    
    // Generate token
    const token = generateToken({
      userId: user.id,
      businessId: business.id,
      email: user.email,
    });
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        onboarding_complete: business.onboarding_complete,
        vapi_phone_number: null, // Phone number will be provisioned separately
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await User.findByEmail(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValid = await comparePassword(password, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is inactive' });
    }
    
    // Update last login
    await User.updateLastLogin(user.id);
    
    // Get business
    const business = await Business.findById(user.business_id);
    
    // Generate token
    const token = generateToken({
      userId: user.id,
      businessId: user.business_id,
      email: user.email,
    });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        onboarding_complete: business.onboarding_complete,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    const agent = await AIAgent.findByBusinessId(req.businessId); // Fetch agent for FAQ data
    
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        role: req.user.role,
      },
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        phone: business.phone,
        public_phone_number: business.public_phone_number,
        address: business.address,
        timezone: business.timezone,
        onboarding_complete: business.onboarding_complete,
        vapi_phone_number: business.vapi_phone_number,
        ai_enabled: business.ai_enabled,
        call_forward_rings: business.call_forward_rings,
        after_hours_behavior: business.after_hours_behavior,
        allow_call_transfer: business.allow_call_transfer,
        email_ai_answered: business.email_ai_answered,
        email_missed_calls: business.email_missed_calls,
        sms_enabled: business.sms_enabled,
        sms_notification_number: business.sms_notification_number,
        plan_tier: business.plan_tier,
        usage_limit_minutes: business.usage_limit_minutes,
        faq_count: agent?.faqs?.length || 0,
        faq_limit: business.plan_tier === 'Tier 1' ? 5 : business.plan_tier === 'Tier 2' ? 10 : business.plan_tier === 'Tier 3' ? 20 : 5,
      },
      // Include agent data directly for checklist
      agent: agent ? {
        faqs: agent.faqs || [],
      } : { faqs: [] },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Logout (client-side token removal, but we can track it)
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;

