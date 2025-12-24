// routes/diagnostics.js
// Diagnostic endpoints to help debug dashboard issues

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';
import { CallSession } from '../models/CallSession.js';
import { Message } from '../models/Message.js';
import { UsageMinutes } from '../models/UsageMinutes.js';

const router = express.Router();

// Check assistant webhook configuration without rebuilding
router.get('/check-webhook', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (!business.vapi_assistant_id) {
      return res.status(400).json({ 
        error: 'No VAPI assistant ID found',
        message: 'Please provision a phone number first'
      });
    }

    // Get assistant config from VAPI
    const { getVapiClient } = await import('../services/vapi.js');
    const vapiClient = getVapiClient();
    const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
    const assistant = assistantResponse.data;

    // Expected webhook URL
    let backendUrl = process.env.BACKEND_URL || 
                      process.env.RAILWAY_PUBLIC_DOMAIN || 
                      process.env.VERCEL_URL || 
                      process.env.SERVER_URL ||
                      "https://api.tavarios.com";
    
    // Ensure URL has https:// protocol
    if (backendUrl && !backendUrl.startsWith('http://') && !backendUrl.startsWith('https://')) {
      backendUrl = `https://${backendUrl}`;
    }
    
    const expectedWebhookUrl = `${backendUrl}/api/vapi/webhook`;

    // Normalize URLs for comparison (remove trailing slashes, lowercase)
    const normalizeUrl = (url) => {
      if (!url) return '';
      return url.toLowerCase().replace(/\/$/, '');
    };

    // Check for issues
    const issues = [];
    if (!assistant.serverUrl) {
      issues.push('❌ CRITICAL: serverUrl is NOT SET - webhooks will not be sent!');
    } else if (normalizeUrl(assistant.serverUrl) !== normalizeUrl(expectedWebhookUrl)) {
      issues.push(`⚠️ serverUrl mismatch: expected ${expectedWebhookUrl}, got ${assistant.serverUrl}`);
    }

    if (!assistant.serverMessages || assistant.serverMessages.length === 0) {
      issues.push('❌ CRITICAL: serverMessages is NOT SET - webhooks will not be sent!');
    } else {
      const requiredMessages = ['status-update', 'end-of-call-report'];
      const missing = requiredMessages.filter(msg => !assistant.serverMessages.includes(msg));
      if (missing.length > 0) {
        issues.push(`⚠️ Missing required serverMessages: ${missing.join(', ')}`);
      }
    }

    res.json({
      business: {
        id: business.id,
        name: business.name,
        vapi_assistant_id: business.vapi_assistant_id,
        vapi_phone_number: business.vapi_phone_number,
      },
      assistant: {
        id: assistant.id,
        name: assistant.name,
        serverUrl: assistant.serverUrl || 'NOT SET',
        serverMessages: assistant.serverMessages || [],
        metadata: assistant.metadata || {},
      },
      expected: {
        webhookUrl: expectedWebhookUrl,
        serverMessages: ['status-update', 'end-of-call-report', 'function-call', 'hang'],
      },
      status: {
        webhookUrlConfigured: normalizeUrl(assistant.serverUrl) === normalizeUrl(expectedWebhookUrl),
        serverMessagesConfigured: assistant.serverMessages && assistant.serverMessages.length > 0,
        hasBusinessIdInMetadata: !!assistant.metadata?.businessId,
        allGood: issues.length === 0,
      },
      issues: issues,
      fix: issues.length > 0 ? 'Call POST /api/diagnostics/rebuild-assistant to fix' : null,
    });
  } catch (error) {
    console.error('[Diagnostics] Error checking webhook:', error);
    res.status(500).json({ 
      error: 'Failed to check webhook configuration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get diagnostic information for the current business
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get recent calls
    const recentCalls = await CallSession.findByBusinessId(req.businessId, 10);
    
    // Get recent messages
    const recentMessages = await Message.findByBusinessId(req.businessId, 10);
    
    // Get usage for current billing cycle
    const { getCurrentCycleUsage } = await import('../services/usage.js');
    const usage = await getCurrentCycleUsage(req.businessId);
    
    // Check VAPI assistant configuration
    let assistantConfig = null;
    if (business.vapi_assistant_id) {
      try {
        const { getVapiClient } = await import('../services/vapi.js');
        const vapiClient = getVapiClient();
        const assistantResponse = await vapiClient.get(`/assistant/${business.vapi_assistant_id}`);
        assistantConfig = {
          id: assistantResponse.data.id,
          name: assistantResponse.data.name,
          serverUrl: assistantResponse.data.serverUrl,
          serverMessages: assistantResponse.data.serverMessages || [],
          metadata: assistantResponse.data.metadata || {},
        };
      } catch (error) {
        console.error('[Diagnostics] Error fetching assistant config:', error.message);
      }
    }

    // Check webhook endpoint accessibility
    const backendUrl = process.env.BACKEND_URL || 
                      process.env.RAILWAY_PUBLIC_DOMAIN || 
                      process.env.VERCEL_URL || 
                      process.env.SERVER_URL ||
                      "https://api.tavarios.com";
    const expectedWebhookUrl = `${backendUrl}/api/vapi/webhook`;

    res.json({
      business: {
        id: business.id,
        name: business.name,
        vapi_assistant_id: business.vapi_assistant_id,
        vapi_phone_number: business.vapi_phone_number,
        email_ai_answered: business.email_ai_answered,
        email_missed_calls: business.email_missed_calls,
        notification_email: business.notification_email || business.email,
      },
      assistant: assistantConfig,
      webhook: {
        expectedUrl: expectedWebhookUrl,
        configured: assistantConfig?.serverUrl === expectedWebhookUrl,
        serverMessagesConfigured: assistantConfig?.serverMessages?.length > 0,
        metadataConfigured: !!assistantConfig?.metadata?.businessId,
      },
      data: {
        recentCallsCount: recentCalls?.length || 0,
        recentMessagesCount: recentMessages?.length || 0,
        usageMinutes: usage?.totalMinutes || 0,
        recentCalls: recentCalls?.slice(0, 5) || [],
        recentMessages: recentMessages?.slice(0, 5) || [],
      },
      issues: [
        !business.vapi_assistant_id && 'No VAPI assistant ID configured',
        !business.vapi_phone_number && 'No phone number assigned',
        assistantConfig && assistantConfig.serverUrl !== expectedWebhookUrl && 'Webhook URL mismatch',
        assistantConfig && (!assistantConfig.serverMessages || assistantConfig.serverMessages.length === 0) && 'No serverMessages configured in assistant',
        assistantConfig && !assistantConfig.metadata?.businessId && 'BusinessId not in assistant metadata',
        recentCalls?.length === 0 && 'No call sessions found',
        recentMessages?.length === 0 && 'No messages found',
        usage?.totalMinutes === 0 && 'No usage minutes recorded',
      ].filter(Boolean),
    });
  } catch (error) {
    console.error('[Diagnostics] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get diagnostics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rebuild assistant with businessId in metadata
router.post('/rebuild-assistant', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (!business.vapi_assistant_id) {
      return res.status(400).json({ 
        error: 'No VAPI assistant ID found',
        message: 'Please provision a phone number first'
      });
    }

    console.log(`[Diagnostics] Rebuilding assistant for business: ${business.id}`);
    const { rebuildAssistant } = await import('../services/vapi.js');
    await rebuildAssistant(business.id);

    res.json({ 
      success: true,
      message: 'Assistant rebuilt successfully with businessId in metadata'
    });
  } catch (error) {
    console.error('[Diagnostics] Error rebuilding assistant:', error);
    res.status(500).json({ 
      error: 'Failed to rebuild assistant',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get recent call sessions to check if webhooks are working
router.get('/recent-activity', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get recent calls (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { supabaseClient } = await import('../config/database.js');
    const { data: recentCalls, error: callsError } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('business_id', business.id)
      .gte('started_at', sevenDaysAgo.toISOString())
      .order('started_at', { ascending: false })
      .limit(50);

    if (callsError) {
      console.error('[Diagnostics] Error fetching recent calls:', callsError);
    }

    // Get recent messages (last 7 days)
    const { data: recentMessages, error: messagesError } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('business_id', business.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (messagesError) {
      console.error('[Diagnostics] Error fetching recent messages:', messagesError);
    }

    // Get usage for last 7 days
    const { UsageMinutes } = await import('../models/UsageMinutes.js');
    const usage = await UsageMinutes.getMonthlyUsage(
      business.id,
      new Date().getFullYear(),
      new Date().getMonth() + 1
    );

    res.json({
      business: {
        id: business.id,
        name: business.name,
        vapi_assistant_id: business.vapi_assistant_id,
        vapi_phone_number: business.vapi_phone_number,
      },
      recentActivity: {
        calls: {
          count: recentCalls?.length || 0,
          lastCall: recentCalls && recentCalls.length > 0 ? recentCalls[0].started_at : null,
          calls: recentCalls?.slice(0, 10) || [],
        },
        messages: {
          count: recentMessages?.length || 0,
          lastMessage: recentMessages && recentMessages.length > 0 ? recentMessages[0].created_at : null,
          messages: recentMessages?.slice(0, 10) || [],
        },
        usage: {
          totalMinutes: usage?.totalMinutes || 0,
          overageMinutes: usage?.overageMinutes || 0,
        },
      },
      summary: {
        hasRecentCalls: (recentCalls?.length || 0) > 0,
        hasRecentMessages: (recentMessages?.length || 0) > 0,
        hasUsage: (usage?.totalMinutes || 0) > 0,
        lastActivity: recentCalls?.[0]?.started_at || recentMessages?.[0]?.created_at || null,
      },
    });
  } catch (error) {
    console.error('[Diagnostics] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get recent activity',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;

