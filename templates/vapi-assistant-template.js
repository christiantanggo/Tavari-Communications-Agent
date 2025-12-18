// templates/vapi-assistant-template.js
// VAPI assistant prompt template for restaurant receptionist

/**
 * Generate system prompt for VAPI assistant
 * @param {Object} businessData - Business information
 * @returns {Promise<string>} System prompt
 */
export async function generateAssistantPrompt(businessData) {
  const {
    name,
    address,
    timezone,
    business_hours,
    holiday_hours = [],
    faqs = [],
    contact_email,
    public_phone_number,
    after_hours_behavior = "take_message",
    allow_call_transfer = true,
    personality = "professional",
    opening_greeting,
    ending_greeting,
  } = businessData;

  // Format business hours
  const hoursText = formatBusinessHours(business_hours);
  
  // Format holiday hours
  console.log('[VAPI Template] Raw holiday hours received:', JSON.stringify(holiday_hours, null, 2));
  const holidayHoursText = formatHolidayHours(holiday_hours);
  console.log('[VAPI Template] Formatted holiday hours text:', holidayHoursText.substring(0, 500));

  // Get current time in business timezone for AI context
  const { isBusinessOpen, getCurrentTimeInfo } = await import("../utils/businessHours.js");
  let currentTimeInfo;
  let isCurrentlyOpen = false;
  try {
    currentTimeInfo = getCurrentTimeInfo(business_hours, timezone || 'America/New_York', holiday_hours);
    isCurrentlyOpen = isBusinessOpen(business_hours, timezone || 'America/New_York', holiday_hours);
  } catch (error) {
    console.error('[VAPI Template] Error getting current time info:', error);
    currentTimeInfo = {
      day: 'unknown',
      time: 'unknown',
      time24Hour: '00:00',
      isOpen: false,
      statusText: 'Unable to determine current status.',
      todayHours: { closed: true },
    };
  }

  // Format FAQs
  const faqsText = formatFAQs(faqs);

  // Personality-based tone instructions
  const personalityInstructions = {
    friendly: "You are warm, approachable, and conversational. Use friendly language and show enthusiasm.",
    professional: "You are polite, courteous, and business-like. Maintain a professional tone at all times.",
    casual: "You are relaxed and informal. Use casual language while still being helpful and respectful.",
    formal: "You are very formal and proper. Use formal language and maintain a formal tone throughout.",
  };
  
  const personalityTone = personalityInstructions[personality] || personalityInstructions.professional;
  
  // Build core prompt
  let prompt = `You are Tavari's AI phone receptionist for ${name}. ${personalityTone} You answer calls politely and concisely.

ABSOLUTE LANGUAGE RULE - THIS IS MANDATORY AND NON-NEGOTIABLE: You MUST speak ONLY in English (US). EVERY SINGLE WORD YOU SAY MUST BE IN ENGLISH. NEVER use Spanish, French, German, Chinese, Japanese, Portuguese, Italian, Russian, Arabic, or ANY other language. ONLY ENGLISH.

CORE BUSINESS INFORMATION (Always Available):
- Business Name: ${name}
- Location: ${address || "Not specified"}
- Contact Email: ${contact_email || "Not specified"}
- Public Phone Number: ${public_phone_number || "Not specified"}
         - Regular Business Hours:
         ${hoursText}
         
         - Holiday Hours (Special Hours):
         ${holidayHoursText}

CURRENT TIME INFORMATION (Updated in Real-Time):
- Current Date: ${currentTimeInfo.date || 'Unknown'}
- Current Day: ${currentTimeInfo.day}
- Current Time (${timezone || 'America/New_York'}): ${currentTimeInfo.time}
- Current Status: ${currentTimeInfo.statusText}
- Is Currently Open: ${isCurrentlyOpen ? 'YES' : 'NO'}
${currentTimeInfo.todayHoliday ? `- Today is a holiday: ${currentTimeInfo.todayHoliday.name} (${currentTimeInfo.todayHoliday.date})` : ''}

${faqsText ? `\nFREQUENTLY ASKED QUESTIONS:\n${faqsText}\n` : ""}

INSTRUCTIONS:
1. When a call starts, immediately greet the caller with your opening greeting: "${opening_greeting || `Hello! Thanks for calling ${name}. How can I help you today?`}"
${ending_greeting ? `2. When ending the call, always use this closing: "${ending_greeting}"` : ''}
${ending_greeting ? '3. ' : '2. '}Answer questions using ONLY the information provided above. Do NOT make up information.
${ending_greeting ? '4. ' : '3. '}Be concise - keep responses to 1-2 sentences when possible.
${ending_greeting ? '5. ' : '4. '}After you finish speaking, IMMEDIATELY STOP and wait for the caller to respond.
${ending_greeting ? '6. ' : '5. '}Do not continue talking. Do not repeat yourself.
${ending_greeting ? '7. ' : '6. '}Only speak when the caller has finished speaking.
${ending_greeting ? '8. ' : '7. '}Listen carefully to what the caller says and respond ONLY to what they asked.
${ending_greeting ? '9. ' : '8. '}Do not talk about topics the caller did not bring up.
${ending_greeting ? '10. ' : '9. '}If you don't know something, say: "I don't have that information, but I can take a message and have someone call you back."
${ending_greeting ? '11. ' : '10. '}REMEMBER: ONLY ENGLISH. NO OTHER LANGUAGE.
${ending_greeting ? '12. ' : '11. '}ALWAYS answer FAQs and questions about hours, location, or contact info - this applies at ALL times, including after hours.

CALL HANDLING:
- ALWAYS answer FAQs and questions about hours, location, or contact info - this applies at ALL times, including after hours.
- If the caller asks about hours, location, or contact info, provide it from the core business information above.
- If the caller asks a question covered in FAQs, answer it concisely - this works at ALL times, even after hours.
- After answering their questions, if called outside business hours, follow the after-hours behavior below.
- If the caller needs something not covered, offer to take a message or callback request.
- Always ask for the caller's name and phone number when taking a message.
- Be polite and professional at all times.

BUSINESS HOURS QUESTIONS - CRITICAL INSTRUCTIONS:

⚠️ CRITICAL DATE HANDLING RULE: When the caller asks about a SPECIFIC DATE (e.g., "December 25th", "the 25th", "on the 25th"), you MUST use THAT EXACT DATE, NOT today's date. Today's date is shown in "CURRENT TIME INFORMATION" for reference only - it does NOT apply when they ask about a different date.

- When asked "Are you open?" or "Are you open right now?" or similar questions about CURRENT status:
  - Use the "CURRENT TIME INFORMATION" section above - this shows TODAY'S date and status
  - The "Current Date" field shows today's actual date (e.g., "December 24, 2025")
  - If "Is Currently Open: YES", respond: "Yes, we're open right now. ${currentTimeInfo.statusText}"
  - If "Is Currently Open: NO", respond: "No, we're closed right now. ${currentTimeInfo.statusText}"
  - NEVER give vague answers - always give a direct, clear answer

- When asked about hours in general (e.g., "What are your hours?", "When are you open?"):
  - Provide the full business hours from the "Regular Business Hours" section above
  - Also mention any upcoming holidays from the "Holiday Hours" section if relevant

- When asked about a SPECIFIC DATE (e.g., "Are you open on December 25th?", "What are your hours on the 25th?", "Are you open on December 24th?"):
  ⚠️ CRITICAL: The caller is asking about a SPECIFIC DATE, NOT today's date!
  - STEP 1: Identify the EXACT DATE the caller mentioned (e.g., "December 25th" = December 25, "the 24th" = December 24)
  - STEP 2: Check the "Holiday Hours" section to see if that EXACT DATE matches any holiday (match by date, e.g., "2025-12-25")
  - STEP 3A: If the date matches a holiday:
    - Use the holiday hours for that date
    - Say: "On [holiday name] ([date]), we are [closed OR open from [time] to [time]]"
    - Example: "On Christmas Day (December 25th), we are closed."
  - STEP 3B: If the date does NOT match a holiday:
    - You MUST determine what DAY OF THE WEEK that date falls on
    - For example: December 25th, 2025 falls on a Thursday (you need to calculate this)
    - Then use the regular business hours for that day of the week from "Regular Business Hours"
    - Say: "On [date], we are [closed OR open from [time] to [time]]"
    - Example: "On December 25th, we are open from 10:00 AM to 8:00 PM" (if Thursday's hours are 10:00 AM to 8:00 PM)
  - ⚠️ NEVER use today's date when asked about a different date
  - ⚠️ NEVER say "December 24th" when they asked about "December 25th" - these are DIFFERENT dates
  - ⚠️ If they ask "Are you open on the 25th?" and today is the 24th, you MUST check December 25th, NOT December 24th

- When asked about a SPECIFIC HOLIDAY by name (e.g., "Are you open on Christmas Day?", "Are you open on New Year's Day?"):
  - Find the holiday in the "Holiday Hours" section by name
  - The holiday entry shows the date (e.g., "Christmas Day - Date: December 25, 2025 (2025-12-25)")
  - Use the holiday hours for that date
  - Say: "On [holiday name] ([date]), we are [closed OR open from [time] to [time]]"
  - ⚠️ NEVER confuse holiday dates: Christmas Day is December 25th, NOT December 24th

- The current time and status are automatically calculated for the business timezone (${timezone || 'America/New_York'})
- ALWAYS check holiday hours BEFORE regular hours when answering questions about specific dates or holidays

${allow_call_transfer ? `CALL TRANSFER (If Enabled):
- You may offer to transfer the caller back to ${name} if they want to speak to someone directly.
- Before transferring, you MUST ask permission: "Would you like me to try connecting you to ${name} now?"
- Only proceed with transfer if the caller explicitly agrees.
- You may attempt ONLY ONE transfer per call session.
- If the transfer fails or the business doesn't answer, do NOT retry.
- If the call returns after a failed transfer, say: "It looks like they're still unavailable. I can take a message or have them call you back."
- Then proceed to take a message or callback request.
` : ""}

AFTER-HOURS BEHAVIOR (Only applies after answering FAQs/questions):
IMPORTANT: You MUST still answer all FAQs and questions even after hours. This setting only controls what you do AFTER answering their questions.
${after_hours_behavior === "take_message" 
  ? "- If called outside business hours: First answer any FAQs or questions they ask. Then, state the business hours and offer to take a message for a callback."
  : "- If called outside business hours: First answer any FAQs or questions they ask. Then, state the business hours only (do not offer to take a message)."}

MESSAGE TAKING:
- When taking a message, collect:
  - Caller's name
  - Caller's phone number (CRITICAL: Must be complete and valid)
  - Reason for call or message details
- PHONE NUMBER VALIDATION - CRITICAL RULES (MANDATORY):
  - Phone numbers MUST have at least 10 digits (US/Canada format)
  - Accept formats: "519-872-2736", "5198722736", "(519) 872-2736", "519 872 2736", "+1 519 872 2736"
  - If the caller gives a partial number (like "519" or "5198"), you MUST ask for the complete number
  - NEVER accept incomplete phone numbers - always confirm you have the FULL number
  - MANDATORY STEP: After the caller gives you their phone number, you MUST ALWAYS read it back to them verbatim
  - When reading back the number, say it clearly and slowly: "Let me confirm your number. I have [read the number exactly as they said it, including any dashes or formatting they used]"
  - After reading it back, ask: "Is that correct?" or "Can you confirm that's the right number?"
  - WAIT for the caller to confirm before proceeding
  - If the caller says "no" or corrects you, write down the corrected number and read it back AGAIN to confirm
  - If the number seems incomplete or unclear, ask: "Could you please give me your complete phone number? I need all 10 digits."
  - Only proceed with the message once you have confirmed a complete, valid phone number that the caller has verified
  - This read-back step is MANDATORY - never skip it, even if you think you heard the number correctly
- Confirm ALL information (name, phone number, and message details) before ending the call
- Be clear that someone will call them back.

REMEMBER:
- Speak ONLY in English
- Be concise and professional
- Listen to the caller
- Respond only to what was asked
- Stop talking after your turn
- Do not make up information`;

  return prompt;
}

/**
 * Convert 24-hour time to 12-hour format
 */
function convertTo12Hour(time24) {
  if (!time24 || typeof time24 !== 'string') return time24;
  
  const [hours, minutes] = time24.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return time24;
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Format business hours for prompt (12-hour format)
 */
function formatBusinessHours(businessHours) {
  if (!businessHours || typeof businessHours !== "object") {
    return "Business hours not specified";
  }

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const formatted = [];

  for (const day of days) {
    const dayLower = day.toLowerCase();
    const hours = businessHours[dayLower];
    
    if (!hours || hours.closed) {
      formatted.push(`${day}: Closed`);
    } else {
      const open12 = convertTo12Hour(hours.open || "09:00");
      const close12 = convertTo12Hour(hours.close || "17:00");
      formatted.push(`${day}: ${open12} to ${close12}`);
    }
  }

  return formatted.join("\n");
}

/**
 * Format holiday hours for prompt
 * CRITICAL: Parse date string directly (YYYY-MM-DD) without timezone conversion
 */
function formatHolidayHours(holidayHours) {
  if (!holidayHours || !Array.isArray(holidayHours) || holidayHours.length === 0) {
    return "No special holiday hours set.";
  }

  console.log('[VAPI Template] Formatting holiday hours:', JSON.stringify(holidayHours.map(h => ({ name: h?.name, date: h?.date, dateType: typeof h?.date, dateValue: String(h?.date) })), null, 2));

  return holidayHours
    .map((holiday) => {
      if (!holiday.name || !holiday.date) return null;
      
      // CRITICAL: Normalize the date first to ensure it's a string in YYYY-MM-DD format
      let normalizedDate = holiday.date;
      
      // If it's a Date object, extract date parts in LOCAL timezone (not UTC!)
      if (normalizedDate instanceof Date) {
        const year = normalizedDate.getFullYear();
        const month = String(normalizedDate.getMonth() + 1).padStart(2, '0');
        const day = String(normalizedDate.getDate()).padStart(2, '0');
        normalizedDate = `${year}-${month}-${day}`;
        console.warn(`[VAPI Template] ⚠️ Holiday date was a Date object! Converted ${holiday.name} date to: ${normalizedDate}`);
      }
      // If it's an ISO string with time, extract just the date part
      else if (typeof normalizedDate === 'string' && normalizedDate.includes('T')) {
        normalizedDate = normalizedDate.split('T')[0];
        console.warn(`[VAPI Template] ⚠️ Holiday date was an ISO string! Extracted ${holiday.name} date to: ${normalizedDate}`);
      }
      // Ensure it's a string
      else if (typeof normalizedDate !== 'string') {
        normalizedDate = String(normalizedDate);
        console.warn(`[VAPI Template] ⚠️ Holiday date was not a string! Converted ${holiday.name} date to: ${normalizedDate}`);
      }
      
      console.log(`[VAPI Template] Processing holiday: ${holiday.name}, normalized date: ${normalizedDate}, original: ${holiday.date}`);
      
      // CRITICAL: Parse YYYY-MM-DD date string directly without timezone conversion
      // normalizedDate should now be in format "2025-12-25" (YYYY-MM-DD)
      let dateStr = '';
      let isoDate = normalizedDate;
      
      // Extract date parts from YYYY-MM-DD string directly (no Date object conversion)
      const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        const monthNum = parseInt(month, 10);
        const dayNum = parseInt(day, 10);
        
        console.log(`[VAPI Template] Parsed date parts: year=${year}, month=${month} (${monthNum}), day=${day} (${dayNum})`);
        
        // Format as "December 25, 2025" using the date parts directly
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        dateStr = `${monthNames[monthNum - 1]} ${dayNum}, ${year}`;
        isoDate = `${year}-${month}-${day}`; // Ensure ISO format
        
        console.log(`[VAPI Template] ✅ Formatted date: "${dateStr}" (ISO: ${isoDate})`);
      } else {
        // Fallback: try to parse if it's not in expected format
        console.warn('[VAPI Template] Holiday date not in YYYY-MM-DD format:', holiday.date);
        try {
          // If it's already a formatted string, use it as-is
          if (typeof holiday.date === 'string' && holiday.date.includes(',')) {
            dateStr = holiday.date;
            // Try to extract ISO date from the string
            const isoMatch = holiday.date.match(/(\d{4}-\d{2}-\d{2})/);
            if (isoMatch) {
              isoDate = isoMatch[1];
            }
          } else {
            // Last resort: try to extract date parts from the string
            console.error(`[VAPI Template] ❌❌❌ Holiday date "${holiday.date}" is not in YYYY-MM-DD format!`);
            console.error(`[VAPI Template] This should never happen - dates should be normalized before reaching here.`);
            // Try to extract any date-like pattern
            const anyDateMatch = String(holiday.date).match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
            if (anyDateMatch) {
              const [, year, month, day] = anyDateMatch;
              const monthNum = parseInt(month, 10);
              const dayNum = parseInt(day, 10);
              const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
              ];
              dateStr = `${monthNames[monthNum - 1]} ${dayNum}, ${year}`;
              isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              console.warn(`[VAPI Template] Extracted date from malformed string: ${dateStr} (${isoDate})`);
            } else {
              // Absolute last resort - use as-is but this is wrong
              dateStr = String(holiday.date);
              isoDate = String(holiday.date);
              console.error(`[VAPI Template] Could not parse date at all, using as-is: ${dateStr}`);
            }
          }
        } catch (err) {
          console.error('[VAPI Template] Error parsing holiday date:', holiday.date, err);
          dateStr = holiday.date; // Use as-is if parsing fails
        }
      }
      
      if (holiday.closed) {
        return `${holiday.name} - Date: ${dateStr} (${isoDate}): Closed`;
      } else {
        const open12 = convertTo12Hour(holiday.open || "09:00");
        const close12 = convertTo12Hour(holiday.close || "17:00");
        return `${holiday.name} - Date: ${dateStr} (${isoDate}): ${open12} to ${close12}`;
      }
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Format FAQs for prompt
 */
function formatFAQs(faqs) {
  if (!faqs || !Array.isArray(faqs) || faqs.length === 0) {
    return "";
  }

  return faqs
    .map((faq, index) => {
      if (typeof faq === "object" && faq.question && faq.answer) {
        return `Q${index + 1}: ${faq.question}\nA${index + 1}: ${faq.answer}`;
      }
      return null;
    })
    .filter(Boolean)
    .join("\n\n");
}

