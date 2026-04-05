// Automated test script that tests the payment flow end-to-end
// This simulates signup, checkout creation, and webhook processing

import dotenv from 'dotenv';
import { supabaseClient } from '../config/database.js';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';
import { StripeService } from '../services/stripe.js';
import { getStripeInstance } from '../services/stripe.js';
import { hashPassword } from '../utils/auth.js';
import { User } from '../models/User.js';
import { Subscription } from '../models/v2/Subscription.js';

dotenv.config();

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

async function testPaymentFlowAutomated() {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 AUTOMATED PAYMENT FLOW TEST');
  console.log('='.repeat(60) + '\n');

  let testBusinessId = null;
  let testUserId = null;
  let testPackageId = null;
  let testCheckoutSessionId = null;

  try {
    // Step 1: Create a test business and user
    console.log('📋 STEP 1: Creating test business and user');
    console.log('-'.repeat(60));
    
    const testEmail = `test-payment-${Date.now()}@test.com`;
    const testBusiness = await Business.create({
      name: 'TEST PAYMENT FLOW - DELETE ME',
      email: testEmail,
      phone: '+1234567890',
      address: 'Test Address',
      timezone: 'America/New_York',
    });
    
    testBusinessId = testBusiness.id;
    
    if (testBusiness.usage_limit_minutes !== null && testBusiness.usage_limit_minutes !== undefined) {
      console.log(`❌ FAIL: Business has usage_limit_minutes = ${testBusiness.usage_limit_minutes}`);
      console.log('   Expected: NULL');
      return;
    }
    console.log('✅ Business created with NULL usage_limit_minutes');
    
    const passwordHash = await hashPassword('testpassword123');
    const testUser = await User.create({
      business_id: testBusinessId,
      email: testEmail,
      password_hash: passwordHash,
      first_name: 'Test',
      last_name: 'User',
      role: 'owner',
    });
    
    testUserId = testUser.id;
    console.log('✅ User created');
    console.log('');

    // Step 2: Get a package
    console.log('📋 STEP 2: Getting a package');
    console.log('-'.repeat(60));
    
    const packages = await PricingPackage.findAll({ includeInactive: false, includePrivate: false });
    if (packages.length === 0) {
      console.log('❌ FAIL: No packages found');
      return;
    }
    
    testPackageId = packages[0].id;
    const testPackage = packages[0];
    console.log(`✅ Using package: ${testPackage.name} (${testPackage.minutes_included} minutes)`);
    console.log('');

    // Step 3: Create Stripe checkout session
    console.log('📋 STEP 3: Creating Stripe checkout session');
    console.log('-'.repeat(60));
    
    if (!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY_LIVE && !process.env.STRIPE_SECRET_KEY_TEST) {
      console.log('⚠️  SKIP: Stripe not configured, cannot test checkout session creation');
      console.log('');
    } else {
      try {
        const priceToCharge = testPackage.monthly_price;
        const checkoutSession = await StripeService.createCheckoutSession(
          testBusinessId,
          testPackageId,
          priceToCharge,
          testPackage.name,
          'https://example.com/success',
          'https://example.com/cancel'
        );
        
        testCheckoutSessionId = checkoutSession.sessionId;
        console.log('✅ Checkout session created:', checkoutSession.sessionId);
        console.log('   URL:', checkoutSession.url);
        console.log('');
        
        // Step 4: Simulate webhook event (checkout.session.completed)
        console.log('📋 STEP 4: Simulating checkout.session.completed webhook');
        console.log('-'.repeat(60));
        
        const stripe = getStripeInstance();
        const session = await stripe.checkout.sessions.retrieve(checkoutSession.sessionId, {
          expand: ['subscription']
        });
        
        if (!session.subscription) {
          console.log('⚠️  WARNING: Checkout session has no subscription yet');
          console.log('   This is normal - subscription is created when payment completes');
          console.log('   To fully test, you would need to complete payment in Stripe dashboard');
          console.log('');
        } else {
          console.log('✅ Subscription found:', session.subscription);
          
          // Simulate the webhook event
          const webhookEvent = {
            type: 'checkout.session.completed',
            data: {
              object: session
            }
          };
          
          await StripeService.handleWebhook(webhookEvent);
          console.log('✅ Webhook processed');
          console.log('');
          
          // Step 5: Verify business was updated
          console.log('📋 STEP 5: Verifying business was updated');
          console.log('-'.repeat(60));
          
          const updatedBusiness = await Business.findById(testBusinessId);
          
          if (updatedBusiness.package_id !== testPackageId) {
            console.log(`❌ FAIL: package_id not set. Expected: ${testPackageId}, Got: ${updatedBusiness.package_id}`);
          } else {
            console.log('✅ package_id correctly set');
          }
          
          if (updatedBusiness.usage_limit_minutes !== testPackage.minutes_included) {
            console.log(`❌ FAIL: usage_limit_minutes incorrect. Expected: ${testPackage.minutes_included}, Got: ${updatedBusiness.usage_limit_minutes}`);
          } else {
            console.log('✅ usage_limit_minutes correctly set:', updatedBusiness.usage_limit_minutes);
          }
          
          if (!updatedBusiness.stripe_subscription_id) {
            console.log('❌ FAIL: stripe_subscription_id not set');
          } else {
            console.log('✅ stripe_subscription_id set:', updatedBusiness.stripe_subscription_id);
          }
          
          if (updatedBusiness.stripe_subscription_status !== 'active') {
            console.log(`❌ FAIL: stripe_subscription_status incorrect. Expected: active, Got: ${updatedBusiness.stripe_subscription_status}`);
          } else {
            console.log('✅ stripe_subscription_status correctly set: active');
          }

          const modKey = String(testPackage.module_key || 'phone-agent').trim() || 'phone-agent';
          const v2Sub = await Subscription.findByBusinessAndModule(testBusinessId, modKey);
          if (!v2Sub || v2Sub.status !== 'active') {
            console.log(`❌ FAIL: v2 subscriptions row missing or inactive for module_key=${modKey}`);
          } else {
            console.log(`✅ v2 subscription active for module_key=${modKey}`);
          }
          console.log('');
        }
      } catch (error) {
        console.log('❌ ERROR in Stripe operations:', error.message);
        console.log('   This might be expected if Stripe keys are not configured correctly');
        console.log('');
      }
    }

    // Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log('\n✅ Automated test complete');
    console.log('\nNote: To fully test payment flow, you need to:');
    console.log('1. Complete the checkout in Stripe (use test card: 4242 4242 4242 4242)');
    console.log('2. Or trigger the webhook manually from Stripe dashboard');
    console.log('3. Then run: npm run check:payment <email>');
    console.log('');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup - delete test data
    console.log('🧹 Cleaning up test data...');
    try {
      if (testUserId) {
        await supabaseClient.from('users').delete().eq('id', testUserId);
        console.log('   Deleted test user');
      }
      if (testBusinessId) {
        await supabaseClient.from('businesses').delete().eq('id', testBusinessId);
        console.log('   Deleted test business');
      }
      
      // If we created a checkout session, it will expire naturally
      if (testCheckoutSessionId) {
        console.log('   Checkout session will expire naturally:', testCheckoutSessionId);
      }
    } catch (cleanupError) {
      console.warn('⚠️  Cleanup error:', cleanupError.message);
    }
    console.log('✅ Cleanup complete\n');
  }
}

testPaymentFlowAutomated()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });


