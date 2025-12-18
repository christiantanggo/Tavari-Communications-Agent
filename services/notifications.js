// services/notifications.js
// Email and SMS notification service using Supabase Edge Function (mail-send) and Telnyx

import axios from "axios";
import { renderEmailTemplate } from "./emailTemplates.js";
import { formatPhoneNumber } from "../utils/phoneFormatter.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FROM_EMAIL = process.env.AWS_SES_FROM_EMAIL || "noreply@tavari.com";
const FROM_NAME = "Tavari";
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

/**
 * Send email using Supabase Edge Function (mail-send)
 */
async function sendEmail(to, subject, bodyText, bodyHtml = null, displayName = null, businessId = null, attachments = null) {
  console.log("[Notifications] ========== SEND EMAIL START ==========");
  console.log("[Notifications] To:", to);
  console.log("[Notifications] Subject:", subject);
  console.log("[Notifications] From Email:", FROM_EMAIL);
  console.log("[Notifications] From Name:", displayName || FROM_NAME);
  console.log("[Notifications] Business ID:", businessId);
  console.log("[Notifications] Has Attachments:", attachments ? attachments.length : 0);
  
  try {
    console.log("[Notifications] Step 1: Checking environment variables...");
    console.log("[Notifications] SUPABASE_URL:", SUPABASE_URL ? "SET" : "MISSING");
    console.log("[Notifications] SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "SET" : "MISSING");
    console.log("[Notifications] SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING");
    console.log("[Notifications] FROM_EMAIL:", FROM_EMAIL);
    
    if (!SUPABASE_URL) {
      throw new Error("SUPABASE_URL must be set");
    }
    
    // Use service role key as fallback if anon key is not available
    const apiKey = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey) {
      throw new Error("Either SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY must be set");
    }

    const emailPayload = {
      businessId: businessId || "system",
      campaignId: `email-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      contactId: `email-${to}-${Date.now()}`,
      to: to,
      fromEmail: FROM_EMAIL,
      fromName: displayName || FROM_NAME,
      subject: subject,
      html: bodyHtml || bodyText,
      text: bodyText,
    };

    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/mail-send`;
    console.log("[Notifications] Step 2: Calling Edge Function...");
    console.log("[Notifications] URL:", edgeFunctionUrl);
    console.log("[Notifications] Payload:", JSON.stringify({
      ...emailPayload,
      html: emailPayload.html ? `${emailPayload.html.substring(0, 100)}...` : null,
      text: emailPayload.text ? `${emailPayload.text.substring(0, 100)}...` : null,
    }, null, 2));

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    console.log("[Notifications] Step 3: Edge Function response received");
    console.log("[Notifications] Status:", response.status);
    console.log("[Notifications] Status Text:", response.statusText);
    console.log("[Notifications] Headers:", Object.fromEntries(response.headers.entries()));

    const result = await response.json();
    console.log("[Notifications] Response body:", JSON.stringify(result, null, 2));
    
    if (!response.ok) {
      console.error("[Notifications] ❌ Edge Function returned error");
      throw new Error(result.error || `Email send failed: ${response.status}`);
    }
    
    console.log(`[Notifications] ✅ Email sent to ${to}: ${result.messageId || "success"}`);
    console.log("[Notifications] ========== SEND EMAIL SUCCESS ==========");
    return result;
  } catch (error) {
    console.error(`[Notifications] ========== SEND EMAIL ERROR ==========`);
    console.error(`[Notifications] Error sending email to ${to}:`, error.message);
    console.error(`[Notifications] Error stack:`, error.stack);
    console.error(`[Notifications] Full error:`, JSON.stringify(error, null, 2));
    throw error;
  }
}

/**
 * Send call summary email
 */
export async function sendCallSummaryEmail(business, callSession, transcript, summary, intent, message = null, forceEmail = false) {
  console.log("[Call Summary Email] ========== CALL SUMMARY EMAIL START ==========");
  console.log("[Call Summary Email] Business:", {
    id: business.id,
    name: business.name,
    email: business.email,
    email_ai_answered: business.email_ai_answered,
    forceEmail: forceEmail,
  });
  
  // CRITICAL: If forceEmail is true (for callbacks/messages), ALWAYS send email regardless of email_ai_answered setting
  if (!forceEmail && !business.email_ai_answered) {
    console.log("[Call Summary Email] ⚠️ Email disabled for AI-answered calls, skipping (not a callback/message)");
    return; // Email disabled for AI-answered calls (but not for callbacks/messages)
  }
  
  if (forceEmail) {
    console.log("[Call Summary Email] 🔥 FORCING EMAIL - This is a callback/message, email will be sent regardless of email_ai_answered setting");
  }

  try {
    console.log("[Call Summary Email] Step 1: Building template data...");
    const templateData = {
      business_name: business.name,
      caller_name: callSession.caller_name || message?.caller_name || "Unknown",
      caller_phone: formatPhoneNumber(callSession.caller_number || message?.caller_phone) || "Unknown",
      call_time: new Date(callSession.started_at).toLocaleString(),
      call_summary: summary || "No summary available",
      transcript: transcript || "No transcript available",
      message_taken: message ? true : false,
      message_text: message?.message_text || null,
      message_reason: message?.reason || null,
      caller_email: message?.caller_email || null,
    };

    // Try to use template, fallback to simple email if template doesn't exist
    let subject, bodyText, bodyHtml;
    try {
      const rendered = await renderEmailTemplate("call_summary", templateData);
      subject = rendered.subject;
      bodyText = rendered.bodyText;
      bodyHtml = rendered.bodyHtml;
    } catch (templateError) {
      // Template doesn't exist - create simple email
      console.warn(`[Notifications] Template not found, using fallback email`);
      subject = message 
        ? `New Message from ${templateData.caller_name} - ${business.name}`
        : `Call Summary - ${business.name}`;
      
      bodyText = message
        ? `New message received:\n\nCaller: ${templateData.caller_name}\nPhone: ${templateData.caller_phone}\n${templateData.caller_email ? `Email: ${templateData.caller_email}\n` : ''}Message: ${templateData.message_text}\n\nCall Summary: ${templateData.call_summary}`
        : `Call received from ${templateData.caller_name} (${templateData.caller_phone})\n\nSummary: ${templateData.call_summary}`;
      
      bodyHtml = message
        ? `<h2>New Message Received</h2><p><strong>Caller:</strong> ${templateData.caller_name}<br><strong>Phone:</strong> ${templateData.caller_phone}${templateData.caller_email ? `<br><strong>Email:</strong> ${templateData.caller_email}` : ''}</p><p><strong>Message:</strong> ${templateData.message_text}</p><p><strong>Call Summary:</strong> ${templateData.call_summary}</p>`
        : `<h2>Call Summary</h2><p><strong>Caller:</strong> ${templateData.caller_name}<br><strong>Phone:</strong> ${templateData.caller_phone}</p><p><strong>Summary:</strong> ${templateData.call_summary}</p>`;
    }

    const displayName = `Tavari for ${business.name}`;
    
    console.log(`[Call Summary Email] Step 2: Sending email...`);
    console.log(`[Call Summary Email] To: ${business.email}`);
    console.log(`[Call Summary Email] Subject: ${subject}`);
    console.log(`[Call Summary Email] Display Name: ${displayName}`);
    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
    console.log(`[Call Summary Email] ✅ Call summary email sent successfully`);
    console.log("[Call Summary Email] ========== CALL SUMMARY EMAIL SUCCESS ==========");
  } catch (error) {
    console.error(`[Call Summary Email] ========== CALL SUMMARY EMAIL ERROR ==========`);
    console.error(`[Call Summary Email] Error sending call summary email:`, error.message);
    console.error(`[Call Summary Email] Error stack:`, error.stack);
    console.error(`[Call Summary Email] Full error:`, JSON.stringify(error, null, 2));
    // Don't throw - email failures shouldn't break the call flow
  }
}

/**
 * Send SMS notification (premium, 3x Telnyx cost)
 */
export async function sendSMSNotification(business, callSession, summary, message = null) {
  console.log("[SMS Notification] ========== SMS NOTIFICATION START ==========");
  console.log("[SMS Notification] Business:", {
    id: business.id,
    name: business.name,
    sms_enabled: business.sms_enabled,
    sms_notification_number: business.sms_notification_number,
    vapi_phone_number: business.vapi_phone_number,
  });
  
  if (!business.sms_enabled || !business.sms_notification_number) {
    console.log("[SMS Notification] ⚠️ SMS disabled or no notification number configured, skipping");
    return; // SMS disabled or no number configured
  }

  // Use the business's VAPI phone number as the sender (their business number)
  if (!business.vapi_phone_number) {
    console.error("[SMS Notification] ❌ Business phone number not provisioned - cannot send SMS");
    return;
  }

  console.log("[SMS Notification] Step 1: Checking Telnyx configuration...");
  console.log("[SMS Notification] TELNYX_API_KEY:", TELNYX_API_KEY ? "SET" : "MISSING");
  console.log("[SMS Notification] Business phone (FROM):", business.vapi_phone_number);
  console.log("[SMS Notification] Notification number (TO):", business.sms_notification_number);

  if (!TELNYX_API_KEY) {
    console.warn("[SMS Notification] ❌ Telnyx API key not configured");
    return;
  }

  try {
    // Build message text - include message details if available
    let messageText;
    if (message && message.message_text) {
      messageText = `New callback request from ${message.caller_name || callSession.caller_name || "Unknown"} (${formatPhoneNumber(message.caller_phone || callSession.caller_number)}). ${message.message_text.substring(0, 150)}`;
    } else {
      messageText = `New callback request from ${callSession.caller_name || "Unknown"} (${formatPhoneNumber(callSession.caller_number)}). ${summary?.substring(0, 100) || "See dashboard for details."}`;
    }
    console.log("[SMS Notification] Step 2: Building SMS message");
    console.log("[SMS Notification] Message:", messageText);
    
    // Format phone number for Telnyx (remove any formatting, ensure it starts with +)
    let fromNumber = business.vapi_phone_number.replace(/[^0-9+]/g, "");
    if (!fromNumber.startsWith("+")) {
      fromNumber = "+" + fromNumber;
    }
    
    let toNumber = business.sms_notification_number.replace(/[^0-9+]/g, "");
    if (!toNumber.startsWith("+")) {
      toNumber = "+" + toNumber;
    }
    
    console.log("[SMS Notification] From (formatted):", fromNumber);
    console.log("[SMS Notification] To (formatted):", toNumber);

    console.log("[SMS Notification] Step 3: Sending SMS via Telnyx API...");
    const response = await axios.post(
      "https://api.telnyx.com/v2/messages",
      {
        from: fromNumber,
        to: toNumber,
        text: messageText,
      },
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`[SMS Notification] ✅ SMS sent to ${business.sms_notification_number}`);
    console.log("[SMS Notification] Response:", JSON.stringify(response.data, null, 2));
    console.log("[SMS Notification] Message ID:", response.data.data.id);
    console.log("[SMS Notification] ========== SMS NOTIFICATION SUCCESS ==========");
    
    // Track SMS cost (3x Telnyx rate)
    // This will be handled by usage tracking service
    return response.data;
  } catch (error) {
    console.error(`[SMS Notification] ========== SMS NOTIFICATION ERROR ==========`);
    console.error(`[SMS Notification] Error sending SMS:`, error.message);
    console.error(`[SMS Notification] Error response:`, error.response?.data);
    console.error(`[SMS Notification] Error stack:`, error.stack);
    console.error(`[SMS Notification] Full error:`, JSON.stringify(error, null, 2));
    // Don't throw - SMS failures shouldn't break the call flow
  }
}

/**
 * Send usage notification (minutes almost used)
 */
export async function sendMinutesAlmostUsedNotification(business, minutesUsed, minutesTotal, minutesRemaining, resetDate) {
  if (!business.notify_minutes_almost_used) {
    return; // Notification disabled
  }

  try {
    const usagePercent = Math.round((minutesUsed / minutesTotal) * 100);
    const templateData = {
      minutes_used: minutesUsed,
      minutes_total: minutesTotal,
      usage_percent: usagePercent,
      minutes_remaining: minutesRemaining,
      reset_date: resetDate.toLocaleDateString(),
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("minutes_almost_used", templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending minutes almost used notification:`, error);
  }
}

/**
 * Send minutes fully used notification
 */
export async function sendMinutesFullyUsedNotification(business, minutesTotal, resetDate, optionA = true) {
  if (!business.notify_minutes_fully_used) {
    return; // Notification disabled (but mandatory notification will still be sent)
  }

  try {
    const templateData = {
      minutes_total: minutesTotal,
      option_a: optionA,
      option_b: !optionA,
      reset_date: resetDate.toLocaleDateString(),
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("minutes_fully_used", templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending minutes fully used notification:`, error);
  }
}

/**
 * Send overage charges notification
 */
export async function sendOverageChargesNotification(business, overageMinutes, overageRate, overageAmount, overageCap) {
  if (!business.notify_overage_charges) {
    return; // Notification disabled
  }

  try {
    const templateData = {
      overage_minutes: overageMinutes,
      overage_rate: overageRate.toFixed(2),
      overage_amount: overageAmount.toFixed(2),
      overage_cap: overageCap,
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("overage_charges", templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending overage charges notification:`, error);
  }
}

/**
 * Send mandatory AI disabled notification (cannot be disabled)
 */
export async function sendAIDisabledNotification(business, reason, details = {}) {
  try {
    let templateKey = "ai_disabled_manual";
    let templateData = { business_name: business.name };

    if (reason === "minutes_exhausted") {
      templateKey = "ai_disabled_minutes";
      templateData = {
        minutes_total: details.minutesTotal || business.usage_limit_minutes,
        reset_date: details.resetDate?.toLocaleDateString() || "Next billing date",
      };
    } else if (reason === "overage_cap") {
      templateKey = "ai_disabled_overage_cap";
      templateData = {
        overage_cap: details.overageCap || business.overage_cap_minutes,
        reset_date: details.resetDate?.toLocaleDateString() || "Next billing date",
      };
    } else if (reason === "payment_issue") {
      templateKey = "ai_disabled_payment";
      templateData = { business_name: business.name };
    }

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate(templateKey, templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending AI disabled notification:`, error);
  }
}

/**
 * Send mandatory AI resumed notification (cannot be disabled)
 */
export async function sendAIResumedNotification(business, minutesTotal, resetDate) {
  try {
    const templateData = {
      minutes_total: minutesTotal,
      reset_date: resetDate.toLocaleDateString(),
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("ai_resumed", templateData);
    const displayName = `Tavari for ${business.name}`;

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending AI resumed notification:`, error);
  }
}

/**
 * Send invoice email with PDF attachment
 */
export async function sendInvoiceEmail(business, invoice, pdfBuffer) {
  try {
    const templateData = {
      invoice_number: invoice.invoice_number,
      amount: invoice.amount.toFixed(2),
      invoice_type: invoice.invoice_type,
      period_start: invoice.period_start?.toLocaleDateString() || "N/A",
      period_end: invoice.period_end?.toLocaleDateString() || "N/A",
      prorated_amount: invoice.prorated_amount ? invoice.prorated_amount.toFixed(2) : null,
      prorated_days: invoice.prorated_days || null,
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("invoice", templateData);
    const displayName = `Tavari for ${business.name}`;

    // Convert PDF buffer to base64
    let attachments = null;
    if (pdfBuffer) {
      const base64PDF = pdfBuffer.toString('base64');
      attachments = [{
        filename: `Invoice-${invoice.invoice_number}.pdf`,
        content: base64PDF,
        contentType: 'application/pdf'
      }];
    }

    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id, attachments);
  } catch (error) {
    console.error(`[Notifications] Error sending invoice email:`, error);
    throw error;
  }
}

/**
 * Send missed call notification (for calls forwarded during business hours)
 */
export async function sendMissedCallEmail(business, callSession) {
  console.log("[Missed Call Email] ========== MISSED CALL EMAIL START ==========");
  console.log("[Missed Call Email] Business:", {
    id: business.id,
    name: business.name,
    email: business.email,
    email_missed_calls: business.email_missed_calls,
  });
  
  if (!business.email_missed_calls) {
    console.log("[Missed Call Email] ⚠️ Email disabled for missed calls, skipping");
    return; // Email disabled for missed calls
  }

  try {
    console.log("[Missed Call Email] Step 1: Building template data...");
    const templateData = {
      business_name: business.name,
      caller_name: callSession.caller_name || "Unknown",
      caller_phone: formatPhoneNumber(callSession.caller_number) || "Unknown",
      call_time: new Date(callSession.started_at).toLocaleString(),
      call_duration: callSession.duration_seconds ? `${Math.floor(callSession.duration_seconds / 60)}m ${callSession.duration_seconds % 60}s` : "N/A",
      forward_reason: callSession.status === "forwarded_no_minutes" 
        ? "AI minutes exhausted" 
        : callSession.status === "forwarded_overage_cap" 
        ? "Overage cap reached" 
        : "AI disabled or call forwarded",
    };

    // Try to use template, fallback to simple email if template doesn't exist
    let subject, bodyText, bodyHtml;
    try {
      const rendered = await renderEmailTemplate("missed_call", templateData);
      subject = rendered.subject;
      bodyText = rendered.bodyText;
      bodyHtml = rendered.bodyHtml;
    } catch (templateError) {
      // Template doesn't exist - create simple email
      console.warn(`[Missed Call Email] Template not found, using fallback email`);
      subject = `Missed Call - ${business.name}`;
      
      bodyText = `A call was forwarded to your business but couldn't be answered:\n\nCaller: ${templateData.caller_name}\nPhone: ${templateData.caller_phone}\nTime: ${templateData.call_time}\nDuration: ${templateData.call_duration}\nReason: ${templateData.forward_reason}\n\nThis call was forwarded to your business number but may not have been answered.`;
      
      bodyHtml = `<h2>Missed Call Notification</h2>
        <p>A call was forwarded to your business but couldn't be answered:</p>
        <ul>
          <li><strong>Caller:</strong> ${templateData.caller_name}</li>
          <li><strong>Phone:</strong> ${templateData.caller_phone}</li>
          <li><strong>Time:</strong> ${templateData.call_time}</li>
          <li><strong>Duration:</strong> ${templateData.call_duration}</li>
          <li><strong>Reason:</strong> ${templateData.forward_reason}</li>
        </ul>
        <p>This call was forwarded to your business number but may not have been answered.</p>`;
    }

    const displayName = `Tavari for ${business.name}`;
    
    console.log(`[Missed Call Email] Step 2: Sending email...`);
    console.log(`[Missed Call Email] To: ${business.email}`);
    console.log(`[Missed Call Email] Subject: ${subject}`);
    console.log(`[Missed Call Email] Display Name: ${displayName}`);
    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
    console.log(`[Missed Call Email] ✅ Missed call email sent successfully`);
    console.log("[Missed Call Email] ========== MISSED CALL EMAIL SUCCESS ==========");
  } catch (error) {
    console.error(`[Missed Call Email] ========== MISSED CALL EMAIL ERROR ==========`);
    console.error(`[Missed Call Email] Error sending missed call email:`, error.message);
    console.error(`[Missed Call Email] Error stack:`, error.stack);
    console.error(`[Missed Call Email] Full error:`, JSON.stringify(error, null, 2));
    // Don't throw - email failures shouldn't break the call flow
  }
}

/**
 * Send support ticket notification to Tavari staff
 */
export async function sendSupportTicketNotification(ticket, business) {
  try {
    const templateData = {
      ticket_id: ticket.id,
      business_name: business.name,
      issue_type: ticket.issue_type,
      description: ticket.description,
      urgency: ticket.urgency,
    };

    const { subject, bodyText, bodyHtml } = await renderEmailTemplate("support_ticket_created", templateData);

    // Send to Tavari support email
    const supportEmail = process.env.SUPPORT_EMAIL || "support@tavari.com";
    await sendEmail(supportEmail, subject, bodyText, bodyHtml, "Tavari Support", business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending support ticket notification:`, error);
  }
}

