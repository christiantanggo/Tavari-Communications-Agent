// Check for failed payment attempts
import dotenv from 'dotenv';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

async function checkFailedPayments() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 CHECKING FOR FAILED PAYMENTS');
  console.log('='.repeat(60) + '\n');

  try {
    const stripe = getStripeInstance();
    
    // Get recent payment intents
    console.log('📋 RECENT PAYMENT INTENTS:');
    console.log('-'.repeat(60));
    
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 10,
    });

    if (paymentIntents.data.length === 0) {
      console.log('   No payment intents found');
    } else {
      paymentIntents.data.forEach((pi, index) => {
        const createdDate = new Date(pi.created * 1000);
        console.log(`\n${index + 1}. Payment Intent: ${pi.id}`);
        console.log(`   Created: ${createdDate.toLocaleString()}`);
        console.log(`   Status: ${pi.status}`);
        console.log(`   Amount: $${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`);
        
        if (pi.last_payment_error) {
          console.log(`   ❌ LAST PAYMENT ERROR:`);
          console.log(`      Type: ${pi.last_payment_error.type}`);
          console.log(`      Code: ${pi.last_payment_error.code}`);
          console.log(`      Message: ${pi.last_payment_error.message}`);
          console.log(`      Decline Code: ${pi.last_payment_error.decline_code || 'N/A'}`);
        }
        
        if (pi.status === 'requires_payment_method') {
          console.log(`   ⚠️  Requires payment method (payment failed or canceled)`);
        } else if (pi.status === 'requires_confirmation') {
          console.log(`   ⚠️  Requires confirmation`);
        } else if (pi.status === 'processing') {
          console.log(`   ⏳ Processing...`);
        } else if (pi.status === 'succeeded') {
          console.log(`   ✅ Succeeded`);
        } else if (pi.status === 'canceled') {
          console.log(`   ❌ Canceled`);
        }
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 RECENT CHECKOUT SESSIONS WITH ISSUES:');
    console.log('-'.repeat(60));
    
    // Get recent checkout sessions
    const sessions = await stripe.checkout.sessions.list({
      limit: 5,
      expand: ['data.payment_intent'],
    });
    
    sessions.data.forEach((session, index) => {
      const createdDate = new Date(session.created * 1000);
      console.log(`\n${index + 1}. Session: ${session.id}`);
      console.log(`   Created: ${createdDate.toLocaleString()}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Payment Status: ${session.payment_status}`);
      
      if (session.status === 'open' && session.payment_status === 'unpaid') {
        console.log(`   ⚠️  OPEN BUT UNPAID - Payment was never completed`);
      } else if (session.status === 'expired') {
        console.log(`   ❌ EXPIRED - Session expired without payment`);
      } else if (session.status === 'complete' && session.payment_status === 'unpaid') {
        console.log(`   ⚠️  COMPLETE BUT UNPAID - This is unusual`);
      }
      
      if (session.payment_status === 'no_payment_required') {
        console.log(`   ℹ️  No payment required (0 amount)`);
      }
    });
    
    console.log('');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkFailedPayments();


