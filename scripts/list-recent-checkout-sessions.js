// Script to list recent Stripe checkout sessions
// This helps find the session ID if you don't have it

import dotenv from 'dotenv';
import { getStripeInstance } from '../services/stripe.js';

dotenv.config();

async function listRecentSessions() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 LISTING RECENT CHECKOUT SESSIONS');
  console.log('='.repeat(60) + '\n');

  try {
    const stripe = getStripeInstance();
    
    // Get the last 10 checkout sessions
    const sessions = await stripe.checkout.sessions.list({
      limit: 10,
      expand: ['data.customer', 'data.subscription'],
    });

    console.log(`Found ${sessions.data.length} recent checkout sessions:\n`);

    sessions.data.forEach((session, index) => {
      console.log(`${index + 1}. Session ID: ${session.id}`);
      console.log(`   Created: ${new Date(session.created * 1000).toLocaleString()}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Payment Status: ${session.payment_status}`);
      console.log(`   Customer: ${typeof session.customer === 'string' ? session.customer : session.customer?.id || 'N/A'}`);
      console.log(`   Subscription: ${session.subscription ? (typeof session.subscription === 'string' ? session.subscription : session.subscription.id) : 'NONE'}`);
      console.log(`   Business ID: ${session.metadata?.business_id || 'N/A'}`);
      console.log(`   Package ID: ${session.metadata?.package_id || 'N/A'}`);
      console.log('');
    });

    if (sessions.data.length > 0) {
      console.log('='.repeat(60));
      console.log('📋 TO VERIFY A SESSION, RUN:');
      console.log(`   npm run verify:webhook ${sessions.data[0].id}`);
      console.log('='.repeat(60) + '\n');
    } else {
      console.log('No checkout sessions found.\n');
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.type === 'StripeAuthenticationError') {
      console.error('   Stripe API key is invalid or not configured');
    }
    console.error(error.stack);
    process.exit(1);
  }
}

listRecentSessions();


