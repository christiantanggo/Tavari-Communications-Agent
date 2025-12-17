import { supabaseClient } from '../config/database.js';

export class CallSession {
  static async create(data) {
    const {
      business_id,
      voximplant_call_id,
      vapi_call_id,
      caller_number,
      caller_name,
      status = 'ringing',
      transfer_attempted = false,
      started_at,
    } = data;
    
    const { data: session, error } = await supabaseClient
      .from('call_sessions')
      .insert({
        business_id,
        voximplant_call_id,
        vapi_call_id,
        caller_number,
        caller_name,
        status,
        transfer_attempted,
        started_at: started_at || new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    return session;
  }
  
  static async findByVoximplantCallId(voximplant_call_id) {
    const { data, error } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('voximplant_call_id', voximplant_call_id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async findByVapiCallId(vapi_call_id) {
    const { data, error } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('vapi_call_id', vapi_call_id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    const { data: session, error } = await supabaseClient
      .from('call_sessions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return session;
  }
  
  static async endCall(id, duration_seconds, transcript, intent, message_taken) {
    return this.update(id, {
      status: 'completed',
      ended_at: new Date().toISOString(),
      duration_seconds,
      transcript,
      intent,
      message_taken,
    });
  }
  
  static async findByBusinessId(business_id, limit = 50) {
    const { data, error } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
}
