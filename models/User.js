import { supabaseClient } from '../config/database.js';

export class User {
  static async create(data) {
    const {
      business_id,
      email,
      password_hash,
      first_name,
      last_name,
      role = 'owner',
    } = data;
    
    const { data: user, error } = await supabaseClient
      .from('users')
      .insert({
        business_id,
        email,
        password_hash,
        first_name,
        last_name,
        role,
      })
      .select()
      .single();
    
    if (error) throw error;
    return user;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByEmail(email) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('email', email)
      .is('deleted_at', null)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByBusinessId(business_id) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('business_id', business_id)
      .is('deleted_at', null);
    
    if (error) throw error;
    return data || [];
  }
  
  static async updateLastLogin(id) {
    const { data, error } = await supabaseClient
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}
