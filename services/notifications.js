// services/notifications.js
// Email and SMS notification service using Supabase Edge Function (mail-send) and Telnyx

import axios from "axios";
import { renderEmailTemplate } from "./emailTemplates.js";
import { formatPhoneNumber } from "../utils/phoneFormatter.js";
import { supabaseClient } from "../config/database.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const FROM_EMAIL = process.env.AWS_SES_FROM_EMAIL || "noreply@tavari.com";
const FROM_NAME = "Tavari";
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_SMS_NUMBER = process.env.TELNYX_SMS_NUMBER;

/**
 * Send email using Supabase Edge Function (mail-send)
 */
async function sendEmail(to, subject, bodyText, bodyHtml = null, displayName = null, businessId = null, attachments = null) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
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

    const response = await fetch(`${SUPABASE_URL}/functions/v1/mail-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || `Email send failed: ${response.status}`);
    }
    
    console.log(`[Notifications] Email sent to ${to}: ${result.messageId || "success"}`);
    return result;
  } catch (error) {
    console.error(`[Notifications] Error sending email to ${to}:`, error);
    throw error;
  }
}

/**
 * Send call summary email
 */
export async function sendCallSummaryEmail(business, callSession, transcript, summary, intent, message = null) {
  if (!business.email_ai_answered) {
    return; // Email disabled for AI-answered calls
  }

  try {
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
    
    console.log(`[Notifications] Sending call summary email to ${business.email}`);
    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
    console.log(`[Notifications] ✅ Call summary email sent successfully`);
  } catch (error) {
    console.error(`[Notifications] Error sending call summary email:`, error);
    // Don't throw - email failures shouldn't break the call flow
  }
}

/**
 * Send SMS notification (premium, 3x Telnyx cost)
 */
export async function sendSMSNotification(business, callSession, summary) {
  if (!business.sms_enabled || !business.sms_notification_number) {
    return; // SMS disabled or no number configured
  }

  if (!TELNYX_API_KEY || !TELNYX_SMS_NUMBER) {
    console.warn("[Notifications] Telnyx SMS not configured");
    return;
  }

  try {
    const message = `New callback request from ${callSession.caller_name || "Unknown"} (${formatPhoneNumber(callSession.caller_number)}). ${summary?.substring(0, 100) || "See dashboard for details."}`;

    const response = await axios.post(
      "https://api.telnyx.com/v2/messages",
      {
        from: TELNYX_SMS_NUMBER,
        to: business.sms_notification_number,
        text: message,
      },
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`[Notifications] SMS sent to ${business.sms_notification_number}: ${response.data.data.id}`);
    
    // Track SMS cost (3x Telnyx rate)
    // This will be handled by usage tracking service
    return response.data;
  } catch (error) {
    console.error(`[Notifications] Error sending SMS:`, error);
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

    // TODO: Add PDF attachment support to SES
    // For now, send email with link to download PDF
    await sendEmail(business.email, subject, bodyText, bodyHtml, displayName, business.id);
  } catch (error) {
    console.error(`[Notifications] Error sending invoice email:`, error);
    throw error;
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

