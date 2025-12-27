// Comprehensive payment flow diagnosis
import dotenv from 'dotenv';
import { getStripeInstance } from '../services/stripe.js';
import { Business } from '../models/Business.js';
import { supabaseClient } from '../config/database.js';

dotenv.config();

async function diagnosePaymentFlow() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 COMPREHENSIVE PAYMENT FLOW DIAGNOSIS');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. Check Stripe configuration
    console.log('1️⃣ STRIPE CONFIGURATION:');
    console.log('='.repeat(60));
    const mode = process.env.STRIPE_MODE?.toLowerCase() || 'auto';
    const testKey = process.env.STRIPE_SECRET_KEY_TEST;
    const liveKey = process.env.STRIPE_SECRET_KEY_LIVE;
    const singleKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    console.log(`   Mode: ${mode}`);
    console.log(`   Test key configured: ${!!testKey}`);
    console.log(`   Live key configured: ${!!liveKey}`);
    console.log(`   Single key configured: ${!!singleKey}`);
    console.log(`   Webhook secret configured: ${!!webhookSecret}`);
    
    const stripe = getStripeInstance();
    const account = await stripe.accounts.retrieve();
    console.log(`   Stripe account ID: ${account.id}`);
    console.log(`   Stripe account country: ${account.country}`);
    console.log(`   Charges enabled: ${account.charges_enabled}`);
    console.log(`   Payouts enabled: ${account.payouts_enabled}`);
    console.log('');
    
    // 2. Check recent checkout sessions
    console.log('2️⃣ RECENT CHECKOUT SESSIONS (last 10):');
    console.log('='.repeat(60));
    const sessions = await stripe.checkout.sessions.list({
      limit: 10,
      expand: ['data.subscription', 'data.customer'],
    });
    
    if (sessions.data.length === 0) {
      console.log('   ❌ No checkout sessions found');
    } else {
      sessions.data.forEach((session, index) => {
        const created = new Date(session.created * 1000);
        const amount = session.amount_total ? (session.amount_total / 100).toFixed(2) : '0.00';
        console.log(`   ${index + 1}. ${session.id}`);
        console.log(`      Created: ${created.toLocaleString()}`);
        console.log(`      Amount: $${amount} CAD`);
        console.log(`      Status: ${session.status}`);
        console.log(`      Payment Status: ${session.payment_status}`);
        if (session.subscription) {
          const sub = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          console.log(`      Subscription: ${sub}`);
        }
        if (session.customer) {
          const cust = typeof session.customer === 'string' ? session.customer : session.customer.id;
          console.log(`      Customer: ${cust}`);
        }
        if (session.metadata?.business_id) {
          console.log(`      Business ID: ${session.metadata.business_id}`);
        }
        console.log('');
      });
    }
    
    // 3. Check businesses without packages
    console.log('3️⃣ BUSINESSES WITHOUT PACKAGES:');
    console.log('='.repeat(60));
    const { data: businesses, error: businessError } = await supabaseClient
      .from('businesses')
      .select('id, email, name, package_id, stripe_subscription_id, stripe_customer_id, usage_limit_minutes, created_at')
      .is('deleted_at', null)
      .is('package_id', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (businessError) {
      console.error('   ❌ Error querying businesses:', businessError);
    } else if (businesses.length === 0) {
      console.log('   ✅ All businesses have packages assigned');
    } else {
      console.log(`   Found ${businesses.length} businesses without packages:`);
      businesses.forEach(b => {
        console.log(`   - ${b.email || b.name || b.id}`);
        console.log(`     Created: ${new Date(b.created_at).toLocaleString()}`);
        console.log(`     Customer ID: ${b.stripe_customer_id || 'none'}`);
        console.log(`     Subscription ID: ${b.stripe_subscription_id || 'none'}`);
        console.log(`     Minutes: ${b.usage_limit_minutes || 'null'}`);
        console.log('');
      });
    }
    
    // 4. Check for recent businesses with customer IDs but no packages
    console.log('4️⃣ BUSINESSES WITH STRIPE CUSTOMERS BUT NO PACKAGES:');
    console.log('='.repeat(60));
    const { data: businessesWithCustomers, error: customersError } = await supabaseClient
      .from('businesses')
      .select('id, email, name, package_id, stripe_subscription_id, stripe_customer_id, usage_limit_minutes, created_at')
      .is('deleted_at', null)
      .not('stripe_customer_id', 'is', null)
      .is('package_id', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (customersError) {
      console.error('   ❌ Error querying businesses:', customersError);
    } else if (businessesWithCustomers.length === 0) {
      console.log('   ✅ No businesses with customers but no packages');
    } else {
      console.log(`   Found ${businessesWithCustomers.length} businesses:`);
      businessesWithCustomers.forEach(b => {
        console.log(`   - ${b.email || b.name || b.id}`);
        console.log(`     Customer ID: ${b.stripe_customer_id}`);
        console.log(`     Subscription ID: ${b.stripe_subscription_id || 'none'}`);
        console.log(`     Created: ${new Date(b.created_at).toLocaleString()}`);
        console.log('');
      });
    }
    
    // 5. Check webhook endpoint
    console.log('5️⃣ WEBHOOK ENDPOINT STATUS:');
    console.log('='.repeat(60));
    const backendUrl = process.env.BACKEND_URL || 
                      process.env.RAILWAY_PUBLIC_DOMAIN || 
                      process.env.VERCEL_URL || 
                      process.env.SERVER_URL ||
                      'http://localhost:5001';
    const webhookUrl = `${backendUrl}/api/billing/webhook`;
    console.log(`   Expected webhook URL: ${webhookUrl}`);
    console.log(`   ⚠️  Make sure this is configured in Stripe Dashboard:`);
    console.log(`      - Go to Stripe Dashboard > Developers > Webhooks`);
    console.log(`      - Add endpoint: ${webhookUrl}`);
    console.log(`      - Select events: checkout.session.completed, customer.subscription.*, invoice.payment_*`);
    console.log('');
    
    // 6. Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    
    const paidSessions = sessions.data.filter(s => s.payment_status === 'paid');
    const unpaidSessions = sessions.data.filter(s => s.payment_status !== 'unpaid');
    
    console.log(`   Total sessions found: ${sessions.data.length}`);
    console.log(`   Paid sessions: ${paidSessions.length}`);
    console.log(`   Unpaid sessions: ${unpaidSessions.length}`);
    console.log(`   Businesses without packages: ${businesses?.length || 0}`);
    console.log(`   Businesses with customers but no packages: ${businessesWithCustomers?.length || 0}`);
    console.log('');
    
    if (businessesWithCustomers && businessesWithCustomers.length > 0) {
      console.log('   ⚠️  ISSUE DETECTED: Businesses have Stripe customers but no packages assigned');
      console.log('      This suggests checkout completed but webhook did not update business records');
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

diagnosePaymentFlow();

