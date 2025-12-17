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
    
    const { data: usage, error } = await supabaseClient
      .from('usage_minutes')
      .insert({
        business_id,
        call_session_id,
        minutes_used,
        date,
        month,
        year,
        billing_cycle_start,
        billing_cycle_end,
      })
      .select()
      .single();
    
    if (error) throw error;
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
    const { data, error } = await supabaseClient
      .from('usage_minutes')
      .select('minutes_used')
      .eq('business_id', business_id)
      .gte('billing_cycle_start', cycleStart.toISOString())
      .lte('billing_cycle_end', cycleEnd.toISOString());
    
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
