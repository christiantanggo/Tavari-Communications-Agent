// scripts/backfill-invoices.js
// Backfill invoice records for businesses with existing Stripe subscriptions
// This creates invoices for payments that happened before invoice creation was implemented

import dotenv from 'dotenv';
dotenv.config();

import { supabaseClient } from '../config/database.js';
import { getStripeInstance } from '../services/stripe.js';

// Import generateInvoiceNumber from invoices service
import { generateInvoiceNumber } from '../services/invoices.js';

async function backfillInvoices() {
  console.log('='.repeat(60));
  console.log('🔄 BACKFILLING INVOICES FOR EXISTING PAYMENTS');
  console.log('='.repeat(60));
  console.log('');

  try {
    const stripe = getStripeInstance();
    
    // Find all businesses with Stripe subscriptions
    const { data: businesses, error: bizError } = await supabaseClient
      .from('businesses')
      .select('id, name, email, stripe_subscription_id, stripe_customer_id, created_at')
      .not('stripe_subscription_id', 'is', null)
      .is('deleted_at', null);
    
    if (bizError) {
      throw new Error(`Failed to fetch businesses: ${bizError.message}`);
    }
    
    if (!businesses || businesses.length === 0) {
      console.log('✅ No businesses with Stripe subscriptions found.');
      return;
    }
    
    console.log(`Found ${businesses.length} businesses with Stripe subscriptions\n`);
    
    let totalInvoicesCreated = 0;
    let totalInvoicesSkipped = 0;
    let errors = 0;
    
    for (const business of businesses) {
      try {
        console.log(`\n📋 Processing business: ${business.name} (${business.email})`);
        console.log(`   Subscription ID: ${business.stripe_subscription_id}`);
        
        // Get existing invoices for this business
        const { data: existingInvoices } = await supabaseClient
          .from('invoices')
          .select('stripe_invoice_id')
          .eq('business_id', business.id)
          .not('stripe_invoice_id', 'is', null);
        
        const existingStripeInvoiceIds = new Set(
          (existingInvoices || []).map(inv => inv.stripe_invoice_id).filter(Boolean)
        );
        
        console.log(`   Existing invoices in database: ${existingStripeInvoiceIds.size}`);
        
        // Retrieve subscription from Stripe
        let subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(business.stripe_subscription_id, {
            expand: ['latest_invoice', 'default_payment_method'],
          });
        } catch (subError) {
          console.warn(`   ⚠️  Could not retrieve subscription: ${subError.message}`);
          continue;
        }
        
        // Get all invoices for this subscription
        const stripeInvoices = await stripe.invoices.list({
          subscription: business.stripe_subscription_id,
          limit: 100, // Get up to 100 invoices (should be enough for most cases)
        });
        
        // Sort invoices by created date (oldest first) to identify the initial invoice
        stripeInvoices.data.sort((a, b) => a.created - b.created);
        
        console.log(`   Found ${stripeInvoices.data.length} invoices in Stripe`);
        
        // Create invoices for any that don't exist in our database
        for (let i = 0; i < stripeInvoices.data.length; i++) {
          const stripeInvoice = stripeInvoices.data[i];
          
          // Skip if we already have this invoice
          if (existingStripeInvoiceIds.has(stripeInvoice.id)) {
            console.log(`   ⏭️  Skipping invoice ${stripeInvoice.id} (already exists)`);
            totalInvoicesSkipped++;
            continue;
          }
          
          // Only process paid invoices
          if (stripeInvoice.status !== 'paid') {
            console.log(`   ⏭️  Skipping invoice ${stripeInvoice.id} (status: ${stripeInvoice.status})`);
            continue;
          }
          
          try {
            // Generate invoice number using the business's account number
            const invoiceNumber = await generateInvoiceNumber(business.id);
            const amountCharged = stripeInvoice.amount_paid ? stripeInvoice.amount_paid / 100 : (stripeInvoice.amount_due / 100);
            
            // Get invoice settings for tax rate
            const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
            const invoiceSettings = await InvoiceSettings.get();
            const taxRate = invoiceSettings?.tax_rate || 0.13;
            
            // Calculate subtotal and tax (assume amountCharged includes tax)
            const subtotal = amountCharged / (1 + taxRate);
            const taxAmount = amountCharged - subtotal;
            
            // Determine invoice type - the first invoice (oldest, index 0) is the setup invoice
            const isInitialInvoice = i === 0;
            const invoiceType = isInitialInvoice ? 'subscription_setup' : 'subscription_recurring';
            
            const { data: createdInvoice, error: invoiceError } = await supabaseClient
              .from('invoices')
              .insert({
                business_id: business.id,
                invoice_number: invoiceNumber,
                stripe_invoice_id: stripeInvoice.id,
                subtotal: subtotal,
                tax_rate: taxRate,
                tax_amount: taxAmount,
                amount: amountCharged, // Total including tax
                currency: stripeInvoice.currency || 'cad',
                invoice_type: invoiceType,
                period_start: stripeInvoice.period_start ? new Date(stripeInvoice.period_start * 1000).toISOString().split('T')[0] : null,
                period_end: stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000).toISOString().split('T')[0] : null,
                status: 'paid',
                paid_at: stripeInvoice.status_transitions?.paid_at ? new Date(stripeInvoice.status_transitions.paid_at * 1000).toISOString() : new Date(stripeInvoice.created * 1000).toISOString(),
              })
              .select()
              .single();
            
            if (invoiceError) {
              // Check if it's a duplicate key error (invoice number or stripe_invoice_id)
              if (invoiceError.code === '23505') {
                console.log(`   ⏭️  Skipping invoice ${stripeInvoice.id} (duplicate key - may have been created concurrently)`);
                totalInvoicesSkipped++;
                continue;
              }
              throw invoiceError;
            }
            
            console.log(`   ✅ Created invoice ${invoiceNumber} for ${amountCharged.toFixed(2)} ${stripeInvoice.currency?.toUpperCase() || 'CAD'} (${invoiceType})`);
            totalInvoicesCreated++;
            
          } catch (invoiceCreateError) {
            console.error(`   ❌ Failed to create invoice for ${stripeInvoice.id}:`, invoiceCreateError.message);
            errors++;
          }
        }
        
      } catch (businessError) {
        console.error(`   ❌ Error processing business ${business.id}:`, businessError.message);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Invoices created: ${totalInvoicesCreated}`);
    console.log(`⏭️  Invoices skipped: ${totalInvoicesSkipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the backfill
backfillInvoices()
  .then(() => {
    console.log('\n✅ Backfill completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  });

