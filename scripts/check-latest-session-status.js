// Check the status of the most recent checkout session
import dotenv from 'dotenv';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

async function checkLatestSession() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 CHECKING LATEST CHECKOUT SESSION STATUS');
  console.log('='.repeat(60) + '\n');

  try {
    const stripe = getStripeInstance();
    
    // Get the most recent session
    const sessions = await stripe.checkout.sessions.list({
      limit: 1,
      expand: ['data.payment_intent', 'data.subscription', 'data.customer'],
    });

    if (sessions.data.length === 0) {
      console.log('❌ No checkout sessions found');
      return;
    }

    const session = sessions.data[0];
    const createdDate = new Date(session.created * 1000);
    
    console.log('📋 MOST RECENT SESSION:');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Created: ${createdDate.toLocaleString()}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Payment Status: ${session.payment_status}`);
    console.log('');
    
    // Check payment intent if available
    if (session.payment_intent) {
      const paymentIntent = typeof session.payment_intent === 'string'
        ? await stripe.paymentIntents.retrieve(session.payment_intent)
        : session.payment_intent;
      
      console.log('💳 PAYMENT INTENT:');
      console.log(`   ID: ${paymentIntent.id}`);
      console.log(`   Status: ${paymentIntent.status}`);
      console.log(`   Amount: $${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency.toUpperCase()}`);
      console.log(`   Last Payment Error: ${paymentIntent.last_payment_error?.message || 'None'}`);
      
      if (paymentIntent.status === 'requires_payment_method') {
        console.log('   ⚠️  Payment requires a valid payment method');
      } else if (paymentIntent.status === 'requires_confirmation') {
        console.log('   ⚠️  Payment requires confirmation');
      } else if (paymentIntent.status === 'succeeded') {
        console.log('   ✅ Payment succeeded');
      } else if (paymentIntent.status === 'canceled') {
        console.log('   ❌ Payment was canceled');
      }
      console.log('');
    }
    
    // Check subscription if available
    if (session.subscription) {
      const subscription = typeof session.subscription === 'string'
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
      
      console.log('📅 SUBSCRIPTION:');
      console.log(`   ID: ${subscription.id}`);
      console.log(`   Status: ${subscription.status}`);
      console.log(`   Current Period End: ${new Date(subscription.current_period_end * 1000).toLocaleString()}`);
      console.log('');
    }
    
    // Check customer
    if (session.customer) {
      const customer = typeof session.customer === 'string'
        ? await stripe.customers.retrieve(session.customer)
        : session.customer;
      
      console.log('👤 CUSTOMER:');
      console.log(`   ID: ${customer.id}`);
      console.log(`   Email: ${customer.email || 'N/A'}`);
      console.log(`   Default Payment Method: ${customer.invoice_settings?.default_payment_method || 'None'}`);
      console.log('');
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    
    if (session.status === 'complete' && session.payment_status === 'paid') {
      console.log('✅ Payment completed successfully');
      if (session.subscription) {
        console.log('   Subscription was created');
      }
    } else if (session.status === 'open' && session.payment_status === 'unpaid') {
      console.log('⚠️  Session is open but payment is unpaid');
      console.log('   Possible causes:');
      console.log('   - Payment was not completed');
      console.log('   - Test card used in LIVE mode');
      console.log('   - Card was declined');
    } else {
      console.log(`⚠️  Unexpected status: ${session.status} / ${session.payment_status}`);
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkLatestSession();


