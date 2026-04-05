/**
 * Review Reply AI — runtime routes (generate, history, settings, feedback).
 * Setup wizard + usage live in reviews-setup.js (mounted first on /api/v2/reviews).
 */
import express from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireBusinessContext } from '../../middleware/v2/requireBusinessContext.js';
import { ModuleSettings } from '../../models/v2/ModuleSettings.js';
import { ReviewsOutput } from '../../models/v2/ReviewsOutput.js';
import { recordFeedback } from '../../services/review-feedback-learning.js';
import { calculateBillingCycle } from '../../services/billing.js';

const router = express.Router();
const MODULE_KEY = 'reviews';

router.use(authenticate);
router.use(requireBusinessContext);

async function assertActiveSubscriptionAndUsage(req) {
  const { Subscription } = await import('../../models/v2/Subscription.js');
  const { UsageLog } = await import('../../models/v2/UsageLog.js');

  const subscription = await Subscription.findByBusinessAndModule(req.active_business_id, MODULE_KEY);
  if (!subscription || subscription.status !== 'active') {
    const e = new Error('An active Review Reply subscription is required.');
    e.code = 'SUBSCRIPTION_INACTIVE';
    e.statusCode = 403;
    throw e;
  }

  if (subscription.usage_limit != null && Number(subscription.usage_limit) > 0) {
    const billingCycle = calculateBillingCycle(req.business);
    const usageData = await UsageLog.getTotalUsage(
      req.active_business_id,
      MODULE_KEY,
      billingCycle.start.toISOString(),
      billingCycle.end.toISOString(),
    );
    const totalUsed = usageData.total || 0;
    if (totalUsed >= subscription.usage_limit) {
      const e = new Error('You have reached your usage limit for this billing period.');
      e.code = 'USAGE_LIMIT_REACHED';
      e.statusCode = 429;
      throw e;
    }
  }
}

/** Flat shape used by review-reply-ai dashboard settings UI */
function nestedSettingsToFlat(settings, business) {
  const s = settings || {};
  const b = business || {};
  const legal = s.legal_rules || {};
  const bv = s.brand_voice_profile || {};
  const rs = s.reply_strategy || {};
  const sm = s.social_media || {};
  const cb = s.custom_branding || {};
  const rr = s.review_reminders || {};

  return {
    business_name: cb.company_name || b.name || '',
    business_website: s.business_website || '',
    industry: cb.industry || b.industry || '',
    facebook_url: sm.facebook || '',
    instagram_url: sm.instagram || '',
    tiktok_url: sm.tiktok || '',
    contact_method: cb.contact_method || b.email || '',
    default_tone: s.default_tone || 'professional',
    tone_preferences: s.tone_preferences || {},
    emoji_usage: bv.emoji_usage || 'none',
    default_length: s.default_length || 'medium',
    perspective: bv.perspective || 'we',
    sign_off: bv.sign_off || 'none',
    custom_sign_off: bv.custom_sign_off || '',
    legal_sensitivity: legal.legal_sensitivity || 'medium',
    forbidden_phrases: Array.isArray(legal.forbidden_phrases) ? legal.forbidden_phrases : [],
    preferred_phrases: Array.isArray(legal.preferred_phrases) ? legal.preferred_phrases : [],
    apology_behavior: legal.apology_behavior || 'apologize',
    default_reply_goal: rs.default_reply_goal || 'professional',
    auto_severity_detection: rs.auto_severity_detection !== false,
    crisis_mode_auto_activation: rs.crisis_mode_auto_activation !== false,
    reply_openings: Array.isArray(s.reply_openings) ? s.reply_openings : ['thank'],
    reply_closings: Array.isArray(s.reply_closings) ? s.reply_closings : ['contact_info'],
    apology_tone: s.apology_tone || 'apologetic',
    legal_awareness_enabled: s.legal_awareness_enabled === true,
    jurisdiction: s.jurisdiction || '',
    reminders_enabled: rr.enabled === true,
    reminder_frequency: rr.frequency || 'daily',
    reminder_day_of_week: rr.day_of_week || '',
    reminder_time: rr.time || '09:00',
    reminder_delivery: Array.isArray(rr.delivery_method) ? rr.delivery_method : ['email'],
    reminder_recipient: rr.recipient || 'owner',
    reminder_template:
      rr.template ||
      'You have {count} unresponded review(s) that need your attention. Visit your dashboard to respond.',
    include_resolution_by_default: s.include_resolution_by_default !== false,
    risk_detection_enabled: s.risk_detection_enabled !== false,
  };
}

function applyFlatPatchToSettings(base, flat) {
  const out = base && typeof base === 'object' ? JSON.parse(JSON.stringify(base)) : {};
  const f = flat || {};

  if (f.business_website !== undefined) out.business_website = f.business_website;
  if (f.default_tone !== undefined) out.default_tone = f.default_tone;
  if (f.tone_preferences !== undefined) out.tone_preferences = f.tone_preferences;
  if (f.default_length !== undefined) out.default_length = f.default_length;
  if (f.reply_openings !== undefined) out.reply_openings = f.reply_openings;
  if (f.reply_closings !== undefined) out.reply_closings = f.reply_closings;
  if (f.apology_tone !== undefined) out.apology_tone = f.apology_tone;
  if (f.legal_awareness_enabled !== undefined) out.legal_awareness_enabled = f.legal_awareness_enabled;
  if (f.jurisdiction !== undefined) out.jurisdiction = f.jurisdiction;
  if (f.include_resolution_by_default !== undefined) out.include_resolution_by_default = f.include_resolution_by_default;
  if (f.risk_detection_enabled !== undefined) out.risk_detection_enabled = f.risk_detection_enabled;

  if (!out.custom_branding) out.custom_branding = {};
  if (f.business_name !== undefined) out.custom_branding.company_name = f.business_name;
  if (f.industry !== undefined) out.custom_branding.industry = f.industry;
  if (f.contact_method !== undefined) out.custom_branding.contact_method = f.contact_method;

  if (!out.social_media) out.social_media = {};
  if (f.facebook_url !== undefined) out.social_media.facebook = f.facebook_url;
  if (f.instagram_url !== undefined) out.social_media.instagram = f.instagram_url;
  if (f.tiktok_url !== undefined) out.social_media.tiktok = f.tiktok_url;

  if (!out.brand_voice_profile) out.brand_voice_profile = {};
  if (f.emoji_usage !== undefined) out.brand_voice_profile.emoji_usage = f.emoji_usage;
  if (f.perspective !== undefined) out.brand_voice_profile.perspective = f.perspective;
  if (f.sign_off !== undefined) out.brand_voice_profile.sign_off = f.sign_off;
  if (f.custom_sign_off !== undefined) out.brand_voice_profile.custom_sign_off = f.custom_sign_off;

  if (!out.legal_rules) out.legal_rules = {};
  if (f.legal_sensitivity !== undefined) out.legal_rules.legal_sensitivity = f.legal_sensitivity;
  if (f.forbidden_phrases !== undefined) out.legal_rules.forbidden_phrases = f.forbidden_phrases;
  if (f.preferred_phrases !== undefined) out.legal_rules.preferred_phrases = f.preferred_phrases;
  if (f.apology_behavior !== undefined) out.legal_rules.apology_behavior = f.apology_behavior;

  if (!out.reply_strategy) out.reply_strategy = {};
  if (f.default_reply_goal !== undefined) out.reply_strategy.default_reply_goal = f.default_reply_goal;
  if (f.auto_severity_detection !== undefined) out.reply_strategy.auto_severity_detection = f.auto_severity_detection;
  if (f.crisis_mode_auto_activation !== undefined) {
    out.reply_strategy.crisis_mode_auto_activation = f.crisis_mode_auto_activation;
  }

  if (!out.review_reminders) out.review_reminders = {};
  if (f.reminders_enabled !== undefined) out.review_reminders.enabled = f.reminders_enabled;
  if (f.reminder_frequency !== undefined) out.review_reminders.frequency = f.reminder_frequency;
  if (f.reminder_day_of_week !== undefined) out.review_reminders.day_of_week = f.reminder_day_of_week;
  if (f.reminder_time !== undefined) out.review_reminders.time = f.reminder_time;
  if (f.reminder_delivery !== undefined) out.review_reminders.delivery_method = f.reminder_delivery;
  if (f.reminder_recipient !== undefined) out.review_reminders.recipient = f.reminder_recipient;
  if (f.reminder_template !== undefined) out.review_reminders.template = f.reminder_template;

  return out;
}

/**
 * GET /api/v2/reviews/settings
 */
router.get('/settings', async (req, res) => {
  try {
    const row = await ModuleSettings.findByBusinessAndModule(req.active_business_id, MODULE_KEY);
    const settings = nestedSettingsToFlat(row?.settings, req.business);
    res.json({ settings });
  } catch (error) {
    console.error('[GET /api/v2/reviews/settings]', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

/**
 * PUT /api/v2/reviews/settings
 * Body: { settings: { ...flat fields } }
 */
router.put('/settings', async (req, res) => {
  try {
    const patch = req.body?.settings;
    if (!patch || typeof patch !== 'object') {
      return res.status(400).json({ error: 'Missing settings object' });
    }

    const existing = await ModuleSettings.findByBusinessAndModule(req.active_business_id, MODULE_KEY);
    const merged = applyFlatPatchToSettings(existing?.settings || {}, patch);
    await ModuleSettings.update(req.active_business_id, MODULE_KEY, merged);

    res.json({ success: true, settings: nestedSettingsToFlat(merged, req.business) });
  } catch (error) {
    console.error('[PUT /api/v2/reviews/settings]', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

/**
 * POST /api/v2/reviews/generate
 */
router.post('/generate', async (req, res) => {
  try {
    await assertActiveSubscriptionAndUsage(req);
    const { generateReviewReply } = await import('../../services/reviews.js');
    const result = await generateReviewReply(req.body, req.business, req.user.id);
    res.json(result);
  } catch (error) {
    const code = error.code;
    let status = 500;
    if (typeof error.statusCode === 'number') status = error.statusCode;
    else if (code === 'SUBSCRIPTION_INACTIVE') status = 403;
    else if (code === 'USAGE_LIMIT_REACHED') status = 429;
    else if (String(error.message || '').includes('OPENAI_API_KEY')) status = 503;
    else if (error.message) status = 400;

    if (status >= 500) {
      console.error('[POST /api/v2/reviews/generate]', error);
    }
    res.status(status).json({
      error: error.message || 'Generation failed',
      ...(code ? { code } : {}),
    });
  }
});

/**
 * GET /api/v2/reviews/history
 */
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { records, total } = await ReviewsOutput.findByBusinessId(req.active_business_id, { limit, offset });
    res.json({ history: records, total, limit, offset });
  } catch (error) {
    console.error('[GET /api/v2/reviews/history]', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

/**
 * POST /api/v2/reviews/feedback
 */
router.post('/feedback', async (req, res) => {
  try {
    const { output_id, feedback_type, adjustment_type, selected_reply_option } = req.body || {};
    if (!output_id || !feedback_type) {
      return res.status(400).json({ error: 'output_id and feedback_type are required' });
    }

    const output = await ReviewsOutput.findById(output_id);
    if (!output || String(output.business_id) !== String(req.active_business_id)) {
      return res.status(404).json({ error: 'Output not found' });
    }

    await recordFeedback(
      req.active_business_id,
      output_id,
      req.user.id,
      feedback_type,
      adjustment_type ?? null,
      selected_reply_option ?? null,
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[POST /api/v2/reviews/feedback]', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

/** Health / discovery for /api/v2/reviews (setup router does not register GET /). */
router.get('/', (req, res) => {
  res.json({
    module: MODULE_KEY,
    runtime_routes: ['GET /settings', 'PUT /settings', 'POST /generate', 'GET /history', 'POST /feedback'],
    setup_routes: ['GET /setup/status', 'POST /setup/step/:n', 'POST /setup/complete', 'GET /usage'],
  });
});

export default router;
