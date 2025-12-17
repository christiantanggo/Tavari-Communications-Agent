import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createProducts() {
  try {
    console.log('Creating Stripe products for Phase 1...');
    
    // Tier 1 - Starter: $79/month, 250 min, $0.30/min overage, 5 FAQs
    const starterProduct = await stripe.products.create({
      name: 'Tavari Starter',
      description: '250 minutes/month - Perfect for small restaurants',
    });
    
    const starterPrice = await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 7900, // $79.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });
    
    console.log('✅ Tier 1 - Starter Plan created:');
    console.log(`   Product ID: ${starterProduct.id}`);
    console.log(`   Price ID: ${starterPrice.id}`);
    console.log(`   Price: $79/month, 250 minutes, $0.30/min overage, 5 FAQs`);
    
    // Tier 2 - Core: $129/month, 500 min, $0.25/min overage, 10 FAQs
    const coreProduct = await stripe.products.create({
      name: 'Tavari Core',
      description: '500 minutes/month - Best seller for restaurants',
    });
    
    const corePrice = await stripe.prices.create({
      product: coreProduct.id,
      unit_amount: 12900, // $129.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });
    
    console.log('✅ Tier 2 - Core Plan created:');
    console.log(`   Product ID: ${coreProduct.id}`);
    console.log(`   Price ID: ${corePrice.id}`);
    console.log(`   Price: $129/month, 500 minutes, $0.25/min overage, 10 FAQs`);
    
    // Tier 3 - Pro: $179/month, 750 min, $0.20/min overage, 20 FAQs
    const proProduct = await stripe.products.create({
      name: 'Tavari Pro',
      description: '750 minutes/month - For busy restaurants',
    });
    
    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 17900, // $179.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });
    
    console.log('✅ Tier 3 - Pro Plan created:');
    console.log(`   Product ID: ${proProduct.id}`);
    console.log(`   Price ID: ${proPrice.id}`);
    console.log(`   Price: $179/month, 750 minutes, $0.20/min overage, 20 FAQs`);
    
    console.log('\n📝 Add these Price IDs to your .env file:');
    console.log(`STRIPE_STARTER_PRICE_ID=${starterPrice.id}`);
    console.log(`STRIPE_CORE_PRICE_ID=${corePrice.id}`);
    console.log(`STRIPE_PRO_PRICE_ID=${proPrice.id}`);
    
  } catch (error) {
    console.error('Error creating products:', error);
    process.exit(1);
  }
}

createProducts();

