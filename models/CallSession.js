import { supabaseClient } from '../config/database.js';

function normalizePhoneForMatch(value) {
  return String(value || "").replace(/\D/g, "");
}

function getSessionActivityTime(session) {
  const raw =
    session?.transfer_timestamp ||
    session?.updated_at ||
    session?.started_at ||
    session?.created_at;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

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
    
    // Build insert object, handle missing columns gracefully
    const insertData = {
      business_id,
      voximplant_call_id,
      caller_number,
      caller_name,
      status,
      started_at: started_at || new Date().toISOString(),
    };
    
    // Only add VAPI columns if provided (they may not exist in DB yet)
    if (vapi_call_id !== undefined && vapi_call_id !== null) {
      insertData.vapi_call_id = vapi_call_id;
    }
    if (transfer_attempted !== undefined) {
      insertData.transfer_attempted = transfer_attempted;
    }
    
    console.log('[CallSession Model] Creating call session with data:', insertData);
    
    const { data: session, error } = await supabaseClient
      .from('call_sessions')
      .insert(insertData)
      .select()
      .single();
    
    // If error is about missing columns, try without them
    if (error && (error.message && (error.message.includes('column') || error.message.includes('does not exist')))) {
      console.warn('⚠️ VAPI columns missing, inserting without them. Run RUN_THIS_MIGRATION.sql');
      console.warn('⚠️ Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      
      const fallbackData = {
        business_id,
        voximplant_call_id: voximplant_call_id || null,
        caller_number: caller_number || null,
        caller_name: caller_name || null,
        status: status || 'ringing',
        started_at: started_at || new Date().toISOString(),
      };
      
      console.log('[CallSession Model] Retrying with fallback data:', fallbackData);
      
      const { data: session2, error: error2 } = await supabaseClient
        .from('call_sessions')
        .insert(fallbackData)
        .select()
        .single();
        
      if (error2) {
        console.error('[CallSession Model] ❌ Fallback insert also failed:', error2);
        throw error2;
      }
      
      console.log('[CallSession Model] ✅ Call session created with fallback data:', session2.id);
      return session2;
    }
    
    if (error) {
      console.error('[CallSession Model] ❌ Error creating call session:', error);
      console.error('[CallSession Model] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }
    
    console.log('[CallSession Model] ✅ Call session created successfully:', session.id);
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
    try {
      const { data, error } = await supabaseClient
        .from('call_sessions')
        .select('*')
        .eq('vapi_call_id', vapi_call_id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        // If column doesn't exist, return null (migration not run)
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          console.warn('⚠️ vapi_call_id column missing. Run RUN_THIS_MIGRATION.sql');
          return null;
        }
        throw error;
      }
      return data;
    } catch (err) {
      if (err.message && (err.message.includes('column') || err.message.includes('does not exist'))) {
        console.warn('⚠️ vapi_call_id column missing. Run RUN_THIS_MIGRATION.sql');
        return null;
      }
      throw err;
    }
  }

  static async findRecentTransferContext({
    businessId,
    callerNumber,
    businessPhoneNumber,
    recentWindowMinutes = 10,
    // Wide enough to cover a long unanswered ring + return inbound.
    ambiguousWindowMinutes = 5,
    sameCallerWindowMinutes = 5,
    limit = 20,
  }) {
    try {
      const { data, error } = await supabaseClient
        .from('call_sessions')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          console.warn('⚠️ transfer-related columns missing. Run RUN_THIS_MIGRATION.sql');
          return null;
        }
        throw error;
      }

      const now = Date.now();
      const recentCutoff = now - recentWindowMinutes * 60 * 1000;
      const ambiguousCutoff = now - ambiguousWindowMinutes * 60 * 1000;
      const sameCallerCutoff = now - sameCallerWindowMinutes * 60 * 1000;
      const normalizedIncoming = normalizePhoneForMatch(callerNumber);
      const normalizedBusiness = normalizePhoneForMatch(businessPhoneNumber);

      const recentTransfers = (data || []).filter((session) => {
        if (getSessionActivityTime(session) < recentCutoff) return false;
        const attempted =
          session.transfer_attempted === true ||
          Number(session.facility_transfer_count) > 0 ||
          session.facility_transfer_locked === true ||
          session.facility_transfer_suppress_until_explicit === true;
        return attempted;
      });

      if (recentTransfers.length === 0) {
        return null;
      }

      const veryRecentTransfers = recentTransfers.filter((session) => {
        return getSessionActivityTime(session) >= ambiguousCutoff;
      });

      const sameCallerTransfers = veryRecentTransfers.filter((session) => {
        return getSessionActivityTime(session) >= sameCallerCutoff;
      });

      const sameCallerMatch = normalizedIncoming
        ? sameCallerTransfers.find((session) => {
            return normalizePhoneForMatch(session.caller_number) === normalizedIncoming;
          })
        : null;
      if (sameCallerMatch) {
        return {
          session: sameCallerMatch,
          reason: 'same_caller_number',
        };
      }

      if (normalizedIncoming && normalizedBusiness && normalizedIncoming === normalizedBusiness) {
        const businessLineReturn = recentTransfers.find((session) => {
          return getSessionActivityTime(session) >= ambiguousCutoff;
        });
        if (businessLineReturn) {
          return {
            session: businessLineReturn,
            reason: 'returned_from_business_line',
          };
        }
      }

      if (veryRecentTransfers.length === 1) {
        return {
          session: veryRecentTransfers[0],
          reason: 'single_recent_transfer',
        };
      }

      if (veryRecentTransfers.length > 1) {
        return {
          session: veryRecentTransfers[0],
          reason: 'recent_transfer_burst',
        };
      }

      return null;
    } catch (err) {
      if (err.message && (err.message.includes('column') || err.message.includes('does not exist'))) {
        console.warn('⚠️ transfer-related columns missing. Run RUN_THIS_MIGRATION.sql');
        return null;
      }
      throw err;
    }
  }

  /** True if this business already emailed for this caller in the last N minutes. */
  static async hasRecentEmailNotification({
    businessId,
    callerNumber,
    excludeSessionId = null,
    recentWindowMinutes = 15,
    limit = 25,
  }) {
    const normalizedCaller = normalizePhoneForMatch(callerNumber);
    if (!businessId || !normalizedCaller) return false;

    try {
      const { data, error } = await supabaseClient
        .from('call_sessions')
        .select('id, caller_number, email_notification_sent, created_at, updated_at, started_at')
        .eq('business_id', businessId)
        .eq('email_notification_sent', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
          return false;
        }
        throw error;
      }

      const recentCutoff = Date.now() - recentWindowMinutes * 60 * 1000;
      return (data || []).some((session) => {
        if (excludeSessionId && session.id === excludeSessionId) return false;
        if (getSessionActivityTime(session) < recentCutoff) return false;
        return normalizePhoneForMatch(session.caller_number) === normalizedCaller;
      });
    } catch (err) {
      console.warn('[CallSession] hasRecentEmailNotification failed:', err?.message || err);
      return false;
    }
  }
  
  static async update(id, data) {
    let updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    // Retry while dropping unknown columns one-by-one so a missing new column
    // (e.g. facility_transfer_locked before migration) does not wipe known fields.
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data: session, error } = await supabaseClient
        .from('call_sessions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (!error) return session;

      const msg = error.message || '';
      const missingCol =
        msg.match(/Could not find the ['"]?(\w+)['"]? column/i)?.[1] ||
        msg.match(/column ['"]?(\w+)['"]? of relation/i)?.[1] ||
        msg.match(/column ['"]?(\w+)['"]? does not exist/i)?.[1] ||
        null;

      if (missingCol && Object.prototype.hasOwnProperty.call(updateData, missingCol)) {
        console.warn(`⚠️ call_sessions.${missingCol} missing — retrying update without it. Run pending migrations.`);
        delete updateData[missingCol];
        continue;
      }

      if (msg.includes('column') || msg.includes('does not exist')) {
        console.warn('⚠️ VAPI columns missing in update, removing known optional set. Run RUN_THIS_MIGRATION.sql');
        delete updateData.vapi_call_id;
        delete updateData.transfer_attempted;
        delete updateData.transfer_successful;
        delete updateData.transfer_timestamp;
        delete updateData.facility_transfer_count;
        delete updateData.facility_transfer_suppress_until_explicit;
        delete updateData.facility_transfer_locked;
        delete updateData.email_notification_sent;

        const { data: session2, error: error2 } = await supabaseClient
          .from('call_sessions')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        if (error2) throw error2;
        return session2;
      }

      throw error;
    }

    throw new Error('CallSession.update exhausted retries stripping unknown columns');
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
  
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('call_sessions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
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
