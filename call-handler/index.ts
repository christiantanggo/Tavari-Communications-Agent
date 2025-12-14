import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!
const telnyxApiKey = process.env.TELNYX_API_KEY!
const apiGatewayUrl = process.env.API_GATEWAY_URL!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface TelnyxWebhook {
  data: {
    id?: string
    event_type: string
    payload: {
      call_control_id: string
      call_leg_id: string
      call_session_id: string
      connection_id: string
      direction: 'inbound' | 'outbound' | 'incoming'
      from: string
      to: string
      state?: string
      start_time?: string
      end_time?: string
      [key: string]: any
    }
  }
  meta?: {
    attempt?: number
    [key: string]: any
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('=== CALL HANDLER CALLED ===')
  console.log('Request body length:', event.body?.length || 0)
  
  try {
    const webhook: TelnyxWebhook = JSON.parse(event.body || '{}')
    const eventType = webhook.data.event_type

    console.log(`Received webhook event: ${eventType}`)
    console.log('Full webhook payload:', JSON.stringify(webhook, null, 2))

    // ============================================
    // 1. call.initiated - Answer the call
    // ============================================
    if (eventType === 'call.initiated') {
      const callControlId = webhook.data.payload.call_control_id
      const toNumber = webhook.data.payload.to
      
      // Normalize phone number for database lookup
      const normalizedTo = toNumber.replace(/^\+/, '')
      const withPlus = `+${normalizedTo}`
      
      console.log(`Looking up business with phone: ${toNumber}`)
      
      // Get business by phone number (try multiple formats)
      let { data: business } = await supabase
        .from('businesses')
        .select('*')
        .eq('phone', toNumber)
        .single()

      if (!business) {
        business = (await supabase
          .from('businesses')
          .select('*')
          .eq('phone', normalizedTo)
          .single()).data
      }

      if (!business) {
        business = (await supabase
          .from('businesses')
          .select('*')
          .eq('phone', withPlus)
          .single()).data
      }

      if (!business) {
        console.error(`Business not found for phone number: ${toNumber}`)
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Business not found, call not answered' }),
        }
      }

      console.log(`Business found: ${business.name}`)

      // Log the call
      await supabase.from('call_logs').insert({
        business_id: business.id,
        caller_number: webhook.data.payload.from,
        call_duration: 0,
        requires_review: false,
      })

      // Answer the call
      try {
        const answerResponse = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${telnyxApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        })

        if (!answerResponse.ok) {
          const errorText = await answerResponse.text()
          console.error('Error answering call:', errorText)
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to answer call' }),
          }
        }
      } catch (error) {
        console.error('Error calling Telnyx API:', error)
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to call Telnyx API' }),
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Call answered' }),
      }
    }

    // ============================================
    // 2. call.answered - ONLY speak greeting
    // Wait for call.speak.ended to start gather
    // ============================================
    if (eventType === 'call.answered') {
      const callControlId = webhook.data.payload.call_control_id
      const toNumber = webhook.data.payload.to
      
      console.log('Call answered, speaking greeting')
      
      // Get business info
      const normalizedTo = toNumber.replace(/^\+/, '')
      const withPlus = `+${normalizedTo}`
      
      let { data: business } = await supabase
        .from('businesses')
        .select('*')
        .eq('phone', toNumber)
        .single()

      if (!business) {
        business = (await supabase
          .from('businesses')
          .select('*')
          .eq('phone', normalizedTo)
          .single()).data
      }

      if (!business) {
        business = (await supabase
          .from('businesses')
          .select('*')
          .eq('phone', withPlus)
          .single()).data
      }

      if (!business) {
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Business not found' }),
        }
      }

      try {
        // Store business_id and voice in client_state for speak.ended handler
        const selectedVoice = business.voice || 'Polly.Joanna' // Use business-selected voice or default
        const clientStateData = { 
          business_id: business.id, 
          call_control_id: callControlId,
          conversation_turn: 1,
          waiting_for_speak_end: true, // Flag to indicate we're waiting for speak to end
          conversation_history: [], // Initialize empty conversation history
          remembered_info: {}, // Initialize remembered info (name, phone, dates)
          voice: selectedVoice // Store voice in client_state for reuse throughout the call
        }
        const clientStateBase64 = Buffer.from(JSON.stringify(clientStateData)).toString('base64')
        
        // Speak greeting - use custom opening message or default
        const openingMessage = business.opening_message || `Hello! Thank you for calling ${business.name}. How can I help you today?`
        
        const speakResponse = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${telnyxApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payload: openingMessage,
            voice: selectedVoice,
            language: 'en-US',
            premium: true,
            client_state: clientStateBase64, // Pass client_state so speak.ended knows what to do
            interruption_settings: {
              enabled: false, // Disable interruption - don't let caller-side noise stop the AI
            },
          }),
        })

        if (!speakResponse.ok) {
          const errorText = await speakResponse.text()
          console.error('Error speaking greeting:', errorText)
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to speak greeting' }),
          }
        }

        console.log('Greeting spoken, waiting for speak.ended to start gather')
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Greeting spoken' }),
        }
      } catch (error) {
        console.error('Error in call.answered handler:', error)
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to start conversation' }),
        }
      }
    }

    // ============================================
    // 2.5. call.speak.ended - Start gather after speech finishes
    // This prevents gather from interrupting speak
    // ============================================
    if (eventType === 'call.speak.ended') {
      const callControlId = webhook.data.payload.call_control_id
      const clientStateBase64 = (webhook.data.payload as any).client_state
      
      if (!clientStateBase64) {
        console.log('No client_state in speak.ended, ignoring')
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'No client_state, ignoring' }),
        }
      }
      
      let clientState: any = {}
      try {
        clientState = JSON.parse(Buffer.from(clientStateBase64, 'base64').toString())
      } catch (e) {
        console.error('Error decoding client_state:', e)
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Invalid client_state' }),
        }
      }
      
      // Only start gather if we're waiting for speak to end (initial greeting or AI response)
      if (clientState.waiting_for_speak_end) {
        console.log('Speak ended, starting gather')
        
        // Get voice from client_state (preserve throughout call)
        const voice = (clientState as any).voice || 'Polly.Joanna'
        console.log('Using voice for gather:', voice)
        
        // Remove the flag
        delete clientState.waiting_for_speak_end
        const newClientStateBase64 = Buffer.from(JSON.stringify(clientState)).toString('base64')
        
        try {
          const gatherResponse = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/gather_using_ai`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${telnyxApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              instructions: 'You are a speech-to-text transcription service. Only transcribe what the user says. Do not respond, do not ask questions, do not have a conversation. Just listen and transcribe the user\'s speech accurately. Ignore background noise, music, TV sounds, or other ambient sounds. Only transcribe clear human speech directed at you.',
              parameters: {
                type: 'object',
                properties: {
                  user_speech: {
                    type: 'string',
                    description: 'The full transcription of what the caller said. Ignore background noise.',
                  },
                },
                required: ['user_speech'],
              },
              voice: voice, // Use voice from client_state to prevent voice switching
              client_state: newClientStateBase64,
              timeout_ms: 15000, // Increased timeout to give user more time
              interruption_settings: {
                enabled: false, // Don't allow interruption during gather - prevents caller-side noise from stopping AI
              },
            }),
          })
          
          if (!gatherResponse.ok) {
            const errorText = await gatherResponse.text()
            console.error('Error starting gather after speak:', errorText)
          } else {
            console.log('Gather started after speak ended')
          }
        } catch (error) {
          console.error('Error starting gather:', error)
        }
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Speak ended acknowledged' }),
      }
    }

    // ============================================
    // 3. call.gather.ended - Recovery mechanism (NOT call.ai_gather.ended)
    // If gather times out or ends without valid speech, restart
    // ============================================
    if (eventType === 'call.gather.ended') {
      console.log('call.gather.ended received - doing nothing (handled by call.ai.gathered)')
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Gather ended event acknowledged' }),
      }
    }

    // ============================================
    // 4. call.ai.gathered / call.ai_gather.ended - THE ONLY EVENT THAT PROCESSES SPEECH
    // This is where ALL AI processing happens
    // ============================================
    if (eventType === 'call.ai.gathered' || eventType === 'call.ai_gather.ended' || eventType === 'call.ai.user_speech') {
      const callControlId = webhook.data.payload.call_control_id
      const clientStateBase64 = (webhook.data.payload as any).client_state
      const eventId = webhook.data.id || 'unknown' // Use event ID to prevent duplicate processing
      
      // Check if this is a retry (meta.attempt > 1) - only process first attempt
      const attempt = webhook.meta?.attempt || 1
      if (attempt > 1) {
        console.log(`Skipping duplicate event ${eventId} (attempt ${attempt})`)
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Duplicate event, already processed' }),
        }
      }
      
      console.log('AI gathered event received - processing speech')
      
      // Decode client_state
      let clientState: any = {}
      if (clientStateBase64) {
        try {
          clientState = JSON.parse(Buffer.from(clientStateBase64, 'base64').toString())
        } catch (e) {
          console.error('Error decoding client_state:', e)
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Invalid client_state' }),
          }
        }
      }

      // Extract speech - try multiple locations
      const payload = webhook.data.payload as any
      const speechResult = payload.result?.user_speech ||
                          payload.parameters?.user_speech ||
                          payload.user_speech ||
                          payload.speech?.text ||
                          payload.transcription?.text || ''
      
      const status = payload.status
      
      // Get voice from client_state (stored when call was answered)
      // CRITICAL: Always use the same voice throughout the call to prevent voice switching
      const voice = (clientState as any).voice || 'Polly.Joanna'
      console.log('Using voice for this turn:', voice)
      
      console.log('Extracted speech:', speechResult, 'Status:', status)
      console.log('Full payload for debugging:', JSON.stringify(payload, null, 2))
      
      // If no valid speech, speak a message and re-gather
      if (!speechResult || (status && status !== 'valid')) {
        console.log('No valid speech, speaking message and re-gathering')
        try {
          // Check if speech contains "hello" or similar - recovery mechanism
          const lowerSpeech = (speechResult || '').toLowerCase()
          const recoveryKeywords = ['hello', 'hi', 'hey', 'are you there', 'can you hear me']
          const isRecovery = recoveryKeywords.some(keyword => lowerSpeech.includes(keyword))
          
          let recoveryMessage = 'I didn\'t catch that. Could you please repeat?'
          if (isRecovery) {
            recoveryMessage = 'Yes, I can hear you! How can I help you today?'
          }
          
          const nextClientState = { 
            ...clientState, 
            conversation_turn: (clientState.conversation_turn || 1) + 1,
            waiting_for_speak_end: true,
            voice: (clientState as any).voice || 'Polly.Joanna' // CRITICAL: Always preserve voice
          }
          const newClientStateBase64 = Buffer.from(JSON.stringify(nextClientState)).toString('base64')
          
          // Speak recovery message (voice already declared above)
          await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${telnyxApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              payload: recoveryMessage,
              voice: voice,
              language: 'en-US',
              premium: true,
              client_state: newClientStateBase64,
            }),
          })
          
          // speak.ended will start the gather
        } catch (error) {
          console.error('Error re-gathering speech:', error)
        }
        
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'No valid speech, re-gathering' }),
        }
      }
      
      // Process speech with our AI
      try {
        console.log('Processing speech with AI:', speechResult)
        
        // Send immediate acknowledgment to caller (like VAPI does) - non-blocking
        // This prevents the caller from thinking the agent is gone
        // (voice already declared above)
        fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${telnyxApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payload: 'One moment.',
            voice: voice,
            language: 'en-US',
            premium: true,
          }),
        }).catch(err => console.error('Error sending acknowledgment:', err)) // Don't wait for this
        
        const aiResponse = await fetch(`${apiGatewayUrl}/ai-processor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            call_control_id: callControlId,
            speech_text: speechResult,
            client_state: JSON.stringify(clientState),
          }),
        })
        
        if (!aiResponse.ok) {
          console.error('Error calling AI processor:', aiResponse.status)
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to process with AI' }),
          }
        }
        
        const aiData = await aiResponse.json() as { 
          response?: string
          conversation_history?: Array<{role: 'user' | 'assistant', content: string}>
          remembered_info?: {
            customer_name?: string
            customer_phone?: string
            requested_date?: string
            requested_time?: string
            party_size?: number
          }
        }
        const aiMessage = aiData.response || 'I understand. How else can I help you?'
        
        console.log('AI response:', aiMessage)
        
        // Background audio continues playing - we don't stop it
        // It plays continuously throughout the call at low volume
        
        // Update client_state with conversation history and remembered info from AI response
        // Speak AI response (handle call ended gracefully)
        // Set flag so speak.ended will start the next gather
        // CRITICAL: Always preserve voice in client_state to prevent voice switching
        const nextClientState = { 
          ...clientState, 
          conversation_turn: (clientState.conversation_turn || 1) + 1,
          waiting_for_speak_end: true, // Flag to start gather after speak ends
          conversation_history: aiData.conversation_history || clientState.conversation_history || [], // Preserve conversation history
          remembered_info: aiData.remembered_info || clientState.remembered_info || {}, // Preserve remembered info (name, phone, dates)
          voice: (clientState as any).voice || 'Polly.Joanna' // CRITICAL: Always preserve voice to prevent switching
        }
        const nextClientStateBase64 = Buffer.from(JSON.stringify(nextClientState)).toString('base64')
        // (voice already declared above)
        
        try {
          const speakResponse = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${telnyxApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              payload: aiMessage,
              voice: voice,
              language: 'en-US',
              premium: true,
              client_state: nextClientStateBase64, // Pass client_state so speak.ended knows to start gather
              interruption_settings: {
                enabled: false, // Disable interruption - don't let caller-side background noise stop the AI
              },
            }),
          })
          
          if (!speakResponse.ok) {
            const errorText = await speakResponse.text()
            const errorJson = JSON.parse(errorText)
            
            // If call has ended, that's okay - just return success
            if (errorJson.errors?.[0]?.code === '90018') {
              console.log('Call has already ended, cannot speak response')
              return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Call ended before response could be spoken' }),
              }
            }
            
            console.error('Error speaking AI response:', errorText)
            // Don't fail - just log and continue
          } else {
            console.log('AI response spoken, waiting for speak.ended to start next gather')
          }
        } catch (speakError: any) {
          console.error('Error calling speak API:', speakError.message)
          // Don't fail the whole request if speak fails
        }
        
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Speech processed, AI responded, next gather started' }),
        }
      } catch (error) {
        console.error('Error processing AI gathered speech:', error)
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to process speech' }),
        }
      }
    }

    // ============================================
    // 5. call.hangup - Log call end
    // ============================================
    if (eventType === 'call.hangup') {
      let duration = 0
      if (webhook.data.payload.start_time && webhook.data.payload.end_time) {
        const startTime = new Date(webhook.data.payload.start_time).getTime()
        const endTime = new Date(webhook.data.payload.end_time).getTime()
        duration = Math.floor((endTime - startTime) / 1000)
      }
      
      console.log('Call ended, duration:', duration)
      
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Call ended' }),
      }
    }

    // ============================================
    // 6. call.conversation.ended - Just acknowledge
    // Speech is handled by call.ai.gathered, not here
    // ============================================
    if (eventType === 'call.conversation.ended') {
      console.log('call.conversation.ended received - acknowledging (speech handled by call.ai.gathered)')
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Conversation ended event acknowledged' }),
      }
    }

        // ============================================
        // 7. call.playback.started / call.playback.ended - Just acknowledge (background audio disabled)
        // ============================================
        if (eventType === 'call.playback.started' || eventType === 'call.playback.ended') {
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Playback event acknowledged' }),
          }
        }

        // ============================================
        // 8. All other events - Just acknowledge
        // ============================================
        console.log(`Unhandled event type: ${eventType}`)
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Webhook received' }),
        }
  } catch (error: any) {
    console.error('Error handling webhook:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }
}
