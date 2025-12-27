// Fix businesses that have minutes but no package
// This sets usage_limit_minutes to NULL for businesses without packages

import dotenv from 'dotenv';
import { supabaseClient } from '../config/database.js';

dotenv.config();

async function fixBusinessMinutes() {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 FIXING BUSINESSES WITH MINUTES BUT NO PACKAGE');
  console.log('='.repeat(60) + '\n');

  try {
    // Find businesses with minutes but no package
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, email, usage_limit_minutes, package_id')
      .is('package_id', null)
      .not('usage_limit_minutes', 'is', null)
      .is('deleted_at', null);

    if (error) {
      console.error('❌ Error fetching businesses:', error.message);
      process.exit(1);
    }

    if (!businesses || businesses.length === 0) {
      console.log('✅ No businesses need fixing - all are correct!');
      return;
    }

    console.log(`Found ${businesses.length} business(es) with minutes but no package:\n`);
    
    businesses.forEach(b => {
      console.log(`  - ${b.name} (${b.email}): ${b.usage_limit_minutes} minutes`);
    });

    console.log('\nThese businesses will have their usage_limit_minutes set to NULL.\n');

    // Fix each business
    let fixedCount = 0;
    for (const business of businesses) {
      try {
        const { error: updateError } = await supabaseClient
          .from('businesses')
          .update({ usage_limit_minutes: null })
          .eq('id', business.id);

        if (updateError) {
          console.error(`❌ Error fixing ${business.name}:`, updateError.message);
        } else {
          console.log(`✅ Fixed: ${business.name} (${business.email})`);
          fixedCount++;
        }
      } catch (error) {
        console.error(`❌ Error fixing ${business.name}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 SUMMARY: Fixed ${fixedCount} of ${businesses.length} business(es)`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixBusinessMinutes()
  .then(() => {
    console.log('✅ Fix complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  });


