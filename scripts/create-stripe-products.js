import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createProducts() {
  try {
    console.log('Creating Stripe products...');
    
    // Starter Plan - $199/month
    const starterProduct = await stripe.products.create({
      name: 'Tavari Starter',
      description: '1,000 minutes/month - Perfect for small businesses',
    });
    
    const starterPrice = await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 19900, // $199.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });
    
    console.log('✅ Starter Plan created:');
    console.log(`   Product ID: ${starterProduct.id}`);
    console.log(`   Price ID: ${starterPrice.id}`);
    
    // Pro Plan - $499/month
    const proProduct = await stripe.products.create({
      name: 'Tavari Pro',
      description: '5,000 minutes/month - For growing businesses',
    });
    
    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 49900, // $499.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });
    
    console.log('✅ Pro Plan created:');
    console.log(`   Product ID: ${proProduct.id}`);
    console.log(`   Price ID: ${proPrice.id}`);
    
    // Enterprise Plan - $1,999/month
    const enterpriseProduct = await stripe.products.create({
      name: 'Tavari Enterprise',
      description: '20,000 minutes/month - For large organizations',
    });
    
    const enterprisePrice = await stripe.prices.create({
      product: enterpriseProduct.id,
      unit_amount: 199900, // $1,999.00
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });
    
    console.log('✅ Enterprise Plan created:');
    console.log(`   Product ID: ${enterpriseProduct.id}`);
    console.log(`   Price ID: ${enterprisePrice.id}`);
    
    console.log('\n📝 Add these Price IDs to your .env file:');
    console.log(`STRIPE_STARTER_PRICE_ID=${starterPrice.id}`);
    console.log(`STRIPE_PRO_PRICE_ID=${proPrice.id}`);
    console.log(`STRIPE_ENTERPRISE_PRICE_ID=${enterprisePrice.id}`);
    
  } catch (error) {
    console.error('Error creating products:', error);
    process.exit(1);
  }
}

createProducts();

