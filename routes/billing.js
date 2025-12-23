import express from 'express';
import { StripeService } from '../services/stripe.js';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';

const router = express.Router();

// Get available packages (public packages for customers)
router.get('/packages', authenticate, async (req, res) => {
  try {
    console.log('[Billing] Fetching packages for business:', req.businessId);
    const packages = await PricingPackage.findAll({
      includeInactive: false,
      includePrivate: false, // Only public packages
    });
    
    console.log('[Billing] Found packages:', packages.length);
    console.log('[Billing] Packages:', packages.map(p => ({ id: p.id, name: p.name, price: p.monthly_price })));
    
    res.json({ packages });
  } catch (error) {
    console.error('Get packages error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ 
      error: 'Failed to get packages',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create checkout/payment session
router.post('/checkout', authenticate, async (req, res) => {
  let packageId;
  try {
    packageId = req.body.packageId;
    
    if (!packageId) {
      return res.status(400).json({ error: 'Package ID is required' });
    }
    
    // Validate packageId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(packageId)) {
      return res.status(400).json({ 
        error: 'Invalid package ID format',
        details: `Package ID must be a valid UUID, received: ${packageId}`
      });
    }
    
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('[Billing] ⚠️ STRIPE_SECRET_KEY not configured, updating package locally');
      const pkg = await PricingPackage.findById(packageId);
      if (!pkg) {
        return res.status(404).json({ error: 'Package not found' });
      }
      
      await Business.update(req.businessId, {
        package_id: packageId,
        plan_tier: pkg.name.toLowerCase(),
        usage_limit_minutes: pkg.minutes_included,
      });
      
      return res.json({ 
        success: true,
        packageId: packageId,
        packageName: pkg.name,
        message: 'Package selected. Payment can be completed later in billing settings.',
        skipPayment: true
      });
    }
    
    // Get package details
    const pkg = await PricingPackage.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    const successUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing/success?package_id=${packageId}&from_setup=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/setup`;
    
    // Create Stripe checkout session
    console.log('[Billing] Creating Stripe checkout session for package:', packageId);
    const checkoutSession = await StripeService.createCheckoutSession(
      req.businessId,
      packageId,
      pkg.monthly_price,
      pkg.name,
      successUrl,
      cancelUrl
    );
    
    console.log('[Billing] ✅ Stripe checkout session created:', checkoutSession.sessionId);
    
    // Update package locally (will be confirmed via webhook)
    await Business.update(req.businessId, {
      package_id: packageId,
      plan_tier: pkg.name.toLowerCase(),
      usage_limit_minutes: pkg.minutes_included,
    });
    
    return res.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.sessionId,
      packageId: packageId,
      packageName: pkg.name,
      message: 'Redirecting to payment page...'
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      packageId: packageId || 'not provided',
      businessId: req.businessId,
    });
    res.status(500).json({ 
      error: 'Failed to create checkout session', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get subscription status
router.get('/status', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const packageId = business.package_id;
    let packageDetails = null;
    
    if (packageId) {
      packageDetails = await PricingPackage.findById(packageId);
    }

    res.json({
      packageId: packageId,
      package: packageDetails,
      planTier: business.plan_tier,
      usageLimitMinutes: business.usage_limit_minutes,
      stripeCustomerId: business.stripe_customer_id,
      stripeSubscriptionId: business.stripe_subscription_id,
      stripeSubscriptionStatus: business.stripe_subscription_status,
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ 
      error: 'Failed to get subscription status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Webhook handler for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!webhookSecret) {
      console.warn('[Billing Webhook] STRIPE_WEBHOOK_SECRET not configured, skipping signature verification');
      // In development, accept events without verification
      event = req.body;
    } else {
      const stripe = (await import('stripe')).default;
      const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
      event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
  } catch (err) {
    console.error('[Billing Webhook] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log('[Billing Webhook] Received event:', event.type);
    await StripeService.handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    console.error('[Billing Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
