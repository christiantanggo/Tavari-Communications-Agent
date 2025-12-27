// Script to verify if a webhook was received and processed for a checkout session
// Usage: node scripts/verify-webhook-received.js <checkout-session-id>

import dotenv from 'dotenv';
import { supabaseClient } from '../config/database.js';
import { Business } from '../models/Business.js';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

const checkoutSessionId = process.argv[2];

if (!checkoutSessionId) {
  console.error('Usage: node scripts/verify-webhook-received.js <checkout-session-id>');
  process.exit(1);
}

async function verifyWebhook() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 VERIFYING WEBHOOK PROCESSING');
  console.log('='.repeat(60) + '\n');

  try {
    // Step 1: Get checkout session from Stripe
    console.log('📋 STEP 1: Retrieving checkout session from Stripe');
    console.log('-'.repeat(60));
    
    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['subscription', 'customer']
    });
    
    console.log('✅ Checkout session retrieved');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Payment status: ${session.payment_status}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Customer: ${session.customer}`);
    console.log(`   Subscription: ${session.subscription || 'NONE (payment not completed)'}`);
    console.log('');

    // Step 2: Extract business ID from metadata
    const businessId = session.metadata?.business_id;
    const packageId = session.metadata?.package_id;
    
    if (!businessId) {
      console.log('❌ ERROR: No business_id in checkout session metadata');
      console.log('   Metadata:', JSON.stringify(session.metadata, null, 2));
      return;
    }
    
    console.log('📋 STEP 2: Checking business record');
    console.log('-'.repeat(60));
    console.log(`   Business ID: ${businessId}`);
    console.log(`   Package ID: ${packageId}`);
    console.log('');

    // Step 3: Check business record
    const business = await Business.findById(businessId);
    if (!business) {
      console.log(`❌ ERROR: Business not found: ${businessId}`);
      return;
    }
    
    console.log('✅ Business found:', business.name);
    console.log('');
    
    // Step 4: Verify what was set
    console.log('📋 STEP 3: Verifying business updates');
    console.log('-'.repeat(60));
    
    const checks = {
      'Stripe Customer ID': business.stripe_customer_id ? '✅ Set' : '❌ NOT SET',
      'Stripe Subscription ID': business.stripe_subscription_id ? `✅ Set: ${business.stripe_subscription_id}` : '❌ NOT SET',
      'Subscription Status': business.stripe_subscription_status || '❌ NOT SET',
      'Package ID': business.package_id ? `✅ Set: ${business.package_id}` : '❌ NOT SET',
      'Plan Tier': business.plan_tier || '❌ NOT SET',
      'Usage Limit Minutes': business.usage_limit_minutes !== null && business.usage_limit_minutes !== undefined 
        ? `✅ Set: ${business.usage_limit_minutes}` 
        : '❌ NULL (webhook did not process)',
    };
    
    Object.entries(checks).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
    console.log('');

    // Step 5: Check if subscription matches
    if (session.subscription && business.stripe_subscription_id) {
      if (session.subscription === business.stripe_subscription_id || 
          (typeof session.subscription === 'object' && session.subscription.id === business.stripe_subscription_id)) {
        console.log('✅ Subscription ID matches between Stripe and database');
      } else {
        console.log('⚠️  WARNING: Subscription ID mismatch');
        console.log(`   Stripe session subscription: ${typeof session.subscription === 'object' ? session.subscription.id : session.subscription}`);
        console.log(`   Database subscription: ${business.stripe_subscription_id}`);
      }
    } else if (session.subscription && !business.stripe_subscription_id) {
      console.log('❌ ERROR: Stripe has subscription but database does not');
      console.log('   This means the webhook did NOT process correctly');
      const subId = typeof session.subscription === 'object' ? session.subscription.id : session.subscription;
      console.log(`   Stripe subscription ID: ${subId}`);
    } else if (!session.subscription) {
      console.log('⚠️  WARNING: No subscription in checkout session');
      console.log('   This means payment was not completed');
      console.log('   Payment status:', session.payment_status);
      console.log('   Status:', session.status);
    }
    console.log('');

    // Step 6: Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    
    const hasSubscription = !!session.subscription;
    const businessHasSubscription = !!business.stripe_subscription_id;
    const businessHasPackage = !!business.package_id;
    const businessHasMinutes = business.usage_limit_minutes !== null && business.usage_limit_minutes !== undefined;
    
    if (!hasSubscription) {
      console.log('❌ Payment was NOT completed');
      console.log('   The checkout session has no subscription');
      console.log('   Complete the payment in Stripe checkout to trigger the webhook');
    } else if (hasSubscription && !businessHasSubscription) {
      console.log('❌ WEBHOOK DID NOT PROCESS');
      console.log('   Payment was completed in Stripe');
      console.log('   But the business record was not updated');
      console.log('   Check server logs for webhook errors');
    } else if (businessHasSubscription && !businessHasPackage) {
      console.log('❌ PARTIAL PROCESSING');
      console.log('   Subscription was created but package was not assigned');
      console.log('   Check webhook handler code');
    } else if (businessHasSubscription && businessHasPackage && !businessHasMinutes) {
      console.log('❌ PARTIAL PROCESSING');
      console.log('   Subscription and package were set but minutes were not');
      console.log('   Check webhook handler code');
    } else if (businessHasSubscription && businessHasPackage && businessHasMinutes) {
      console.log('✅ WEBHOOK PROCESSED CORRECTLY');
      console.log('   Business has subscription, package, and minutes');
    }
    
    console.log('');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyWebhook();


