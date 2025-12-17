import express from 'express';
import { UsageMinutes } from '../models/UsageMinutes.js';
import { Business } from '../models/Business.js';
import { authenticate } from '../middleware/auth.js';
import { calculateBillingCycle } from '../services/billing.js';
import { getCurrentCycleUsage } from '../services/usage.js';

const router = express.Router();

// Get usage status
router.get('/status', authenticate, async (req, res) => {
  console.log('[Usage API] ========== GET USAGE STATUS START ==========');
  console.log('[Usage API] businessId:', req.businessId);
  
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      console.error('[Usage API] Business not found');
      return res.status(404).json({ error: 'Business not found' });
    }

    console.log('[Usage API] Business found:', {
      id: business.id,
      name: business.name,
      usage_limit_minutes: business.usage_limit_minutes,
      bonus_minutes: business.bonus_minutes,
    });

    const billingCycle = calculateBillingCycle(business);
    console.log('[Usage API] Billing cycle:', {
      start: billingCycle.start.toISOString(),
      end: billingCycle.end.toISOString(),
      next: billingCycle.next.toISOString(),
    });
    
    const usage = await getCurrentCycleUsage(req.businessId, billingCycle.start, billingCycle.end);
    console.log('[Usage API] Usage data:', JSON.stringify(usage, null, 2));
    
    const planLimit = business.usage_limit_minutes || 0;
    const bonusMinutes = business.bonus_minutes || 0;
    const totalAvailable = planLimit + bonusMinutes;
    const minutesRemaining = Math.max(0, totalAvailable - usage.totalMinutes);
    const usagePercent = totalAvailable > 0 ? (usage.totalMinutes / totalAvailable) * 100 : 0;

    const response = {
      minutes_used: usage.totalMinutes,
      minutes_total: totalAvailable,
      minutes_remaining: minutesRemaining,
      usage_percent: Math.round(usagePercent),
      overage_minutes: usage.overageMinutes,
      billing_cycle_start: billingCycle.start.toISOString().split('T')[0],
      billing_cycle_end: billingCycle.end.toISOString().split('T')[0],
      next_billing_date: billingCycle.next.toISOString().split('T')[0],
    };
    
    console.log('[Usage API] Response:', JSON.stringify(response, null, 2));
    console.log('[Usage API] ========== GET USAGE STATUS SUCCESS ==========');
    res.json(response);
  } catch (error) {
    console.error('[Usage API] ========== GET USAGE STATUS ERROR ==========');
    console.error('Get usage status error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to get usage status', details: error.message });
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

