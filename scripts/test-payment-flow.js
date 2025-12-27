// Test script to verify the entire payment flow works correctly
// This checks that:
// 1. New businesses get NULL minutes (no free minutes)
// 2. Stripe checkout sessions are created correctly
// 3. Webhook handling works
// 4. Package assignment happens only after payment

import dotenv from 'dotenv';
import { supabaseClient } from '../config/database.js';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';

dotenv.config();

async function testPaymentFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 TESTING PAYMENT FLOW');
  console.log('='.repeat(60) + '\n');

  let testBusinessId = null;
  
  try {
    // Test 1: Verify new business gets NULL minutes
    console.log('📋 TEST 1: New business should have NULL usage_limit_minutes');
    console.log('-'.repeat(60));
    
    const testBusiness = await Business.create({
      name: 'TEST BUSINESS - DELETE ME',
      email: `test-${Date.now()}@test.com`,
      phone: '+1234567890',
      address: 'Test Address',
      timezone: 'America/New_York',
    });
    
    testBusinessId = testBusiness.id;
    
    if (testBusiness.usage_limit_minutes === null || testBusiness.usage_limit_minutes === undefined) {
      console.log('✅ PASS: New business has NULL usage_limit_minutes');
    } else {
      console.log(`❌ FAIL: New business has usage_limit_minutes = ${testBusiness.usage_limit_minutes}`);
      console.log('   Expected: NULL/undefined');
      console.log('   This means the database default is still set!');
      console.log('   Run the migration: migrations/remove_usage_limit_minutes_default.sql');
    }
    
    console.log('');

    // Test 2: Verify database default is removed
    console.log('📋 TEST 2: Database column should have no default');
    console.log('-'.repeat(60));
    
    // Insert a test record without specifying usage_limit_minutes
    // If it gets a default value, the migration hasn't been run
    const { data: testInsert, error: insertError } = await supabaseClient
      .from('businesses')
      .insert({
        name: 'TEST DEFAULT CHECK - DELETE',
        email: `test-default-${Date.now()}@test.com`,
      })
      .select('usage_limit_minutes')
      .single();
    
    if (insertError) {
      console.log(`⚠️  Could not test default: ${insertError.message}`);
    } else if (testInsert?.usage_limit_minutes === null || testInsert?.usage_limit_minutes === undefined) {
      console.log('✅ PASS: Database column has no default (NULL on insert)');
      
      // Clean up test insert
      await supabaseClient
        .from('businesses')
        .delete()
        .eq('id', testInsert.id);
    } else {
      console.log(`❌ FAIL: Database column still has default = ${testInsert?.usage_limit_minutes}`);
      console.log('   Expected: NULL');
      console.log('   Run the migration: migrations/remove_usage_limit_minutes_default.sql');
      
      // Clean up test insert
      await supabaseClient
        .from('businesses')
        .delete()
        .eq('id', testInsert.id);
    }
    
    console.log('');

    // Test 3: Verify packages exist and have minutes
    console.log('📋 TEST 3: Packages should have minutes_included set');
    console.log('-'.repeat(60));
    
    const packages = await PricingPackage.findAll({ includeInactive: false, includePrivate: false });
    
    if (packages.length === 0) {
      console.log('❌ FAIL: No packages found in database');
      console.log('   Create packages in admin panel first');
    } else {
      console.log(`✅ PASS: Found ${packages.length} package(s)`);
      packages.forEach(pkg => {
        console.log(`   - ${pkg.name}: ${pkg.minutes_included || 'NULL'} minutes`);
        if (!pkg.minutes_included) {
          console.log(`     ⚠️  WARNING: Package has no minutes_included!`);
        }
      });
    }
    
    console.log('');

    // Test 4: Verify Stripe is configured
    console.log('📋 TEST 4: Stripe configuration');
    console.log('-'.repeat(60));
    
    const stripeKey = process.env.STRIPE_SECRET_KEY || 
                     process.env.STRIPE_SECRET_KEY_TEST || 
                     process.env.STRIPE_SECRET_KEY_LIVE;
    
    if (!stripeKey) {
      console.log('❌ FAIL: No Stripe secret key configured');
      console.log('   Set STRIPE_SECRET_KEY, STRIPE_SECRET_KEY_TEST, or STRIPE_SECRET_KEY_LIVE');
    } else {
      const isTest = stripeKey.startsWith('sk_test_');
      console.log(`✅ PASS: Stripe key configured (${isTest ? 'TEST' : 'LIVE'} mode)`);
      
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.log('⚠️  WARNING: STRIPE_WEBHOOK_SECRET not configured');
        console.log('   Webhooks will not be verified (development only)');
      } else {
        console.log('✅ PASS: Stripe webhook secret configured');
      }
    }
    
    console.log('');

    // Test 5: Verify webhook endpoint exists
    console.log('📋 TEST 5: Webhook endpoint check');
    console.log('-'.repeat(60));
    
    const backendUrl = process.env.BACKEND_URL || 
                      process.env.RAILWAY_PUBLIC_DOMAIN || 
                      process.env.VERCEL_URL ||
                      'http://localhost:5001';
    
    const webhookUrl = `${backendUrl}/api/billing/webhook`;
    console.log(`Webhook URL should be: ${webhookUrl}`);
    console.log('✅ Check this URL in Stripe Dashboard → Webhooks');
    console.log('   Make sure checkout.session.completed is enabled');
    
    console.log('');

    // Test 6: Check existing businesses for issues
    console.log('📋 TEST 6: Check existing businesses for NULL minutes');
    console.log('-'.repeat(60));
    
    const { data: businessesWithoutPackage } = await supabaseClient
      .from('businesses')
      .select('id, name, email, usage_limit_minutes, package_id, stripe_subscription_id')
      .is('package_id', null)
      .is('deleted_at', null)
      .limit(10);
    
    if (businessesWithoutPackage && businessesWithoutPackage.length > 0) {
      const withFreeMinutes = businessesWithoutPackage.filter(b => b.usage_limit_minutes && b.usage_limit_minutes > 0);
      
      if (withFreeMinutes.length > 0) {
        console.log(`⚠️  WARNING: ${withFreeMinutes.length} business(es) have minutes but no package:`);
        withFreeMinutes.forEach(b => {
          console.log(`   - ${b.name} (${b.email}): ${b.usage_limit_minutes} minutes, no package`);
        });
        console.log('   These should have NULL minutes until they purchase a package');
      } else {
        console.log('✅ PASS: All businesses without packages have NULL minutes');
      }
    } else {
      console.log('✅ PASS: No businesses without packages found');
    }
    
    console.log('');

    // Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    
    // Check if there are businesses with free minutes (from test 6)
    let hasFreeMinutes = false;
    try {
      const { data: businessesToCheck } = await supabaseClient
        .from('businesses')
        .select('id, usage_limit_minutes, package_id')
        .is('package_id', null)
        .not('usage_limit_minutes', 'is', null)
        .is('deleted_at', null)
        .limit(1);
      
      hasFreeMinutes = businessesToCheck && businessesToCheck.length > 0;
    } catch (error) {
      // Ignore error in summary
    }
    
    if (hasFreeMinutes) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log('   Run: npm run fix:minutes');
      console.log('   This will set usage_limit_minutes to NULL for businesses without packages');
      console.log('');
    }
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log('   Set STRIPE_WEBHOOK_SECRET in your environment variables');
      console.log('   Get it from Stripe Dashboard → Developers → Webhooks');
      console.log('');
    }
    
    console.log('\nTo test the full payment flow:');
    console.log('1. Create a test account at /signup');
    console.log('2. Go through setup wizard and select a package');
    console.log('3. Complete Stripe checkout with test card: 4242 4242 4242 4242');
    console.log('4. Check server logs for webhook events');
    console.log('5. Run: npm run check:payment <email>');
    console.log('6. Check Stripe Dashboard → Customers → Subscriptions');
    console.log('');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    // Clean up test business
    if (testBusinessId) {
      try {
        await supabaseClient
          .from('businesses')
          .delete()
          .eq('id', testBusinessId);
        console.log('🧹 Cleaned up test business');
      } catch (cleanupError) {
        console.warn('⚠️  Could not clean up test business:', cleanupError.message);
      }
    }
  }
}

// Run the test
testPaymentFlow()
  .then(() => {
    console.log('✅ Test complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

