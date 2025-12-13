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
}
