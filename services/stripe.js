import Stripe from 'stripe';
import dotenv from 'dotenv';
import { Business } from '../models/Business.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class StripeService {
  // Create or get Stripe customer
  static async getOrCreateCustomer(businessId, email, name) {
    const business = await Business.findById(businessId);
    
    if (business.stripe_customer_id) {
      try {
        const customer = await stripe.customers.retrieve(business.stripe_customer_id);
        return customer;
      } catch (error) {
        console.error('Error retrieving Stripe customer:', error);
      }
    }
    
    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        business_id: businessId,
      },
    });
    
    // Save customer ID
    await Business.update(businessId, {
      stripe_customer_id: customer.id,
    });
    
    return customer;
  }
  
  // Create checkout session
  static async createCheckoutSession(businessId, priceId, successUrl, cancelUrl) {
    const business = await Business.findById(businessId);
    const customer = await this.getOrCreateCustomer(
      businessId,
      business.email,
      business.name
    );
    
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        business_id: businessId,
      },
    });
    
    return session;
  }
  
  // Handle webhook events
  static async handleWebhook(event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
        
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }
  
  // Handle checkout completion
  static async handleCheckoutCompleted(session) {
    const businessId = session.metadata.business_id;
    if (!businessId) return;
    
    // Get subscription
    const subscriptionId = session.subscription;
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await this.handleSubscriptionUpdate(subscription);
    }
  }
  
  // Handle subscription update
  static async handleSubscriptionUpdate(subscription) {
    const customerId = subscription.customer;
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .limit(1);
    
    if (error || !businesses || businesses.length === 0) return;
    
    const businessId = businesses[0].id;
    const priceId = subscription.items.data[0].price.id;
    
    // Determine plan tier and limits based on price
    const planTier = this.getPlanTierFromPrice(priceId);
    const usageLimit = this.getUsageLimitFromTier(planTier);
    
    await Business.update(businessId, {
      stripe_subscription_id: subscription.id,
      plan_tier: planTier,
      usage_limit_minutes: usageLimit,
    });
  }
  
  // Handle subscription deletion
  static async handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .limit(1);
    
    if (error || !businesses || businesses.length === 0) return;
    
    const businessId = businesses[0].id;
    
    // Set to free tier or suspend
    await Business.update(businessId, {
      stripe_subscription_id: null,
      plan_tier: 'free',
      usage_limit_minutes: 100, // Reduced limit
    });
  }
  
  // Handle payment succeeded
  static async handlePaymentSucceeded(invoice) {
    // Business is active, no action needed
    console.log('Payment succeeded for invoice:', invoice.id);
  }
  
  // Handle payment failed
  static async handlePaymentFailed(invoice) {
    const customerId = invoice.customer;
    const { supabaseClient } = await import('../config/database.js');
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .limit(1);
    
    if (error || !businesses || businesses.length === 0) return;
    
    // Could implement grace period logic here
    console.log('Payment failed for business:', businesses[0].id);
  }
  
  // Get plan tier from price ID (customize based on your Stripe prices)
  static getPlanTierFromPrice(priceId) {
    // Map your Stripe price IDs to plan tiers
    if (priceId.includes('starter') || priceId.includes('199')) {
      return 'starter';
    } else if (priceId.includes('pro') || priceId.includes('499')) {
      return 'pro';
    } else if (priceId.includes('enterprise')) {
      return 'enterprise';
    }
    return 'starter';
  }
  
  // Get usage limit from tier
  static getUsageLimitFromTier(tier) {
    const limits = {
      free: 100,
      starter: 1000,
      pro: 5000,
      enterprise: 20000,
    };
    return limits[tier] || 1000;
  }
  
  // Create billing portal session
  static async createBillingPortalSession(customerId, returnUrl) {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    
    return session;
  }
}

