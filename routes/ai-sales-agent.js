import express from 'express';
import {
  ingestAISalesInboundEmail,
  trackAISalesOpen,
  trackAISalesClick,
  getAISalesTrackingPixel,
} from '../services/ai-sales-agent.js';

const router = express.Router();

router.get('/t/:token/open.gif', async (req, res) => {
  try {
    await trackAISalesOpen(req.params.token);
  } catch (error) {
    console.warn('[AI Sales Agent] open tracking failed:', error?.message || error);
  }

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).send(getAISalesTrackingPixel());
});

router.get('/t/:token/click', async (req, res) => {
  try {
    const ctaUrl = await trackAISalesClick(req.params.token);
    if (ctaUrl) {
      return res.redirect(ctaUrl);
    }
  } catch (error) {
    console.warn('[AI Sales Agent] click tracking failed:', error?.message || error);
  }

  return res.redirect('/');
});

router.post('/inbound/email', async (req, res) => {
  try {
    const configuredSecret = String(process.env.AI_SALES_INBOUND_SECRET || '').trim();
    if (configuredSecret) {
      const provided = String(req.headers['x-ai-sales-secret'] || '').trim();
      if (!provided || provided !== configuredSecret) {
        return res.status(401).json({ error: 'Unauthorized inbound email request' });
      }
    }

    const result = await ingestAISalesInboundEmail(req.body || {});
    return res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[POST /api/ai-sales-agent/inbound/email] Error:', error);
    return res.status(status).json({ error: error.message || 'Failed to process inbound email' });
  }
});

export default router;
