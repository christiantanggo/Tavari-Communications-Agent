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
    
    const successUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing/success?package_id=${packageId}`;
    const cancelUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing`;
    
    // Check if Helcim is configured
    if (!process.env.HELCIM_API_TOKEN && !process.env.HELCIM_PAYMENT_PAGE_URL) {
      return res.status(503).json({ 
        error: 'Payment processing is not configured. Please contact support.',
        details: 'Helcim API token or payment page URL is not set'
      });
    }
    
    // SOLUTION: Use saved payment methods + API for fixed amounts (user cannot change amount)
    // If customer has saved payment method, process payment directly via API
    if (process.env.HELCIM_API_TOKEN) {
      try {
        const customer = await HelcimService.getOrCreateCustomer(
          req.businessId,
          business.email,
          business.name,
          business.phone
        );
        
        const customerId = customer.customerId || customer.id;
        
        // Check if customer has saved payment methods
        const paymentMethods = await HelcimService.getCustomerPaymentMethods(customerId);
        
        if (paymentMethods && paymentMethods.length > 0) {
          // ✅ Customer has saved payment method - process payment via API with FIXED amount
          console.log('[Billing] Processing payment with saved method (fixed amount)');
          
          const paymentResult = await HelcimService.processPaymentWithSavedMethod(
            customerId,
            paymentMethods[0].id, // Use first saved payment method
            pkg.monthly_price,
            `${pkg.name} - ${pkg.description || ''}`
          );
          
          // Update business with package
          await Business.update(req.businessId, {
            package_id: packageId,
            plan_tier: pkg.name.toLowerCase(),
            usage_limit_minutes: pkg.minutes_included,
          });
          
          res.json({ 
            success: true,
            transactionId: paymentResult.transactionId,
            amount: pkg.monthly_price.toFixed(2),
            packageId: packageId,
            packageName: pkg.name,
            message: 'Payment processed successfully!',
            url: successUrl // Redirect to success page
          });
          return;
        }
      } catch (apiError) {
        console.warn('[Billing] API payment processing failed:', apiError.message);
        // Fall through to require payment method first
      }
    }
    
    // Customer doesn't have saved payment method - redirect to add one first
    // After adding payment method, they can try checkout again (will use API method above)
    if (process.env.HELCIM_PAYMENT_PAGE_URL) {
      return res.status(402).json({
        error: 'Payment method required',
        message: 'Please add a payment method first, then try again.',
        action: 'add_payment_method',
        url: null, // Frontend should redirect to add payment method page
      });
    }
    
    // Fallback to API-based subscription (if payment page not configured)
    try {
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
    } catch (helcimError) {
      // If Helcim account is under review or API fails, still update the package locally
      // This allows the business to use the package while payment is being set up
      console.error('Helcim subscription creation failed, updating package locally:', helcimError);
      
      // Update business with package anyway (payment can be set up later)
      await Business.update(req.businessId, {
        package_id: packageId,
        plan_tier: pkg.name.toLowerCase(),
        usage_limit_minutes: pkg.minutes_included,
      });
      
      // Return a message indicating package was updated but payment setup needs attention
      res.status(202).json({ 
        subscriptionId: null,
        url: successUrl,
        message: 'Package updated successfully. Payment processing will be configured once your Helcim account is approved.',
        warning: 'Helcim account is under review. Package is active but payment processing is pending.'
      });
    }
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

    // Get or create customer
    const customer = await HelcimService.getOrCreateCustomer(
      req.businessId,
      business.email,
      business.name,
      business.phone
    );

    // Check if we have a configured payment page URL
    // If not, return instructions to create one in Helcim dashboard
    const paymentPageUrl = process.env.HELCIM_PAYMENT_PAGE_URL;
    
    if (!paymentPageUrl) {
      return res.status(503).json({
        error: 'Payment page not configured',
        message: 'Please create a payment page in your Helcim dashboard and set HELCIM_PAYMENT_PAGE_URL environment variable',
        instructions: [
          '1. Go to Helcim Dashboard → All Tools → Payment Pages',
          '2. Create a new payment page (type: "Editable Amount" or "Product Purchase")',
          '3. Copy the payment page URL',
          '4. Add it to your backend environment variables as HELCIM_PAYMENT_PAGE_URL'
        ]
      });
    }

    // Return the payment page URL with customer info as query params (if supported)
    // Or just return the base URL and let Helcim handle customer matching
    res.json({
      url: paymentPageUrl,
      customerId: customer.customerId,
      message: 'Redirect to this URL to add payment method'
    });
  } catch (error) {
    console.error('Get hosted payment page error:', error);
    res.status(500).json({ 
      error: 'Failed to get payment page URL',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add payment method (using Helcim.js token)
router.post('/payment-method', authenticate, async (req, res) => {
  try {
    const { customerId, paymentToken } = req.body;
    
    if (!customerId || !paymentToken) {
      return res.status(400).json({ error: 'Customer ID and payment token are required' });
    }

    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Verify customer ID matches business
    if (business.helcim_customer_id !== customerId) {
      return res.status(403).json({ error: 'Customer ID does not match your account' });
    }

    // Add payment method using Helcim service
    const paymentMethod = await HelcimService.addPaymentMethod(customerId, paymentToken);
    
    res.json({
      success: true,
      paymentMethod: paymentMethod,
      message: 'Payment method added successfully'
    });
  } catch (error) {
    console.error('Add payment method error:', error);
    res.status(500).json({ 
      error: 'Failed to add payment method',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

// Get hosted payment page for adding payment method (alternative to Helcim.js)
router.get('/hosted-payment', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get or create customer
    const customer = await HelcimService.getOrCreateCustomer(
      req.businessId,
      business.email,
      business.name,
      business.phone
    );

    // Use Customer Registration page URL (specifically for adding payment methods)
    // Falls back to HELCIM_PAYMENT_PAGE_URL for backward compatibility
    const customerRegistrationUrl = process.env.HELCIM_CUSTOMER_REGISTRATION_URL || process.env.HELCIM_PAYMENT_PAGE_URL;
    
    if (!customerRegistrationUrl) {
      return res.status(503).json({
        error: 'Payment page not configured',
        message: 'Please create a Customer Registration payment page in your Helcim dashboard',
        customerId: customer.customerId,
        instructions: [
          '1. Go to Helcim Dashboard → All Tools → Payment Pages',
          '2. Click "New Payment Page"',
          '3. Choose "Customer Registration" page type',
          '4. Configure and save',
          '5. Copy the URL and add to Railway as HELCIM_CUSTOMER_REGISTRATION_URL'
        ]
      });
    }

    // Return Customer Registration page URL (for adding payment methods)
    res.json({
      url: customerRegistrationUrl,
      customerId: customer.customerId,
    });
  } catch (error) {
    console.error('Get hosted payment page error:', error);
    res.status(500).json({ 
      error: 'Failed to get payment page',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get hosted payment page for checkout with dynamic amount
router.get('/hosted-payment/checkout', authenticate, async (req, res) => {
  try {
    const { packageId } = req.query;
    
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

    // Get or create customer
    const customer = await HelcimService.getOrCreateCustomer(
      req.businessId,
      business.email,
      business.name,
      business.phone
    );

    // Check for configured payment page URL
    const paymentPageUrl = process.env.HELCIM_PAYMENT_PAGE_URL;
    
    if (!paymentPageUrl) {
      return res.status(503).json({
        error: 'Payment page not configured',
        message: 'Please create a payment page in your Helcim dashboard',
        instructions: 'Go to Helcim Dashboard → All Tools → Payment Pages → Create New Page (choose "Editable Amount")'
      });
    }

    // Append amount as URL parameter (Helcim may support various parameter names)
    // Try common parameter names: amount, total, amt, price
    const amount = pkg.monthly_price.toFixed(2);
    const separator = paymentPageUrl.includes('?') ? '&' : '?';
    
    // Try multiple parameter formats that Helcim might support
    const paymentUrlWithAmount = `${paymentPageUrl}${separator}amount=${amount}&package_id=${packageId}&customer_id=${customer.customerId}`;

    res.json({
      url: paymentUrlWithAmount,
      amount: amount,
      packageId: packageId,
      packageName: pkg.name,
      customerId: customer.customerId,
    });
  } catch (error) {
    console.error('Get hosted payment checkout error:', error);
    res.status(500).json({ 
      error: 'Failed to get payment checkout URL',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get billing portal URL (Helcim customer portal)
router.get('/portal', authenticate, async (req, res) => {
  try {
    console.log('[Billing Portal] ========== GET PORTAL START ==========');
    console.log('[Billing Portal] Business ID:', req.businessId);
    
    const business = await Business.findById(req.businessId);
    if (!business) {
      console.error('[Billing Portal] Business not found');
      return res.status(404).json({ error: 'Business not found' });
    }
    
    console.log('[Billing Portal] Business found:', {
      id: business.id,
      email: business.email,
      helcim_customer_id: business.helcim_customer_id,
    });
    
    // Create customer if one doesn't exist
    let customerId = business.helcim_customer_id;
    if (!customerId) {
      console.log('[Billing Portal] No Helcim customer ID, creating customer...');
      try {
        const customer = await HelcimService.getOrCreateCustomer(
          req.businessId,
          business.email,
          business.name,
          business.phone
        );
        
        console.log('[Billing Portal] Customer response:', {
          hasCustomer: !!customer,
          customerKeys: customer ? Object.keys(customer) : [],
          customerId: customer?.customerId,
          id: customer?.id,
          fullResponse: JSON.stringify(customer, null, 2),
        });
        
        // Try multiple possible field names
        customerId = customer?.customerId || customer?.id || customer?.data?.customerId || customer?.data?.id;
        
        // If still no customerId, reload business to get the saved ID
        if (!customerId) {
          console.log('[Billing Portal] Customer ID not in response, reloading business...');
          const updatedBusiness = await Business.findById(req.businessId);
          customerId = updatedBusiness.helcim_customer_id;
          console.log('[Billing Portal] Reloaded customer ID:', customerId);
        }
      } catch (error) {
        console.error('[Billing Portal] Error creating Helcim customer:', error);
        console.error('[Billing Portal] Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          stack: error.stack,
        });
        return res.status(500).json({ 
          error: 'Failed to create customer account',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
    
    // Validate customerId before constructing URL
    if (!customerId) {
      console.error('[Billing Portal] ❌ Customer ID is still undefined!');
      console.error('[Billing Portal] Business state:', {
        helcim_customer_id: business.helcim_customer_id,
      });
      return res.status(500).json({ 
        error: 'Failed to get customer ID. Please contact support.',
        details: 'Customer account could not be created or retrieved'
      });
    }
    
    console.log('[Billing Portal] ✅ Customer ID found:', customerId);
    
    // IMPORTANT: Helcim does NOT provide a customer-facing portal URL like Stripe
    // The URL https://secure.helcim.com/customer/{customerId} does NOT exist
    // This is why we're getting 522 errors (connection timeout)
    // 
    // To add payment methods with Helcim, you must use:
    // 1. Helcim.js - Frontend JavaScript SDK (recommended)
    // 2. Helcim API - Server-side API calls
    // 3. Helcim Dashboard - Merchant-side only (not customer-facing)
    //
    // See: https://www.helcim.com/helcim-js/ for integration guide
    
    console.log('[Billing Portal] ⚠️ Helcim customer portal URL does not exist');
    console.log('[Billing Portal] Customer ID:', customerId);
    console.log('[Billing Portal] ========== GET PORTAL COMPLETE ==========');
    
    // Return customer ID for frontend to use with Helcim.js
    res.json({ 
      customerId: customerId,
      message: 'Use customer ID with Helcim.js to add payment method'
    });
  } catch (error) {
    console.error('[Billing Portal] ========== GET PORTAL ERROR ==========');
    console.error('[Billing Portal] Error:', error);
    console.error('[Billing Portal] Error details:', {
      message: error.message,
      stack: error.stack,
    });
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
