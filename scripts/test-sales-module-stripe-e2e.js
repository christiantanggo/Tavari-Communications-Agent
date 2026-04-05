/**
 * E2E-style checks for sales path: package module → Stripe subscription → v2 subscriptions row + affiliate ledger module_key.
 *
 * Does not drive the browser. Uses Stripe test mode + API:
 * 1. Creates a sales partner, business (referred_by_partner_id), test card PM on customer.
 * 2. For each target module_key (reviews, delivery-dispatch), finds a pricing_packages row with that module_key.
 * 3. Creates a real Stripe subscription (same shape as post-checkout) and runs the same sync as checkout.session.completed.
 * 4. Asserts subscriptions.status === 'active' and stripe_subscription_item_id matches Stripe.
 * 5. Inserts a synthetic first-sale affiliate earning (unique cs_e2e_* session id) to assert affiliate_earnings.module_key matches the package module.
 *
 * Usage:
 *   node scripts/test-sales-module-stripe-e2e.js
 *
 * Optional — run full webhook path on an already-paid Checkout session:
 *   node scripts/test-sales-module-stripe-e2e.js --checkout-session cs_test_...
 */

import dotenv from 'dotenv';
import { supabaseClient } from '../config/database.js';
import { Business } from '../models/Business.js';
import { PricingPackage } from '../models/PricingPackage.js';
import { Subscription } from '../models/v2/Subscription.js';
import { StripeService, getStripeInstance } from '../services/stripe.js';
import { createPartnerRecordAdmin } from '../services/affiliateProgram.js';
import { recordAffiliateEarningStripeFirstSubscription } from '../services/affiliateEarnings.js';
import { hashPassword } from '../utils/auth.js';
import { User } from '../models/User.js';

dotenv.config();

const TARGET_MODULES = ['reviews', 'delivery-dispatch'];

async function ensureTestPaymentMethod(stripe, customerId) {
  const pm = await stripe.paymentMethods.create({
    type: 'card',
    card: {
      number: '4242424242424242',
      exp_month: 12,
      exp_year: 2034,
      cvc: '123',
    },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });
  return pm.id;
}

async function runCheckoutSessionVerify(sessionId) {
  const stripe = getStripeInstance();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });
  if (session.status !== 'complete' || session.payment_status !== 'paid') {
    console.error('Session must be complete and paid. Got:', session.status, session.payment_status);
    process.exit(1);
  }
  if (!session.subscription) {
    console.error('Session has no subscription');
    process.exit(1);
  }
  const webhookEvent = { type: 'checkout.session.completed', data: { object: session } };
  await StripeService.handleWebhook(webhookEvent);
  const businessId = session.metadata?.business_id;
  const packageId = session.metadata?.package_id;
  const modKey = String(session.metadata?.tavari_module_key || 'phone-agent').trim() || 'phone-agent';
  if (!businessId || !packageId) {
    console.error('Missing business_id or package_id on session metadata');
    process.exit(1);
  }
  const row = await Subscription.findByBusinessAndModule(businessId, modKey);
  if (!row || row.status !== 'active') {
    console.error('FAIL: v2 subscription missing or not active for', modKey, row);
    process.exit(1);
  }
  console.log('OK: webhook path; v2 subscription active for', modKey);
}

async function main() {
  const argv = process.argv.slice(2);
  const csIdx = argv.indexOf('--checkout-session');
  if (csIdx !== -1 && argv[csIdx + 1]) {
    await runCheckoutSessionVerify(argv[csIdx + 1]);
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY_TEST && !process.env.STRIPE_SECRET_KEY_LIVE) {
    console.error('SKIP: No Stripe secret key in env');
    process.exit(0);
  }

  const stripe = getStripeInstance();
  const packages = await PricingPackage.findAll({ includeInactive: false, includePrivate: false });

  let partner = null;
  let business = null;
  let user = null;
  const createdEarningSessionIds = [];
  const createdSubscriptionIds = [];

  try {
    const tag = Date.now();
    partner = await createPartnerRecordAdmin({
      email: `e2e-sales-${tag}@example.com`,
      display_name: 'E2E Sales Rep',
      is_sales_rep: true,
      active: true,
    });

    const testEmail = `e2e-customer-${tag}@example.com`;
    business = await Business.create({
      name: `E2E Sales Module ${tag}`,
      email: testEmail,
      phone: '+15555550100',
      address: '1 Test St',
      timezone: 'America/Toronto',
      referred_by_partner_id: partner.id,
    });

    const passwordHash = await hashPassword('e2e-test-pass-123');
    user = await User.create({
      business_id: business.id,
      email: testEmail,
      password_hash: passwordHash,
      first_name: 'E2E',
      last_name: 'Customer',
      role: 'owner',
    });

    let customerId = business.stripe_customer_id;
    if (!customerId) {
      const c = await stripe.customers.create({
        email: testEmail,
        name: business.name,
        metadata: { business_id: business.id },
      });
      customerId = c.id;
      await Business.update(business.id, { stripe_customer_id: customerId });
    }

    await ensureTestPaymentMethod(stripe, customerId);

    const { InvoiceSettings } = await import('../models/InvoiceSettings.js');
    const invoiceSettings = await InvoiceSettings.get();
    const taxRate = invoiceSettings?.tax_rate || 0.13;

    for (const moduleKey of TARGET_MODULES) {
      const pkg = packages.find((p) => String(p.module_key || '').trim() === moduleKey);
      if (!pkg) {
        console.warn(`SKIP: no public active pricing_packages row with module_key=${moduleKey}`);
        continue;
      }

      const subtotal = Number(pkg.monthly_price);
      if (!Number.isFinite(subtotal) || subtotal <= 0) {
        console.warn(`SKIP: package ${pkg.id} invalid monthly_price`);
        continue;
      }

      const totalWithTax = subtotal * (1 + taxRate);
      const unitAmount = Math.round(totalWithTax * 100);

      const affCode = partner.affiliate_code;
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [
          {
            price_data: {
              currency: 'cad',
              product_data: { name: pkg.name },
              unit_amount: unitAmount,
              recurring: { interval: 'month' },
            },
            quantity: 1,
          },
        ],
        metadata: {
          business_id: business.id,
          package_id: pkg.id,
          tavari_module_key: moduleKey,
          affiliate_code: affCode,
        },
        collection_method: 'charge_automatically',
        payment_behavior: 'error_if_incomplete',
      });

      createdSubscriptionIds.push(subscription.id);
      await Business.update(business.id, {
        stripe_subscription_id: subscription.id,
        stripe_subscription_status: subscription.status,
        package_id: pkg.id,
      });

      const refreshed = await Business.findById(business.id);
      await StripeService.syncV2SubscriptionRowFromPackageCheckout(refreshed.id, refreshed, pkg, subscription.id);

      const row = await Subscription.findByBusinessAndModule(business.id, moduleKey);
      const stripeItemId = subscription.items?.data?.[0]?.id;

      if (!row || row.status !== 'active') {
        throw new Error(`FAIL: v2 subscription not active for ${moduleKey}: ${JSON.stringify(row)}`);
      }
      if (row.stripe_subscription_item_id !== stripeItemId) {
        throw new Error(
          `FAIL: stripe_subscription_item_id mismatch for ${moduleKey}: db=${row.stripe_subscription_item_id} stripe=${stripeItemId}`,
        );
      }
      console.log(`OK: v2 subscribed + item id for module "${moduleKey}"`);

      const syntheticSessionId = `cs_e2e_${moduleKey}_${tag}_${Math.random().toString(36).slice(2, 9)}`;
      const affRes = await recordAffiliateEarningStripeFirstSubscription(
        {
          id: syntheticSessionId,
          metadata: {
            tavari_module_key: moduleKey,
            package_id: pkg.id,
            affiliate_code: affCode,
          },
          amount_total: unitAmount,
          currency: 'cad',
          subscription: subscription.id,
          payment_intent: { id: `pi_e2e_${tag}`, latest_charge: `ch_e2e_${tag}` },
        },
        business.id,
        partner,
        { attributionSource: 'e2e_script' },
      );

      if (!affRes.recorded) {
        throw new Error(`FAIL: affiliate first sale not recorded: ${JSON.stringify(affRes)}`);
      }

      const { data: earn, error: earnErr } = await supabaseClient
        .from('affiliate_earnings')
        .select('id, module_key')
        .eq('stripe_checkout_session_id', syntheticSessionId)
        .maybeSingle();

      if (earnErr) throw earnErr;
      if (!earn || earn.module_key !== moduleKey) {
        throw new Error(`FAIL: affiliate_earnings.module_key expected ${moduleKey}, got ${JSON.stringify(earn)}`);
      }
      createdEarningSessionIds.push(syntheticSessionId);
      console.log(`OK: affiliate_earnings.module_key for "${moduleKey}"`);
      ranAny = true;
    }

    if (!ranAny) {
      console.warn('\nNo target modules had a matching public package + DB setup; nothing asserted.');
    } else {
      console.log('\nAll runnable module checks passed.');
    }
  } finally {
    for (const sid of createdSubscriptionIds) {
      try {
        await stripe.subscriptions.cancel(sid);
      } catch (e) {
        console.warn('Could not cancel subscription', sid, e?.message || e);
      }
    }

    for (const sessionId of createdEarningSessionIds) {
      await supabaseClient.from('affiliate_earnings').delete().eq('stripe_checkout_session_id', sessionId);
    }
    if (partner?.id) {
      await supabaseClient.from('affiliate_events').delete().eq('partner_id', partner.id);
    }
    if (business?.id) {
      await supabaseClient.from('subscriptions').delete().eq('business_id', business.id);
      await supabaseClient.from('users').delete().eq('business_id', business.id);
      await supabaseClient.from('businesses').delete().eq('id', business.id);
    }
    if (partner?.id) {
      await supabaseClient.from('affiliate_partners').delete().eq('id', partner.id);
    }
    console.log('Cleaned up test rows.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
