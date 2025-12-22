// services/bulkSMS.js
// Bulk SMS campaign service with rate limiting and multi-number support

import { parse } from 'csv-parse/sync';
import { sendSMSDirect, addBusinessIdentification } from './notifications.js';
import { 
  validatePhoneNumbersForBulk, 
  formatPhoneNumberE164,
  isCanadianNumber,
  isUSNumber,
  isTollFree,
  getNumberCountry
} from '../utils/phoneFormatter.js';
import { 
  getTimezoneFromPhoneNumber, 
  checkQuietHours 
} from '../utils/timezoneDetector.js';
import { SMSCampaign } from '../models/SMSCampaign.js';
import { SMSCampaignRecipient } from '../models/SMSCampaignRecipient.js';
import { SMSOptOut } from '../models/SMSOptOut.js';
import { Business } from '../models/Business.js';
import { BusinessPhoneNumber } from '../models/BusinessPhoneNumber.js';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE_URL = 'https://api.telnyx.com/v2';

/**
 * Rate limits by number type (messages per minute)
 * Based on Telnyx official rate limits:
 * - Long Code (A2P/P2P): 2 messages/minute per number
 * - Toll-Free: 1,200 messages/minute per number
 * - Short Code: 60,000 messages/minute per number
 * - Account Limit: 3,000 messages/minute across all numbers
 */
const RATE_LIMITS = {
  'CA_LOCAL': 2,        // Canadian local (Long Code): 2 messages/minute (Telnyx standard)
  'US_LOCAL_UNREGISTERED': 2,  // US local (Long Code, unregistered): 2 messages/minute
  'US_LOCAL_10DLC': 2,  // US local (Long Code, 10DLC registered): 2 messages/minute (Telnyx standard, not higher for 10DLC)
  'TOLL_FREE_VERIFIED': 1200,  // Toll-free (verified): 1,200 messages/minute (Telnyx official limit)
  'TOLL_FREE_UNVERIFIED': 0,   // Toll-free (unverified): Cannot send
  'SHORT_CODE': 60000,  // Short Code: 60,000 messages/minute (Telnyx official limit)
};

/**
 * Parse CSV file and extract contact information
 * Supports both comma and semicolon delimiters
 * Expected format: EMAIL;LASTNAME;FIRSTNAME;SMS or EMAIL,LASTNAME,FIRSTNAME,SMS
 * @param {Buffer} fileBuffer - CSV file buffer
 * @returns {Array} Array of contact objects { email, last_name, first_name, phone_number }
 */
export function parseCSV(fileBuffer) {
  try {
    // Detect delimiter (semicolon or comma)
    const text = fileBuffer.toString('utf-8');
    const firstLine = text.split('\n')[0];
    const hasSemicolon = firstLine.includes(';');
    const delimiter = hasSemicolon ? ';' : ',';
    
    const records = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: delimiter,
    });
    
    // Extract contact information
    const contacts = [];
    for (const record of records) {
      // Try to find fields - handle case-insensitive column names
      const recordLower = {};
      Object.keys(record).forEach(key => {
        recordLower[key.toLowerCase()] = record[key];
      });
      
      // Look for email, lastname/firstname, sms/phone columns
      let email = recordLower.email || recordLower['e-mail'] || '';
      let lastName = recordLower.lastname || recordLower['last name'] || recordLower.lname || '';
      let firstName = recordLower.firstname || recordLower['first name'] || recordLower.fname || '';
      let phoneNumber = recordLower.sms || recordLower.phone || recordLower['phone number'] || recordLower.phone_number || '';
      
      // If columns are not named, try to infer from position
      // Format: EMAIL;LASTNAME;FIRSTNAME;SMS
      const values = Object.values(record);
      if (values.length >= 4 && !email && !phoneNumber) {
        // Assume positional: [0]=email, [1]=lastname, [2]=firstname, [3]=sms
        email = values[0] || '';
        lastName = values[1] || '';
        firstName = values[2] || '';
        phoneNumber = values[3] || '';
      } else if (values.length >= 1) {
        // Try to find phone number in any field
        for (const value of values) {
          if (value && typeof value === 'string') {
            const digits = value.replace(/\D/g, '');
            if (digits.length >= 10 && !phoneNumber) {
              phoneNumber = value.trim();
            }
            // Check if it looks like an email
            if (value.includes('@') && !email) {
              email = value.trim();
            }
          }
        }
      }
      
      // Only add if we have at least a phone number
      if (phoneNumber && phoneNumber.trim()) {
        contacts.push({
          email: email ? email.trim() : null,
          last_name: lastName ? lastName.trim() : null,
          first_name: firstName ? firstName.trim() : null,
          phone_number: phoneNumber.trim(),
        });
      }
    }
    
    return contacts;
  } catch (error) {
    console.error('[BulkSMS] CSV parsing error:', error);
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

/**
 * Detect number type and calculate rate limit
 * @param {string} phoneNumber - Phone number in E.164 format
 * @param {boolean} isVerified - Whether toll-free number is verified (default: true for now)
 * @returns {Object} { type: string, country: string, rateLimit: number, rateUnit: string }
 */
export function detectNumberType(phoneNumber, isVerified = true) {
  const country = getNumberCountry(phoneNumber);
  const isTollFreeNum = isTollFree(phoneNumber);
  
  let type;
  let rateLimit;
  
  if (isTollFreeNum) {
    if (isVerified) {
      type = 'TOLL_FREE_VERIFIED';
      rateLimit = RATE_LIMITS.TOLL_FREE_VERIFIED;
    } else {
      type = 'TOLL_FREE_UNVERIFIED';
      rateLimit = RATE_LIMITS.TOLL_FREE_UNVERIFIED;
    }
  } else if (country === 'CA') {
    type = 'CA_LOCAL';
    rateLimit = RATE_LIMITS.CA_LOCAL;
  } else if (country === 'US') {
    // For now, assume unregistered. In future, check 10DLC status
    type = 'US_LOCAL_UNREGISTERED';
    rateLimit = RATE_LIMITS.US_LOCAL_UNREGISTERED;
  } else {
    // Default to US unregistered if unknown
    type = 'US_LOCAL_UNREGISTERED';
    rateLimit = RATE_LIMITS.US_LOCAL_UNREGISTERED;
  }
  
  return {
    type,
    country: country || 'US',
    rateLimit,
    rateUnit: 'messages_per_minute',
  };
}

/**
 * Get all SMS-capable numbers for a business
 * @param {string} businessId - Business ID
 * @returns {Promise<Array>} Array of number objects with type and rate limit
 */
export async function getAvailableSMSNumbers(businessId) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error('Business not found');
  }
  
  const numbers = [];
  
  // Get all active phone numbers from business_phone_numbers table (new system)
  try {
    const businessPhoneNumbers = await BusinessPhoneNumber.findActiveByBusinessId(businessId);
    
    if (businessPhoneNumbers.length > 0) {
      // Use numbers from business_phone_numbers table
      for (const bpn of businessPhoneNumbers) {
        // Check actual verification status from Telnyx
        let isVerified = true; // Default to verified
        try {
          const { getVerificationStatus } = await import('./telnyxVerification.js');
          const verificationStatus = await getVerificationStatus(bpn.phone_number);
          isVerified = verificationStatus.verified || !verificationStatus.is_toll_free; // Verified if verified or not toll-free
        } catch (verifyError) {
          console.warn(`[BulkSMS] Could not check verification status for ${bpn.phone_number}:`, verifyError.message);
          // Default to verified to avoid blocking sends
        }
        
        const numberInfo = detectNumberType(bpn.phone_number, isVerified);
        numbers.push({
          phone_number: bpn.phone_number,
          ...numberInfo,
          verified: isVerified,
          is_primary: bpn.is_primary,
        });
      }
      console.log(`[BulkSMS] Found ${numbers.length} phone number(s) from business_phone_numbers table`);
    } else {
      // Fallback to legacy telnyx_number field
      if (business.telnyx_number) {
        const numberInfo = detectNumberType(business.telnyx_number, true);
        numbers.push({
          phone_number: business.telnyx_number,
          ...numberInfo,
          verified: true,
          is_primary: true,
        });
        console.log(`[BulkSMS] Using legacy telnyx_number field: ${business.telnyx_number}`);
      }
    }
  } catch (error) {
    console.warn('[BulkSMS] Error loading from business_phone_numbers table (may not exist yet):', error.message);
    // Fallback to legacy telnyx_number field
    if (business.telnyx_number) {
      const numberInfo = detectNumberType(business.telnyx_number, true);
      numbers.push({
        phone_number: business.telnyx_number,
        ...numberInfo,
        verified: true,
        is_primary: true,
      });
    }
  }
  
  if (numbers.length === 0) {
    console.warn(`[BulkSMS] ⚠️  No SMS-capable phone numbers found for business ${businessId}`);
  }
  
  return numbers;
}

/**
 * Calculate total throughput for multiple numbers
 * @param {Array} numbers - Array of number objects with rateLimit
 * @returns {Object} { totalRate: number, unit: string }
 */
export function calculateTotalThroughput(numbers) {
  const totalRate = numbers.reduce((sum, num) => {
    return sum + (num.rateLimit || 0);
  }, 0);
  
  return {
    totalRate,
    unit: 'messages_per_minute',
    totalPerHour: totalRate * 60,
  };
}

/**
 * Load balance messages across multiple numbers
 * @param {Array} phoneNumbers - Array of recipient phone numbers
 * @param {Array} availableNumbers - Array of available sender numbers
 * @returns {Array} Array of { phoneNumber, fromNumber } assignments
 */
export function loadBalanceMessages(phoneNumbers, availableNumbers) {
  if (availableNumbers.length === 0) {
    throw new Error('No SMS-capable numbers available');
  }
  
  const assignments = [];
  let numberIndex = 0;
  
  for (const phoneNumber of phoneNumbers) {
    // Round-robin assignment
    const fromNumber = availableNumbers[numberIndex % availableNumbers.length];
    assignments.push({
      phoneNumber,
      fromNumber: fromNumber.phone_number,
      numberInfo: fromNumber,
    });
    numberIndex++;
  }
  
  return assignments;
}

/**
 * Send bulk SMS campaign
 * @param {string} campaignId - Campaign ID
 * @param {string} businessId - Business ID
 * @param {string} messageText - SMS message text
 * @param {Array} phoneNumbers - Array of recipient phone numbers
 */
/**
 * Check if current time is within allowed SMS sending hours for a recipient
 * Uses recipient's timezone (from phone number area code) for TCPA compliance
 * @param {string} phoneNumber - Recipient phone number
 * @param {Object} business - Business object with SMS time settings
 * @returns {Object} { allowed: boolean, reason: string, timezone: string, currentTime: string }
 */
function checkRecipientQuietHours(phoneNumber, business) {
  // If SMS business hours are disabled, always allow sending
  if (!business.sms_business_hours_enabled) {
    return {
      allowed: true,
      reason: 'quiet_hours_disabled',
      message: 'SMS time restrictions are disabled',
    };
  }

  // Get recipient's timezone from phone number area code
  const fallbackTimezone = business.sms_timezone || business.timezone || 'America/New_York';
  const recipientTimezone = getTimezoneFromPhoneNumber(phoneNumber, fallbackTimezone);
  
  // Parse allowed start/end times (default: 9 AM - 8 PM for TCPA compliance)
  const startTime = business.sms_allowed_start_time || '09:00:00';
  const endTime = business.sms_allowed_end_time || '20:00:00'; // 8 PM, not 9 PM for safety
  
  const [startHour] = startTime.split(':').map(Number);
  const [endHour] = endTime.split(':').map(Number);
  
  // Check quiet hours for recipient's timezone
  const quietHoursCheck = checkQuietHours(recipientTimezone, startHour, endHour);
  
  return {
    allowed: quietHoursCheck.isWithinAllowedHours,
    reason: quietHoursCheck.isWithinQuietHours ? 'quiet_hours' : 'allowed',
    timezone: recipientTimezone,
    currentTime: quietHoursCheck.currentTime.toLocaleTimeString(),
    message: quietHoursCheck.message,
    quietHoursCheck,
  };
}

export async function sendBulkSMS(campaignId, businessId, messageText, phoneNumbers, options = {}) {
  const { overrideQuietHours = false } = options;
  console.log(`[BulkSMS] ========== FUNCTION CALLED ==========`);
  console.log(`[BulkSMS] Function entry point reached`);
  console.log(`[BulkSMS] Parameters received:`, {
    campaignId,
    businessId,
    messageTextLength: messageText?.length || 0,
    phoneNumbersLength: phoneNumbers?.length || 0,
  });
  
  // Validate inputs
  if (!campaignId) {
    throw new Error('campaignId is required');
  }
  if (!businessId) {
    throw new Error('businessId is required');
  }
  if (!messageText) {
    throw new Error('messageText is required');
  }
  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    throw new Error('phoneNumbers must be a non-empty array');
  }
  
  const startTime = Date.now();
  console.log(`[BulkSMS] ========== STARTING CAMPAIGN ${campaignId} ==========`);
  console.log(`[BulkSMS] Business ID: ${businessId}`);
  console.log(`[BulkSMS] Total recipients: ${phoneNumbers.length}`);
  console.log(`[BulkSMS] Message length: ${messageText.length} characters`);
  console.log(`[BulkSMS] Start time: ${new Date().toISOString()}`);
  
  // Get business to check SMS time settings
  console.log(`[BulkSMS] Fetching business ${businessId}...`);
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error(`Business ${businessId} not found`);
  }
  console.log(`[BulkSMS] ✅ Business found: ${business.name}`);
  
  // Check quiet hours for all recipients before sending
  // This enforces TCPA compliance by checking each recipient's timezone
  const quietHoursViolations = [];
  const quietHoursStats = {
    total: phoneNumbers.length,
    allowed: 0,
    blocked: 0,
    timezones: {},
  };
  
  if (business.sms_business_hours_enabled && !overrideQuietHours) {
    console.log(`[BulkSMS] 🔍 Checking quiet hours for ${phoneNumbers.length} recipients...`);
    
    for (const phoneNumber of phoneNumbers) {
      const check = checkRecipientQuietHours(phoneNumber, business);
      
      // Track timezone distribution
      if (!quietHoursStats.timezones[check.timezone]) {
        quietHoursStats.timezones[check.timezone] = { allowed: 0, blocked: 0 };
      }
      
      if (check.allowed) {
        quietHoursStats.allowed++;
        quietHoursStats.timezones[check.timezone].allowed++;
      } else {
        quietHoursStats.blocked++;
        quietHoursStats.timezones[check.timezone].blocked++;
        quietHoursViolations.push({
          phoneNumber,
          timezone: check.timezone,
          currentTime: check.currentTime,
          reason: check.message,
        });
      }
    }
    
    console.log(`[BulkSMS] 📊 Quiet Hours Check Results:`);
    console.log(`[BulkSMS]   Total recipients: ${quietHoursStats.total}`);
    console.log(`[BulkSMS]   Allowed: ${quietHoursStats.allowed}`);
    console.log(`[BulkSMS]   Blocked (quiet hours): ${quietHoursStats.blocked}`);
    Object.entries(quietHoursStats.timezones).forEach(([tz, stats]) => {
      console.log(`[BulkSMS]   ${tz}: ${stats.allowed} allowed, ${stats.blocked} blocked`);
    });
    
    // If all recipients are in quiet hours, block the entire campaign
    if (quietHoursStats.blocked === quietHoursStats.total && quietHoursStats.total > 0) {
      const errorMessage = `🚫 All recipients are in quiet hours. SMS sending is blocked to comply with TCPA regulations. Allowed hours: ${business.sms_allowed_start_time || '09:00'} - ${business.sms_allowed_end_time || '20:00'} (recipient's local time). Use overrideQuietHours option to bypass (admin only).`;
      console.error(`[BulkSMS] ${errorMessage}`);
      await SMSCampaign.updateStatus(campaignId, 'failed');
      throw new Error(errorMessage);
    }
    
    // If some recipients are in quiet hours, log warning but continue with allowed recipients
    if (quietHoursStats.blocked > 0) {
      console.warn(`[BulkSMS] ⚠️  ${quietHoursStats.blocked} recipient(s) are in quiet hours and will be skipped`);
      console.warn(`[BulkSMS] ⚠️  Sample violations:`, quietHoursViolations.slice(0, 3));
    }
  } else if (overrideQuietHours) {
    console.warn(`[BulkSMS] ⚠️  Quiet hours override enabled - sending despite quiet hours restrictions (admin override)`);
  } else {
    console.log(`[BulkSMS] ✅ SMS time restrictions are disabled - sending allowed at any time`);
  }
  
  // Update campaign status to processing
  console.log(`[BulkSMS] Updating campaign status to 'processing'...`);
  await SMSCampaign.updateStatus(campaignId, 'processing');
  console.log(`[BulkSMS] ✅ Campaign status updated to 'processing'`);
  
  try {
    // Get available numbers
    console.log(`[BulkSMS] Getting available SMS numbers for business ${businessId}...`);
    const availableNumbers = await getAvailableSMSNumbers(businessId);
    console.log(`[BulkSMS] Found ${availableNumbers.length} available number(s):`);
    availableNumbers.forEach((num, idx) => {
      console.log(`[BulkSMS]   ${idx + 1}. ${num.phone_number} (${num.type}, ${num.rateLimit} msg/min, ${num.country})`);
    });
    
    if (availableNumbers.length === 0) {
      throw new Error('No SMS-capable numbers available for this business');
    }
    
    console.log(`[BulkSMS] Available numbers: ${availableNumbers.length}`);
    availableNumbers.forEach((num, idx) => {
      console.log(`[BulkSMS]   ${idx + 1}. ${num.phone_number} (${num.type}, ${num.rateLimit} msg/min)`);
    });
    
    // Calculate total throughput
    const throughput = calculateTotalThroughput(availableNumbers);
    console.log(`[BulkSMS] Total throughput: ${throughput.totalRate} msg/min = ${throughput.totalPerHour} msg/hour`);
    
    // Get recipients with contact info from database (if phoneNumbers not provided)
    const recipientPhoneNumbers = phoneNumbers && phoneNumbers.length > 0 
      ? phoneNumbers 
      : (await SMSCampaignRecipient.findByCampaignId(campaignId)).map(r => r.phone_number);
    
    // Filter out recipients in quiet hours (if enabled) and queue them for later
    let allowedRecipients = recipientPhoneNumbers;
    const quietHoursBlockedSet = new Set();
    const queuedRecipients = []; // Store recipients to queue for later sending
    
    if (business.sms_business_hours_enabled && quietHoursStats.blocked > 0) {
      console.log(`[BulkSMS] 🔍 Filtering out ${quietHoursStats.blocked} recipient(s) in quiet hours...`);
      
      // Get all recipient records from database to update their status
      const allRecipientRecords = await SMSCampaignRecipient.findByCampaignId(campaignId);
      const recipientRecordMap = new Map(allRecipientRecords.map(r => [r.phone_number, r]));
      
      allowedRecipients = recipientPhoneNumbers.filter(phoneNumber => {
        const check = checkRecipientQuietHours(phoneNumber, business);
        if (!check.allowed) {
          quietHoursBlockedSet.add(phoneNumber);
          
          // Calculate next allowed send time (9 AM in recipient's timezone)
          const recipientTimezone = check.timezone;
          const startTime = business.sms_allowed_start_time || '09:00:00';
          const [startHour] = startTime.split(':').map(Number);
          
          // Get current time in recipient's timezone
          const now = new Date();
          const timeInTimezone = new Date(now.toLocaleString('en-US', { timeZone: recipientTimezone }));
          const currentHour = timeInTimezone.getHours();
          
          // Calculate scheduled send time: next 9 AM in recipient's timezone
          const scheduledSend = new Date(timeInTimezone);
          scheduledSend.setHours(startHour, 0, 0, 0);
          
          // If current time is before 9 AM today, schedule for today
          // If current time is after 8 PM, schedule for tomorrow
          if (currentHour >= (parseInt(business.sms_allowed_end_time?.split(':')[0]) || 20)) {
            scheduledSend.setDate(scheduledSend.getDate() + 1);
          }
          
          // Store recipient record for queuing
          const recipientRecord = recipientRecordMap.get(phoneNumber);
          if (recipientRecord) {
            queuedRecipients.push({
              recipientId: recipientRecord.id,
              phoneNumber,
              scheduledSendAt: scheduledSend.toISOString(),
              timezone: recipientTimezone,
            });
          }
          
          return false;
        }
        return true;
      });
      
      // Queue blocked recipients for later sending
      if (queuedRecipients.length > 0) {
        console.log(`[BulkSMS] 📅 Queuing ${queuedRecipients.length} recipient(s) for scheduled sending...`);
        for (const queued of queuedRecipients) {
          try {
            await SMSCampaignRecipient.updateStatus(queued.recipientId, 'queued', {
              scheduled_send_at: queued.scheduledSendAt,
            });
            console.log(`[BulkSMS]   Queued ${queued.phoneNumber} for ${queued.scheduledSendAt} (${queued.timezone})`);
          } catch (error) {
            console.error(`[BulkSMS] Error queuing recipient ${queued.phoneNumber}:`, error.message);
          }
        }
        console.log(`[BulkSMS] ✅ Queued ${queuedRecipients.length} recipient(s) - they will be sent automatically when quiet hours end`);
      }
      
      console.log(`[BulkSMS] ✅ ${allowedRecipients.length} recipient(s) allowed after quiet hours filter`);
    }
    
    // Load balance messages (only for allowed recipients)
    const assignments = loadBalanceMessages(allowedRecipients, availableNumbers);
    
    // Check opt-outs - normalize phone numbers for comparison
    const optOuts = await SMSOptOut.findByBusinessId(businessId);
    const optOutSet = new Set();
    
    // Normalize opt-out phone numbers to E.164 format
    for (const optOut of optOuts) {
      try {
        const normalized = formatPhoneNumberE164(optOut.phone_number);
        if (normalized) {
          optOutSet.add(normalized);
          // Also add original format for robustness
          optOutSet.add(optOut.phone_number);
        } else {
          optOutSet.add(optOut.phone_number); // Fallback to original if normalization fails
        }
      } catch (error) {
        console.warn(`[BulkSMS] Could not normalize opt-out number ${optOut.phone_number}:`, error.message);
        optOutSet.add(optOut.phone_number); // Fallback to original
      }
    }
    
    // Filter out opted-out numbers - normalize recipient numbers too
    const validAssignments = assignments.filter(a => {
      // Skip if in quiet hours
      if (quietHoursBlockedSet.has(a.phoneNumber)) {
        return false;
      }
      
      try {
        const normalizedPhone = formatPhoneNumberE164(a.phoneNumber);
        // Check both normalized and original format
        const isOptedOut = optOutSet.has(a.phoneNumber) || (normalizedPhone && optOutSet.has(normalizedPhone));
        return !isOptedOut;
      } catch (error) {
        // If normalization fails, just check original format
        return !optOutSet.has(a.phoneNumber);
      }
    });
    
    const filteredCount = assignments.length - validAssignments.length;
    const optedOutCount = filteredCount - (quietHoursStats.blocked || 0);
    
    if (quietHoursStats.blocked > 0) {
      console.log(`[BulkSMS] ✅ Filtered out ${quietHoursStats.blocked} recipient(s) in quiet hours - TCPA compliance`);
    }
    if (optedOutCount > 0) {
      console.log(`[BulkSMS] ✅ Filtered out ${optedOutCount} opted-out number(s) - they will NOT receive messages`);
    }
    
    // Track last send time per number to enforce rate limits
    const numberLastSend = {};
    const numberSendCounts = {};
    
    // Initialize tracking
    availableNumbers.forEach(num => {
      numberLastSend[num.phone_number] = 0;
      numberSendCounts[num.phone_number] = 0;
    });
    
    // Log initial distribution plan
    console.log(`[BulkSMS] 📊 Load Balancing Plan:`);
    console.log(`[BulkSMS]   Total messages: ${validAssignments.length}`);
    console.log(`[BulkSMS]   Available numbers: ${availableNumbers.length}`);
    const distribution = {};
    validAssignments.forEach(a => {
      distribution[a.fromNumber] = (distribution[a.fromNumber] || 0) + 1;
    });
    Object.entries(distribution).forEach(([num, count]) => {
      const percent = ((count / validAssignments.length) * 100).toFixed(1);
      console.log(`[BulkSMS]   ${num}: ${count} messages (${percent}%)`);
    });
    
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];
    
    // Pre-fetch all recipients for efficient lookup
    const allRecipients = await SMSCampaignRecipient.findByCampaignId(campaignId);
    const recipientMap = new Map(allRecipients.map(r => [r.phone_number, r]));
    
    console.log(`[BulkSMS] ========== STARTING TO SEND MESSAGES ==========`);
    console.log(`[BulkSMS] Processing ${validAssignments.length} messages with rate limiting`);
    
    // Process messages with rate limiting
    let lastLogTime = Date.now();
    for (let i = 0; i < validAssignments.length; i++) {
      const assignment = validAssignments[i];
      const { phoneNumber, fromNumber, numberInfo } = assignment;
      
      // Log progress every 10 messages or every 30 seconds
      const now = Date.now();
      if (i % 10 === 0 || (now - lastLogTime) > 30000) {
        const elapsed = ((now - startTime) / 1000).toFixed(1);
        const rate = sentCount > 0 ? (sentCount / (elapsed / 60)).toFixed(1) : 0;
        console.log(`[BulkSMS] Progress: ${i + 1}/${validAssignments.length} (${((i + 1) / validAssignments.length * 100).toFixed(1)}%) | Sent: ${sentCount} | Failed: ${failedCount} | Rate: ${rate} msg/min | Elapsed: ${elapsed}s`);
        lastLogTime = now;
      }
      
      // Check if we need to wait for rate limit
      const lastSend = numberLastSend[fromNumber] || 0;
      const rateLimit = numberInfo.rateLimit; // messages per minute
      const minInterval = (60 * 1000) / rateLimit; // milliseconds between messages
      
      if (lastSend > 0) {
        const timeSinceLastSend = now - lastSend;
        if (timeSinceLastSend < minInterval) {
          const waitTime = minInterval - timeSinceLastSend;
          if (waitTime > 100) { // Only log if waiting more than 100ms
            console.log(`[BulkSMS] Rate limit: Waiting ${waitTime.toFixed(0)}ms before sending from ${fromNumber} (limit: ${rateLimit} msg/min)`);
          }
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      // Send SMS
      try {
        const sendStartTime = Date.now();
        // Add business name identification for TCPA/CTIA compliance
        const compliantMessage = addBusinessIdentification(messageText, business.name);
        const response = await sendSMSDirect(fromNumber, phoneNumber, compliantMessage);
        const sendDuration = Date.now() - sendStartTime;
        
        if (sendDuration > 1000) {
          console.log(`[BulkSMS] ⚠️ Slow send: ${sendDuration}ms for ${phoneNumber}`);
        }
        
        // Update recipient status
        const recipient = recipientMap.get(phoneNumber);
        if (recipient) {
          await SMSCampaignRecipient.updateStatus(recipient.id, 'sent', {
            telnyx_message_id: response.data?.id || null,
          });
        }
        
        sentCount++;
        numberSendCounts[fromNumber]++;
        numberLastSend[fromNumber] = Date.now();
        
        // Update campaign progress every 10 messages
        if (sentCount % 10 === 0) {
          await SMSCampaign.update(campaignId, {
            sent_count: sentCount,
            failed_count: failedCount,
          });
        }
      } catch (error) {
        console.error(`[BulkSMS] ❌ Failed to send SMS to ${phoneNumber} from ${fromNumber}:`, error.message);
        if (error.response) {
          console.error(`[BulkSMS] Error response:`, JSON.stringify(error.response.data, null, 2));
        }
        
        // Update recipient status
        const recipient = recipientMap.get(phoneNumber);
        if (recipient) {
          await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
            error_message: error.message,
          });
        }
        
        failedCount++;
        errors.push({ phoneNumber, error: error.message });
        
        // Update campaign progress
        await SMSCampaign.update(campaignId, {
          sent_count: sentCount,
          failed_count: failedCount,
        });
      }
    }
    
    // Update final campaign status
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalStatus = failedCount === validAssignments.length ? 'failed' : 'completed';
    
    console.log(`[BulkSMS] ========== CAMPAIGN ${campaignId} FINISHED ==========`);
    console.log(`[BulkSMS] Final status: ${finalStatus}`);
    console.log(`[BulkSMS] Total sent: ${sentCount}`);
    console.log(`[BulkSMS] Total failed: ${failedCount}`);
    console.log(`[BulkSMS] Total time: ${totalTime} seconds (${(totalTime / 60).toFixed(1)} minutes)`);
    console.log(`[BulkSMS] Average rate: ${sentCount > 0 ? (sentCount / (totalTime / 60)).toFixed(1) : 0} messages/minute`);
    console.log(`[BulkSMS] End time: ${new Date().toISOString()}`);
    
    // Log distribution summary
    console.log(`[BulkSMS] 📊 Message Distribution by Phone Number:`);
    const sortedNumbers = Object.entries(numberSendCounts)
      .sort((a, b) => b[1] - a[1]); // Sort by count descending
    sortedNumbers.forEach(([phoneNumber, count]) => {
      const percent = sentCount > 0 ? ((count / sentCount) * 100).toFixed(1) : 0;
      console.log(`[BulkSMS]   ${phoneNumber}: ${count} messages (${percent}%)`);
    });
    
    await SMSCampaign.updateStatus(campaignId, finalStatus, {
      sent_count: sentCount,
      failed_count: failedCount,
      error_summary: errors.length > 0 ? { errors: errors.slice(0, 10) } : null, // Store first 10 errors
    });
    
    console.log(`[BulkSMS] ✅ Campaign status updated in database`);
    
    return {
      sentCount,
      failedCount,
      optedOutCount,
    };
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[BulkSMS] ========== CRITICAL ERROR IN CAMPAIGN ${campaignId} ==========`);
    console.error(`[BulkSMS] Error message: ${error.message}`);
    console.error(`[BulkSMS] Error stack:`, error.stack);
    console.error(`[BulkSMS] Time before error: ${totalTime} seconds`);
    console.error(`[BulkSMS] Sent before error: ${sentCount || 0}`);
    console.error(`[BulkSMS] Failed before error: ${failedCount || 0}`);
    
    await SMSCampaign.updateStatus(campaignId, 'failed', {
      error_summary: { error: error.message },
    });
    
    console.error(`[BulkSMS] ❌ Campaign marked as failed in database`);
    throw error;
  }
}

/**
 * Get campaign status
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>} Campaign status with stats
 */
export async function getCampaignStatus(campaignId) {
  const campaign = await SMSCampaign.findById(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }
  
  const stats = await SMSCampaignRecipient.getCampaignStats(campaignId);
  
  return {
    ...campaign,
    stats,
    progress: campaign.total_recipients > 0 
      ? Math.round((stats.sent / campaign.total_recipients) * 100) 
      : 0,
  };
}

/**
 * Cancel a campaign
 * @param {string} campaignId - Campaign ID
 */
export async function cancelCampaign(campaignId) {
  const campaign = await SMSCampaign.findById(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }
  
  if (campaign.status !== 'processing' && campaign.status !== 'pending') {
    throw new Error(`Cannot cancel campaign with status: ${campaign.status}`);
  }
  
  await SMSCampaign.updateStatus(campaignId, 'cancelled');
  return { success: true };
}

