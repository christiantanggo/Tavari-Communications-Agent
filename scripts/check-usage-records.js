// Check usage records for a business
import dotenv from 'dotenv';
import { supabaseClient } from '../config/database.js';
import { Business } from '../models/Business.js';
import { calculateBillingCycle } from '../services/billing.js';
import { getCurrentCycleUsage } from '../services/usage.js';

dotenv.config();

const businessId = process.argv[2];

if (!businessId) {
  console.error('Usage: node scripts/check-usage-records.js <business-id>');
  process.exit(1);
}

async function checkUsage() {
  try {
    console.log(`\n🔍 Checking usage records for business: ${businessId}\n`);

    // Get business
    const business = await Business.findById(businessId);
    if (!business) {
      console.error('❌ Business not found');
      process.exit(1);
    }

    console.log(`Business: ${business.name}`);
    console.log(`Plan limit: ${business.usage_limit_minutes} minutes`);
    console.log(`Bonus minutes: ${business.bonus_minutes || 0} minutes\n`);

    // Get billing cycle
    const billingCycle = calculateBillingCycle(business);
    console.log(`Billing cycle:`);
    console.log(`  Start: ${billingCycle.start.toISOString()}`);
    console.log(`  End: ${billingCycle.end.toISOString()}\n`);

    // Get all usage records
    const { data: allRecords, error: allError } = await supabaseClient
      .from('usage_minutes')
      .select('*')
      .eq('business_id', businessId)
      .order('date', { ascending: false })
      .limit(20);

    if (allError) {
      console.error('❌ Error fetching all records:', allError);
    } else {
      console.log(`📊 All usage records (last 20):`);
      if (allRecords && allRecords.length > 0) {
        allRecords.forEach((record, idx) => {
          console.log(`  ${idx + 1}. Date: ${record.date}, Minutes: ${record.minutes_used}, Call Session: ${record.call_session_id}`);
          if (record.billing_cycle_start) {
            console.log(`     Billing cycle: ${record.billing_cycle_start} to ${record.billing_cycle_end}`);
          }
        });
        const totalAll = allRecords.reduce((sum, r) => sum + parseFloat(r.minutes_used || 0), 0);
        console.log(`  Total: ${totalAll} minutes\n`);
      } else {
        console.log('  No records found\n');
      }
    }

    // Try query with billing cycle columns
    console.log(`🔍 Querying with billing cycle columns:`);
    const cycleStartStr = billingCycle.start.toISOString().split('T')[0];
    const cycleEndStr = billingCycle.end.toISOString().split('T')[0];
    
    const { data: cycleRecords, error: cycleError } = await supabaseClient
      .from('usage_minutes')
      .select('*')
      .eq('business_id', businessId)
      .gte('billing_cycle_start', cycleStartStr)
      .lte('billing_cycle_end', cycleEndStr);

    if (cycleError) {
      console.log(`  ⚠️  Billing cycle query error (columns may not exist): ${cycleError.message}`);
      
      // Fallback to date-based query
      console.log(`\n🔍 Fallback: Querying with date range:`);
      const { data: dateRecords, error: dateError } = await supabaseClient
        .from('usage_minutes')
        .select('*')
        .eq('business_id', businessId)
        .gte('date', cycleStartStr)
        .lte('date', cycleEndStr);

      if (dateError) {
        console.error(`  ❌ Date query error: ${dateError.message}`);
      } else {
        console.log(`  ✅ Found ${dateRecords?.length || 0} records in date range`);
        if (dateRecords && dateRecords.length > 0) {
          dateRecords.forEach((record, idx) => {
            console.log(`    ${idx + 1}. Date: ${record.date}, Minutes: ${record.minutes_used}`);
          });
          const totalDate = dateRecords.reduce((sum, r) => sum + parseFloat(r.minutes_used || 0), 0);
          console.log(`  Total: ${totalDate} minutes`);
        }
      }
    } else {
      console.log(`  ✅ Found ${cycleRecords?.length || 0} records in billing cycle`);
      if (cycleRecords && cycleRecords.length > 0) {
        cycleRecords.forEach((record, idx) => {
          console.log(`    ${idx + 1}. Date: ${record.date}, Minutes: ${record.minutes_used}`);
        });
        const totalCycle = cycleRecords.reduce((sum, r) => sum + parseFloat(r.minutes_used || 0), 0);
        console.log(`  Total: ${totalCycle} minutes`);
      }
    }

    // Get usage via service function
    console.log(`\n🔍 Using getCurrentCycleUsage service function:`);
    const usage = await getCurrentCycleUsage(businessId, billingCycle.start, billingCycle.end);
    console.log(`  Total minutes: ${usage.totalMinutes}`);
    console.log(`  Overage minutes: ${usage.overageMinutes}`);
    console.log(`  Minutes remaining: ${(business.usage_limit_minutes + (business.bonus_minutes || 0)) - usage.totalMinutes}`);

    // Check recent call sessions
    console.log(`\n📞 Recent call sessions:`);
    const { data: sessions, error: sessionsError } = await supabaseClient
      .from('call_sessions')
      .select('id, vapi_call_id, status, duration_seconds, created_at, ended_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (sessionsError) {
      console.error(`  ❌ Error: ${sessionsError.message}`);
    } else {
      if (sessions && sessions.length > 0) {
        sessions.forEach((session, idx) => {
          const durationMins = session.duration_seconds ? Math.ceil(session.duration_seconds / 60) : 0;
          console.log(`  ${idx + 1}. ${session.status} - ${durationMins} min - ${session.created_at}`);
        });
      } else {
        console.log('  No call sessions found');
      }
    }

    console.log('\n✅ Check complete\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUsage();

