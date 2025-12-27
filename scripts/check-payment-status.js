// Quick script to check if a business has proper payment setup
// Usage: node scripts/check-payment-status.js <business-email>

import dotenv from 'dotenv';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

const businessEmail = process.argv[2];

if (!businessEmail) {
  console.error('Usage: node scripts/check-payment-status.js <business-email>');
  process.exit(1);
}

async function checkPaymentStatus() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log(`🔍 CHECKING PAYMENT STATUS FOR: ${businessEmail}`);
    console.log('='.repeat(60) + '\n');

    const business = await Business.findByEmail(businessEmail);
    
    if (!business) {
      console.log(`❌ Business not found with email: ${businessEmail}`);
      process.exit(1);
    }

    console.log('Business Info:');
    console.log(`  ID: ${business.id}`);
    console.log(`  Name: ${business.name}`);
    console.log(`  Email: ${business.email}`);
    console.log('');

    // Check minutes
    console.log('Usage Limit:');
    if (business.usage_limit_minutes === null || business.usage_limit_minutes === undefined) {
      console.log('  ❌ usage_limit_minutes: NULL (no package purchased)');
    } else {
      console.log(`  ✅ usage_limit_minutes: ${business.usage_limit_minutes}`);
    }
    console.log('');

    // Check package
    console.log('Package:');
    if (!business.package_id) {
      console.log('  ❌ package_id: NULL (no package assigned)');
    } else {
      const pkg = await PricingPackage.findById(business.package_id);
      if (pkg) {
        console.log(`  ✅ package_id: ${business.package_id}`);
        console.log(`  ✅ Package: ${pkg.name}`);
        console.log(`  ✅ Plan tier: ${business.plan_tier || 'not set'}`);
      } else {
        console.log(`  ⚠️  package_id: ${business.package_id} (package not found in database)`);
      }
    }
    console.log('');

    // Check Stripe
    console.log('Stripe:');
    if (!business.stripe_customer_id) {
      console.log('  ❌ stripe_customer_id: NULL (no Stripe customer)');
    } else {
      console.log(`  ✅ stripe_customer_id: ${business.stripe_customer_id}`);
      
      try {
        const stripe = getStripeInstance();
        const customer = await stripe.customers.retrieve(business.stripe_customer_id);
        console.log(`  ✅ Customer exists in Stripe: ${customer.email}`);
      } catch (error) {
        console.log(`  ❌ Error retrieving customer: ${error.message}`);
      }
    }
    console.log('');

    if (!business.stripe_subscription_id) {
      console.log('  ❌ stripe_subscription_id: NULL (no active subscription)');
    } else {
      console.log(`  ✅ stripe_subscription_id: ${business.stripe_subscription_id}`);
      console.log(`  ✅ Subscription status: ${business.stripe_subscription_status || 'unknown'}`);
      
      try {
        const stripe = getStripeInstance();
        const subscription = await stripe.subscriptions.retrieve(business.stripe_subscription_id);
        console.log(`  ✅ Subscription exists in Stripe`);
        console.log(`  ✅ Status: ${subscription.status}`);
        console.log(`  ✅ Current period end: ${new Date(subscription.current_period_end * 1000).toISOString()}`);
        
        if (subscription.items?.data?.[0]?.price) {
          const price = subscription.items.data[0].price;
          console.log(`  ✅ Amount: $${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`);
        }
      } catch (error) {
        console.log(`  ❌ Error retrieving subscription: ${error.message}`);
      }
    }
    console.log('');

    // Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    
    const hasPackage = !!business.package_id;
    const hasMinutes = business.usage_limit_minutes !== null && business.usage_limit_minutes !== undefined;
    const hasSubscription = !!business.stripe_subscription_id;
    
    if (hasPackage && hasMinutes && hasSubscription) {
      console.log('✅ Business has complete payment setup');
    } else {
      console.log('❌ Business is missing payment setup:');
      if (!hasPackage) console.log('   - No package assigned');
      if (!hasMinutes) console.log('   - No usage_limit_minutes set');
      if (!hasSubscription) console.log('   - No Stripe subscription');
      console.log('\nThis business will not work properly!');
    }
    
    console.log('');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkPaymentStatus();


