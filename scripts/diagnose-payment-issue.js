// Script to diagnose payment flow issues
// This checks Stripe configuration and recent checkout activity

import dotenv from 'dotenv';
import { supabaseClient } from '../config/database.js';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';
import { getStripeInstance, isStripeTestMode } from '../services/stripe.js';

dotenv.config();

async function diagnosePaymentIssue() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 PAYMENT FLOW DIAGNOSTICS');
  console.log('='.repeat(60) + '\n');

  // Check 1: Stripe Configuration
  console.log('📋 CHECK 1: Stripe Configuration');
  console.log('-'.repeat(60));
  
  const testMode = isStripeTestMode();
  console.log(`   Stripe Mode: ${testMode ? 'TEST MODE' : 'LIVE MODE'}`);
  
  const hasStripeKey = !!(
    process.env.STRIPE_SECRET_KEY || 
    process.env.STRIPE_SECRET_KEY_TEST || 
    process.env.STRIPE_SECRET_KEY_LIVE
  );
  console.log(`   Stripe Key Configured: ${hasStripeKey ? '✅ YES' : '❌ NO'}`);
  
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
  console.log(`   Webhook Secret Configured: ${hasWebhookSecret ? '✅ YES' : '❌ NO'}`);
  
  if (!hasStripeKey) {
    console.log('\n   ⚠️  WARNING: Stripe secret key is not configured!');
    console.log('      Payments will be skipped. Set STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_TEST/LIVE');
  }
  
  if (!hasWebhookSecret) {
    console.log('\n   ⚠️  WARNING: Stripe webhook secret is not configured!');
    console.log('      Webhooks will not be verified. Set STRIPE_WEBHOOK_SECRET');
  }
  console.log('');

  // Check 2: Test Stripe Connection
  console.log('📋 CHECK 2: Stripe API Connection');
  console.log('-'.repeat(60));
  
  if (hasStripeKey) {
    try {
      const stripe = getStripeInstance();
      // Try a simple API call to verify connection
      const account = await stripe.account.retrieve();
      console.log(`   ✅ Stripe connection successful`);
      console.log(`   Account ID: ${account.id}`);
      console.log(`   Account Type: ${account.type}`);
    } catch (error) {
      console.log(`   ❌ Stripe connection failed: ${error.message}`);
      if (error.type === 'StripeAuthenticationError') {
        console.log('      Your Stripe API key is invalid or expired');
      }
    }
  } else {
    console.log('   ⚠️  Skipped (Stripe key not configured)');
  }
  console.log('');

  // Check 3: Packages Available
  console.log('📋 CHECK 3: Packages Available');
  console.log('-'.repeat(60));
  
  try {
    const packages = await PricingPackage.findAll({ includeInactive: false });
    console.log(`   Found ${packages.length} active packages:`);
    packages.forEach(pkg => {
      console.log(`   - ${pkg.name}: $${pkg.monthly_price} CAD (${pkg.minutes_included} minutes)`);
      if (pkg.isOnSale) {
        console.log(`     ON SALE: $${pkg.sale_price} CAD`);
      }
    });
  } catch (error) {
    console.log(`   ❌ Error loading packages: ${error.message}`);
  }
  console.log('');

  // Check 4: Recent Checkout Sessions (if Stripe is configured)
  console.log('📋 CHECK 4: Recent Checkout Sessions');
  console.log('-'.repeat(60));
  
  if (hasStripeKey) {
    try {
      const stripe = getStripeInstance();
      const sessions = await stripe.checkout.sessions.list({
        limit: 5,
        expand: ['data.customer'],
      });
      
      console.log(`   Found ${sessions.data.length} recent sessions:`);
      sessions.data.forEach((session, index) => {
        console.log(`   ${index + 1}. ${session.id}`);
        console.log(`      Created: ${new Date(session.created * 1000).toLocaleString()}`);
        console.log(`      Status: ${session.status} | Payment: ${session.payment_status}`);
        console.log(`      Business: ${session.metadata?.business_id || 'N/A'}`);
        console.log(`      Package: ${session.metadata?.package_id || 'N/A'}`);
        if (session.status === 'complete' && session.payment_status === 'paid') {
          console.log(`      ✅ Payment completed`);
        } else if (session.status === 'open' && session.payment_status === 'unpaid') {
          console.log(`      ⚠️  Session open but unpaid (user may have abandoned)`);
        } else if (session.status === 'expired') {
          console.log(`      ⚠️  Session expired (payment never completed)`);
        }
        console.log('');
      });
    } catch (error) {
      console.log(`   ❌ Error loading sessions: ${error.message}`);
    }
  } else {
    console.log('   ⚠️  Skipped (Stripe key not configured)');
  }
  console.log('');

  // Check 5: Businesses without packages
  console.log('📋 CHECK 5: Businesses Without Packages');
  console.log('-'.repeat(60));
  
  try {
    const { data: businesses } = await supabaseClient
      .from('businesses')
      .select('id, name, email, package_id, stripe_subscription_id, usage_limit_minutes')
      .is('package_id', null)
      .is('deleted_at', null)
      .limit(10);
    
    if (businesses && businesses.length > 0) {
      console.log(`   Found ${businesses.length} businesses without packages:`);
      businesses.forEach(business => {
        console.log(`   - ${business.name} (${business.email})`);
        console.log(`     Usage limit: ${business.usage_limit_minutes || 'NULL'} minutes`);
        console.log(`     Subscription: ${business.stripe_subscription_id || 'NONE'}`);
      });
    } else {
      console.log('   ✅ All businesses have packages assigned');
    }
  } catch (error) {
    console.log(`   ❌ Error loading businesses: ${error.message}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  if (!hasStripeKey) {
    console.log('❌ STRIPE NOT CONFIGURED');
    console.log('   Payments are being skipped. Configure STRIPE_SECRET_KEY to enable payments.');
  } else if (!hasWebhookSecret) {
    console.log('⚠️  WEBHOOK NOT CONFIGURED');
    console.log('   Payments may complete but webhooks won\'t be processed.');
    console.log('   Configure STRIPE_WEBHOOK_SECRET and set up webhook in Stripe Dashboard.');
  } else {
    console.log('✅ STRIPE CONFIGURED');
    console.log('   If payments still aren\'t working:');
    console.log('   1. Check browser console for errors when clicking payment button');
    console.log('   2. Check server logs when initiating checkout');
    console.log('   3. Verify webhook URL in Stripe Dashboard matches your backend URL');
    console.log('   4. Test with Stripe test cards (4242 4242 4242 4242)');
  }
  
  console.log('');
}

diagnosePaymentIssue();


