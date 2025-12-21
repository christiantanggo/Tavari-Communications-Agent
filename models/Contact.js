import { supabaseClient } from '../config/database.js';
import { formatPhoneNumberE164 } from '../utils/phoneFormatter.js';

export class Contact {
  static async create(data) {
    const {
      business_id,
      email,
      first_name,
      last_name,
      phone_number,
      address,
      city,
      state,
      zip_code,
      country = 'US',
      notes,
      tags = [],
      custom_fields = {},
    } = data;
    
    const { data: contact, error } = await supabaseClient
      .from('contacts')
      .insert({
        business_id,
        email: email || null,
        first_name: first_name || null,
        last_name: last_name || null,
        phone_number,
        address: address || null,
        city: city || null,
        state: state || null,
        zip_code: zip_code || null,
        country,
        notes: notes || null,
        tags: tags || [],
        custom_fields: custom_fields || {},
      })
      .select()
      .single();
    
    if (error) {
      // If unique constraint violation, update existing contact
      if (error.code === '23505') {
        return this.updateByPhone(business_id, phone_number, {
          email,
          first_name,
          last_name,
          address,
          city,
          state,
          zip_code,
          country,
          notes,
          tags,
          custom_fields,
        });
      }
      console.error('[Contact Model] ❌ Error creating contact:', error);
      throw error;
    }
    
    return contact;
  }
  
  static async createBatch(contacts) {
    if (!contacts || contacts.length === 0) {
      return [];
    }
    
    // Supabase has a limit of ~1000 rows per batch insert
    // Split into chunks of 1000
    const BATCH_SIZE = 1000;
    const chunks = [];
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      chunks.push(contacts.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`[Contact Model] Processing ${contacts.length} contacts in ${chunks.length} batch(es)`);
    
    const allResults = [];
    
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[Contact Model] Processing batch ${i + 1}/${chunks.length} (${chunk.length} contacts)`);
      
      try {
        // Use upsert to handle duplicates
        const { data, error } = await supabaseClient
          .from('contacts')
          .upsert(chunk, {
            onConflict: 'business_id,phone_number',
            ignoreDuplicates: false,
          })
          .select();
        
        if (error) {
          console.error(`[Contact Model] ❌ Error creating contacts batch ${i + 1}:`, error);
          throw error;
        }
        
        if (data) {
          allResults.push(...data);
        }
      } catch (error) {
        // If one batch fails, log and continue with others
        console.error(`[Contact Model] ❌ Batch ${i + 1} failed:`, error.message);
        // Continue processing other batches
      }
    }
    
    console.log(`[Contact Model] ✅ Successfully imported ${allResults.length} contacts`);
    return allResults;
  }
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
  
  static async findByBusinessId(business_id, limit = 100, offset = 0) {
    const { data, error } = await supabaseClient
      .from('contacts')
      .select('*')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    return data || [];
  }
  
  static async findByPhone(business_id, phone_number) {
    const { data, error } = await supabaseClient
      .from('contacts')
      .select('*')
      .eq('business_id', business_id)
      .eq('phone_number', phone_number)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }
  
  static async update(id, updates) {
    const { data, error } = await supabaseClient
      .from('contacts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async updateByPhone(business_id, phone_number, updates) {
    // Check opt-out status if not explicitly set
    if (updates.opted_out === undefined) {
      const { data: optOut } = await supabaseClient
        .from('sms_opt_outs')
        .select('id')
        .eq('business_id', business_id)
        .eq('phone_number', phone_number)
        .single();
      updates.opted_out = !!optOut;
      if (updates.opted_out) {
        updates.opted_out_at = new Date().toISOString();
      }
    }
    
    const { data, error } = await supabaseClient
      .from('contacts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', business_id)
      .eq('phone_number', phone_number)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  static async setOptOutStatus(id, optedOut) {
    return this.update(id, {
      opted_out: optedOut,
      opted_out_at: optedOut ? new Date().toISOString() : null,
    });
  }
  
  static async syncOptOutStatus(business_id) {
    console.log(`[Contact Model] Syncing opt-out status for business ${business_id}...`);
    
    // Sync opt-out status from sms_opt_outs table to contacts
    const { data: optOuts, error: optOutsError } = await supabaseClient
      .from('sms_opt_outs')
      .select('phone_number')
      .eq('business_id', business_id);
    
    if (optOutsError) {
      console.error('[Contact Model] Error fetching opt-outs:', optOutsError);
      throw optOutsError;
    }
    
    console.log(`[Contact Model] Found ${optOuts?.length || 0} opt-outs in sms_opt_outs table`);
    
    // Normalize phone numbers to E.164 format for comparison
    const optedOutNumbers = new Set();
    
    for (const optOut of optOuts || []) {
      try {
        const normalized = formatPhoneNumberE164(optOut.phone_number);
        if (normalized) {
          optedOutNumbers.add(normalized);
          // Also add the original format in case contacts use that format
          optedOutNumbers.add(optOut.phone_number);
        }
      } catch (error) {
        console.warn(`[Contact Model] Could not normalize opt-out number ${optOut.phone_number}:`, error.message);
        // Still add the original number
        optedOutNumbers.add(optOut.phone_number);
      }
    }
    
    console.log(`[Contact Model] Normalized opt-out numbers set size: ${optedOutNumbers.size}`);
    console.log(`[Contact Model] Sample opt-out numbers:`, Array.from(optedOutNumbers).slice(0, 5));
    
    // Update all contacts
    const { data: contacts, error: contactsError } = await supabaseClient
      .from('contacts')
      .select('id, phone_number, opted_out')
      .eq('business_id', business_id);
    
    if (contactsError) {
      console.error('[Contact Model] Error fetching contacts:', contactsError);
      throw contactsError;
    }
    
    console.log(`[Contact Model] Found ${contacts?.length || 0} contacts to check`);
    
    const updates = [];
    for (const contact of contacts || []) {
      try {
        // Normalize contact phone number for comparison
        const normalizedContactPhone = formatPhoneNumberE164(contact.phone_number);
        const shouldBeOptedOut = optedOutNumbers.has(contact.phone_number) || 
                                 (normalizedContactPhone && optedOutNumbers.has(normalizedContactPhone));
        
        if (contact.opted_out !== shouldBeOptedOut) {
          console.log(`[Contact Model] Updating contact ${contact.id}: ${contact.phone_number} -> opted_out: ${shouldBeOptedOut}`);
          updates.push(
            this.update(contact.id, {
              opted_out: shouldBeOptedOut,
              opted_out_at: shouldBeOptedOut ? new Date().toISOString() : null,
            })
          );
        }
      } catch (error) {
        console.warn(`[Contact Model] Error processing contact ${contact.id} (${contact.phone_number}):`, error.message);
        // Continue with other contacts
      }
    }
    
    console.log(`[Contact Model] Queued ${updates.length} contact updates`);
    
    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(`[Contact Model] ✅ Successfully synced ${updates.length} contacts`);
    } else {
      console.log(`[Contact Model] ℹ️ No contacts needed updating`);
    }
    
    return { synced: updates.length };
  }
  
  static async delete(id) {
    const { error } = await supabaseClient
      .from('contacts')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { success: true };
  }
  
  static async search(business_id, query, limit = 50) {
    const { data, error } = await supabaseClient
      .from('contacts')
      .select('*')
      .eq('business_id', business_id)
      .or(`phone_number.ilike.%${query}%,email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
}

