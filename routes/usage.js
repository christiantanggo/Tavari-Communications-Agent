import express from 'express';
import { UsageMinutes } from '../models/UsageMinutes.js';
import { Business } from '../models/Business.js';
import { authenticate } from '../middleware/auth.js';
import { calculateBillingCycle } from '../services/billing.js';
import { getCurrentCycleUsage } from '../services/usage.js';

const router = express.Router();

// Get usage status
router.get('/status', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const billingCycle = calculateBillingCycle(business);
    const usage = await getCurrentCycleUsage(req.businessId, billingCycle.start, billingCycle.end);
    
    const planLimit = business.usage_limit_minutes || 0;
    const bonusMinutes = business.bonus_minutes || 0;
    const totalAvailable = planLimit + bonusMinutes;
    const minutesRemaining = Math.max(0, totalAvailable - usage.totalMinutes);
    const usagePercent = totalAvailable > 0 ? (usage.totalMinutes / totalAvailable) * 100 : 0;

    res.json({
      minutes_used: usage.totalMinutes,
      minutes_total: totalAvailable,
      minutes_remaining: minutesRemaining,
      usage_percent: Math.round(usagePercent),
      overage_minutes: usage.overageMinutes,
      billing_cycle_start: billingCycle.start.toISOString().split('T')[0],
      billing_cycle_end: billingCycle.end.toISOString().split('T')[0],
      next_billing_date: billingCycle.next.toISOString().split('T')[0],
    });
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

