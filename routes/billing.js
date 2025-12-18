import express from 'express';
import { StripeService } from '../services/stripe.js';
import { authenticate } from '../middleware/auth.js';
import { Business } from '../models/Business.js';
import Stripe from 'stripe';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { priceId } = req.body;
    
    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }
    
    const successUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing`;
    
    const session = await StripeService.createCheckoutSession(
      req.businessId,
      priceId,
      successUrl,
      cancelUrl
    );
    
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  try {
    await StripeService.handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Get billing portal URL
router.get('/portal', authenticate, async (req, res) => {
  try {
    const business = await Business.findById(req.businessId);
    
    if (!business.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }
    
    const returnUrl = `${req.headers.origin || process.env.FRONTEND_URL}/dashboard/billing`;
    const session = await StripeService.createBillingPortalSession(
      business.stripe_customer_id,
      returnUrl
    );
    
    res.json({ url: session.url });
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
    let customer = null;
    
    if (business.stripe_customer_id) {
      try {
        customer = await stripe.customers.retrieve(business.stripe_customer_id);
        
        // Get default payment method
        if (customer.invoice_settings?.default_payment_method) {
          paymentMethod = await stripe.paymentMethods.retrieve(
            customer.invoice_settings.default_payment_method
          );
        }
      } catch (error) {
        console.error('Error retrieving customer:', error);
      }
    }
    
    if (business.stripe_subscription_id) {
      try {
        subscription = await stripe.subscriptions.retrieve(business.stripe_subscription_id);
      } catch (error) {
        console.error('Error retrieving subscription:', error);
      }
    }
    
    res.json({
      plan_tier: business.plan_tier,
      usage_limit_minutes: business.usage_limit_minutes,
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        items: subscription.items.data.map(item => ({
          price_id: item.price.id,
          amount: item.price.unit_amount / 100,
          currency: item.price.currency,
          interval: item.price.recurring?.interval,
        })),
      } : null,
      payment_method: paymentMethod ? {
        type: paymentMethod.type,
        card: paymentMethod.card ? {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          exp_month: paymentMethod.card.exp_month,
          exp_year: paymentMethod.card.exp_year,
        } : null,
      } : null,
      customer_id: business.stripe_customer_id,
    });
  } catch (error) {
    console.error('Get billing status error:', error);
    res.status(500).json({ error: 'Failed to get billing status' });
  }
});

export default router;

