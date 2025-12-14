import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
// Use SES_REGION if set, otherwise fall back to AWS_REGION, otherwise default to us-east-2 (Ohio - where tavarios.ca domain is verified)
const sesRegion = process.env.SES_REGION || process.env.AWS_REGION || 'us-east-2'
const sesClient = new SESClient({ region: sesRegion })
const apiGatewayUrl = process.env.API_GATEWAY_URL!

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface AIProcessorRequest {
  call_control_id: string
  speech_text: string
  client_state?: string
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface BookingIntent {
  intent: 'booking' | 'question' | 'other' | 'goodbye' | 'confirmation'
  confidence: number // 0-1
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  requested_date?: string // YYYY-MM-DD
  requested_time?: string // HH:MM:SS
  party_size?: number
  notes?: string
  needs_message: boolean // true if we should take a message
  suggested_alternatives?: string[] // Alternative times to suggest
  original_request?: string // Original customer request text
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('=== AI PROCESSOR CALLED ===')
  console.log('Timestamp:', new Date().toISOString())
  console.log('Request method:', event.httpMethod)
  console.log('Request path:', event.path)
  console.log('Request body length:', event.body?.length || 0)
  console.log('Request body:', event.body)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    }
  }

  try {
    const request: AIProcessorRequest = JSON.parse(event.body || '{}')
    const { speech_text, client_state } = request

    if (!speech_text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'speech_text required' }),
      }
    }

    // Parse client_state to get business_id, conversation history, and remembered info
    let businessId = ''
    let conversationTurn = 1
    let conversationHistory: ConversationMessage[] = []
    let rememberedInfo: {
      customer_name?: string
      customer_phone?: string
      customer_email?: string
      requested_date?: string
      requested_time?: string
      party_size?: number
    } = {}
    
    // Check if a booking was already made in this conversation by looking at assistant responses
    const bookingAlreadyMade = conversationHistory.some(msg => 
      msg.role === 'assistant' && (
        msg.content.toLowerCase().includes("i've got you down") ||
        msg.content.toLowerCase().includes("got you down") ||
        msg.content.toLowerCase().includes("booked") ||
        msg.content.toLowerCase().includes("reservation confirmed") ||
        msg.content.toLowerCase().includes("appointment confirmed")
      )
    )
    try {
      if (client_state) {
        const state = JSON.parse(client_state)
        businessId = state.business_id || ''
        conversationTurn = state.conversation_turn || 1
        conversationHistory = state.conversation_history || []
        rememberedInfo = state.remembered_info || {} // Track name, phone, dates explicitly
      }
    } catch (e) {
      console.error('Error parsing client_state:', e)
    }

    if (!businessId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Business ID required in client_state' }),
      }
    }

    // PARALLELIZE all database calls for speed (like VAPI optimizes)
    const now = new Date()
    
    // Run all database queries in parallel for speed
    const [businessResult, knowledgeBaseResult, appointmentsResult, servicesResult] = await Promise.all([
      supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .single(),
      supabase
        .from('knowledge_base')
        .select('*')
        .eq('business_id', businessId),
      supabase
        .from('appointments')
        .select('*')
        .eq('business_id', businessId)
        .gte('appointment_date', new Date().toISOString().split('T')[0])
        .lte('appointment_date', getDateDaysLater(new Date().toISOString().split('T')[0], 7))
        .eq('status', 'scheduled'),
      supabase
        .from('services')
        .select('*')
        .eq('business_id', businessId)
        .eq('active', true)
        .order('name', { ascending: true })
    ])

    const business = businessResult.data
    if (!business) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Business not found' }),
      }
    }

    const knowledgeBase = knowledgeBaseResult.data
    const appointments = appointmentsResult.data
    const services = servicesResult.data || []
    
    // Get date/time in business timezone using Intl API
    const businessTimezone = business.timezone || 'America/New_York'
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: businessTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      hour12: false,
    })
    
    const parts = formatter.formatToParts(now)
    const year = parts.find(p => p.type === 'year')?.value || ''
    const month = parts.find(p => p.type === 'month')?.value || ''
    const day = parts.find(p => p.type === 'day')?.value || ''
    const hour = parts.find(p => p.type === 'hour')?.value || ''
    const minute = parts.find(p => p.type === 'minute')?.value || ''
    const weekday = parts.find(p => p.type === 'weekday')?.value || ''
    
    const today = `${year}-${month}-${day}`
    const dayOfWeek = weekday.toLowerCase()
    const currentTime = `${hour}:${minute}`
    
    // Check if business is currently open
    const currentHours = business.operating_hours[dayOfWeek] || { closed: true }
    let isCurrentlyOpen = false
    if (!currentHours.closed) {
      const [currentHour, currentMin] = currentTime.split(':').map(Number)
      const currentMinutes = currentHour * 60 + currentMin
      const [openHour, openMin] = currentHours.open.split(':').map(Number)
      const [closeHour, closeMin] = currentHours.close.split(':').map(Number)
      const openMinutes = openHour * 60 + openMin
      const closeMinutes = closeHour * 60 + closeMin
      isCurrentlyOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes
    }
    const currentStatusText = isCurrentlyOpen 
      ? `We are currently OPEN (open until ${currentHours.close})`
      : `We are currently CLOSED (hours today: ${currentHours.closed ? 'Closed' : `${currentHours.open} - ${currentHours.close}`})`

    // Build context for AI
    const knowledgeBaseContext = knowledgeBase
      ?.map(kb => `${kb.title}: ${kb.content}`)
      .join('\n\n') || ''

    // Optimized business context (shorter = faster processing)
    const businessType = business.business_type || 'restaurant'
    const businessAddress = business.address ? ` | Address: ${business.address}` : ''
    const businessPhone = business.phone ? ` | Phone: ${business.phone}` : ''
    const businessEmail = business.email ? ` | Email: ${business.email}` : ''
    const businessContext = `Name: ${business.name} | Type: ${businessType}${businessAddress}${businessPhone}${businessEmail} | Hours: ${JSON.stringify(business.operating_hours)} | Slot: ${business.appointment_slot_duration}min | Max/Slot: ${business.max_appointments_per_slot} | Today: ${dayOfWeek} ${today} ${currentTime} | TZ: ${businessTimezone}`

    // Optimized calendar context (shorter format for speed)
    const calendarContext = appointments && appointments.length > 0
      ? `Appts: ${appointments.map(apt => `${apt.appointment_date} ${apt.appointment_time}`).join(', ')}`
      : "No appointments."

    // Build system prompt for AI
    const closingMessage = business.closing_message || 'Thank you for calling. Have a great day!'
    
    // Business type specific context
    const businessTypeContext = getBusinessTypeContext(businessType)
    
    const systemPrompt = `You are a friendly, helpful phone assistant for ${business.name}, which is a ${businessType}. You're speaking to a customer on the phone right now. You are NOT an AI - you're a real person helping customers. Never mention that you're an AI or assistant.

CRITICAL - Business Type Context:
${businessTypeContext}
You MUST ONLY talk about ${businessType}-related topics. Never mention or discuss other types of businesses (like hotels, airlines, etc.) unless the customer specifically asks about something unrelated, in which case politely redirect them back to what your business offers.

Your personality:
- Warm, friendly, and conversational - like a helpful colleague
- Use natural speech patterns: "Sure thing!", "Absolutely!", "Of course!", "You got it!"
- Vary your responses - don't sound scripted or repetitive
- Show empathy and understanding
- Keep responses brief but complete (1-2 sentences max for phone conversations)
- Use contractions naturally: "I'm", "we're", "that's", "I've", "you're"
- Sound enthusiastic but professional
- Use filler words naturally when appropriate: "um", "well", "let me see"
- Be conversational, not formal

Business Information:
${businessContext}
${business.address ? `\n\nOur address: ${business.address}. You can provide this if customers ask for directions or our location.` : ''}
${business.phone ? `\n\nOur phone number: ${business.phone}. Use this when customers ask how to reach us or for our contact information.` : ''}
${business.email ? `\n\nOur email: ${business.email}. Use this when customers ask for our email address or how to contact us via email.` : ''}

CRITICAL - Understanding Customer Questions About Business Information:
When customers ask questions like:
- "What's your address?" or "What is your address?" or "Where are you located?" or "What's the address?"
- "What's your phone number?" or "What's the phone number?" or "How can I reach you?"
- "What's your email?" or "What's the email address?" or "How can I email you?"

They are asking for YOUR BUSINESS information, NOT their own information. You should PROVIDE the business information, NOT ask them to provide it.

CRITICAL - Use Real Business Information ONLY (EXACT VALUES FROM DATABASE):
The database contains these EXACT values - use them WORD-FOR-WORD:
- Business Address: "${business.address || 'NOT AVAILABLE'}"
- Business Phone: "${business.phone || 'NOT AVAILABLE'}"
- Business Email: "${business.email || 'NOT AVAILABLE'}"

When a customer asks for business information, respond with the EXACT value above:
- If a customer asks for "your address", "the address", "where you are", "your location" - they want the BUSINESS address. 
  * If address is available: Say EXACTLY "${business.address}" (copy it word-for-word from above)
  * If address is NOT AVAILABLE: Say "I don't have that information available right now. Let me have someone from our team call you back with that information."
  * DO NOT make up an address. DO NOT use placeholder addresses. DO NOT ask the customer for the address.
  
- If a customer asks for "your phone number", "the phone number", "how to reach you", "what's your phone" - they want the BUSINESS phone.
  * If phone is available: Say EXACTLY "${business.phone}" (copy it word-for-word from above)
  * If phone is NOT AVAILABLE: Say "I don't have that information available right now. Let me have someone from our team call you back with that information."
  * DO NOT make up a phone number. DO NOT use placeholder numbers. DO NOT ask the customer for the phone number.
  
- If a customer asks for "your email", "the email address", "how to email you", "what's your email" - they want the BUSINESS email.
  * If email is available: Say EXACTLY "${business.email}" (copy it word-for-word from above)
  * If email is NOT AVAILABLE: Say "I don't have that information available right now. Let me have someone from our team call you back with that information."
  * DO NOT make up an email. DO NOT use placeholder emails. DO NOT ask the customer for the email.

- If a customer asks who the owner is, say: "I'm calling from ${business.name}. How can I help you today?" (Don't make up owner names - we don't have that information)

CRITICAL - NEVER Ask Customers for Business Information:
- NEVER ask the customer for business information like: band names, specials, menu items, events, promotions, or any other business details
- If you don't know something about the business (like a band name, a special, an event), you MUST take a message - DO NOT ask the customer
- Examples of what NOT to do:
  * WRONG: "What band is playing on Fridays?" (NEVER ask this - take a message instead)
  * WRONG: "What's the special today?" (If not in knowledge base, take a message - don't ask)
  * CORRECT: "I don't have that information available right now. Let me have someone from our team call you back with that information."
- NEVER ask the customer for their address, phone, or email unless you're specifically taking a booking and need their contact information for the appointment
- NEVER make up, fabricate, or use placeholder information. ONLY use what's provided above.
- If information is missing (shows as "not available"), you MUST take a message instead of making something up. Say: "I don't have that information available right now. Let me have someone from our team call you back with that information."
- NEVER use placeholder text, example data, or fake information. If you don't have real data, take a message.

Knowledge Base:
${knowledgeBaseContext}

CRITICAL - Using Knowledge Base:
- The knowledge base above contains information about the business (specials, events, menu items, etc.)
- If a customer asks about something (like "daily special", "band name", "menu item", "event"), check the knowledge base FIRST
- If the information is in the knowledge base, use it EXACTLY as written
- If the information is NOT in the knowledge base, you MUST take a message - DO NOT ask the customer for the information
- Examples:
  * Customer: "What's the daily special on Thursday?"
  * If in knowledge base: Provide the exact information from knowledge base
  * If NOT in knowledge base: "I don't have that information available right now. Let me have someone from our team call you back with that information."
  * NEVER ask: "What special do you want?" or "What band is playing?" - these are business questions, not customer questions

Available Services:
${services.length > 0 ? services.map(svc => {
  const priceText = svc.price ? `$${parseFloat(svc.price).toFixed(2)}` : 'Price on request'
  const durationText = svc.duration_minutes ? ` (${svc.duration_minutes} minutes)` : ''
  const quoteText = svc.quote_needed ? ' [QUOTE NEEDED - Take message, do not book]' : ''
  return `- ${svc.name}${durationText}: ${svc.description || 'No description'} - ${priceText}${quoteText}`
}).join('\n') : 'No services defined.'}

IMPORTANT - Service Booking Rules:
- If a customer asks about or wants to book a service marked "QUOTE NEEDED", you MUST take a message instead of booking. Say: "For that service, we'll need to provide you with a quote. I'll have someone from our team call you back to discuss pricing and availability."
- For services without "QUOTE NEEDED", you can book normally if they have all booking information.
- When discussing services, mention the name, description, price (if available), and duration.
- If a customer asks about services, list the relevant ones from the list above.

Calendar:
${calendarContext}

IMPORTANT - Current Date/Time Context (USE THIS EXACT INFORMATION):
- Today is ${dayOfWeek}, ${today}
- Current time is ${currentTime} (in business timezone: ${businessTimezone})
- ${currentStatusText}
- Operating hours for ${dayOfWeek}: ${JSON.stringify(business.operating_hours?.[dayOfWeek.toLowerCase()] || {})}
- When someone asks "are you open?" or "are you open right now?", tell them EXACTLY: ${currentStatusText}
- DO NOT guess the hours. DO NOT make up hours. Use the exact hours from the database above.
- When someone says "today" or "tonight", they mean ${today}
- ALWAYS check the operating hours for ${dayOfWeek} before responding about hours - use the exact hours from the database

When booking an appointment:
- IMPORTANT: Use the conversation history to track what information the customer has already provided (name, phone, date, time, party size)
- NEVER ask for information that was already provided earlier in the conversation
- If information is missing, ask ONLY for what's missing
- Check availability first using the calendar context
- Verify the requested time is within operating hours for that day
- Once you have name, phone, date, time, and party size, proceed to book immediately
- If the requested time is not available, suggest 2-3 alternatives in a friendly way
- Always confirm the appointment details before ending the call
- Respond naturally like: "Perfect! I've got you down for [date] at [time]. Anything else I can help with?"

When the customer is ready to end the call, use this closing message: "${closingMessage}"

If you cannot confidently answer a question (confidence below the configured threshold), or if a booking cannot be accommodated even with alternatives, you should take a message for a manager to call back.

IMPORTANT - Message Taking:
- If the customer says they want to "leave a message", "take a message", "have someone call me back", mentions "interview", "manager", or any request that requires human follow-up, you should take a message IMMEDIATELY
- When taking a message, be empathetic and say: "I'm so sorry, but I'm not able to help with that right now. I've made a note and someone from our team will give you a call back shortly."
- Do NOT go in circles asking questions when the customer wants to leave a message - just take the message and confirm
- Do NOT ask for their name or phone number if they already provided it - use what you have
- If they haven't provided name/phone yet, you can ask once, but if they don't provide it, still take the message with whatever info you have

Conversation Memory:
- You have access to the full conversation history above
- Use it to remember what the customer has already told you
- If they already gave their name, phone, date, time, or party size, you already know it
- Don't ask for information you already have
- NEVER ask "why are you calling" or "what can I help you with" if the customer already stated their purpose (e.g., "I want to make a reservation")
- Track the booking progress: if you're missing info, ask ONLY for what's missing
- If you have all the info (name, phone, date, time, party size), proceed to confirm and book
- When you suggest alternative times (e.g., "5:30 or 6:30"), and the customer confirms one (e.g., "530 is fine" means 5:30 PM), immediately proceed with that SPECIFIC time - don't say "either 5:30 or 6:30"

CRITICAL - Remembered Information (ALWAYS use this, even if not in recent conversation):
${rememberedInfo.customer_name ? `- Customer Name: ${rememberedInfo.customer_name}` : ''}
${rememberedInfo.customer_phone ? `- Customer Phone: ${rememberedInfo.customer_phone}` : ''}
${rememberedInfo.customer_email ? `- Customer Email: ${rememberedInfo.customer_email}` : ''}
${rememberedInfo.requested_date ? `- Requested Date: ${rememberedInfo.requested_date}` : ''}
${rememberedInfo.requested_time ? `- Requested Time: ${rememberedInfo.requested_time}` : ''}
${rememberedInfo.party_size ? `- Party Size: ${rememberedInfo.party_size}` : ''}

You MUST remember this information throughout the entire conversation. Never ask for information that is already remembered above.

CRITICAL REMINDER - Before Responding to Any Question:
1. Check if the question is about business information (address, phone, email, hours, specials, events, etc.)
2. If yes, look at the Business Information section above for the EXACT value
3. Use the EXACT value from the database - copy it word-for-word
4. If the value shows "not available" or is missing, take a message - DO NOT make something up
5. NEVER ask the customer for business information - you either know it from the database/knowledge base, or you take a message

Remember: You're having a real conversation with a real person. Be natural, friendly, and helpful. Don't sound like a robot reading a script.`

    // Quick check for simple confirmations (don't waste time on these)
    const speechLower = speech_text.toLowerCase().trim()
    const simpleConfirmations = ['yeah', 'yes', 'yep', 'yup', 'ok', 'okay', 'sure', 'alright', 'sounds good', 'that works', 'perfect', 'great']
    const isSimpleConfirmation = simpleConfirmations.some(conf => speechLower === conf || speechLower.startsWith(conf + ' '))
    
    if (isSimpleConfirmation) {
      console.log('Detected simple confirmation, responding naturally')
      const aiResponse = await callOpenAI(speech_text, systemPrompt, conversationHistory)
      
      // Update conversation history
      const updatedHistory = [
        ...conversationHistory,
        { role: 'user' as const, content: speech_text },
        { role: 'assistant' as const, content: aiResponse },
      ].slice(-50) // Keep last 50 messages (25 turns) - increased for longer conversations
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: aiResponse,
          has_appointment: false,
          needs_message: false,
          conversation_history: updatedHistory, // Return updated history
          remembered_info: rememberedInfo, // Return remembered info
        }),
      }
    }

    // ALWAYS try to extract name/phone/email from any conversation (even if not booking-related)
    // This ensures we remember it for later booking attempts
    try {
      const quickExtract = await extractCustomerInfo(speech_text, systemPrompt, conversationHistory)
      if (quickExtract.name && !rememberedInfo.customer_name) {
        rememberedInfo.customer_name = quickExtract.name
        console.log('Extracted and remembered name:', quickExtract.name)
      }
      // Validate phone number before storing - must be at least 10 digits
      if (quickExtract.phone) {
        const digitsOnly = quickExtract.phone.replace(/\D/g, '')
        if (digitsOnly.length >= 10) {
          if (!rememberedInfo.customer_phone) {
            rememberedInfo.customer_phone = quickExtract.phone
            console.log('Extracted and remembered phone:', quickExtract.phone)
          } else if (rememberedInfo.customer_phone !== quickExtract.phone) {
            // Update if different (user corrected it)
            rememberedInfo.customer_phone = quickExtract.phone
            console.log('Updated remembered phone:', quickExtract.phone)
          }
        } else {
          console.log('Rejected partial phone number (too short):', quickExtract.phone, 'digits:', digitsOnly.length)
          // If we have a partial number, we should ask for the full number
          // But don't store it as remembered yet
        }
      }
      // Store email if found
      if (quickExtract.email && !rememberedInfo.customer_email) {
        rememberedInfo.customer_email = quickExtract.email
        console.log('Extracted and remembered email:', quickExtract.email)
      }
    } catch (e) {
      console.error('Error extracting customer info (non-blocking):', e)
    }

    // Quick check for booking keywords - only do expensive intent analysis if booking is likely
    const bookingKeywords = ['book', 'reservation', 'reserve', 'appointment', 'schedule', 'available', 'time slot', 'tonight', 'today', 'tomorrow']
    const hasBookingKeywords = bookingKeywords.some(keyword => speechLower.includes(keyword))
    
    // Check if we're in an ongoing booking conversation (booking was mentioned earlier)
    const hasBookingContext = conversationHistory.some(msg => 
      bookingKeywords.some(keyword => msg.content.toLowerCase().includes(keyword))
    )
    
    // Only do intent analysis if booking keywords are present OR we're in a booking context
    let intentAnalysis: BookingIntent | null = null
    let combinedIntent: BookingIntent | null = null // Declare outside so it's available in all handlers
    
      if (hasBookingKeywords || hasBookingContext) {
        console.log('Detected booking keywords or booking context, analyzing intent:', speech_text)
        console.log('Current remembered_info before analysis:', JSON.stringify(rememberedInfo, null, 2))
        intentAnalysis = await analyzeIntent(speech_text, systemPrompt, business, today, dayOfWeek, appointments || [], conversationHistory, rememberedInfo)
        console.log('Intent analysis result:', JSON.stringify(intentAnalysis, null, 2))
        console.log('Extracted party_size:', intentAnalysis.party_size, 'Type:', typeof intentAnalysis.party_size)
      
      // Update remembered info with any new information extracted
      if (intentAnalysis.customer_name) rememberedInfo.customer_name = intentAnalysis.customer_name
      if (intentAnalysis.customer_phone) rememberedInfo.customer_phone = intentAnalysis.customer_phone
      if (intentAnalysis.customer_email) rememberedInfo.customer_email = intentAnalysis.customer_email
      if (intentAnalysis.requested_date) rememberedInfo.requested_date = intentAnalysis.requested_date
      if (intentAnalysis.requested_time) rememberedInfo.requested_time = intentAnalysis.requested_time
      // Always update party_size if it's provided (even if it's the same value)
      if (intentAnalysis.party_size !== undefined && intentAnalysis.party_size !== null) {
        rememberedInfo.party_size = intentAnalysis.party_size
        console.log('Updated remembered party_size:', intentAnalysis.party_size)
      }
      
      // Create combinedIntent that merges intentAnalysis with rememberedInfo for booking flow
      // Get confidence threshold from business settings (use once at the start)
      // This will be used throughout the booking flow
      
      if (intentAnalysis.intent === 'booking' && intentAnalysis.confidence >= (business.notification_settings?.ai_confidence_threshold ?? 0.8)) {
        // Determine party_size - prioritize current extraction, fall back to remembered, default to 1
        const partySize = (intentAnalysis.party_size !== undefined && intentAnalysis.party_size !== null) 
          ? intentAnalysis.party_size 
          : (rememberedInfo.party_size !== undefined && rememberedInfo.party_size !== null)
          ? rememberedInfo.party_size
          : 1
        
        console.log('Creating combinedIntent - intentAnalysis.party_size:', intentAnalysis.party_size, 'rememberedInfo.party_size:', rememberedInfo.party_size, 'final partySize:', partySize)
        
        combinedIntent = {
          ...intentAnalysis,
          customer_name: intentAnalysis.customer_name || rememberedInfo.customer_name,
          customer_phone: intentAnalysis.customer_phone || rememberedInfo.customer_phone,
          customer_email: intentAnalysis.customer_email || rememberedInfo.customer_email,
          requested_date: intentAnalysis.requested_date || rememberedInfo.requested_date,
          requested_time: intentAnalysis.requested_time || rememberedInfo.requested_time,
          party_size: partySize, // Use the explicitly calculated value
        }
        
        console.log('combinedIntent created with party_size:', combinedIntent.party_size)
        
        // Update rememberedInfo with the combined values to ensure persistence
        rememberedInfo.customer_name = combinedIntent.customer_name
        rememberedInfo.customer_phone = combinedIntent.customer_phone
        rememberedInfo.requested_date = combinedIntent.requested_date
        rememberedInfo.requested_time = combinedIntent.requested_time
        rememberedInfo.party_size = combinedIntent.party_size
        
        console.log('Updated rememberedInfo.party_size to:', rememberedInfo.party_size)
      }
    } else {
      // No booking keywords or context - skip intent analysis and go straight to conversation
      // But still extract name/phone if present (already done above)
      console.log('No booking keywords or context detected, processing as regular conversation')
      const aiResponse = await callOpenAI(speech_text, systemPrompt, conversationHistory)
      
      // Update conversation history
      const updatedHistory = [
        ...conversationHistory,
        { role: 'user' as const, content: speech_text },
        { role: 'assistant' as const, content: aiResponse },
      ].slice(-50) // Keep last 50 messages (25 turns) - increased for longer conversations
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: aiResponse,
          has_appointment: false,
          needs_message: false,
          conversation_history: updatedHistory, // Return updated history
          remembered_info: rememberedInfo, // Return remembered info (with extracted name/phone if found)
        }),
      }
    }

    // Get confidence threshold from business settings once (default is 0.8)
    const confidenceThreshold = (business.notification_settings?.ai_confidence_threshold ?? 0.8) as number

    // Handle booking intent (only if we have intent analysis and combinedIntent was created)
    if (combinedIntent && combinedIntent.intent === 'booking' && combinedIntent.confidence >= confidenceThreshold) {
      // Check if a service requiring a quote is mentioned in the conversation
      const conversationText = [speech_text, ...conversationHistory.map(m => m.content)].join(' ').toLowerCase()
      const quoteNeededService = services.find(svc => 
        svc.quote_needed && conversationText.includes(svc.name.toLowerCase())
      )
      
      if (quoteNeededService) {
        console.log('Quote-needed service requested:', quoteNeededService.name, '- triggering message-taking')
        // Force message-taking for quote-needed services
        combinedIntent.needs_message = true
        combinedIntent.original_request = speech_text
      }
      
      // Check if we have all required info (combinedIntent already has merged info)
      const customerName = combinedIntent.customer_name
      const customerPhone = combinedIntent.customer_phone
      const requestedDate = combinedIntent.requested_date
      const requestedTime = combinedIntent.requested_time
      
      // Validate phone number - must be 10+ digits
      let validPhone = customerPhone
      if (customerPhone) {
        const digitsOnly = customerPhone.replace(/\D/g, '')
        if (digitsOnly.length < 10) {
          console.log('Phone number validation failed:', customerPhone, 'digits:', digitsOnly.length)
          validPhone = undefined // Treat as missing
        }
      }
      
      // If we have all required info AND phone is valid AND AI didn't explicitly say needs_message, try to book
      if (customerName && validPhone && requestedDate && requestedTime && !combinedIntent.needs_message) {
        // CRITICAL: Check if a booking was already made in this conversation to prevent duplicates
        if (bookingAlreadyMade) {
          console.log('Booking already made in this conversation - skipping duplicate booking attempt')
          // Just respond naturally without creating another appointment
          const response = await callOpenAI(
            `The customer just said "${speech_text}" but we already successfully booked their appointment. Acknowledge what they said but confirm the booking is already set. Be brief and friendly.`,
            systemPrompt,
            conversationHistory
          )
          
          const updatedHistory = [
            ...conversationHistory,
            { role: 'user' as const, content: speech_text },
            { role: 'assistant' as const, content: response },
          ].slice(-50)
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              response,
              has_appointment: true, // Already has appointment
              needs_message: false,
              conversation_history: updatedHistory,
              remembered_info: rememberedInfo,
            }),
          }
        }
        
        // Check availability and try to book (pass combined intent with all info)
        const bookingResult = await attemptBooking(
          business,
          combinedIntent,
          appointments || [],
          today,
          dayOfWeek
        )

        if (bookingResult.success) {
          // CRITICAL: Re-check database directly before creating appointment to prevent race conditions
          // This ensures we have the most up-to-date count, including any bookings made in this same conversation
          const { data: currentAppointments, error: checkError } = await supabase
            .from('appointments')
            .select('*')
            .eq('business_id', businessId)
            .eq('appointment_date', bookingResult.appointment_date!)
            .eq('appointment_time', bookingResult.appointment_time!)
            .eq('status', 'scheduled')
          
          if (checkError) {
            console.error('Error checking current appointments:', checkError)
            // Fall through to message-taking
            combinedIntent.needs_message = true
          } else {
            const currentCount = currentAppointments?.length || 0
            const maxPerSlot = business.max_appointments_per_slot || 1
            
            if (currentCount >= maxPerSlot) {
              console.log(`Slot is now full (${currentCount}/${maxPerSlot}) - preventing duplicate booking`)
              // Slot became full - suggest alternatives or take message
              const alternatives = findAlternativeSlots(
                bookingResult.appointment_time!,
                business.operating_hours[dayOfWeek]?.open || '09:00',
                business.operating_hours[dayOfWeek]?.close || '17:00',
                business.appointment_slot_duration,
                bookingResult.appointment_date!,
                currentAppointments || [],
                maxPerSlot
              )
              
              if (alternatives.length > 0) {
                const altTimes = alternatives.map(t => formatTime(t)).join(', ')
                const response = `I'm sorry, but ${formatTime(bookingResult.appointment_time!)} just got booked. We do have availability at ${altTimes}. Would any of those work for you?`
                
                const updatedHistory = [
                  ...conversationHistory,
                  { role: 'user' as const, content: speech_text },
                  { role: 'assistant' as const, content: response },
                ].slice(-50)
                
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    response,
                    has_appointment: false,
                    needs_message: false,
                    suggested_alternatives: alternatives,
                    conversation_history: updatedHistory,
                    remembered_info: rememberedInfo,
                  }),
                }
              } else {
                // No alternatives - take message
                combinedIntent.needs_message = true
              }
            } else {
              // Slot is still available - proceed with booking
              const finalPartySize = (combinedIntent.party_size !== undefined && combinedIntent.party_size !== null) 
                ? combinedIntent.party_size 
                : 1
              console.log('Creating appointment with party_size:', finalPartySize, 'from combinedIntent.party_size:', combinedIntent.party_size)
              
              const { error: aptError } = await supabase
                .from('appointments')
                .insert({
                  business_id: businessId,
                  customer_name: customerName,
                  customer_phone: customerPhone,
                  appointment_date: bookingResult.appointment_date!,
                  appointment_time: bookingResult.appointment_time!,
                  duration_minutes: business.appointment_slot_duration,
                  party_size: finalPartySize,
                  notes: intentAnalysis.notes,
                  status: 'scheduled',
                })

              if (aptError) {
                console.error('Error creating appointment:', aptError)
                // Fall through to message-taking
                combinedIntent.needs_message = true
              } else {
                // Check if we should create a notification for this successful booking
                const notificationSettings = business.notification_settings || {}
                const notifyOnBookings = notificationSettings.notify_on_bookings === true
                const partySizeThreshold = notificationSettings.booking_party_size_threshold
                const bookingTypes = notificationSettings.booking_types_to_notify || []
                
                // Determine if we should notify based on settings
                let shouldNotify = false
                let notificationCategory = 'booking'
                
                // Send notification (use combinedIntent which has all the info) - always send email/SMS for bookings
                await sendBookingNotification(business, combinedIntent, bookingResult.appointment_date!, bookingResult.appointment_time!, 'booking')
                
                if (notifyOnBookings) {
                  // Check party size threshold (if set)
                  if (partySizeThreshold && finalPartySize >= partySizeThreshold) {
                    shouldNotify = true
                    notificationCategory = 'booking'
                  } else if (!partySizeThreshold) {
                    // No threshold, notify all bookings
                    shouldNotify = true
                    notificationCategory = 'booking'
                  }
                  
                  // Check if this is a "service" booking (for contractors/salons)
                  // This would be detected by keywords in the conversation or notes
                  const isServiceBooking = intentAnalysis.notes?.toLowerCase().includes('service') ||
                                         intentAnalysis.notes?.toLowerCase().includes('appointment') ||
                                         speech_text.toLowerCase().includes('service') ||
                                         speech_text.toLowerCase().includes('appointment')
                  
                  if (isServiceBooking && notificationSettings.notify_on_service_booked === true) {
                    shouldNotify = true
                    notificationCategory = 'service_booked'
                  }
                }
                
                // Create notification if enabled
                if (shouldNotify) {
                  try {
                    const bookingMessage = `New booking: ${customerName} for ${formatDate(bookingResult.appointment_date!)} at ${formatTime(bookingResult.appointment_time!)}. Party size: ${finalPartySize}.${intentAnalysis.notes ? ` Notes: ${intentAnalysis.notes}` : ''}`
                    
                    await supabase
                      .from('customer_messages')
                      .insert({
                        business_id: businessId,
                        caller_number: customerPhone,
                        caller_name: customerName,
                        caller_email: combinedIntent.customer_email || undefined,
                        message: bookingMessage,
                        request_type: 'booking',
                        original_request: speech_text,
                        notification_category: notificationCategory,
                        status: 'pending',
                      })
                    
                    console.log('Notification created for successful booking:', notificationCategory)
                  } catch (notifyError) {
                    console.error('Error creating booking notification (non-blocking):', notifyError)
                  }
                }
                
                // Update conversation history
                const updatedHistory = [
                  ...conversationHistory,
                  { role: 'user' as const, content: speech_text },
                  { role: 'assistant' as const, content: bookingResult.response },
                ].slice(-20)
                
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    response: bookingResult.response,
                    has_appointment: true,
                    needs_message: false,
                    conversation_history: updatedHistory,
                    remembered_info: rememberedInfo,
                  }),
                }
              }
            }
          }
        } else {
          // Booking failed - use the response with alternatives or message-taking
          if (bookingResult.needs_message) {
            combinedIntent.needs_message = true
            combinedIntent.original_request = speech_text
          } else {
            // Check if user confirmed one of the alternatives in this turn
            // If so, try booking with that specific time
            if (bookingResult.alternatives && bookingResult.alternatives.length > 0) {
              // Check if the user's speech contains a time that matches one of the alternatives
              const speechLower = speech_text.toLowerCase()
              for (const altTime of bookingResult.alternatives) {
                // Convert alternative time to various formats for matching
                const altHour = parseInt(altTime.split(':')[0])
                const altMin = altTime.split(':')[1]
                const altHour12 = altHour > 12 ? altHour - 12 : altHour === 0 ? 12 : altHour
                const altPeriod = altHour >= 12 ? 'pm' : 'am'
                
                // Check for various time formats: "530", "5:30", "5:30 pm", etc.
                const timePatterns = [
                  `${altHour12}${altMin}`,
                  `${altHour12}:${altMin}`,
                  `${altHour12}${altMin} ${altPeriod}`,
                  `${altHour12}:${altMin} ${altPeriod}`,
                ]
                
                if (timePatterns.some(pattern => speechLower.includes(pattern))) {
                  // User confirmed this alternative - update remembered_info and try booking again
                  rememberedInfo.requested_time = altTime
                  combinedIntent.requested_time = altTime
                  
                  // Try booking with the confirmed alternative
                  const confirmedBookingResult = await attemptBooking(
                    business,
                    { ...combinedIntent, requested_time: altTime },
                    appointments || [],
                    today,
                    dayOfWeek
                  )
                  
                  if (confirmedBookingResult.success) {
                    // Booking successful with confirmed alternative
                    const finalPartySize = (combinedIntent.party_size !== undefined && combinedIntent.party_size !== null) 
                      ? combinedIntent.party_size 
                      : 1
                    console.log('Creating appointment (alternative time) with party_size:', finalPartySize)
                    
                    const { error: aptError } = await supabase
                      .from('appointments')
                      .insert({
                        business_id: businessId,
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        appointment_date: confirmedBookingResult.appointment_date!,
                        appointment_time: confirmedBookingResult.appointment_time!,
                        duration_minutes: business.appointment_slot_duration,
                        party_size: finalPartySize,
                        notes: intentAnalysis.notes,
                        status: 'scheduled',
                      })

                    if (!aptError) {
                      // Send notification - always send email/SMS for bookings
                      await sendBookingNotification(business, combinedIntent, confirmedBookingResult.appointment_date!, confirmedBookingResult.appointment_time!, 'booking')
                      
                      // Check if we should create a notification for this successful booking (same logic as above)
                      const notificationSettings = business.notification_settings || {}
                      const notifyOnBookings = notificationSettings.notify_on_bookings === true
                      const partySizeThreshold = notificationSettings.booking_party_size_threshold
                      
                      let shouldNotify = false
                      let notificationCategory = 'booking'
                      
                      if (notifyOnBookings) {
                        if (partySizeThreshold && finalPartySize >= partySizeThreshold) {
                          shouldNotify = true
                        } else if (!partySizeThreshold) {
                          shouldNotify = true
                        }
                        
                        const isServiceBooking = intentAnalysis.notes?.toLowerCase().includes('service') ||
                                               intentAnalysis.notes?.toLowerCase().includes('appointment') ||
                                               speech_text.toLowerCase().includes('service') ||
                                               speech_text.toLowerCase().includes('appointment')
                        
                        if (isServiceBooking && notificationSettings.notify_on_service_booked === true) {
                          shouldNotify = true
                          notificationCategory = 'service_booked'
                        }
                      }
                      
                      if (shouldNotify) {
                        try {
                          const bookingMessage = `New booking: ${customerName} for ${formatDate(confirmedBookingResult.appointment_date!)} at ${formatTime(confirmedBookingResult.appointment_time!)}. Party size: ${finalPartySize}.${intentAnalysis.notes ? ` Notes: ${intentAnalysis.notes}` : ''}`
                          
                          await supabase
                            .from('customer_messages')
                            .insert({
                              business_id: businessId,
                              caller_number: customerPhone,
                              caller_name: customerName,
                              caller_email: combinedIntent.customer_email || undefined,
                              message: bookingMessage,
                              request_type: 'booking',
                              original_request: speech_text,
                              notification_category: notificationCategory,
                              status: 'pending',
                            })
                          
                          console.log('Notification created for successful booking (alternative time):', notificationCategory)
                        } catch (notifyError) {
                          console.error('Error creating booking notification (non-blocking):', notifyError)
                        }
                      }
                      
                      const updatedHistory = [
                        ...conversationHistory,
                        { role: 'user' as const, content: speech_text },
                        { role: 'assistant' as const, content: confirmedBookingResult.response },
                      ].slice(-50)
                      
                      return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                          response: confirmedBookingResult.response,
                          has_appointment: true,
                          needs_message: false,
                          conversation_history: updatedHistory,
                          remembered_info: rememberedInfo,
                        }),
                      }
                    }
                  }
                  break // Exit loop if we found a match
                }
              }
            }
            
            // Return with alternatives (no confirmation detected)
            const updatedHistory = [
              ...conversationHistory,
              { role: 'user' as const, content: speech_text },
              { role: 'assistant' as const, content: bookingResult.response },
            ].slice(-50)
            
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                response: bookingResult.response,
                has_appointment: false,
                needs_message: false,
                suggested_alternatives: bookingResult.alternatives,
                conversation_history: updatedHistory,
                remembered_info: rememberedInfo,
              }),
            }
          }
        }
      } else {
        // Missing booking info - ask for it naturally
        // Use combinedIntent which already merges intentAnalysis with rememberedInfo
        const customerName = combinedIntent.customer_name
        const customerPhone = combinedIntent.customer_phone
        const requestedDate = combinedIntent.requested_date
        const requestedTime = combinedIntent.requested_time
        
        const missingInfo = []
        if (!customerName) missingInfo.push('name')
        if (!customerPhone) missingInfo.push('phone number')
        if (!requestedDate) missingInfo.push('date')
        if (!requestedTime) missingInfo.push('time')

        // Special handling for phone number - validate and confirm
        let responsePrompt = `The customer wants to book an appointment. Based on our conversation history, I need their ${missingInfo.join(' and ')}. Ask for ONLY what's missing in 1-2 sentences. Be natural and reference what they already told me so you don't repeat questions.`
        
        if (customerPhone) {
          // Validate phone number length
          const digitsOnly = customerPhone.replace(/\D/g, '')
          if (digitsOnly.length < 10) {
            responsePrompt = `The customer provided a phone number but it seems incomplete (only ${digitsOnly.length} digits: "${customerPhone}"). I need their FULL phone number. Apologize and ask them to provide their complete phone number again. Say something like "I'm sorry, but I only got part of your phone number. Could you please give me your complete phone number?"`
          } else {
            // Confirm the phone number by repeating it back
            // Format it nicely for confirmation
            const formattedPhone = customerPhone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
            responsePrompt = `The customer provided their phone number: ${customerPhone}. I need to confirm it's correct before booking. Repeat the phone number back to them clearly and ask them to confirm. Say something like "Just to confirm, is ${formattedPhone} the correct number to reach you?" Wait for their confirmation before proceeding with the booking.`
          }
        }

        const response = await callOpenAI(
          responsePrompt,
          systemPrompt,
          conversationHistory
        )
        
        // Update conversation history
        const updatedHistory = [
          ...conversationHistory,
          { role: 'user' as const, content: speech_text },
          { role: 'assistant' as const, content: response },
        ].slice(-20)

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            response,
            has_appointment: false,
            needs_message: false,
            conversation_history: updatedHistory,
            remembered_info: rememberedInfo,
          }),
        }
      }
    }

    // Check if user explicitly wants to leave a message (e.g., "take a message", "leave a message", "call me back")
    // Check BOTH current speech AND conversation history for message keywords
    const messageKeywords = ['take a message', 'leave a message', 'call me back', 'call back', 'message', 'interview', 'manager', 'callback', 'need a callback', 'want a callback']
    const wantsMessageInCurrentSpeech = messageKeywords.some(keyword => speech_text.toLowerCase().includes(keyword))
    
    // Check conversation history for message-taking intent
    const conversationText = conversationHistory.map(msg => msg.content).join(' ').toLowerCase()
    const wantsMessageInHistory = messageKeywords.some(keyword => conversationText.includes(keyword))
    
    // Also check if AI has already indicated it's taking a message (look for phrases like "I'll pass this message", "I've made a note", "someone will call")
    const aiHasTakenMessage = conversationHistory.some(msg => 
      msg.role === 'assistant' && (
        msg.content.toLowerCase().includes("i'll pass") ||
        msg.content.toLowerCase().includes("i've made a note") ||
        msg.content.toLowerCase().includes("someone will call") ||
        msg.content.toLowerCase().includes("manager will call") ||
        msg.content.toLowerCase().includes("call back")
      )
    )
    
    const wantsMessage = wantsMessageInCurrentSpeech || wantsMessageInHistory || aiHasTakenMessage
    
    // Handle low confidence or needs message (but not for simple confirmations)
    // Use combinedIntent if it exists (from booking flow), otherwise use intentAnalysis
    const finalIntent = combinedIntent || intentAnalysis
      
    // Use the confidence threshold already declared above
    if ((finalIntent && (finalIntent.needs_message || finalIntent.confidence < confidenceThreshold) && !isSimpleConfirmation) || wantsMessage) {
      console.log('=== TAKING MESSAGE ===')
      console.log('Reason:', {
        confidence: finalIntent?.confidence,
        needs_message: finalIntent?.needs_message,
        wantsMessage,
        wantsMessageInCurrentSpeech,
        wantsMessageInHistory,
        aiHasTakenMessage,
        speech_text,
        conversationLength: conversationHistory.length
      })
      
      // For message-taking, use whatever info we have (don't ask for more)
      // Only extract if we don't already have it in rememberedInfo
      let callerName = rememberedInfo.customer_name
      let callerPhone = rememberedInfo.customer_phone
      let callerEmail: string | undefined
      
      // Only try to extract if we're missing name or phone
      if (!callerName || !callerPhone) {
        console.log('Extracting customer info for message (missing name or phone)')
        const customerInfo = await extractCustomerInfo(speech_text, systemPrompt, conversationHistory)
        callerName = customerInfo.name || callerName
        // Validate phone number before using it
        if (customerInfo.phone) {
          const digitsOnly = customerInfo.phone.replace(/\D/g, '')
          if (digitsOnly.length >= 10) {
            callerPhone = customerInfo.phone
          } else {
            console.log('Rejected partial phone number for message:', customerInfo.phone, 'digits:', digitsOnly.length)
          }
        }
        callerEmail = customerInfo.email
      } else {
        console.log('Using remembered info for message:', { callerName, callerPhone })
      }
      
      // Determine notification category and check if we should notify
      const notificationSettings = business.notification_settings || {}
      let notificationCategory = 'other'
      let shouldNotify = true
      
      if (wantsMessage) {
        // Explicit call back request
        notificationCategory = 'call_back'
        shouldNotify = notificationSettings.notify_on_call_backs !== false // Default to true
      } else if (finalIntent?.intent === 'booking' && finalIntent.needs_message) {
        // Failed booking
        notificationCategory = 'booking_failed'
        shouldNotify = notificationSettings.notify_on_booking_failed !== false // Default to true
      } else if (finalIntent && finalIntent.confidence < confidenceThreshold) {
        // Low confidence
        notificationCategory = 'low_confidence'
        shouldNotify = notificationSettings.notify_on_low_confidence !== false // Default to true
      }
      
      // If notification is disabled for this category, skip creating the message
      if (!shouldNotify) {
        console.log('Notification disabled for category:', notificationCategory, '- skipping message creation')
        // Still respond to the user, just don't create a notification
        const response = wantsMessage 
          ? `I'm so sorry, but I'm not able to help with that right now. I've made a note and someone from our team will give you a call back shortly. Is there anything else I can help you with?`
          : `I understand. How else can I help you today?`
        
        const updatedHistory = [
          ...conversationHistory,
          { role: 'user' as const, content: speech_text },
          { role: 'assistant' as const, content: response },
        ].slice(-20)
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            response,
            has_appointment: false,
            needs_message: false,
            conversation_history: updatedHistory,
            remembered_info: rememberedInfo,
          }),
        }
      }
      
      // Find the original message request from conversation history
      const originalMessageRequest = conversationHistory.find(msg => 
        msg.role === 'user' && messageKeywords.some(keyword => msg.content.toLowerCase().includes(keyword))
      )?.content || speech_text
      
      // Build full message context from conversation
      const fullMessageContext = conversationHistory
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join(' | ')
      
      // Store message (even if phone/name are incomplete - we'll still notify)
      console.log('Storing message in database:', {
        business_id: businessId,
        caller_number: callerPhone || 'unknown',
        caller_name: callerName,
        message: fullMessageContext || speech_text,
        original_request: originalMessageRequest,
        request_type: finalIntent?.intent || 'other',
        notification_category: notificationCategory
      })
      
      const { data: messageData, error: msgError } = await supabase
        .from('customer_messages')
        .insert({
          business_id: businessId,
          caller_number: callerPhone || 'unknown',
          caller_name: callerName,
          caller_email: callerEmail,
          message: fullMessageContext || speech_text, // Store full conversation context
          request_type: finalIntent?.intent || 'other',
          original_request: originalMessageRequest, // Store the original request
          notification_category: notificationCategory, // Add category
          status: 'pending',
        })
        .select()
        .single()

      if (msgError) {
        console.error('ERROR storing message:', msgError)
      } else {
        console.log('SUCCESS: Message stored in database with ID:', messageData?.id)
      }

      // Send notification to manager (non-blocking - don't fail if email isn't verified)
      console.log('=== SENDING MESSAGE NOTIFICATION ===')
      console.log('Notification details:', {
        notification_email: business.notification_email,
        notification_sms: business.notification_sms,
        caller_name: callerName || 'Not provided',
        caller_phone: callerPhone || 'Not provided',
        message: fullMessageContext || speech_text
      })
      
      try {
        await sendMessageNotification(business, { name: callerName, phone: callerPhone, email: callerEmail }, fullMessageContext || speech_text, finalIntent?.intent || 'other', notificationCategory)
        console.log('SUCCESS: Message notification sent (email and/or SMS)')
      } catch (emailError: any) {
        console.error('ERROR sending message notification:', emailError.message)
        console.error('Full error:', JSON.stringify(emailError, null, 2))
        // Continue even if email fails
      }

      // Generate apology and message-taking response
      const response = `I'm so sorry, but I'm not able to help with that right now. I've made a note and someone from our team will give you a call back shortly. Is there anything else I can help you with?`
      
      // Update conversation history
      const updatedHistory = [
        ...conversationHistory,
        { role: 'user' as const, content: speech_text },
        { role: 'assistant' as const, content: response },
      ].slice(-20)

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response,
          has_appointment: false,
          needs_message: true,
          conversation_history: updatedHistory,
          remembered_info: rememberedInfo,
        }),
      }
    }

    // Check for goodbye intent - if detected, use closing message
    const finalIntentForGoodbye = combinedIntent || intentAnalysis
    if (finalIntentForGoodbye && finalIntentForGoodbye.intent === 'goodbye') {
      console.log('Goodbye intent detected - using closing message')
      const closingMessage = business.closing_message || 'Thank you for calling. Have a great day!'
      
      const updatedHistory = [
        ...conversationHistory,
        { role: 'user' as const, content: speech_text },
        { role: 'assistant' as const, content: closingMessage },
      ].slice(-20)

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          response: closingMessage,
          has_appointment: false,
          needs_message: false,
          conversation_history: updatedHistory,
          remembered_info: rememberedInfo,
        }),
      }
    }

    // Regular conversation - just respond naturally
    console.log('Processing regular conversation')
    const aiResponse = await callOpenAI(speech_text, systemPrompt, conversationHistory)
    console.log('OpenAI response:', aiResponse)
    
    // Update conversation history
    const updatedHistory = [
      ...conversationHistory,
      { role: 'user' as const, content: speech_text },
      { role: 'assistant' as const, content: aiResponse },
    ].slice(-20)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        response: aiResponse,
        has_appointment: false,
        needs_message: false,
        conversation_history: updatedHistory,
        remembered_info: rememberedInfo,
      }),
    }
  } catch (error: any) {
    console.error('Error processing AI:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }
}

// Analyze speech to detect intent and extract booking details
async function analyzeIntent(
  speech: string,
  systemPrompt: string,
  business: any,
  today: string,
  dayOfWeek: string,
  appointments: any[],
  conversationHistory: ConversationMessage[] = [],
  rememberedInfo: {
    customer_name?: string
    customer_phone?: string
    customer_email?: string
    requested_date?: string
    requested_time?: string
    party_size?: number
  } = {}
): Promise<BookingIntent> {
  // Build context from conversation history
  const conversationContext = conversationHistory.length > 0
    ? `\n\nPrevious conversation context:\n${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\nIMPORTANT: Use the conversation history to extract information. If the customer already provided their name, phone, date, time, or party size in previous messages, extract those values even if they're not explicitly repeated in the current speech.`
    : ''
  
  const rememberedContext = `
REMEMBERED INFORMATION (use these if not in current speech):
${rememberedInfo.customer_name ? `- Name: ${rememberedInfo.customer_name}` : ''}
${rememberedInfo.customer_phone ? `- Phone: ${rememberedInfo.customer_phone}` : ''}
${rememberedInfo.customer_email ? `- Email: ${rememberedInfo.customer_email}` : ''}
${rememberedInfo.requested_date ? `- Date: ${rememberedInfo.requested_date}` : ''}
${rememberedInfo.requested_time ? `- Time: ${rememberedInfo.requested_time}` : ''}
${rememberedInfo.party_size ? `- Party Size: ${rememberedInfo.party_size}` : ''}
`

  const prompt = `Analyze this customer speech and extract booking intent. 

CRITICAL: You MUST return valid JSON only. No markdown, no code blocks, no extra text.

Return a JSON object with these exact fields:
{
  "intent": "booking" | "question" | "other" | "goodbye" | "confirmation",
  "confidence": 0.0-1.0,
  "customer_name": "extracted name or null",
      "customer_phone": "extracted FULL phone number (10+ digits) or null - if only partial number (like 3 digits), return null",
  "requested_date": "YYYY-MM-DD or null",
  "requested_time": "HH:MM:SS or null",
  "party_size": number or null,
  "notes": "any notes or null",
  "needs_message": true or false
}

Rules:
- For booking requests: confidence 0.8+, intent "booking", needs_message false (ONLY set needs_message true if information is truly missing or unclear)
- CRITICAL: If you have customer_name, customer_phone (10+ digits), requested_date, and requested_time, set needs_message to FALSE - we can book!
- For simple confirmations: confidence 0.9+, intent "confirmation" or "other", needs_message false
- For goodbye/ending calls: If customer says "bye", "goodbye", "thanks, bye", "have a good day", "that's all", "nothing else", "I'm done", "we're done", "I'll let you go", or similar ending phrases, use intent "goodbye"
- For unclear speech: confidence below threshold (default 0.8), needs_message true
- Use remembered info if not in current speech
- If they say "today", use ${today}
- Time parsing: "6 p.m." or "6pm" = "18:00:00", "530" or "5:30" = "17:30:00", "630" or "6:30" = "18:30:00"
- If they confirm an alternative time (e.g., "530 is fine" after you suggested "5:30 or 6:30"), extract "17:30:00" as the requested_time
- Always extract the SPECIFIC time they want, not a range
- Party size extraction: "six people" = 6, "party of 6" = 6, "6 guests" = 6, "for 6" = 6, "there'll be six people" = 6
- ALWAYS extract party_size as a NUMBER (not a string). If they say "six", extract 6. If they say "6", extract 6.
- Phone number extraction: MUST be FULL phone number (10+ digits). If only partial (like "519" or "519-872" or "872-2736"), return null. Formats: "519-872-2736", "5198722736", "(519) 872-2736" are all valid. Partial numbers like "872-2736" (7 digits) should return null.

Customer said: "${speech}"
Today is: ${dayOfWeek}, ${today}${conversationContext}${rememberedContext}

Return ONLY the JSON object, nothing else.`

  // Build messages with conversation history for context
  const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
    { role: 'system', content: 'You are a JSON extraction assistant. Always return valid JSON only.' },
  ]
  
  // Add conversation history for context (limit to last 10 messages for speed)
  if (conversationHistory.length > 0) {
    messages.push(...conversationHistory.slice(-10).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })))
  }
  
  messages.push({ role: 'user', content: prompt })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0.1, // Very low temperature for fast, consistent intent detection
      max_tokens: 150, // Increased to ensure complete JSON
    })

    let content = completion.choices[0].message.content || '{}'
    
    // Clean the response - remove any markdown code blocks or extra text
    content = content.trim()
    if (content.startsWith('```json')) {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (content.startsWith('```')) {
      content = content.replace(/```\n?/g, '')
    }
    
    let result: any = {}
    try {
      result = JSON.parse(content)
    } catch (parseError: any) {
      console.error('JSON parse error:', parseError.message)
      console.error('Raw content:', content)
      // Try to extract JSON from the response if it's wrapped in text
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0])
        } catch (e) {
          console.error('Failed to parse extracted JSON:', e)
        }
      }
    }
    
    // Merge with remembered info - use remembered values if not in current extraction
    // For party_size, prioritize current extraction, but fall back to remembered
    let partySize = undefined
    if (result.party_size !== undefined && result.party_size !== null) {
      // Ensure it's a number
      partySize = typeof result.party_size === 'number' ? result.party_size : parseInt(result.party_size)
      console.log('Extracted party_size from current speech:', partySize)
    } else if (rememberedInfo.party_size !== undefined && rememberedInfo.party_size !== null) {
      partySize = rememberedInfo.party_size
      console.log('Using remembered party_size:', partySize)
    }
    
    return {
      intent: result.intent || 'other',
      confidence: result.confidence || 0.5,
      customer_name: result.customer_name || rememberedInfo.customer_name || undefined,
      customer_phone: result.customer_phone || rememberedInfo.customer_phone || undefined,
      requested_date: result.requested_date || rememberedInfo.requested_date || undefined,
      requested_time: result.requested_time || rememberedInfo.requested_time || undefined,
      party_size: partySize,
      notes: result.notes || undefined,
      needs_message: result.needs_message || false,
    }
  } catch (error: any) {
    console.error('Error analyzing intent:', error)
    return {
      intent: 'other',
      confidence: 0.3,
      needs_message: true,
    }
  }
}

// Attempt to book an appointment, checking availability and suggesting alternatives
async function attemptBooking(
  business: any,
  intent: BookingIntent,
  existingAppointments: any[],
  today: string,
  dayOfWeek: string
): Promise<{
  success: boolean
  response: string
  appointment_date?: string
  appointment_time?: string
  alternatives?: string[]
  needs_message: boolean
}> {
  const requestedDate = intent.requested_date || today
  const requestedTime = intent.requested_time || '18:00:00'
  
  // Parse date correctly to avoid timezone issues
  // requestedDate is in format YYYY-MM-DD, parse it as local date (not UTC)
  const dateParts = requestedDate.split('-')
  const parsedDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]))
  
  // Check if date is valid and business is open
  const targetDayOfWeek = parsedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const hours = business.operating_hours[targetDayOfWeek] || { closed: true }
  
  if (hours.closed) {
    return {
      success: false,
      response: `I'm sorry, but we're closed on ${targetDayOfWeek}. Would you like to book for another day?`,
      needs_message: false,
    }
  }

  // Check if requested time slot is available
  const slotDuration = business.appointment_slot_duration
  const maxPerSlot = business.max_appointments_per_slot
  
  // Count existing appointments at this time
  const existingAtTime = existingAppointments.filter(
    apt => apt.appointment_date === requestedDate && apt.appointment_time === requestedTime
  ).length

  if (existingAtTime < maxPerSlot) {
    // Slot is available!
    return {
      success: true,
      response: `Perfect! I've got you down for ${formatDate(requestedDate)} at ${formatTime(requestedTime)}. Anything else I can help with?`,
      appointment_date: requestedDate,
      appointment_time: requestedTime,
      needs_message: false,
    }
  }

  // Slot is full - find alternatives (before and after)
  const alternatives = findAlternativeSlots(
    requestedTime,
    hours.open,
    hours.close,
    slotDuration,
    requestedDate,
    existingAppointments,
    maxPerSlot
  )

  if (alternatives.length > 0) {
    // Suggest alternatives
    const altTimes = alternatives.map(t => formatTime(t)).join(', ')
    return {
      success: false,
      response: `I'm sorry, but ${formatTime(requestedTime)} is already booked. We do have availability at ${altTimes}. Would any of those work for you?`,
      alternatives,
      needs_message: false,
    }
  }

  // No alternatives available - need to take message
  return {
    success: false,
    response: `I'm so sorry, but we're completely booked for that time and don't have any nearby slots available. Let me have someone from our team call you back to find a time that works.`,
    needs_message: true,
  }
}

// Find alternative time slots (before and after requested time)
function findAlternativeSlots(
  requestedTime: string,
  openTime: string,
  closeTime: string,
  slotDuration: number,
  date: string,
  existingAppointments: any[],
  maxPerSlot: number
): string[] {
  const [reqHour, reqMin] = requestedTime.split(':').map(Number)
  const reqMinutes = reqHour * 60 + reqMin
  
  const [openHour, openMin] = openTime.split(':').map(Number)
  const openMinutes = openHour * 60 + openMin
  
  const [closeHour, closeMin] = closeTime.split(':').map(Number)
  const closeMinutes = closeHour * 60 + closeMin

  const alternatives: string[] = []
  
  // Check slots before (going backwards)
  for (let offset = slotDuration; offset <= slotDuration * 3; offset += slotDuration) {
    const altMinutes = reqMinutes - offset
    if (altMinutes >= openMinutes) {
      const altHour = Math.floor(altMinutes / 60)
      const altMin = altMinutes % 60
      const altTime = `${String(altHour).padStart(2, '0')}:${String(altMin).padStart(2, '0')}:00`
      
      const existingAtAlt = existingAppointments.filter(
        apt => apt.appointment_date === date && apt.appointment_time === altTime
      ).length
      
      if (existingAtAlt < maxPerSlot) {
        alternatives.push(altTime)
        if (alternatives.length >= 2) break
      }
    }
  }
  
  // Check slots after (going forwards)
  for (let offset = slotDuration; offset <= slotDuration * 3; offset += slotDuration) {
    const altMinutes = reqMinutes + offset
    if (altMinutes < closeMinutes) {
      const altHour = Math.floor(altMinutes / 60)
      const altMin = altMinutes % 60
      const altTime = `${String(altHour).padStart(2, '0')}:${String(altMin).padStart(2, '0')}:00`
      
      const existingAtAlt = existingAppointments.filter(
        apt => apt.appointment_date === date && apt.appointment_time === altTime
      ).length
      
      if (existingAtAlt < maxPerSlot) {
        alternatives.push(altTime)
        if (alternatives.length >= 3) break
      }
    }
  }

  return alternatives.slice(0, 3) // Max 3 alternatives
}

// Extract customer info from speech
async function extractCustomerInfo(speech: string, systemPrompt: string, conversationHistory: ConversationMessage[] = []): Promise<{
  name?: string
  phone?: string
  email?: string
}> {
  const conversationContext = conversationHistory.length > 0
    ? `\n\nPrevious conversation:\n${conversationHistory.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n')}`
    : ''

  const prompt = `Extract customer information from this speech. Return JSON with name, phone, email (or null if not found).

CRITICAL PHONE NUMBER RULES:
- Phone numbers must be at least 10 digits (US/Canada format)
- Extract the FULL phone number, not partial numbers
- Accept formats: "519-872-2736", "5198722736", "(519) 872-2736", "519 872 2736", "five one nine eight seven two two seven three six"
- If you only see 3 digits (like "519"), that's NOT a complete phone number - return null for phone
- If you only see 4 digits (like "5198"), that's NOT a complete phone number - return null for phone
- If the phone number is incomplete or unclear, return null for phone
- US/Canada numbers: 10 digits (area code + 7 digits) or 11 digits with country code (1 + 10 digits)
- If the customer says a partial number like "five one nine" (only 3 digits), return null for phone - you need ALL 10 digits

IMPORTANT: If you extract a phone number, make sure it has at least 10 digits when you remove all non-digit characters. If it doesn't, return null for phone.

Return ONLY valid JSON: {"name": "...", "phone": "...", "email": "..."}

Speech: "${speech}"${conversationContext}`

  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are a JSON extraction assistant. Always return valid JSON only.' },
      { role: 'system', content: systemPrompt }, // Include system prompt for context
      ...conversationHistory.slice(-6), // Include recent conversation for context
      { role: 'user', content: prompt },
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 100,
    })

    return JSON.parse(completion.choices[0].message.content || '{}')
  } catch (error) {
    console.error('Error extracting customer info:', error)
    return {}
  }
}

// Helper function to call OpenAI for natural responses
async function callOpenAI(
  prompt: string, 
  systemPrompt: string, 
  conversationHistory: ConversationMessage[] = []
): Promise<string> {
  // Build messages array with system prompt, conversation history, and current user message
  const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
    {
      role: 'system',
      content: systemPrompt,
    },
    // Add conversation history (limit to last 12 messages for speed - VAPI uses similar limits)
    // We keep 50 messages in storage but only send last 12 to OpenAI for faster processing
    ...conversationHistory.slice(-12).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    // Add current user message
    {
      role: 'user',
      content: prompt,
    },
  ]

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages,
    max_tokens: 80, // Reduced for faster generation
    temperature: 0.7, // Lower temperature = faster, more consistent responses
    presence_penalty: 0.2,
    frequency_penalty: 0.2,
    stream: false, // Explicitly disable streaming for faster response
  })

  let response = completion.choices[0].message.content || ''
  response = response.replace(/\*\*/g, '').replace(/\*/g, '').trim()
  
  return response
}

// Send booking notification
async function sendBookingNotification(
  business: any,
  intent: BookingIntent,
  date: string,
  time: string,
  category: string = 'booking'
): Promise<void> {
  const notificationSettings = business.notification_settings || {}
  const notificationMethods = notificationSettings.notification_methods || {}
  const methods = notificationMethods[category] || ['email', 'sms'] // Default to both if not configured
  
  const subject = `New Appointment: ${intent.customer_name} - ${formatDate(date)} at ${formatTime(time)}`
  const body = `New appointment booked:

Customer: ${intent.customer_name}
Phone: ${intent.customer_phone}
Date: ${formatDate(date)}
Time: ${formatTime(time)}
Party Size: ${intent.party_size || 'Not specified'}
Notes: ${intent.notes || 'None'}

This is an automated notification from your AI phone agent.`

  const smsMessage = `New appointment: ${intent.customer_name} on ${formatDate(date)} at ${formatTime(time)}`

  // Send email if enabled
  if (methods.includes('email') && business.notification_email) {
    try {
      await sendEmailNotification(business.notification_email, subject, body)
      console.log('SUCCESS: Booking email notification sent to', business.notification_email)
    } catch (error: any) {
      console.error('Error sending email notification (non-blocking):', error.message)
    }
  }
  
  // Send SMS if enabled
  if (methods.includes('sms') && business.notification_sms) {
    try {
      await sendSMSNotification(business.notification_sms, smsMessage)
      console.log('SUCCESS: Booking SMS notification sent to', business.notification_sms)
    } catch (error: any) {
      console.error('Error sending SMS notification (non-blocking):', error.message)
    }
  }
}

// Send message notification
async function sendMessageNotification(
  business: any,
  customerInfo: any,
  message: string,
  requestType: string,
  category: string = 'call_back'
): Promise<void> {
  const notificationSettings = business.notification_settings || {}
  const notificationMethods = notificationSettings.notification_methods || {}
  const methods = notificationMethods[category] || ['email', 'sms'] // Default to both if not configured
  
  const subject = `Customer Message Requires Follow-up - ${business.name}`
  const body = `A customer called and left a message that requires your attention:

Customer Name: ${customerInfo.name || 'Not provided'}
Phone: ${customerInfo.phone || 'Not provided'}
Email: ${customerInfo.email || 'Not provided'}
Request Type: ${requestType}
Message: ${message}

Please call them back as soon as possible.

This is an automated notification from your AI phone agent.`

  const smsMessage = `New message from ${customerInfo.name || 'customer'}. Check email for details.`

  // Send email if enabled
  if (methods.includes('email') && business.notification_email) {
    try {
      await sendEmailNotification(business.notification_email, subject, body)
      console.log('SUCCESS: Message email notification sent to', business.notification_email)
    } catch (error: any) {
      console.error('ERROR sending email notification (non-blocking):', {
        message: error.message,
        code: error.Code,
        to: business.notification_email,
        error: JSON.stringify(error, null, 2)
      })
      // Common issues:
      // - SES_FROM_EMAIL not set in Lambda environment variables
      // - Email addresses not verified in AWS SES (check SES console)
      // - SES is in sandbox mode (can only send to verified emails)
    }
  } else {
    console.log('Skipping email notification - not enabled or no email configured')
  }
  
  // Send SMS if enabled
  if (methods.includes('sms') && business.notification_sms) {
    try {
      await sendSMSNotification(business.notification_sms, smsMessage)
      console.log('SUCCESS: Message SMS notification sent to', business.notification_sms)
    } catch (error: any) {
      console.error('ERROR sending SMS notification (non-blocking):', {
        message: error.message,
        to: business.notification_sms,
        error: JSON.stringify(error, null, 2)
      })
      // Common issues:
      // - API_GATEWAY_URL not set in Lambda environment variables
      // - notification-api Lambda not deployed or not accessible
      // - Telnyx API key not configured in notification-api Lambda
      // - Telnyx phone number not configured in notification-api Lambda
    }
  } else {
    console.log('Skipping SMS notification - not enabled or no SMS configured')
  }
}

// Helper function to send email notification
async function sendEmailNotification(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const fromEmail = process.env.SES_FROM_EMAIL
  if (!fromEmail) {
    throw new Error('SES_FROM_EMAIL environment variable is not set')
  }
  
  console.log('Sending email notification:', {
    from: fromEmail,
    to,
    subject
  })
  
  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Text: {
          Data: body,
        },
      },
    },
  })

  try {
    const result = await sesClient.send(command)
    console.log('Email sent successfully:', result.MessageId)
  } catch (error: any) {
    console.error('SES Error details:', {
      code: error.Code,
      message: error.message,
      name: error.name,
      from: fromEmail,
      to
    })
    throw error // Re-throw so caller can log it
  }
}

// Helper function to get business type context for AI prompt
function getBusinessTypeContext(businessType: string): string {
  const contexts: Record<string, string> = {
    'restaurant': `This is a restaurant. You help customers make reservations, answer questions about the menu, hours, and dining options. Use terms like "reservation", "table", "party size", "dining", "menu". Never mention hotels, rooms, or accommodations.`,
    'salon': `This is a hair salon or beauty salon. You help customers book appointments for haircuts, styling, coloring, and other beauty services. Use terms like "appointment", "service", "stylist", "cut", "color". Never mention restaurants, hotels, or other unrelated businesses.`,
    'spa': `This is a spa. You help customers book appointments for massages, facials, and other spa services. Use terms like "appointment", "service", "massage", "facial", "treatment". Never mention restaurants, hotels, or other unrelated businesses.`,
    'medical': `This is a medical practice or clinic. You help patients book appointments with doctors or healthcare providers. Use terms like "appointment", "visit", "doctor", "patient", "medical". Be professional and respectful. Never mention restaurants, hotels, or other unrelated businesses.`,
    'dental': `This is a dental practice. You help patients book appointments for dental care. Use terms like "appointment", "visit", "dentist", "patient", "dental". Be professional and respectful. Never mention restaurants, hotels, or other unrelated businesses.`,
    'contractor': `This is a contractor or service provider. You help customers schedule service calls, estimates, and work appointments. Use terms like "appointment", "service call", "estimate", "work", "project". Never mention restaurants, hotels, or other unrelated businesses.`,
    'fitness': `This is a gym or fitness center. You help customers with memberships, class schedules, and personal training appointments. Use terms like "appointment", "class", "session", "membership", "training". Never mention restaurants, hotels, or other unrelated businesses.`,
    'retail': `This is a retail store. You help customers with product inquiries, store hours, and special orders. Use terms like "product", "item", "store hours", "order", "inventory". Never mention restaurants, hotels, or other unrelated businesses.`,
    'automotive': `This is an automotive service business (auto repair, car wash, etc.). You help customers schedule service appointments. Use terms like "appointment", "service", "repair", "vehicle", "car". Never mention restaurants, hotels, or other unrelated businesses.`,
    'veterinary': `This is a veterinary clinic. You help pet owners book appointments for their pets. Use terms like "appointment", "visit", "pet", "animal", "veterinarian". Be caring and professional. Never mention restaurants, hotels, or other unrelated businesses.`,
    'other': `This is a general business. Help customers with their inquiries, bookings, and questions. Stay focused on what this business offers and never mention unrelated business types like hotels, airlines, etc.`,
  }
  
  return contexts[businessType.toLowerCase()] || contexts['other']
}

// Helper function to send SMS notification
async function sendSMSNotification(to: string, message: string): Promise<void> {
  if (!apiGatewayUrl) {
    throw new Error('API_GATEWAY_URL environment variable is not set')
  }
  
  // Determine the correct API Gateway route
  // Try multiple possible routes since API Gateway configurations vary
  // According to DEPLOYMENT.md, the route is POST /notifications
  const possibleRoutes = []
  
  if (apiGatewayUrl.endsWith('/prod')) {
    // URL already ends with /prod, try /notifications first (correct route), then /notification-api (fallback)
    possibleRoutes.push(`${apiGatewayUrl}/notifications`)
    possibleRoutes.push(`${apiGatewayUrl}/notification-api`)
  } else if (apiGatewayUrl.includes('/prod/')) {
    // URL already has /prod/ in it, try /notifications first (correct route), then /notification-api (fallback)
    possibleRoutes.push(`${apiGatewayUrl}/notifications`)
    possibleRoutes.push(`${apiGatewayUrl}/notification-api`)
  } else {
    // URL doesn't have /prod, try both variations with /notifications first
    possibleRoutes.push(`${apiGatewayUrl}/prod/notifications`)
    possibleRoutes.push(`${apiGatewayUrl}/notifications`)
    possibleRoutes.push(`${apiGatewayUrl}/prod/notification-api`)
    possibleRoutes.push(`${apiGatewayUrl}/notification-api`)
  }
  
  let lastError: any = null
  
  // Try each route until one works
  for (const notificationApiUrl of possibleRoutes) {
    console.log('Trying SMS API route:', notificationApiUrl)
    
    try {
      const response = await fetch(notificationApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'sms',
          to,
          subject: '', // Not used for SMS but API expects it
          message,
        }),
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('SMS sent successfully via route:', notificationApiUrl, result)
        return // Success, exit function
      } else {
        const errorText = await response.text()
        lastError = {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          route: notificationApiUrl
        }
        console.log('Route failed, trying next:', {
          route: notificationApiUrl,
          status: response.status,
          error: errorText
        })
        // Continue to next route
      }
    } catch (error: any) {
      lastError = {
        message: error.message,
        route: notificationApiUrl
      }
      console.log('Route error, trying next:', {
        route: notificationApiUrl,
        error: error.message
      })
      // Continue to next route
    }
  }
  
  // All routes failed
  console.error('SMS API Error - all routes failed:', {
    to,
    messageLength: message.length,
    lastError
  })
  throw new Error(`SMS API failed on all routes. Last error: ${lastError?.status || lastError?.message || 'Unknown error'}`)
}

// Helper functions for date/time formatting
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(timeStr: string): string {
  const [hour, minute] = timeStr.split(':')
  const hourNum = parseInt(hour)
  const period = hourNum >= 12 ? 'PM' : 'AM'
  const displayHour = hourNum > 12 ? hourNum - 12 : hourNum === 0 ? 12 : hourNum
  return `${displayHour}:${minute} ${period}`
}

function getDateDaysLater(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00')
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}
