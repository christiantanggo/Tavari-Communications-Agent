// services/stripe.js
// Stripe payment processing service

import Stripe from 'stripe';
import dotenv from 'dotenv';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';

dotenv.config();

// Get Stripe instance based on mode
// Supports both separate test/live keys and single key (backward compatible)
function createStripeInstance() {
  const mode = process.env.STRIPE_MODE?.toLowerCase() || 'auto'; // 'test', 'live', or 'auto'
  
  let secretKey;
  
  if (mode === 'test') {
    // Use test keys
    secretKey = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY;
  } else if (mode === 'live') {
    // Use live keys
    secretKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY;
  } else {
    // Auto-detect based on key prefix (backward compatible)
    const testKey = process.env.STRIPE_SECRET_KEY_TEST;
    const liveKey = process.env.STRIPE_SECRET_KEY_LIVE;
    const singleKey = process.env.STRIPE_SECRET_KEY;
    
    if (testKey && liveKey) {
      // Both keys exist, default to test for safety
      console.warn('[StripeService] Both test and live keys found, but STRIPE_MODE not set. Defaulting to test mode.');
      secretKey = testKey;
    } else if (testKey) {
      secretKey = testKey;
    } else if (liveKey) {
      secretKey = liveKey;
    } else {
      secretKey = singleKey;
    }
  }
  
  if (!secretKey) {
    console.warn('[StripeService] ⚠️ Stripe secret key not configured. Stripe features will not work.');
    console.warn('[StripeService] Set STRIPE_SECRET_KEY, STRIPE_SECRET_KEY_TEST, or STRIPE_SECRET_KEY_LIVE environment variable.');
    // Return a dummy instance that will throw when used, but won't crash server startup
    return new Stripe('sk_test_dummy_key_for_startup', {
      apiVersion: '2024-12-18.acacia',
    });
  }
  
  return new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia',
  });
}

// Export function to get Stripe instance (for use in routes)
// Lazy-loaded to prevent server crash if Stripe keys aren't configured
let stripeInstance = null;

export function getStripeInstance() {
  if (!stripeInstance) {
    stripeInstance = createStripeInstance();
  }
  return stripeInstance;
}

// Get the default Stripe instance (lazy-loaded)
function getStripe() {
  return getStripeInstance();
}

// Helper to check if we're in test mode
export function isStripeTestMode() {
  const mode = process.env.STRIPE_MODE?.toLowerCase() || 'auto';
  
  if (mode === 'test') {
    return true;
  } else if (mode === 'live') {
    return false;
  } else {
    // Auto-detect
    const secretKey = process.env.STRIPE_SECRET_KEY_TEST || 
                     process.env.STRIPE_SECRET_KEY_LIVE || 
                     process.env.STRIPE_SECRET_KEY;
    return secretKey?.startsWith('sk_test_') || false;
  }
}

export class StripeService {
  // Create a checkout session for a package
  static async createCheckoutSession(businessId, packageId, packagePrice, packageName, successUrl, cancelUrl) {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }

      // Get package to check for existing Stripe price ID
      const pkg = await PricingPackage.findById(packageId);
      if (!pkg) {
        throw new Error('Package not found');
      }

      // Create or get Stripe customer
      let customerId = business.stripe_customer_id;
      
      if (!customerId) {
        // Create new Stripe customer
        const stripe = getStripe();
        const customer = await stripe.customers.create({
          email: business.email,
          name: business.name,
          phone: business.phone,
          metadata: {
            business_id: businessId,
          },
        });
        customerId = customer.id;
        
        // Save customer ID to business
        await Business.update(businessId, {
          stripe_customer_id: customerId,
        });
      }

      // Get or create Stripe price ID
      let priceId = pkg.stripe_price_id;
      let needsNewPrice = !priceId;
      
      // If we have a price ID, verify it exists in Stripe
      if (priceId) {
        try {
          const stripe = getStripe();
          // Try to retrieve the price to verify it exists
          await stripe.prices.retrieve(priceId);
          console.log('[StripeService] Verified existing Stripe price:', priceId);
        } catch (error) {
          // Price doesn't exist (might be from test mode or deleted)
          console.warn('[StripeService] Stored price ID does not exist in Stripe:', priceId);
          console.warn('[StripeService] Error:', error.message);
          console.log('[StripeService] Creating new price...');
          needsNewPrice = true;
          priceId = null;
        }
      }
      
      if (needsNewPrice) {
        // Create Stripe product and price if they don't exist
        console.log('[StripeService] Creating Stripe product and price for package:', packageName);
        
        // Check if we have a product ID that still exists
        let productId = pkg.stripe_product_id;
        if (productId) {
          try {
            const stripe = getStripe();
            await stripe.products.retrieve(productId);
            console.log('[StripeService] Using existing Stripe product:', productId);
          } catch (error) {
            console.warn('[StripeService] Stored product ID does not exist, creating new product');
            productId = null;
          }
        }
        
        // Create product if needed
        if (!productId) {
          const stripe = getStripe();
          const product = await stripe.products.create({
            name: packageName,
            description: pkg.description || `Monthly subscription for ${packageName}`,
            metadata: {
              package_id: packageId,
            },
          });
          productId = product.id;
        }

        // Create price
        const stripe = getStripe();
        const price = await stripe.prices.create({
          unit_amount: Math.round(packagePrice * 100), // Convert to cents
          currency: 'cad',
          recurring: {
            interval: 'month',
          },
          product: productId,
          metadata: {
            package_id: packageId,
          },
        });

        priceId = price.id;
        
        // Save to database for future use
        await PricingPackage.update(packageId, {
          stripe_product_id: productId,
          stripe_price_id: price.id,
        });
        
        console.log('[StripeService] Created Stripe product and price:', { productId: productId, priceId: price.id });
      }

      // Create checkout session using existing price ID
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId, // Use existing price ID instead of price_data
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          business_id: businessId,
          package_id: packageId,
        },
      });

      return {
        sessionId: session.id,
        url: session.url,
        customerId: customerId,
      };
    } catch (error) {
      console.error('[StripeService] Error creating checkout session:', error);
      throw error;
    }
  }

  // Handle webhook events
  static async handleWebhook(event) {
    try {
      const eventType = event.type;
      const data = event.data.object;

      switch (eventType) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(data);
          break;
        
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(data);
          break;
        
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(data);
          break;
        
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(data);
          break;
        
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(data);
          break;
        
        default:
          console.log(`[StripeService] Unhandled event type: ${eventType}`);
      }
    } catch (error) {
      console.error('[StripeService] Error handling webhook:', error);
      throw error;
    }
  }

  // Handle checkout completed
  static async handleCheckoutCompleted(session) {
    const businessId = session.metadata?.business_id;
    const packageId = session.metadata?.package_id;

    if (!businessId || !packageId) {
      console.warn('[StripeService] Missing metadata in checkout session');
      return;
    }

    // Get package details to update plan_tier and usage_limit_minutes
    const { PricingPackage } = await import('../models/PricingPackage.js');
    const pkg = await PricingPackage.findById(packageId);

    // Update business with subscription info
    const subscriptionId = session.subscription;
    if (subscriptionId) {
      const updateData = {
        stripe_subscription_id: subscriptionId,
        stripe_subscription_status: 'active',
        package_id: packageId,
      };

      // If package found, update plan tier and usage limit
      if (pkg) {
        updateData.plan_tier = pkg.name.toLowerCase();
        updateData.usage_limit_minutes = pkg.minutes_included;
      }

      await Business.update(businessId, updateData);
      console.log(`[StripeService] Business ${businessId} updated with subscription ${subscriptionId}`);
    }
  }

  // Handle subscription update
  static async handleSubscriptionUpdate(subscription) {
    const customerId = subscription.customer;
    
    // Find business by Stripe customer ID using Business model method
    const business = await Business.findByStripeCustomerId(customerId);

    if (!business) {
      console.warn('[StripeService] Business not found for customer:', customerId);
      return;
    }

    const businessId = business.id;
    const status = subscription.status;

    // Get package ID from subscription metadata or line items if available
    const packageId = subscription.metadata?.package_id;
    
    const updateData = {
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: status,
    };

    // If package_id is in metadata, update it
    if (packageId) {
      updateData.package_id = packageId;
    }

    // Update subscription status
    await Business.update(businessId, updateData);
  }

  // Handle subscription deleted
  static async handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    
    // Find business by Stripe customer ID using Business model method
    const business = await Business.findByStripeCustomerId(customerId);

    if (!business) {
      console.warn('[StripeService] Business not found for customer:', customerId);
      return;
    }

    const businessId = business.id;

    // Clear subscription info
    await Business.update(businessId, {
      stripe_subscription_id: null,
      stripe_subscription_status: 'canceled',
    });
  }

  // Handle payment succeeded
  static async handlePaymentSucceeded(invoice) {
    console.log('[StripeService] Payment succeeded for invoice:', invoice.id);
    // Business subscription is already updated via subscription webhooks
  }

  // Handle payment failed
  static async handlePaymentFailed(invoice) {
    console.log('[StripeService] Payment failed for invoice:', invoice.id);
    // Could implement grace period logic here
  }

  // Cancel subscription
  static async cancelSubscription(subscriptionId) {
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.cancel(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('[StripeService] Error canceling subscription:', error);
      throw error;
    }
  }

  // Get subscription details
  static async getSubscription(subscriptionId) {
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('[StripeService] Error retrieving subscription:', error);
      throw error;
    }
  }
}

