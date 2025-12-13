import { AIAgent } from '../models/AIAgent.js';
import { Business } from '../models/Business.js';

export class BusinessLogicService {
  // Check if business is currently open
  static isBusinessOpen(businessHours, timezone = 'America/New_York') {
    const now = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = dayNames[now.getDay()];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    
    const todayHours = businessHours[currentDay];
    
    if (!todayHours || todayHours.closed) {
      return false;
    }
    
    const openTime = todayHours.open || '09:00';
    const closeTime = todayHours.close || '17:00';
    
    return currentTime >= openTime && currentTime <= closeTime;
  }
  
  // Get greeting based on business hours
  static getGreeting(agentConfig, businessHours) {
    const isOpen = this.isBusinessOpen(businessHours);
    const baseGreeting = agentConfig.greeting_text || 'Hello! Thank you for calling. How can I help you today?';
    
    if (!isOpen) {
      return `${baseGreeting} I notice we're currently closed. Would you like to leave a message?`;
    }
    
    return baseGreeting;
  }
  
  // Check if question matches any FAQ
  static findMatchingFAQ(question, faqs) {
    if (!faqs || faqs.length === 0) {
      return null;
    }
    
    const lowerQuestion = question.toLowerCase();
    
    for (const faq of faqs) {
      const lowerFAQQuestion = faq.question.toLowerCase();
      const lowerFAQKeywords = (faq.keywords || []).map(k => k.toLowerCase());
      
      // Check if question contains FAQ question or keywords
      if (lowerQuestion.includes(lowerFAQQuestion) || 
          lowerFAQKeywords.some(keyword => lowerQuestion.includes(keyword))) {
        return faq;
      }
    }
    
    return null;
  }
  
  // Extract message details from transcript
  static extractMessageDetails(transcript, messageSettings) {
    const details = {
      name: null,
      phone: null,
      email: null,
      reason: null,
      message: transcript,
    };
    
    // Simple extraction patterns (could be enhanced with NLP)
    const phonePattern = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    
    const phoneMatch = transcript.match(phonePattern);
    if (phoneMatch) {
      details.phone = phoneMatch[0].replace(/\D/g, '');
    }
    
    const emailMatch = transcript.match(emailPattern);
    if (emailMatch) {
      details.email = emailMatch[0];
    }
    
    // Extract name (look for "my name is" or "I'm" patterns)
    const namePatterns = [
      /(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:call me|name's)\s+([A-Z][a-z]+)/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = transcript.match(pattern);
      if (match) {
        details.name = match[1];
        break;
      }
    }
    
    // Extract reason (look for "because", "about", "regarding" patterns)
    const reasonPatterns = [
      /(?:because|about|regarding|concerning|for)\s+(.+?)(?:\.|,|$)/i,
      /(?:reason|purpose|calling)\s+(?:is|for)\s+(.+?)(?:\.|,|$)/i,
    ];
    
    for (const pattern of reasonPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        details.reason = match[1].trim();
        break;
      }
    }
    
    return details;
  }
  
  // Validate message completeness
  static validateMessage(messageDetails, messageSettings) {
    const missing = [];
    
    if (messageSettings.ask_name && !messageDetails.name) {
      missing.push('name');
    }
    
    if (messageSettings.ask_phone && !messageDetails.phone) {
      missing.push('phone number');
    }
    
    if (messageSettings.ask_email && !messageDetails.email) {
      missing.push('email');
    }
    
    if (messageSettings.ask_reason && !messageDetails.reason) {
      missing.push('reason for calling');
    }
    
    return {
      complete: missing.length === 0,
      missing,
    };
  }
  
  // Generate message summary
  static generateMessageSummary(messageDetails) {
    let summary = 'Message Summary:\n';
    
    if (messageDetails.name) {
      summary += `Name: ${messageDetails.name}\n`;
    }
    
    if (messageDetails.phone) {
      summary += `Phone: ${messageDetails.phone}\n`;
    }
    
    if (messageDetails.email) {
      summary += `Email: ${messageDetails.email}\n`;
    }
    
    if (messageDetails.reason) {
      summary += `Reason: ${messageDetails.reason}\n`;
    }
    
    summary += `Message: ${messageDetails.message}`;
    
    return summary;
  }
  
  // Check usage limits and return status
  static async checkUsageStatus(businessId) {
    const business = await Business.findById(businessId);
    if (!business) {
      return { allowed: false, reason: 'Business not found' };
    }
    
    const { UsageMinutes } = await import('../models/UsageMinutes.js');
    const currentUsage = await UsageMinutes.getCurrentMonthUsage(businessId);
    const limit = business.usage_limit_minutes || 1000;
    
    if (currentUsage >= limit) {
      return {
        allowed: false,
        reason: 'Usage limit reached',
        usage: currentUsage,
        limit,
        percentage: 100,
      };
    }
    
    const percentage = (currentUsage / limit) * 100;
    const warning = percentage >= 80;
    
    return {
      allowed: true,
      usage: currentUsage,
      limit,
      percentage: Math.round(percentage),
      warning,
    };
  }
}

