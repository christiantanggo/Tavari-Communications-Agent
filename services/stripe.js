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
    return null; // Return null instead of creating instance
  }
  
  return new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia',
  });
}

// Export function to get Stripe instance (for use in routes)
// Lazy-loaded to prevent server crash if Stripe keys aren't configured
let stripeInstance = null;

export function getStripeInstance() {
  if (stripeInstance === null) {
    stripeInstance = createStripeInstance();
  }
  if (!stripeInstance) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY, STRIPE_SECRET_KEY_TEST, or STRIPE_SECRET_KEY_LIVE environment variable.');
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
  static async createCheckoutSession(businessId, packageId, packagePrice, packageName, successUrl, cancelUrl, saleName = null, salePriceExpiresAt = null) {
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

      // Always use dynamic price_data to ensure the price matches what's in the database
      // This handles sale prices and price changes correctly
      // We'll check if we can reuse the stored price ID, but only if the price matches
      let priceId = null;
      let usePriceData = true; // Default to using price_data for dynamic pricing
      
      // Check if we have a stored price ID that matches the current price
      if (pkg.stripe_price_id) {
        try {
          const stripe = getStripe();
          const existingPrice = await stripe.prices.retrieve(pkg.stripe_price_id);
          const existingPriceAmount = existingPrice.unit_amount / 100; // Convert cents to dollars
          
          // Only reuse the price ID if the amount matches exactly
          if (Math.abs(existingPriceAmount - packagePrice) < 0.01) {
            console.log('[StripeService] Reusing existing Stripe price that matches current price:', pkg.stripe_price_id);
            priceId = pkg.stripe_price_id;
            usePriceData = false; // Use existing price ID
          } else {
            console.log('[StripeService] Stored price ID amount does not match current price. Stored:', existingPriceAmount, 'Current:', packagePrice);
            console.log('[StripeService] Creating new price with current amount...');
            // Will create new price below
          }
        } catch (error) {
          // Price doesn't exist (might be from test mode or deleted)
          console.warn('[StripeService] Stored price ID does not exist in Stripe:', pkg.stripe_price_id);
          console.warn('[StripeService] Error:', error.message);
          console.log('[StripeService] Creating new price...');
          // Will create new price below
        }
      }
      
      // Get or create product ID (needed for price_data)
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
        
        // Save product ID to database
        await PricingPackage.update(packageId, {
          stripe_product_id: productId,
        });
        
        console.log('[StripeService] Created new Stripe product:', productId);
      }

      // Create checkout session - use price_data to ensure correct price is always used
      const stripe = getStripe();
      const lineItems = [];
      
      if (priceId && !usePriceData) {
        // Use existing price ID if it matches the current price
        lineItems.push({
          price: priceId,
          quantity: 1,
        });
        console.log('[StripeService] Using existing Stripe price ID:', priceId);
      } else {
        // Use price_data to ensure the price matches what's in the database (handles sales and price changes)
        lineItems.push({
          price_data: {
            currency: 'cad',
            product: productId,
            unit_amount: Math.round(packagePrice * 100), // Convert to cents - ensures correct price
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        });
        console.log('[StripeService] Using price_data with dynamic price:', packagePrice, '(ensures UI price matches Stripe)');
      }
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'subscription', // This creates a recurring subscription automatically
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          business_id: businessId,
          package_id: packageId,
          sale_name: saleName || '',
          sale_price_expires_at: salePriceExpiresAt || '',
        },
        subscription_data: {
          metadata: {
            business_id: businessId,
            package_id: packageId,
          },
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
    const saleName = session.metadata?.sale_name;
    const salePriceExpiresAt = session.metadata?.sale_price_expires_at;

    if (!businessId || !packageId) {
      console.warn('[StripeService] Missing metadata in checkout session');
      return;
    }

    // Get package details to update plan_tier and usage_limit_minutes
    const { PricingPackage } = await import('../models/PricingPackage.js');
    const pkg = await PricingPackage.findById(packageId);

    // Use sale info from metadata (more reliable than recalculating)
    const isOnSale = !!(saleName && saleName.trim() !== '');

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
        
        // Track sale purchase details if on sale (use metadata values)
        if (isOnSale) {
          // Get the actual amount charged from the session (most accurate)
          const amountCharged = session.amount_total ? session.amount_total / 100 : null;
          if (amountCharged) {
            updateData.purchased_at_sale_price = amountCharged;
          }
          updateData.sale_price_expires_at = salePriceExpiresAt && salePriceExpiresAt.trim() !== '' ? salePriceExpiresAt : null;
          updateData.sale_name = saleName;
        }
      }

      await Business.update(businessId, updateData);
      
      // Increment sale count if package is on sale
      if (isOnSale && pkg) {
        await PricingPackage.incrementSaleCount(packageId);
      }
      
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
    
    try {
      // Check if sale price has expired and update subscription if needed
      const subscriptionId = invoice.subscription;
      if (!subscriptionId) {
        // One-time payment, not a subscription
        return;
      }

      // Get subscription to find customer
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = subscription.customer;

      // Find business by Stripe customer ID
      const business = await Business.findByStripeCustomerId(customerId);
      if (!business) {
        console.warn('[StripeService] Business not found for customer:', customerId);
        return;
      }

      // Check if sale price has expired
      if (business.sale_price_expires_at && business.package_id) {
        const expirationDate = new Date(business.sale_price_expires_at);
        const now = new Date();
        expirationDate.setHours(23, 59, 59, 999); // End of expiration day

        if (now > expirationDate) {
          // Sale has expired - update subscription to regular price
          console.log(`[StripeService] Sale price expired for business ${business.id}, updating subscription to regular price`);
          
          const { PricingPackage } = await import('../models/PricingPackage.js');
          const pkg = await PricingPackage.findById(business.package_id);
          
          if (!pkg) {
            console.warn(`[StripeService] Package not found for business ${business.id}`);
            return;
          }

          // Use helper function to update subscription
          await this.updateSubscriptionToRegularPrice(
            subscriptionId,
            business.id,
            business.package_id,
            pkg.monthly_price
          );

          // Clear sale fields from business record
          await Business.update(business.id, {
            sale_price_expires_at: null,
            sale_name: null,
            purchased_at_sale_price: null,
          });

          console.log(`[StripeService] ✅ Cleared sale fields for business ${business.id}`);
        }
      }
    } catch (error) {
      console.error('[StripeService] Error checking/updating expired sale price:', error);
      // Don't throw - payment succeeded, this is just a cleanup task
    }
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

  /**
   * Check and update subscriptions with expired sale prices
   * Should be called periodically (e.g., daily) to proactively update subscriptions
   */
  static async updateExpiredSalePrices() {
    try {
      const { supabaseClient } = await import('../config/database.js');
      const { PricingPackage } = await import('../models/PricingPackage.js');
      
      console.log('[StripeService] Checking for expired sale prices...');
      
      // Find businesses with expired sale prices that have active Stripe subscriptions
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const { data: businesses, error } = await supabaseClient
        .from('businesses')
        .select('id, sale_price_expires_at, package_id, stripe_subscription_id')
        .not('sale_price_expires_at', 'is', null)
        .not('stripe_subscription_id', 'is', null)
        .is('deleted_at', null);
      
      if (error) {
        console.error('[StripeService] Error finding businesses with expired sale prices:', error);
        return;
      }

      let updatedCount = 0;
      let errorCount = 0;

      for (const business of businesses || []) {
        try {
          const expirationDate = new Date(business.sale_price_expires_at);
          const expirationDateStr = expirationDate.toISOString().split('T')[0];
          
          // Check if sale has expired (expiration date is today or in the past)
          if (expirationDateStr <= todayStr) {
            console.log(`[StripeService] Sale price expired for business ${business.id}, updating subscription...`);
            
            // Get package details
            const pkg = await PricingPackage.findById(business.package_id);
            if (!pkg) {
              console.warn(`[StripeService] Package not found for business ${business.id}`);
              continue;
            }

            const regularPrice = pkg.monthly_price;
            
            // Update subscription price
            await this.updateSubscriptionToRegularPrice(
              business.stripe_subscription_id,
              business.id,
              business.package_id,
              regularPrice
            );
            
            // Clear sale fields from business record
            await Business.update(business.id, {
              sale_price_expires_at: null,
              sale_name: null,
              purchased_at_sale_price: null,
            });
            
            updatedCount++;
            console.log(`[StripeService] ✅ Updated business ${business.id} to regular price: ${regularPrice} CAD/month`);
          }
        } catch (error) {
          console.error(`[StripeService] Error updating business ${business.id}:`, error.message);
          errorCount++;
        }
      }

      console.log(`[StripeService] ✅ Updated ${updatedCount} subscriptions, ${errorCount} errors`);
    } catch (error) {
      console.error('[StripeService] Error in updateExpiredSalePrices:', error);
    }
  }

  /**
   * Update a Stripe subscription to use the regular (non-sale) price
   * Helper method used by both invoice handler and scheduled job
   */
  static async updateSubscriptionToRegularPrice(subscriptionId, businessId, packageId, regularPrice) {
    const stripe = getStripe();
    const { PricingPackage } = await import('../models/PricingPackage.js');
    
    // Get or create the regular price ID
    const pkg = await PricingPackage.findById(packageId);
    if (!pkg) {
      throw new Error(`Package ${packageId} not found`);
    }

    let regularPriceId = pkg.stripe_price_id;
    
    // Check if the stored price ID matches the regular price
    if (regularPriceId) {
      try {
        const existingPrice = await stripe.prices.retrieve(regularPriceId);
        const existingPriceAmount = existingPrice.unit_amount / 100;
        
        if (Math.abs(existingPriceAmount - regularPrice) >= 0.01) {
          // Stored price doesn't match regular price - create new price
          regularPriceId = null;
        }
      } catch (error) {
        // Price doesn't exist - create new one
        regularPriceId = null;
      }
    }

    // Create new price if needed
    if (!regularPriceId) {
      // Get product ID
      let productId = pkg.stripe_product_id;
      if (!productId) {
        // Create product if needed
        const product = await stripe.products.create({
          name: pkg.name,
          description: pkg.description || `Monthly subscription for ${pkg.name}`,
          metadata: {
            package_id: packageId,
          },
        });
        productId = product.id;
        
        await PricingPackage.update(packageId, {
          stripe_product_id: productId,
        });
      }

      // Create new price for regular (non-sale) amount
      const newPrice = await stripe.prices.create({
        currency: 'cad',
        product: productId,
        unit_amount: Math.round(regularPrice * 100),
        recurring: {
          interval: 'month',
        },
      });
      
      regularPriceId = newPrice.id;
      
      // Save the regular price ID to package
      await PricingPackage.update(packageId, {
        stripe_price_id: regularPriceId,
      });
    }

    // Get subscription to find subscription item
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionItems = subscription.items.data;
    
    if (subscriptionItems.length === 0) {
      throw new Error(`No subscription items found for subscription ${subscriptionId}`);
    }

    const subscriptionItemId = subscriptionItems[0].id;
    
    // Update subscription item to use regular price
    // This will take effect on the next billing cycle
    await stripe.subscriptionItems.update(subscriptionItemId, {
      price: regularPriceId,
      proration_behavior: 'none', // Don't prorate - apply to next billing cycle
    });

    console.log(`[StripeService] Updated subscription ${subscriptionId} to regular price: ${regularPrice} CAD/month`);
  }
}

