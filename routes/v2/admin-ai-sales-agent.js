import express from 'express';
import { authenticateAdmin } from '../../middleware/adminAuth.js';
import {
  ensureAISalesSettings,
  getAISalesOverview,
  updateAISalesSettings,
  listAISalesCampaigns,
  upsertAISalesCampaign,
  updateAISalesCampaignStatus,
  listAISalesLeads,
  listAISalesThreads,
  runAISalesLeadGeneration,
  runAISalesDailyCycle,
} from '../../services/ai-sales-agent.js';
import { supabaseClient } from '../../config/database.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/overview', async (_req, res) => {
  try {
    const overview = await getAISalesOverview();
    res.json(overview);
  } catch (error) {
    console.error('[GET /api/v2/admin/ai-sales-agent/overview] Error:', error);
    res.status(500).json({ error: 'Failed to load AI Sales Agent overview' });
  }
});

router.get('/settings', async (_req, res) => {
  try {
    const settings = await ensureAISalesSettings();
    res.json({ settings });
  } catch (error) {
    console.error('[GET /api/v2/admin/ai-sales-agent/settings] Error:', error);
    res.status(500).json({ error: 'Failed to load AI Sales Agent settings' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await updateAISalesSettings(req.body || {});
    res.json({ success: true, settings });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[PUT /api/v2/admin/ai-sales-agent/settings] Error:', error);
    res.status(status).json({ error: error.message || 'Failed to update AI Sales Agent settings' });
  }
});

router.get('/campaigns', async (_req, res) => {
  try {
    const campaigns = await listAISalesCampaigns();
    res.json({ campaigns });
  } catch (error) {
    console.error('[GET /api/v2/admin/ai-sales-agent/campaigns] Error:', error);
    res.status(500).json({ error: 'Failed to load campaigns' });
  }
});

router.post('/campaigns', async (req, res) => {
  try {
    const campaign = await upsertAISalesCampaign(req.body || {});
    res.json({ success: true, campaign });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[POST /api/v2/admin/ai-sales-agent/campaigns] Error:', error);
    res.status(status).json({ error: error.message || 'Failed to save campaign' });
  }
});

router.put('/campaigns/:campaignId', async (req, res) => {
  try {
    const campaign = await upsertAISalesCampaign({
      ...(req.body || {}),
      id: req.params.campaignId,
    });
    res.json({ success: true, campaign });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[PUT /api/v2/admin/ai-sales-agent/campaigns/:campaignId] Error:', error);
    res.status(status).json({ error: error.message || 'Failed to update campaign' });
  }
});

router.post('/campaigns/:campaignId/status', async (req, res) => {
  try {
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!['active', 'paused', 'draft'].includes(status)) {
      return res.status(400).json({ error: 'status must be active, paused, or draft' });
    }
    const campaign = await updateAISalesCampaignStatus(req.params.campaignId, status);
    res.json({ success: true, campaign });
  } catch (error) {
    console.error('[POST /api/v2/admin/ai-sales-agent/campaigns/:campaignId/status] Error:', error);
    res.status(500).json({ error: 'Failed to update campaign status' });
  }
});

router.get('/leads', async (_req, res) => {
  try {
    const leads = await listAISalesLeads();
    res.json({ leads });
  } catch (error) {
    console.error('[GET /api/v2/admin/ai-sales-agent/leads] Error:', error);
    res.status(500).json({ error: 'Failed to load leads' });
  }
});

router.get('/threads', async (_req, res) => {
  try {
    const threads = await listAISalesThreads();
    res.json({ threads });
  } catch (error) {
    console.error('[GET /api/v2/admin/ai-sales-agent/threads] Error:', error);
    res.status(500).json({ error: 'Failed to load threads' });
  }
});

router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from('ai_sales_messages')
      .select('*')
      .eq('scope', 'tavari')
      .eq('thread_id', req.params.threadId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (error) {
    console.error('[GET /api/v2/admin/ai-sales-agent/threads/:threadId/messages] Error:', error);
    res.status(500).json({ error: 'Failed to load thread messages' });
  }
});

router.post('/run/lead-generation', async (req, res) => {
  try {
    const result = await runAISalesLeadGeneration({
      moduleKey: req.body?.module_key || req.query?.module_key || null,
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('[POST /api/v2/admin/ai-sales-agent/run/lead-generation] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to run lead generation' });
  }
});

router.post('/run/daily', async (_req, res) => {
  try {
    const result = await runAISalesDailyCycle();
    res.json({ success: true, result });
  } catch (error) {
    console.error('[POST /api/v2/admin/ai-sales-agent/run/daily] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to run AI Sales daily cycle' });
  }
});

export default router;
