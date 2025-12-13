import { supabaseClient } from '../config/database.js';

export class Message {
  static async create(data) {
    const {
      business_id,
      call_session_id,
      caller_name,
      caller_phone,
      caller_email,
      message_text,
      reason,
    } = data;
    
    const { data: message, error } = await supabaseClient
      .from('messages')
      .insert({
        business_id,
        call_session_id,
        caller_name,
        caller_phone,
        caller_email,
        message_text,
        reason,
      })
      .select()
      .single();
    
    if (error) throw error;
    return message;
  }
  
  static async findByBusinessId(business_id, limit = 50) {
    const { data, error } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('business_id', business_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
  
  static async markAsRead(id) {
    const { data, error } = await supabaseClient
      .from('messages')
      .update({ 
        is_read: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}
