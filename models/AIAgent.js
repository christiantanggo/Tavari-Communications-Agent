import { supabaseClient } from '../config/database.js';

export class AIAgent {
  static async create(data) {
    const {
      business_id,
      name = 'AI Assistant',
      greeting_text,
      business_hours = {},
      faqs = [],
      message_settings = {},
      voice_settings = {},
      system_instructions,
    } = data;
    
    const { data: agent, error } = await supabaseClient
      .from('ai_agents')
      .insert({
        business_id,
        name,
        greeting_text,
        business_hours,
        faqs,
        message_settings,
        voice_settings,
        system_instructions,
      })
      .select()
      .single();
    
    if (error) throw error;
    return agent;
  }
  
  static async findByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('ai_agents')
      .select('*')
      .eq('business_id', business_id)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async update(business_id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    const { data: agent, error } = await supabaseClient
      .from('ai_agents')
      .update(updateData)
      .eq('business_id', business_id)
      .select()
      .single();
    
    if (error) throw error;
    return agent;
  }
}
