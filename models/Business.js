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
    
    const { data: business, error } = await supabaseClient
      .from('businesses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
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
}
