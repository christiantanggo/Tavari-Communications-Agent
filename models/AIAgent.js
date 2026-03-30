import { supabaseClient } from '../config/database.js';
import { Business } from './Business.js';

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
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw error;
    return data?.[0] ?? null;
  }

  /**
   * Setup wizard and other flows may run before phone-agent module activation
   * (which normally creates the row). Updates require a row — create defaults if missing.
   */
  static async ensureForBusiness(business_id) {
    const existing = await AIAgent.findByBusinessId(business_id);
    if (existing) return existing;
    const business = await Business.findById(business_id);
    const displayName = business?.name || 'your business';
    return AIAgent.create({
      business_id,
      name: 'AI Assistant',
      greeting_text: `Hello! Thank you for calling ${displayName}. How can I help you today?`,
      business_hours: {
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { closed: true },
        sunday: { closed: true },
      },
      faqs: [],
      message_settings: {
        ask_name: true,
        ask_phone: true,
        ask_email: false,
        ask_reason: true,
      },
      system_instructions: `You are a helpful AI assistant for ${displayName}. Answer questions politely and take messages when needed.`,
    });
  }

  static async update(business_id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    console.log('[AIAgent Model] ========== UPDATING AI AGENT ==========');
    console.log('[AIAgent Model] Business ID:', business_id);
    console.log('[AIAgent Model] Update data (keys):', Object.keys(updateData));
    if (updateData.business_hours) {
      console.log('[AIAgent Model] business_hours being saved:', JSON.stringify(updateData.business_hours, null, 2));
    }
    
    const { data: agents, error } = await supabaseClient
      .from('ai_agents')
      .update(updateData)
      .eq('business_id', business_id)
      .select();

    if (error) {
      console.error('[AIAgent Model] ❌ Error updating agent:', error);
      console.error('[AIAgent Model] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }

    if (!agents?.length) {
      const err = new Error('No ai_agents row found for this business');
      err.code = 'NO_AGENT_ROW';
      throw err;
    }

    if (agents.length > 1) {
      console.warn(
        `[AIAgent Model] ${agents.length} ai_agents rows for business_id=${business_id}; updated all (consider merging duplicates in DB)`
      );
    }

    const agent = agents[0];

    console.log('[AIAgent Model] ✅ Agent updated successfully');
    if (agent.business_hours) {
      console.log('[AIAgent Model] Saved business_hours:', JSON.stringify(agent.business_hours, null, 2));
    }
    console.log('[AIAgent Model] ===============================================');

    return agent;
  }
}
