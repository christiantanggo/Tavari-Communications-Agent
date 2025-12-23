// services/stripe.js
// Stripe payment processing service

import Stripe from 'stripe';
import dotenv from 'dotenv';
import { Business } from '../models/Business.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

export class StripeService {
  // Create a checkout session for a package
  static async createCheckoutSession(businessId, packageId, packagePrice, packageName, successUrl, cancelUrl) {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }

      // Create or get Stripe customer
      let customerId = business.stripe_customer_id;
      
      if (!customerId) {
        // Create new Stripe customer
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

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'cad',
              product_data: {
                name: packageName,
                description: `Monthly subscription for ${packageName}`,
              },
              unit_amount: Math.round(packagePrice * 100), // Convert to cents
              recurring: {
                interval: 'month',
              },
            },
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

    // Update business with subscription info
    const subscriptionId = session.subscription;
    if (subscriptionId) {
      await Business.update(businessId, {
        stripe_subscription_id: subscriptionId,
        package_id: packageId,
      });
    }
  }

  // Handle subscription update
  static async handleSubscriptionUpdate(subscription) {
    const customerId = subscription.customer;
    
    // Find business by Stripe customer ID
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .limit(1);

    if (!businesses || businesses.length === 0) {
      console.warn('[StripeService] Business not found for customer:', customerId);
      return;
    }

    const businessId = businesses[0].id;
    const status = subscription.status;

    // Update subscription status
    await Business.update(businessId, {
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: status,
    });
  }

  // Handle subscription deleted
  static async handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .limit(1);

    if (!businesses || businesses.length === 0) return;

    const businessId = businesses[0].id;

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
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('[StripeService] Error retrieving subscription:', error);
      throw error;
    }
  }
}

