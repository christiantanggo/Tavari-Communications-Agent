// Script to manually process a checkout session that wasn't processed by webhook
// Usage: node scripts/manual-process-checkout.js <checkout-session-id>

import dotenv from 'dotenv';
import { StripeService } from '../services/stripe.js';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

const checkoutSessionId = process.argv[2];

if (!checkoutSessionId) {
  console.error('Usage: node scripts/manual-process-checkout.js <checkout-session-id>');
  process.exit(1);
}

async function manualProcessCheckout() {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 MANUAL CHECKOUT PROCESSING');
  console.log('='.repeat(60) + '\n');

  try {
    // Retrieve the checkout session from Stripe
    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['subscription', 'customer'],
    });

    console.log('✅ Checkout session retrieved');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Payment status: ${session.payment_status}`);
    console.log(`   Status: ${session.status}`);
    console.log('');

    if (session.status !== 'complete' || session.payment_status !== 'paid') {
      console.log('❌ ERROR: Session is not complete or payment is not paid');
      console.log(`   Status: ${session.status}, Payment Status: ${session.payment_status}`);
      console.log('   This script only processes completed, paid sessions');
      return;
    }

    if (!session.subscription) {
      console.log('❌ ERROR: Session has no subscription');
      console.log('   This usually means the session is not a subscription payment');
      return;
    }

    const subscriptionId = typeof session.subscription === 'string' 
      ? session.subscription 
      : session.subscription.id;

    console.log(`✅ Subscription ID: ${subscriptionId}`);
    console.log(`   Business ID: ${session.metadata?.business_id || 'N/A'}`);
    console.log(`   Package ID: ${session.metadata?.package_id || 'N/A'}`);
    console.log('');

    // Convert session to the format expected by handleCheckoutCompleted
    // The handler expects the session object as-is from Stripe
    console.log('🔄 Processing checkout session...');
    await StripeService.handleCheckoutCompleted(session);

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ CHECKOUT PROCESSED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('');
    console.log('The business record should now be updated with:');
    console.log(`- Package ID: ${session.metadata?.package_id}`);
    console.log(`- Subscription ID: ${subscriptionId}`);
    console.log('- Plan tier and usage limit minutes');
    console.log('');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

manualProcessCheckout();


