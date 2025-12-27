// Check all recent checkout sessions to find failed payments
import dotenv from 'dotenv';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

async function checkAllRecentSessions() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 CHECKING ALL RECENT CHECKOUT SESSIONS');
  console.log('='.repeat(60) + '\n');

  try {
    const stripe = getStripeInstance();
    
    // Get the last 10 sessions
    const sessions = await stripe.checkout.sessions.list({
      limit: 10,
      expand: ['data.payment_intent', 'data.subscription', 'data.customer'],
    });

    if (sessions.data.length === 0) {
      console.log('❌ No checkout sessions found');
      return;
    }

    console.log(`Found ${sessions.data.length} recent sessions:\n`);

    sessions.data.forEach((session, index) => {
      const createdDate = new Date(session.created * 1000);
      const amount = session.amount_total ? (session.amount_total / 100).toFixed(2) : '0.00';
      
      console.log(`${index + 1}. Session: ${session.id}`);
      console.log(`   Created: ${createdDate.toLocaleString()}`);
      console.log(`   Amount: $${amount} CAD`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Payment Status: ${session.payment_status}`);
      
      // Check payment intent if available
      if (session.payment_intent) {
        const paymentIntent = typeof session.payment_intent === 'string'
          ? null // Would need to retrieve separately
          : session.payment_intent;
        
        if (paymentIntent) {
          console.log(`   Payment Intent Status: ${paymentIntent.status}`);
          if (paymentIntent.last_payment_error) {
            console.log(`   ⚠️  Payment Error: ${paymentIntent.last_payment_error.message}`);
          }
        }
      }
      
      // Check subscription
      if (session.subscription) {
        const subscription = typeof session.subscription === 'string'
          ? null
          : session.subscription;
        
        if (subscription) {
          console.log(`   Subscription: ${subscription.id} (${subscription.status})`);
        } else {
          console.log(`   Subscription ID: ${session.subscription}`);
        }
      }
      
      // Check customer
      if (session.customer) {
        const customer = typeof session.customer === 'string'
          ? null
          : session.customer;
        
        if (customer) {
          console.log(`   Customer: ${customer.email || 'N/A'}`);
        } else {
          console.log(`   Customer ID: ${session.customer}`);
        }
      }
      
      // Highlight issues
      if (session.status === 'open' && session.payment_status === 'unpaid') {
        console.log(`   ⚠️  ISSUE: Session is open but unpaid`);
      } else if (session.status === 'complete' && session.payment_status !== 'paid') {
        console.log(`   ⚠️  ISSUE: Session complete but payment not paid (${session.payment_status})`);
      } else if (parseFloat(amount) < 0.50) {
        console.log(`   ⚠️  WARNING: Amount is below Stripe minimum ($0.50 CAD)`);
      }
      
      console.log('');
    });
    
    // Summary
    const paidSessions = sessions.data.filter(s => s.payment_status === 'paid');
    const unpaidSessions = sessions.data.filter(s => s.payment_status === 'unpaid');
    const openSessions = sessions.data.filter(s => s.status === 'open');
    
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total sessions: ${sessions.data.length}`);
    console.log(`✅ Paid: ${paidSessions.length}`);
    console.log(`❌ Unpaid: ${unpaidSessions.length}`);
    console.log(`⏳ Open: ${openSessions.length}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkAllRecentSessions();

