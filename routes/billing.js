import express from 'express';
import { HelcimService } from '../services/helcim.js';
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
    
    // Get package details
    const pkg = await PricingPackage.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    const successUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing/success?package_id=${packageId}&from_setup=true`;
    const cancelUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/setup`;
    
    // Check if Helcim payment page URL is configured
    if (!process.env.HELCIM_PAYMENT_PAGE_URL) {
      // If no payment page URL, just update the package locally and skip payment
      console.log('[Billing] ⚠️ HELCIM_PAYMENT_PAGE_URL not configured, updating package locally and skipping payment');
      await Business.update(req.businessId, {
        package_id: packageId,
        plan_tier: pkg.name.toLowerCase(),
        usage_limit_minutes: pkg.minutes_included,
      });
      
      // Return success flag so frontend continues to next step
      return res.json({ 
        success: true,
        packageId: packageId,
        packageName: pkg.name,
        message: 'Package selected. Payment can be completed later in billing settings.',
        skipPayment: true
      });
    }
    
    // Get or create customer for payment page
    let customerId = null;
    if (process.env.HELCIM_API_TOKEN) {
      try {
        const customer = await HelcimService.getOrCreateCustomer(
          req.businessId,
          business.email,
          business.name,
          business.phone
        );
        customerId = customer.customerId || customer.id;
      } catch (customerError) {
        console.warn('[Billing] Could not get/create customer for payment page:', customerError.message);
        // Continue without customer ID - payment page will still work
      }
    }
    
    // Build payment page URL with amount and package info
    const paymentPageUrl = process.env.HELCIM_PAYMENT_PAGE_URL;
    const amount = pkg.monthly_price.toFixed(2);
    const separator = paymentPageUrl.includes('?') ? '&' : '?';
    
    // Construct URL with amount and optional customer ID
    let paymentUrlWithAmount = `${paymentPageUrl}${separator}amount=${amount}&package_id=${packageId}`;
    if (customerId) {
      paymentUrlWithAmount += `&customer_id=${customerId}`;
    }
    
    // Add return URLs if payment page supports them
    // Some payment pages support return_url and cancel_url parameters
    paymentUrlWithAmount += `&return_url=${encodeURIComponent(successUrl)}`;
    paymentUrlWithAmount += `&cancel_url=${encodeURIComponent(cancelUrl)}`;
    
    console.log('[Billing] ✅ Returning payment page URL:', paymentUrlWithAmount);
    
    // Update package locally (user will complete payment on Helcim page)
    await Business.update(req.businessId, {
      package_id: packageId,
      plan_tier: pkg.name.toLowerCase(),
      usage_limit_minutes: pkg.minutes_included,
    });
    
    return res.json({
      url: paymentUrlWithAmount,
      amount: amount,
      packageId: packageId,
      packageName: pkg.name,
      customerId: customerId,
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

// Get hosted payment page URL for adding payment method
router.get('/hosted-payment-page', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Check if we have a configured payment page URL
    // If not, return instructions to create one in Helcim dashboard
    const paymentPageUrl = process.env.HELCIM_PAYMENT_PAGE_URL;
    if (!paymentPageUrl) {
      return res.status(503).json({ 
        error: 'Payment page not configured',
        message: 'Please create a payment page in your Helcim dashboard and set HELCIM_PAYMENT_PAGE_URL environment variable',
        instructions: [
          '1. Log into Helcim Dashboard',
          '2. Go to "All Tools" → "Payment Pages"',
          '3. Create a new "Customer Registration" or "Editable Amount" payment page',
          '4. Add it to your backend environment variables as HELCIM_PAYMENT_PAGE_URL'
        ]
      });
    }

    // Get or create customer
    let customerId = null;
    if (process.env.HELCIM_API_TOKEN) {
      try {
        const customer = await HelcimService.getOrCreateCustomer(
          req.businessId,
          business.email,
          business.name,
          business.phone
        );
        customerId = customer.customerId || customer.id;
      } catch (customerError) {
        console.warn('[Billing] Could not get/create customer:', customerError.message);
      }
    }

    // Build payment page URL with customer ID if available
    const separator = paymentPageUrl.includes('?') ? '&' : '?';
    let paymentUrl = paymentPageUrl;
    if (customerId) {
      paymentUrl += `${separator}customer_id=${customerId}`;
    }

    res.json({ 
      url: paymentUrl,
      customerId: customerId
    });
  } catch (error) {
    console.error('Get hosted payment page error:', error);
    res.status(500).json({ 
      error: 'Failed to get payment page URL',
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
      helcimCustomerId: business.helcim_customer_id,
      helcimSubscriptionId: business.helcim_subscription_id,
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ 
      error: 'Failed to get subscription status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Webhook handler for Helcim events
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('[Billing Webhook] Received event:', event.type || event.eventType);
    
    // Verify webhook secret if configured
    if (process.env.HELCIM_WEBHOOK_SECRET) {
      const signature = req.headers['helcim-signature'] || req.headers['x-helcim-signature'];
      // TODO: Implement webhook signature verification
      // For now, we'll trust the webhook if secret is set
    }
    
    // Handle the webhook event
    await HelcimService.handleWebhook(event);
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
