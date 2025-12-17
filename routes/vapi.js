// routes/vapi.js
// VAPI webhook handler for call events

import express from "express";
import { CallSession } from "../models/CallSession.js";
import { Business } from "../models/Business.js";
import { Message } from "../models/Message.js";
import { getCallSummary, forwardCallToBusiness } from "../services/vapi.js";
import { checkMinutesAvailable, recordCallUsage } from "../services/usage.js";
import { sendCallSummaryEmail, sendSMSNotification } from "../services/notifications.js";

const router = express.Router();

/**
 * Test endpoint to verify webhook route is accessible
 */
router.get("/webhook", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "VAPI webhook endpoint is accessible",
    path: "/api/vapi/webhook",
    timestamp: new Date().toISOString(),
  });
});

/**
 * VAPI Webhook Handler
 * Handles call-start, call-end, transfer-started, transfer-failed, call-returned events
 * 
 * CRITICAL: Respond IMMEDIATELY - do NOT wait for DB operations
 * VAPI needs a fast response to answer calls properly
 */
router.post("/webhook", async (req, res) => {
  // 🔥 IMMEDIATE LOG - First thing we do
  console.log("🔥 INBOUND CALL HIT", JSON.stringify(req.body, null, 2));
  
  // RESPOND IMMEDIATELY - Don't wait for anything
  // This tells VAPI we received the webhook
  res.status(200).json({ received: true });
  
  // Now process asynchronously (don't await - let it run in background)
  (async () => {
    try {
      // Log incoming request for debugging
      console.log(`[VAPI Webhook] 📥 Incoming POST request to /api/vapi/webhook`);
      console.log(`[VAPI Webhook] Headers:`, JSON.stringify(req.headers, null, 2));
      console.log(`[VAPI Webhook] Body:`, JSON.stringify(req.body, null, 2));

      // Verify webhook signature if secret is provided
      if (process.env.VAPI_WEBHOOK_SECRET) {
        // TODO: Implement signature verification
        // const signature = req.headers["vapi-signature"];
        // verifySignature(req.body, signature);
      }

      const event = req.body;
      const eventType = event.type || event.event;

      if (!eventType) {
        console.warn(`[VAPI Webhook] ⚠️  No event type found in request body`);
        return;
      }

      console.log(`[VAPI Webhook] 📞 Received event: ${eventType}`, {
        callId: event.call?.id,
        assistantId: event.call?.assistant?.id,
        businessId: event.call?.assistant?.metadata?.businessId,
        callerNumber: event.call?.customer?.number,
        fullEvent: JSON.stringify(event, null, 2).substring(0, 500), // First 500 chars for debugging
      });

      // Handle different event types (async - don't block)
      switch (eventType) {
        case "call-start":
          await handleCallStart(event);
          break;
        case "call-end":
          await handleCallEnd(event);
          break;
        case "transfer-started":
          await handleTransferStarted(event);
          break;
        case "transfer-failed":
        case "transfer-ended":
          await handleTransferFailed(event);
          break;
        case "call-returned":
          await handleCallReturned(event);
          break;
        case "function-call":
          await handleFunctionCall(event);
          break;
        default:
          console.log(`[VAPI Webhook] Unhandled event type: ${eventType}`);
      }
    } catch (error) {
      console.error("[VAPI Webhook] Error processing webhook (non-blocking):", error);
      // Don't throw - we already responded
    }
  })();
});

/**
 * Handle call-start event
 */
async function handleCallStart(event) {
  const call = event.call;
  const callId = call.id;
  const assistantId = call.assistant?.id;
  const callerNumber = call.customer?.number;

  // Skip test webhooks (assistant ID starting with "test-")
  if (!assistantId || assistantId.startsWith("test-")) {
    console.log(`[VAPI Webhook] Skipping test webhook for assistant: ${assistantId}`);
    return;
  }

  // Find business by assistant ID
  const business = await Business.findByVapiAssistantId(assistantId);
  if (!business) {
    console.error(`[VAPI Webhook] Business not found for assistant: ${assistantId}`);
    return;
  }

  // Check if AI is enabled
  if (!business.ai_enabled) {
    console.log(`[VAPI Webhook] AI disabled for business ${business.id}, forwarding call`);
    
    // Immediately forward call to business
    try {
      await forwardCallToBusiness(callId, business.public_phone_number);
      
      // Create call session record for tracking
      await CallSession.create({
        business_id: business.id,
        vapi_call_id: callId,
        caller_number: callerNumber,
        status: "forwarded",
        started_at: new Date(),
      });
    } catch (error) {
      console.error(`[VAPI Webhook] Error forwarding call:`, error);
    }
    return;
  }

  // Check minutes availability
  const minutesCheck = await checkMinutesAvailable(business.id, 0); // Estimate 0 for now, will update on call-end
  
  if (!minutesCheck.available) {
    console.log(`[VAPI Webhook] Minutes exhausted for business ${business.id}, handling exhaustion`);
    
    if (business.minutes_exhausted_behavior === "disable_ai") {
      // Option A: Disable AI and forward
      await Business.update(business.id, { ai_enabled: false });
      await forwardCallToBusiness(callId, business.public_phone_number);
      
      await CallSession.create({
        business_id: business.id,
        vapi_call_id: callId,
        caller_number: callerNumber,
        status: "forwarded_no_minutes",
        started_at: new Date(),
      });
      return;
    } else if (business.minutes_exhausted_behavior === "allow_overage") {
      // Option B: Check overage cap
      if (business.overage_cap_minutes && minutesCheck.overageMinutes >= business.overage_cap_minutes) {
        // Cap reached, disable AI
        await Business.update(business.id, { ai_enabled: false });
        await forwardCallToBusiness(callId, business.public_phone_number);
        
        await CallSession.create({
          business_id: business.id,
          vapi_call_id: callId,
          caller_number: callerNumber,
          status: "forwarded_overage_cap",
          started_at: new Date(),
        });
        return;
      }
      // Under cap, allow call with overage billing
    }
  }

  // Create call session record
  try {
    await CallSession.create({
      business_id: business.id,
      vapi_call_id: callId,
      caller_number: callerNumber,
      status: "active",
      started_at: new Date(),
      transfer_attempted: false,
    });
    console.log(`[VAPI Webhook] ✅ Call session created for call ${callId}`);
  } catch (error) {
    console.error(`[VAPI Webhook] ❌ Error creating call session:`, error);
    // Don't throw - continue processing
  }
}

/**
 * Handle call-end event
 */
async function handleCallEnd(event) {
  const call = event.call || event;
  const callId = call.id || call.callId;
  const duration = call.duration || call.durationSeconds || 0;
  const durationMinutes = Math.ceil(duration / 60); // Round up to nearest minute

  // Find call session
  const callSession = await CallSession.findByVapiCallId(callId);
  if (!callSession) {
    console.error(`[VAPI Webhook] Call session not found for call: ${callId}`);
    return;
  }

  // Get business
  const business = await Business.findById(callSession.business_id);
  if (!business) {
    console.error(`[VAPI Webhook] Business not found for call session: ${callSession.id}`);
    return;
  }

  // Only process if AI was actually active (not just forwarded)
  if (callSession.status === "forwarded" || callSession.status === "forwarded_no_minutes" || callSession.status === "forwarded_overage_cap") {
    // Call was forwarded, no AI interaction
    await CallSession.update(callSession.id, {
      status: "completed",
      ended_at: new Date(),
      duration_seconds: duration,
    });
    return;
  }

  // Get call summary from VAPI
  let transcript = "";
  let summary = "";
  let intent = "general";
  let vapiCallData = null;

  try {
    const callSummary = await getCallSummary(callId);
    transcript = callSummary.transcript || "";
    summary = callSummary.summary || "";
    
    // Get full call data for better message extraction
    const { getVapiClient } = await import("../services/vapi.js");
    const vapiClient = getVapiClient();
    const callResponse = await vapiClient.get(`/call/${callId}`);
    vapiCallData = callResponse.data;
    
    console.log(`[VAPI Webhook] Full call data:`, JSON.stringify(vapiCallData, null, 2).substring(0, 1000));
    
    // Determine intent from summary
    intent = determineIntent(summary, transcript);
    console.log(`[VAPI Webhook] Detected intent: ${intent}`);
  } catch (error) {
    console.error(`[VAPI Webhook] Error getting call summary:`, error);
  }

  // Update call session
  await CallSession.update(callSession.id, {
    status: "completed",
    ended_at: new Date(),
    duration_seconds: duration,
    transcript: transcript,
    intent: intent,
    message_taken: intent === "callback" || intent === "message",
  });

  // Record usage (minutes)
  await recordCallUsage(business.id, callSession.id, durationMinutes);

  // Extract message if callback/message intent OR if summary/transcript indicates a message was taken
  // Be more lenient - if transcript mentions taking a message, callback, or contact info, create message
  const shouldCreateMessage = intent === "callback" || 
                              intent === "message" || 
                              summary.toLowerCase().includes("message") ||
                              summary.toLowerCase().includes("callback") ||
                              summary.toLowerCase().includes("call back") ||
                              transcript.toLowerCase().includes("taking a message") ||
                              transcript.toLowerCase().includes("leave a message");
  
  if (shouldCreateMessage) {
    console.log(`[VAPI Webhook] Creating message record - Intent: ${intent}`);
    const messageData = extractMessageFromTranscript(transcript, summary, vapiCallData);
    
    if (messageData && (messageData.name !== "Unknown" || messageData.phone || messageData.message)) {
      try {
        const createdMessage = await Message.create({
          business_id: business.id,
          call_session_id: callSession.id,
          caller_name: messageData.name,
          caller_phone: messageData.phone || callSession.caller_number,
          caller_email: messageData.email,
          message_text: messageData.message || summary || transcript,
          reason: messageData.reason || intent,
          status: "new",
        });
        console.log(`[VAPI Webhook] ✅ Message created: ${createdMessage.id}`);
      } catch (msgError) {
        console.error(`[VAPI Webhook] ❌ Error creating message:`, msgError);
      }
    } else {
      console.log(`[VAPI Webhook] ⚠️  Message data insufficient, not creating message record`);
    }
  }

  // Send notifications
  if (business.email_ai_answered) {
    // Check if a message was created - if so, include message details in email
    const messages = await Message.findByBusinessId(business.id, 1);
    const latestMessage = messages && messages.length > 0 && 
                         messages[0].call_session_id === callSession.id ? messages[0] : null;
    
    await sendCallSummaryEmail(
      business, 
      callSession, 
      transcript, 
      summary, 
      intent,
      latestMessage // Pass message if one was created
    );
  }

  // Send SMS if enabled and urgent
  if (business.sms_enabled && (intent === "urgent" || intent === "callback")) {
    await sendSMSNotification(business, callSession, summary);
  }
}

/**
 * Handle transfer-started event
 */
async function handleTransferStarted(event) {
  const call = event.call || event;
  const callId = call.id || call.callId;

  const callSession = await CallSession.findByVapiCallId(callId);
  if (callSession) {
    await CallSession.update(callSession.id, {
      transfer_attempted: true,
      transfer_timestamp: new Date(),
    });
  }
}

/**
 * Handle transfer-failed event
 */
async function handleTransferFailed(event) {
  const call = event.call || event;
  const callId = call.id || call.callId;

  const callSession = await CallSession.findByVapiCallId(callId);
  if (callSession) {
    await CallSession.update(callSession.id, {
      transfer_successful: false,
    });
  }
}

/**
 * Handle call-returned event (call returned after transfer failure)
 */
async function handleCallReturned(event) {
  const call = event.call || event;
  const callId = call.id || call.callId;

  // Call returned after transfer failure
  // AI should NOT attempt another transfer
  // This is handled in the assistant template logic
  console.log(`[VAPI Webhook] Call ${callId} returned after transfer failure`);
}

/**
 * Handle function-call event (if needed)
 */
async function handleFunctionCall(event) {
  // Handle any function calls from VAPI assistant
  console.log(`[VAPI Webhook] Function call:`, event);
}

/**
 * Determine call intent from summary/transcript
 */
function determineIntent(summary, transcript) {
  const text = (summary + " " + transcript).toLowerCase();
  
  if (text.includes("callback") || text.includes("call back") || text.includes("call me")) {
    return "callback";
  }
  if (text.includes("hours") || text.includes("open") || text.includes("close")) {
    return "hours";
  }
  if (text.includes("catering") || text.includes("cater")) {
    return "catering";
  }
  if (text.includes("complaint") || text.includes("problem") || text.includes("issue")) {
    return "complaint";
  }
  if (text.includes("urgent") || text.includes("asap") || text.includes("immediately")) {
    return "urgent";
  }
  if (text.includes("message") || text.includes("leave a message")) {
    return "message";
  }
  
  return "general";
}

/**
 * Extract message data from transcript, summary, and VAPI call data
 */
function extractMessageFromTranscript(transcript, summary, vapiCallData = null) {
  // Combine all text for extraction
  const fullText = `${summary || ""} ${transcript || ""}`.toLowerCase();
  
  let name = "";
  let phone = "";
  let email = "";
  let message = summary || transcript || "";
  let reason = "";

  // Try to extract from VAPI structured data first (if available)
  if (vapiCallData) {
    // Check for structured message data in VAPI response
    if (vapiCallData.metadata?.callerName) {
      name = vapiCallData.metadata.callerName;
    }
    if (vapiCallData.metadata?.callerPhone) {
      phone = vapiCallData.metadata.callerPhone;
    }
    if (vapiCallData.metadata?.callerEmail) {
      email = vapiCallData.metadata.callerEmail;
    }
    if (vapiCallData.metadata?.message) {
      message = vapiCallData.metadata.message;
    }
  }

  // Fallback: Extract from transcript/summary text
  const lines = (transcript || "").split("\n");
  
  // Extract name - look for patterns like "name is John" or "my name is John"
  if (!name || name === "Unknown") {
    const namePatterns = [
      /(?:name is|my name is|this is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:name|caller)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:here|speaking|calling)/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        name = match[1].trim();
        break;
      }
    }
  }

  // Extract phone - look for phone number patterns
  if (!phone) {
    const phonePatterns = [
      /(?:phone|number|call me at|reach me at)[:\s]*([+]?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
      /([+]?1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
    ];
    
    for (const pattern of phonePatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        phone = match[1].replace(/[-.\s()]/g, "");
        if (phone.length === 10 && !phone.startsWith("+")) {
          phone = "+1" + phone;
        } else if (phone.length === 11 && phone.startsWith("1")) {
          phone = "+" + phone;
        }
        break;
      }
    }
  }

  // Extract email
  if (!email) {
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const match = fullText.match(emailPattern);
    if (match) {
      email = match[1];
    }
  }

  // Extract message/reason from summary or transcript
  if (summary) {
    // Look for key phrases that indicate what the caller wants
    if (summary.toLowerCase().includes("reservation") || summary.toLowerCase().includes("book")) {
      reason = "Reservation";
    } else if (summary.toLowerCase().includes("catering")) {
      reason = "Catering";
    } else if (summary.toLowerCase().includes("hours") || summary.toLowerCase().includes("open")) {
      reason = "Hours Inquiry";
    } else if (summary.toLowerCase().includes("complaint")) {
      reason = "Complaint";
    } else {
      reason = "General Inquiry";
    }
    
    // Use summary as message if it's detailed
    if (summary.length > 50) {
      message = summary;
    }
  }

  console.log(`[Message Extraction] Extracted:`, {
    name: name || "Unknown",
    phone: phone || "None",
    email: email || "None",
    reason: reason || "General inquiry",
    messageLength: message.length,
  });

  return {
    name: name || "Unknown",
    phone: phone || "",
    email: email || "",
    message: message || summary || transcript || "No message provided",
    reason: reason || "General inquiry",
  };
}

export default router;

