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
    const { email, password, name, phone, address, first_name, last_name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and business name are required' });
    }
    
    // Check if business email already exists
    const existingBusiness = await Business.findByEmail(email);
    if (existingBusiness) {
      return res.status(400).json({ error: 'Business with this email already exists' });
    }
    
    // Create business
    const business = await Business.create({
      name,
      email,
      phone,
      address,
    });
    
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
        onboarding_complete: business.onboarding_complete,
        voximplant_number: business.voximplant_number,
        telnyx_number: business.telnyx_number,
      },
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

