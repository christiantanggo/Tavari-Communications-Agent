import express from 'express';
import { StripeService } from '../services/stripe.js';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';

const router = express.Router();

// Check if Stripe is in test mode (public endpoint for setup wizard)
router.get('/test-mode', async (req, res) => {
  try {
    const { isStripeTestMode } = await import('../services/stripe.js');
    const testMode = isStripeTestMode();
    res.json({ testMode });
  } catch (error) {
    console.error('Get Stripe test mode error:', error);
    res.status(500).json({ error: 'Failed to check Stripe mode' });
  }
});

// Get available packages (public endpoint - no auth required for pricing modal)
router.get('/packages', async (req, res) => {
  try {
    const packages = await PricingPackage.findAll({
      includeInactive: false,
      includePrivate: false, // Only public packages
    });
    
    console.log('[Billing] Found packages:', packages.length);
    console.log('[Billing] Packages:', packages.map(p => ({ id: p.id, name: p.name, price: p.monthly_price, isOnSale: p.isOnSale })));
    
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
    
    // Get package details first (needed for both Stripe and non-Stripe flows)
    const pkg = await PricingPackage.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    // Check if sale is available (active and not sold out)
    const isOnSale = PricingPackage.isSaleActive(pkg);
    const saleAvailable = PricingPackage.isSaleAvailable(pkg);
    
    if (isOnSale && !saleAvailable) {
      return res.status(400).json({ 
        error: 'This sale has ended - all available plans have been sold out',
        saleName: pkg.sale_name,
      });
    }
    
    // Determine the price to charge (sale_price if on sale, otherwise monthly_price)
    const priceToCharge = (isOnSale && pkg.sale_price) ? pkg.sale_price : pkg.monthly_price;
    
    // Calculate sale price expiration date if applicable
    let salePriceExpiresAt = null;
    if (isOnSale && pkg.sale_duration_months) {
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + pkg.sale_duration_months);
      salePriceExpiresAt = expirationDate.toISOString().split('T')[0];
    }
    
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('[Billing] ⚠️ STRIPE_SECRET_KEY not configured, updating package locally');
      
      const updateData = {
        package_id: packageId,
        plan_tier: pkg.name.toLowerCase(),
        usage_limit_minutes: pkg.minutes_included,
      };
      
      // Track sale purchase details if on sale
      if (isOnSale) {
        updateData.purchased_at_sale_price = priceToCharge;
        updateData.sale_price_expires_at = salePriceExpiresAt;
        updateData.sale_name = pkg.sale_name;
      }
      
      await Business.update(req.businessId, updateData);
      
      // Increment sale count if package is on sale
      if (isOnSale) {
        await PricingPackage.incrementSaleCount(packageId);
      }
      
      return res.json({ 
        success: true,
        packageId: packageId,
        packageName: pkg.name,
        message: 'Package selected. Payment can be completed later in billing settings.',
        skipPayment: true
      });
    }
    
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    const successUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing/success?package_id=${packageId}&from_setup=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/setup`;
    
    // Create Stripe checkout session with the correct price (sale or regular)
    console.log('[Billing] Creating Stripe checkout session for package:', packageId);
    console.log('[Billing] Package regular price:', pkg.monthly_price, 'Sale price:', pkg.sale_price, 'Charging:', priceToCharge);
    const checkoutSession = await StripeService.createCheckoutSession(
      req.businessId,
      packageId,
      priceToCharge,
      pkg.name,
      successUrl,
      cancelUrl
    );
    
    console.log('[Billing] ✅ Stripe checkout session created:', checkoutSession.sessionId);
    
    // Update package locally (will be confirmed via webhook)
    // Track sale purchase details if on sale (webhook will confirm)
    const updateData = {
      package_id: packageId,
      plan_tier: pkg.name.toLowerCase(),
      usage_limit_minutes: pkg.minutes_included,
    };
    
    if (isOnSale) {
      updateData.purchased_at_sale_price = priceToCharge;
      updateData.sale_price_expires_at = salePriceExpiresAt;
      updateData.sale_name = pkg.sale_name;
    }
    
    await Business.update(req.businessId, updateData);
    
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

// Verify Stripe checkout session
router.get('/verify-session', authenticate, async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const { getStripeInstance } = await import('../services/stripe.js');
    const stripeInstance = getStripeInstance();
    
    // Retrieve the checkout session
    const session = await stripeInstance.checkout.sessions.retrieve(sessionId);
    
    // Verify the session belongs to this business
    const businessId = session.metadata?.business_id;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'Session does not belong to this business' });
    }

    // Check if payment was successful
    if (session.payment_status === 'paid' && session.status === 'complete') {
      // The webhook should have already updated the subscription, but verify it's set
      const business = await Business.findById(req.businessId);
      
      return res.json({
        success: true,
        sessionId: session.id,
        paymentStatus: session.payment_status,
        subscriptionId: business.stripe_subscription_id,
        packageId: business.package_id,
      });
    }

    return res.json({
      success: false,
      sessionId: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
    });
  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({ 
      error: 'Failed to verify session',
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
      // Use the same Stripe instance logic as the service
      const { getStripeInstance } = await import('../services/stripe.js');
      const stripeInstance = getStripeInstance();
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
