import { supabaseClient } from '../config/database.js';

export class UsageMinutes {
  static async create(data) {
    const {
      business_id,
      call_session_id,
      minutes_used,
      date,
      month,
      year,
      billing_cycle_start,
      billing_cycle_end,
    } = data;
    
    // Build insert object, only include columns that exist
    const insertData = {
      business_id,
      call_session_id,
      minutes_used,
      date,
      month,
      year,
    };
    
    // Only add billing cycle columns if provided (they may not exist in DB yet)
    if (billing_cycle_start !== undefined) {
      insertData.billing_cycle_start = billing_cycle_start instanceof Date 
        ? billing_cycle_start.toISOString().split('T')[0] 
        : billing_cycle_start;
    }
    if (billing_cycle_end !== undefined) {
      insertData.billing_cycle_end = billing_cycle_end instanceof Date 
        ? billing_cycle_end.toISOString().split('T')[0] 
        : billing_cycle_end;
    }
    
    const { data: usage, error } = await supabaseClient
      .from('usage_minutes')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      // If error is about missing columns, try without them
      if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
        console.warn('⚠️ Billing cycle columns missing, inserting without them. Run RUN_THIS_MIGRATION.sql');
        const { data: usage2, error: error2 } = await supabaseClient
          .from('usage_minutes')
          .insert({
            business_id,
            call_session_id,
            minutes_used,
            date,
            month,
            year,
          })
          .select()
          .single();
        if (error2) throw error2;
        return usage2;
      }
      throw error;
    }
    return usage;
  }
  
  static async getMonthlyUsage(business_id, year, month) {
    const { data, error } = await supabaseClient
      .from('usage_minutes')
      .select('minutes_used')
      .eq('business_id', business_id)
      .eq('year', year)
      .eq('month', month);
    
    if (error) throw error;
    
    const total = data?.reduce((sum, row) => sum + parseFloat(row.minutes_used || 0), 0) || 0;
    return total;
  }
  
  static async getCurrentMonthUsage(business_id) {
    const now = new Date();
    return this.getMonthlyUsage(business_id, now.getFullYear(), now.getMonth() + 1);
  }

  static async getCurrentCycleUsage(business_id, cycleStart, cycleEnd) {
    // Try to use billing cycle columns, fallback to date-based if they don't exist
    let query = supabaseClient
      .from('usage_minutes')
      .select('minutes_used, date')
      .eq('business_id', business_id);
    
    // Try billing cycle columns first
    try {
      const cycleStartStr = cycleStart instanceof Date ? cycleStart.toISOString().split('T')[0] : cycleStart;
      const cycleEndStr = cycleEnd instanceof Date ? cycleEnd.toISOString().split('T')[0] : cycleEnd;
      
      query = query
        .gte('billing_cycle_start', cycleStartStr)
        .lte('billing_cycle_end', cycleEndStr);
    } catch (err) {
      // Columns don't exist, use date range instead
      const cycleStartStr = cycleStart instanceof Date ? cycleStart.toISOString().split('T')[0] : cycleStart;
      const cycleEndStr = cycleEnd instanceof Date ? cycleEnd.toISOString().split('T')[0] : cycleEnd;
      query = query
        .gte('date', cycleStartStr)
        .lte('date', cycleEndStr);
    }
    
    const { data, error } = await query;
    
    // If error is about missing columns, fallback to date-based query
    if (error && (error.message.includes('column') || error.message.includes('does not exist'))) {
      console.warn('⚠️ Billing cycle columns missing, using date-based query. Run RUN_THIS_MIGRATION.sql');
      const cycleStartStr = cycleStart instanceof Date ? cycleStart.toISOString().split('T')[0] : cycleStart;
      const cycleEndStr = cycleEnd instanceof Date ? cycleEnd.toISOString().split('T')[0] : cycleEnd;
      const { data: data2, error: error2 } = await supabaseClient
        .from('usage_minutes')
        .select('minutes_used')
        .eq('business_id', business_id)
        .gte('date', cycleStartStr)
        .lte('date', cycleEndStr);
      if (error2) throw error2;
      const totalMinutes = data2?.reduce((sum, row) => sum + parseFloat(row.minutes_used || 0), 0) || 0;
      const { Business } = await import('./Business.js');
      const business = await Business.findById(business_id);
      const planLimit = business?.usage_limit_minutes || 0;
      const bonusMinutes = business?.bonus_minutes || 0;
      const totalAvailable = planLimit + bonusMinutes;
      const overageMinutes = Math.max(0, totalMinutes - totalAvailable);
      return {
        totalMinutes,
        overageMinutes,
        minutesUsed: totalMinutes - overageMinutes,
        minutesRemaining: Math.max(0, totalAvailable - totalMinutes),
        billing_cycle_start: cycleStart,
        billing_cycle_end: cycleEnd,
        minutes_total: totalAvailable,
      };
    }
    
    if (error) throw error;
    
    const totalMinutes = data?.reduce((sum, row) => sum + parseFloat(row.minutes_used || 0), 0) || 0;
    
    // Get business to calculate overage
    const { Business } = await import('./Business.js');
    const business = await Business.findById(business_id);
    const planLimit = business?.usage_limit_minutes || 0;
    const bonusMinutes = business?.bonus_minutes || 0;
    const totalAvailable = planLimit + bonusMinutes;
    const overageMinutes = Math.max(0, totalMinutes - totalAvailable);
    
    return {
      totalMinutes,
      overageMinutes,
      minutesUsed: totalMinutes - overageMinutes,
      minutesRemaining: Math.max(0, totalAvailable - totalMinutes),
      billing_cycle_start: cycleStart,
      billing_cycle_end: cycleEnd,
      minutes_total: totalAvailable,
    };
  }
}
