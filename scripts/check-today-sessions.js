// Check for checkout sessions created today
import dotenv from 'dotenv';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

async function checkTodaySessions() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 CHECKING TODAY\'S CHECKOUT SESSIONS');
  console.log('='.repeat(60) + '\n');

  try {
    const stripe = getStripeInstance();
    
    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(today.getTime() / 1000);
    
    console.log(`Looking for sessions created after: ${today.toLocaleString()}\n`);
    
    // Get sessions created today
    const sessions = await stripe.checkout.sessions.list({
      limit: 20,
      created: { gte: todayTimestamp },
      expand: ['data.customer', 'data.subscription'],
    });

    console.log(`Found ${sessions.data.length} sessions created today:\n`);

    if (sessions.data.length === 0) {
      console.log('❌ NO CHECKOUT SESSIONS CREATED TODAY');
      console.log('   This means the checkout button is not creating Stripe sessions');
      console.log('   Check server logs for errors when clicking payment button');
    } else {
      sessions.data.forEach((session, index) => {
        const createdDate = new Date(session.created * 1000);
        console.log(`${index + 1}. Session ID: ${session.id}`);
        console.log(`   Created: ${createdDate.toLocaleString()}`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Payment Status: ${session.payment_status}`);
        console.log(`   Business ID: ${session.metadata?.business_id || 'N/A'}`);
        console.log(`   Package ID: ${session.metadata?.package_id || 'N/A'}`);
        
        if (session.status === 'open' && session.payment_status === 'unpaid') {
          console.log(`   ⚠️  OPEN BUT UNPAID - User may have been redirected but didn't complete payment`);
          console.log(`   Checkout URL: ${session.url}`);
        } else if (session.status === 'complete' && session.payment_status === 'paid') {
          console.log(`   ✅ PAYMENT COMPLETED`);
        } else if (session.status === 'expired') {
          console.log(`   ⚠️  EXPIRED - Payment was never completed`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkTodaySessions();


