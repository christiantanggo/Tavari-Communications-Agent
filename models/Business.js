import { supabaseClient } from '../config/database.js';

export class Business {
  static async create(data) {
    const {
      name,
      email,
      phone,
      address,
      timezone = 'America/New_York',
    } = data;
    
    const { data: business, error } = await supabaseClient
      .from('businesses')
      .insert({
        name,
        email,
        phone,
        address,
        timezone,
      })
      .select()
      .single();
    
    if (error) throw error;
    return business;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByEmail(email) {
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('email', email)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async update(id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    console.log('[Business Model] Updating business:', { id, updateData });
    
    const { data: business, error } = await supabaseClient
      .from('businesses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('[Business Model] Update error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    
    console.log('[Business Model] Update successful:', {
      id: business.id,
      name: business.name,
      website: business.website,
    });
    
    return business;
  }
  
  static async setOnboardingComplete(id) {
    return this.update(id, { onboarding_complete: true });
  }
  
  static async setVoximplantNumber(id, number) {
    return this.update(id, { voximplant_number: number });
  }

  static async setTelnyxNumber(id, number) {
    return this.update(id, { telnyx_number: number });
  }

  static async findByVapiAssistantId(assistantId) {
    try {
      const { data, error } = await supabaseClient
        .from('businesses')
        .select('*')
        .eq('vapi_assistant_id', assistantId)
        .is('deleted_at', null)
        .single();
      
      // If column doesn't exist, return null (migration not run)
      if (error) {
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          console.warn('⚠️ vapi_assistant_id column missing. Run RUN_THIS_MIGRATION.sql');
          return null;
        }
        if (error.code !== 'PGRST116') throw error;
      }
      return data;
    } catch (err) {
      if (err.message && (err.message.includes('column') || err.message.includes('does not exist'))) {
        console.warn('⚠️ vapi_assistant_id column missing. Run RUN_THIS_MIGRATION.sql');
        return null;
      }
      throw err;
    }
  }

  static async setVapiAssistant(id, assistantId, phoneNumber) {
    return this.update(id, {
      vapi_assistant_id: assistantId,
      vapi_phone_number: phoneNumber,
      ai_enabled: true,
    });
  }
}
