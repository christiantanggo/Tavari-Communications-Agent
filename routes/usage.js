import express from 'express';
import { UsageMinutes } from '../models/UsageMinutes.js';
import { BusinessLogicService } from '../services/businessLogic.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get usage status
router.get('/status', authenticate, async (req, res) => {
  try {
    const status = await BusinessLogicService.checkUsageStatus(req.businessId);
    res.json(status);
  } catch (error) {
    console.error('Get usage status error:', error);
    res.status(500).json({ error: 'Failed to get usage status' });
  }
});

// Get monthly usage
router.get('/monthly', authenticate, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    
    const usage = await UsageMinutes.getMonthlyUsage(req.businessId, year, month);
    
    res.json({
      year,
      month,
      minutes: usage,
    });
  } catch (error) {
    console.error('Get monthly usage error:', error);
    res.status(500).json({ error: 'Failed to get monthly usage' });
  }
});

export default router;

