/**
 * Construction Dashboard: PIN-unlock cookie + list of in-development modules (same shape as GET /modules).
 */
import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { Module } from '../../models/v2/Module.js';
import { Subscription } from '../../models/v2/Subscription.js';
import { Business } from '../../models/Business.js';
import {
  CONSTRUCTION_COOKIE_NAME,
  createConstructionUnlockCookieValue,
  filterToConstructionModulesOnly,
  getExpectedConstructionPin,
  hasValidConstructionUnlock,
} from '../../config/construction-dashboard.js';
import { excludeRetiredModules } from '../../config/retired-module-keys.js';

const router = express.Router();

const EIGHT_HOURS_SEC = 8 * 60 * 60;

function setUnlockCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${CONSTRUCTION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${EIGHT_HOURS_SEC}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearUnlockCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [`${CONSTRUCTION_COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * POST /api/v2/construction/unlock
 * Body: { pin: string } — sets httpOnly cookie for 8h
 */
router.post('/unlock', authenticate, (req, res) => {
  try {
    const pin = req.body?.pin != null ? String(req.body.pin).trim() : '';
    if (!pin || pin !== getExpectedConstructionPin()) {
      // 403 (not 401) so the frontend axios interceptor does not clear the session
      return res.status(403).json({ error: 'Invalid PIN' });
    }
    const token = createConstructionUnlockCookieValue();
    setUnlockCookie(res, token);
    return res.json({ success: true });
  } catch (e) {
    console.error('[POST /api/v2/construction/unlock]', e?.message || e);
    return res.status(500).json({ error: 'Unlock failed' });
  }
});

/**
 * POST /api/v2/construction/lock
 * Clears construction unlock cookie
 */
router.post('/lock', authenticate, (_req, res) => {
  clearUnlockCookie(res);
  return res.json({ success: true });
});

/**
 * GET /api/v2/construction/modules
 * Same subscription enrichment as GET /api/v2/modules but only construction-flagged modules.
 */
router.get('/modules', authenticate, requireBusinessContext, async (req, res) => {
  try {
    if (!hasValidConstructionUnlock(req)) {
      return res.status(403).json({ error: 'Construction dashboard locked', code: 'CONSTRUCTION_LOCKED' });
    }

    const all = excludeRetiredModules(await Module.findAll());
    const construction = filterToConstructionModulesOnly(all);
    const subscriptions = await Subscription.findByBusinessId(req.active_business_id);
    const business = await Business.findById(req.active_business_id);

    const hasLegacyPhoneAgent = business && (
      business.stripe_subscription_id ||
      business.package_id ||
      business.vapi_assistant_id
    );

    const subscriptionMap = {};
    subscriptions.forEach((sub) => {
      subscriptionMap[sub.module_key] = sub;
    });

    const modulesWithStatus = construction.map((module) => {
      let subscribed = !!subscriptionMap[module.key];
      let subscription = subscriptionMap[module.key];

      if (module.key === 'phone-agent' && !subscribed && hasLegacyPhoneAgent) {
        subscribed = true;
        subscription = {
          status: 'active',
          plan: business.package_id ? 'legacy' : 'active',
        };
      }

      return {
        ...module,
        subscribed,
        subscription: subscription || null,
        subscription_status: subscription?.status || null,
        subscription_plan: subscription?.plan || null,
        usage_limit: subscription?.usage_limit || null,
      };
    });

    return res.json({ modules: modulesWithStatus });
  } catch (error) {
    console.error('[GET /api/v2/construction/modules] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch construction modules' });
  }
});

export default router;
