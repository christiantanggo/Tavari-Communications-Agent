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
    const agent = await AIAgent.create({
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

    // Automatically assign an unassigned phone number during signup
    let assignedPhoneNumber = null;
    try {
      // Pre-flight check
      const { canAssignPhoneNumber } = await import('../utils/phonePreflight.js');
      const preflightCheck = await canAssignPhoneNumber();
      
      if (!preflightCheck.canAssign) {
        console.warn('[Signup] ⚠️  Phone assignment pre-flight check failed:', preflightCheck.reason);
        console.warn('[Signup] Details:', preflightCheck.details);
        console.warn('[Signup] Skipping automatic phone assignment. User can assign manually later.');
        // Continue with signup - don't fail
      } else {
        const { 
          findUnassignedTelnyxNumbers, 
          checkIfNumberProvisionedInVAPI,
          createAssistant, 
          provisionPhoneNumber, 
          linkAssistantToNumber,
          searchAvailablePhoneNumbers,
          purchaseTelnyxNumber
        } = await import('../services/vapi.js');
        
        const { acquirePhoneLock, releasePhoneLock } = await import('../utils/phoneLock.js');
        
        console.log('[Signup] Attempting to automatically assign phone number...');
      
      // Extract area code from business phone if available
      let preferredAreaCode = null;
      if (formattedPhone) {
        const { extractAreaCode } = await import('../utils/phoneFormatter.js');
        preferredAreaCode = extractAreaCode(formattedPhone);
        if (preferredAreaCode) {
          console.log(`[Signup] Preferred area code: ${preferredAreaCode}`);
        }
      }
      
      // Step 1: Check for unassigned numbers already purchased in Telnyx
      const unassignedNumbers = await findUnassignedTelnyxNumbers(preferredAreaCode);
      let selectedNumber = null;
      let phoneNumber = null;
      let phoneNumberId = null;
      
      if (unassignedNumbers.length > 0) {
        // Try to acquire lock for the first available number
        let lockedNumber = null;
        for (const num of unassignedNumbers) {
          const candidateNumber = num.phoneNumber || num.phone_number || num.number;
          let candidateE164 = candidateNumber;
          if (!candidateE164.startsWith('+')) {
            candidateE164 = '+' + candidateE164.replace(/[^0-9]/g, '');
          }
          
          const lockAcquired = await acquirePhoneLock(candidateE164, 60000); // 60 second lock
          if (lockAcquired) {
            lockedNumber = candidateE164;
            selectedNumber = num;
            phoneNumber = candidateE164;
            console.log(`[Signup] ✅ Acquired lock for phone number ${candidateE164}`);
            break;
          } else {
            console.log(`[Signup] Phone number ${candidateE164} is locked, trying next...`);
          }
        }
        
        if (!lockedNumber) {
          console.warn('[Signup] ⚠️  All available numbers are currently locked, will purchase new number instead');
          // Fall through to purchase new number
        } else {
          // Check if this number is already provisioned in VAPI
          const existingVapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumber);
          if (existingVapiNumber) {
            // Number is already in VAPI, just get its ID
            phoneNumberId = existingVapiNumber.id || existingVapiNumber.phoneNumberId;
            console.log(`[Signup] Number ${phoneNumber} is already provisioned in VAPI (ID: ${phoneNumberId}), will reuse it`);
          } else {
            // Number exists in Telnyx but not in VAPI, need to provision it
            console.log(`[Signup] Number ${phoneNumber} exists in Telnyx but not in VAPI, provisioning to VAPI...`);
            try {
              const provisionedNumber = await provisionPhoneNumber(phoneNumber, formattedPhone);
              phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
              
              if (!phoneNumberId) {
                console.error(`[Signup] ⚠️  WARNING: provisionPhoneNumber did not return phoneNumberId`);
                console.error(`[Signup] Provisioned number response:`, JSON.stringify(provisionedNumber, null, 2));
                // Try to get it from VAPI directly
                const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumber);
                if (vapiCheck) {
                  phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
                  console.log(`[Signup] Retrieved phoneNumberId from VAPI check: ${phoneNumberId}`);
                }
              }
            } catch (provisionError) {
              // Release lock on error
              releasePhoneLock(phoneNumber);
              throw provisionError;
            }
          }
        }
      }
      
      // If we don't have a phone number yet (either no unassigned numbers or all were locked), purchase new
      if (!phoneNumber) {
      } else {
        // Step 2: No unassigned numbers, purchase a new one matching area code
        console.log('[Signup] No unassigned numbers found, purchasing new number...');
        
        if (preferredAreaCode) {
          console.log(`[Signup] Searching for available numbers with area code ${preferredAreaCode}...`);
          const availableNumbers = await searchAvailablePhoneNumbers('US', 'local', 5, preferredAreaCode);
          
          if (availableNumbers.length > 0) {
            phoneNumber = availableNumbers[0].phone_number;
            console.log(`[Signup] Found available number with area code ${preferredAreaCode}: ${phoneNumber}`);
          } else {
            // Try without area code
            console.log(`[Signup] No numbers found with area code ${preferredAreaCode}, trying any area code...`);
            const fallbackNumbers = await searchAvailablePhoneNumbers('US', 'local', 5, null);
            if (fallbackNumbers.length > 0) {
              phoneNumber = fallbackNumbers[0].phone_number;
              console.log(`[Signup] Found available number: ${phoneNumber}`);
            } else {
              throw new Error('No available phone numbers found. Please try again or contact support.');
            }
          }
        } else {
          // No preferred area code, get any available number
          const availableNumbers = await searchAvailablePhoneNumbers('US', 'local', 5, null);
          if (availableNumbers.length > 0) {
            phoneNumber = availableNumbers[0].phone_number;
            console.log(`[Signup] Found available number: ${phoneNumber}`);
          } else {
            throw new Error('No available phone numbers found. Please try again or contact support.');
          }
        }
        
        // Ensure phone number is in E.164 format
        let phoneNumberE164 = phoneNumber;
        if (!phoneNumberE164.startsWith('+')) {
          phoneNumberE164 = '+' + phoneNumberE164.replace(/[^0-9]/g, '');
        }
        phoneNumber = phoneNumberE164;
        
        // Acquire lock before purchasing
        const lockAcquired = await acquirePhoneLock(phoneNumber, 60000);
        if (!lockAcquired) {
          throw new Error(`Phone number ${phoneNumber} is currently being assigned to another account. Please try again.`);
        }
        
        try {
          // Purchase the number from Telnyx
          console.log(`[Signup] Purchasing number ${phoneNumber} from Telnyx...`);
          await purchaseTelnyxNumber(phoneNumber);
          console.log(`[Signup] ✅ Number purchased from Telnyx`);
          
          // Provision to VAPI
          console.log(`[Signup] Provisioning number ${phoneNumber} to VAPI...`);
          const provisionedNumber = await provisionPhoneNumber(phoneNumber, formattedPhone);
          phoneNumberId = provisionedNumber.id || provisionedNumber.phoneNumberId || provisionedNumber.phone_number_id;
          
          if (!phoneNumberId) {
            console.error(`[Signup] ⚠️  WARNING: provisionPhoneNumber did not return phoneNumberId`);
            const vapiCheck = await checkIfNumberProvisionedInVAPI(phoneNumber);
            if (vapiCheck) {
              phoneNumberId = vapiCheck.id || vapiCheck.phoneNumberId;
            }
          }
        } catch (purchaseError) {
          // Release lock on error
          releasePhoneLock(phoneNumber);
          throw purchaseError;
        }
      }
      
      // Release lock after successful assignment (will be done in finally block)
      
      // Step 3: Create VAPI assistant
      console.log(`[Signup] Creating VAPI assistant for business...`);
      const assistant = await createAssistant({
        name: business.name,
        public_phone_number: formattedPhone || '',
        timezone: business.timezone,
        business_hours: agent.business_hours || {},
        faqs: agent.faqs || [],
        contact_email: business.email,
        address: business.address || '',
        allow_call_transfer: business.allow_call_transfer ?? true,
        opening_greeting: agent.greeting_text,
        voice_settings: agent.voice_settings || {},
      });
      
      if (!assistant || !assistant.id) {
        throw new Error('Failed to create VAPI assistant - no assistant ID returned');
      }
      
      // Step 4: Link assistant to phone number
      if (!phoneNumberId) {
        console.warn(`[Signup] ⚠️  Warning: phoneNumberId is missing, cannot link assistant to phone number`);
        console.warn(`[Signup] Phone number: ${phoneNumber}, Assistant ID: ${assistant.id}`);
        // Try to extract phoneNumberId from the phone number if we have it
        if (phoneNumber) {
          // Try to find the phone number in VAPI by the actual number
          const vapiNumber = await checkIfNumberProvisionedInVAPI(phoneNumber);
          if (vapiNumber) {
            phoneNumberId = vapiNumber.id || vapiNumber.phoneNumberId;
            console.log(`[Signup] Found phoneNumberId from VAPI lookup: ${phoneNumberId}`);
          }
        }
      }
      
      if (phoneNumberId && assistant.id) {
        console.log(`[Signup] Linking assistant ${assistant.id} to phone number ${phoneNumberId}...`);
        try {
          await linkAssistantToNumber(assistant.id, phoneNumberId);
          console.log(`[Signup] ✅ Successfully linked assistant to phone number`);
        } catch (linkError) {
          console.error(`[Signup] ⚠️  Failed to link assistant to phone number:`, linkError.message);
          // Continue anyway - number might still work
        }
      } else {
        console.warn(`[Signup] ⚠️  Cannot link assistant - missing phoneNumberId (${phoneNumberId}) or assistant.id (${assistant.id})`);
      }
      
      // Step 5: Update business with phone number and assistant ID
      // Ensure phone number is in E.164 format
      const phoneNumberE164 = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/[^0-9]/g, '')}`;
      
      if (!phoneNumberE164 || phoneNumberE164 === '+') {
        throw new Error(`Invalid phone number format: ${phoneNumber}`);
      }
      
      try {
        await Business.update(business.id, {
          vapi_phone_number: phoneNumberE164,
          vapi_assistant_id: assistant.id,
        });
        assignedPhoneNumber = phoneNumberE164;
        console.log(`[Signup] ✅ Phone number ${phoneNumberE164} automatically assigned to business ${business.id}`);
        
        // Release lock after successful assignment
        if (phoneNumber) {
          releasePhoneLock(phoneNumber);
        }
      } catch (dbError) {
        console.error(`[Signup] ⚠️  Failed to update business with phone number:`, dbError.message);
        console.error(`[Signup] Database error details:`, dbError);
        // Still set assignedPhoneNumber so it's returned in response
        assignedPhoneNumber = phoneNumberE164;
        // Release lock even on database error
        if (phoneNumber) {
          releasePhoneLock(phoneNumber);
        }
      }
      } // End of preflight check else block
    } catch (phoneError) {
      // Don't fail signup if phone assignment fails - user can assign manually later
      console.error('[Signup] ⚠️  Error automatically assigning phone number (non-blocking):', phoneError.message);
      console.error('[Signup] Business can assign phone number manually via the setup wizard.');
      // Release lock if we had one (phoneNumber might be undefined if error occurred early)
      if (typeof phoneNumber !== 'undefined' && phoneNumber) {
        try {
          releasePhoneLock(phoneNumber);
        } catch (lockError) {
          console.warn('[Signup] Could not release phone lock:', lockError.message);
        }
      }
    }
    
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
        vapi_phone_number: assignedPhoneNumber, // Automatically assigned if available
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
        website: business.website,
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

