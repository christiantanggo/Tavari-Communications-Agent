import express from 'express';
import { HelcimService } from '../services/helcim.js';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';

const router = express.Router();

// Create checkout/payment session
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { packageId } = req.body;
    
    if (!packageId) {
      return res.status(400).json({ error: 'Package ID is required' });
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
    
    const successUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing/success?package_id=${packageId}`;
    const cancelUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing`;
    
    // Create subscription with Helcim
    const subscription = await HelcimService.createSubscription(
      req.businessId,
      pkg.monthly_price,
      'monthly',
      `${pkg.name} - ${pkg.description || ''}`
    );
    
    // Update business with package
    await Business.update(req.businessId, {
      package_id: packageId,
      plan_tier: pkg.name.toLowerCase(),
      usage_limit_minutes: pkg.minutes_included,
      helcim_subscription_id: subscription.subscriptionId || subscription.id,
    });
    
    res.json({ 
      subscriptionId: subscription.subscriptionId || subscription.id,
      url: successUrl, // Redirect to success page
      message: 'Subscription created successfully. Redirecting to payment...'
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session', details: error.message });
  }
});

// Helcim webhook
router.post('/webhook', express.json(), async (req, res) => {
  try {
    // Verify webhook signature if Helcim provides it
    const webhookSecret = process.env.HELCIM_WEBHOOK_SECRET;
    
    // Helcim may send webhook signature in headers
    // Verify signature if provided
    if (webhookSecret && req.headers['helcim-signature']) {
      // Implement signature verification if Helcim provides it
      // For now, we'll process the webhook
    }
    
    await HelcimService.handleWebhook(req.body);
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Get billing portal URL (Helcim customer portal)
router.get('/portal', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    if (!business.helcim_customer_id) {
      return res.status(400).json({ error: 'No Helcim customer found' });
    }
    
    // Helcim may have a customer portal URL
    // For now, return a message directing to Helcim dashboard
    const portalUrl = `https://secure.helcim.com/customer/${business.helcim_customer_id}`;
    
    res.json({ 
      url: portalUrl,
      message: 'Redirecting to Helcim customer portal...'
    });
  } catch (error) {
    console.error('Get billing portal error:', error);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

// Get subscription status
router.get('/status', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    let subscription = null;
    let paymentMethod = null;
    
    if (business.helcim_subscription_id) {
      try {
        subscription = await HelcimService.getSubscription(business.helcim_subscription_id);
      } catch (error) {
        console.error('Error retrieving subscription:', error);
      }
    }
    
    if (business.helcim_customer_id) {
      try {
        paymentMethod = await HelcimService.getCustomerPaymentMethods(business.helcim_customer_id);
      } catch (error) {
        console.error('Error retrieving payment methods:', error);
      }
    }
    
    // Get package details if package_id exists
    let packageDetails = null;
    if (business.package_id) {
      try {
        packageDetails = await PricingPackage.findById(business.package_id);
      } catch (error) {
        console.error('Error retrieving package:', error);
      }
    }
    
    res.json({
      plan_tier: business.plan_tier,
      usage_limit_minutes: business.usage_limit_minutes,
      package: packageDetails ? {
        id: packageDetails.id,
        name: packageDetails.name,
        monthly_price: packageDetails.monthly_price,
        minutes_included: packageDetails.minutes_included,
      } : null,
      subscription: subscription ? {
        id: subscription.subscriptionId || subscription.id,
        status: subscription.status || 'active',
        amount: subscription.amount,
        frequency: subscription.frequency,
        nextPaymentDate: subscription.nextPaymentDate,
      } : null,
      payment_method: paymentMethod ? {
        type: paymentMethod.type || 'card',
        last4: paymentMethod.last4,
      } : null,
      customer_id: business.helcim_customer_id,
    });
  } catch (error) {
    console.error('Get billing status error:', error);
    res.status(500).json({ error: 'Failed to get billing status' });
  }
});

export default router;
