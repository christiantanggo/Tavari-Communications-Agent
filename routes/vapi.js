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
 * Note: express.json() is already applied globally in server.js, so we don't need it here
 */
router.post("/webhook", async (req, res) => {
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
      return res.status(400).json({ error: "Missing event type" });
    }

    console.log(`[VAPI Webhook] 📞 Received event: ${eventType}`, {
      callId: event.call?.id,
      assistantId: event.call?.assistant?.id,
      businessId: event.call?.assistant?.metadata?.businessId,
      callerNumber: event.call?.customer?.number,
      fullEvent: JSON.stringify(event, null, 2).substring(0, 500), // First 500 chars for debugging
    });

    // Handle different event types
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

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[VAPI Webhook] Error:", error);
    res.status(500).json({ error: error.message });
  }
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

  try {
    const callSummary = await getCallSummary(callId);
    transcript = callSummary.transcript || "";
    summary = callSummary.summary || "";
    
    // Determine intent from summary
    intent = determineIntent(summary, transcript);
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

  // Extract message if callback/message intent
  if (intent === "callback" || intent === "message") {
    const messageData = extractMessageFromTranscript(transcript, summary);
    if (messageData) {
      await Message.create({
        business_id: business.id,
        call_session_id: callSession.id,
        caller_name: messageData.name,
        caller_phone: callSession.caller_number,
        caller_email: messageData.email,
        message_text: messageData.message,
        reason: messageData.reason,
        status: "new",
      });
    }
  }

  // Send notifications
  if (business.email_ai_answered) {
    await sendCallSummaryEmail(business, callSession, transcript, summary, intent);
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
 * Extract message data from transcript
 */
function extractMessageFromTranscript(transcript, summary) {
  // Simple extraction - can be enhanced with AI parsing
  const lines = transcript.split("\n");
  let name = "";
  let phone = "";
  let email = "";
  let message = summary || transcript;
  let reason = "";

  // Try to extract name and phone from transcript
  for (const line of lines) {
    if (line.toLowerCase().includes("name") || line.toLowerCase().includes("caller")) {
      const nameMatch = line.match(/(?:name|caller)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if (nameMatch) name = nameMatch[1];
    }
    if (line.includes("phone") || line.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/)) {
      const phoneMatch = line.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
      if (phoneMatch) phone = phoneMatch[1];
    }
    if (line.includes("@")) {
      const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) email = emailMatch[1];
    }
  }

  return {
    name: name || "Unknown",
    phone: phone || "",
    email: email || "",
    message: message,
    reason: reason || "General inquiry",
  };
}

export default router;

