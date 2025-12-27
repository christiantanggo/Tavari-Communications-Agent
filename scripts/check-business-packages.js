// Check which businesses have packages assigned
import dotenv from 'dotenv';
import { supabaseClient } from '../config/database.js';

dotenv.config();

async function checkBusinessPackages() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 CHECKING BUSINESS PACKAGES');
  console.log('='.repeat(60) + '\n');

  try {
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    console.log(`Total businesses: ${businesses.length}\n`);
    
    const withPackages = businesses.filter(b => b.package_id);
    const withoutPackages = businesses.filter(b => !b.package_id);
    
    console.log('✅ Businesses WITH packages:');
    console.log('='.repeat(60));
    withPackages.forEach(b => {
      console.log(`  ${b.email || b.name || b.id}:`);
      console.log(`    Package ID: ${b.package_id}`);
      console.log(`    Subscription: ${b.stripe_subscription_id || 'none'}`);
      console.log(`    Minutes: ${b.usage_limit_minutes || 'null'}`);
      console.log(`    Plan Tier: ${b.plan_tier || 'none'}`);
      console.log('');
    });
    
    console.log('❌ Businesses WITHOUT packages:');
    console.log('='.repeat(60));
    withoutPackages.forEach(b => {
      console.log(`  ${b.email || b.name || b.id}:`);
      console.log(`    Subscription: ${b.stripe_subscription_id || 'none'}`);
      console.log(`    Minutes: ${b.usage_limit_minutes || 'null'}`);
      console.log(`    Plan Tier: ${b.plan_tier || 'none'}`);
      console.log('');
    });
    
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total: ${businesses.length}`);
    console.log(`With packages: ${withPackages.length}`);
    console.log(`Without packages: ${withoutPackages.length}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkBusinessPackages();

