import { supabaseClient } from '../config/database.js';

export const BOOKING_STATUSES = ['scheduled', 'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled'];
export const BOOKING_BLOCK_TYPES = ['lunch', 'meeting', 'closure', 'vacation', 'emergency', 'blocked'];
export const DEFAULT_BOOKING_DURATIONS = [30, 60, 90, 120, 150, 180, 210, 240];

export const DEFAULT_BOOKING_SETTINGS = {
  enabled: false,
  slot_duration_minutes: 30,
  allowed_durations_minutes: DEFAULT_BOOKING_DURATIONS,
  capacity_per_slot: 1,
  minimum_notice_minutes: 60,
  max_days_ahead: 30,
  duplicate_window_minutes: 180,
  require_confirmation_for_duplicates: true,
  ask_for_email: true,
  require_reason: false,
  customer_confirmation_enabled: true,
  customer_confirmation_channels: ['sms'],
  business_confirmation_enabled: true,
  business_confirmation_channels: ['email'],
  customer_reminders_enabled: false,
  customer_reminder_offsets: [1440],
  customer_reminder_channels: ['sms'],
  business_reminders_enabled: false,
  business_reminder_offsets: [60],
  business_reminder_channels: ['email'],
  business_notification_email: '',
  business_notification_phone: '',
};

function isMissingBookingTableError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('table') && message.includes('not found'))
  );
}

function uniqueArray(values, transform = (value) => value) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(transform).filter(Boolean)));
}

function normalizeDurationList(values, fallback = [30]) {
  const normalized = uniqueArray(values, (value) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }).sort((a, b) => a - b);
  return normalized.length ? normalized : fallback;
}

function normalizeChannelList(values, fallback) {
  const normalized = uniqueArray(values, (value) => {
    const lower = String(value || '').trim().toLowerCase();
    return ['email', 'sms'].includes(lower) ? lower : null;
  });
  return normalized.length ? normalized : fallback;
}

function normalizeSettings(input = {}) {
  const merged = {
    ...DEFAULT_BOOKING_SETTINGS,
    ...(input || {}),
  };
  const normalizedInputDurations = normalizeDurationList(merged.allowed_durations_minutes, []);
  const isLegacySingleDuration =
    normalizedInputDurations.length === 1 &&
    normalizedInputDurations[0] === 30 &&
    (input?.allowed_durations_minutes === undefined || input?.slot_duration_minutes === undefined || parseInt(input?.slot_duration_minutes, 10) === 30);
  const allowedDurations = isLegacySingleDuration || normalizedInputDurations.length === 0
    ? DEFAULT_BOOKING_DURATIONS
    : normalizedInputDurations;
  const slotDuration = allowedDurations.includes(parseInt(merged.slot_duration_minutes, 10))
    ? parseInt(merged.slot_duration_minutes, 10)
    : allowedDurations[0];

  return {
    enabled: merged.enabled === true,
    slot_duration_minutes: slotDuration,
    allowed_durations_minutes: allowedDurations,
    capacity_per_slot: Math.max(1, parseInt(merged.capacity_per_slot, 10) || 1),
    minimum_notice_minutes: Math.max(0, parseInt(merged.minimum_notice_minutes, 10) || 0),
    max_days_ahead: Math.max(1, parseInt(merged.max_days_ahead, 10) || 30),
    duplicate_window_minutes: Math.max(0, parseInt(merged.duplicate_window_minutes, 10) || 0),
    require_confirmation_for_duplicates: merged.require_confirmation_for_duplicates !== false,
    ask_for_email: merged.ask_for_email !== false,
    require_reason: merged.require_reason === true,
    customer_confirmation_enabled: merged.customer_confirmation_enabled !== false,
    customer_confirmation_channels: normalizeChannelList(merged.customer_confirmation_channels, ['sms']),
    business_confirmation_enabled: merged.business_confirmation_enabled !== false,
    business_confirmation_channels: normalizeChannelList(merged.business_confirmation_channels, ['email']),
    customer_reminders_enabled: merged.customer_reminders_enabled === true,
    customer_reminder_offsets: normalizeDurationList(merged.customer_reminder_offsets, [1440]),
    customer_reminder_channels: normalizeChannelList(merged.customer_reminder_channels, ['sms']),
    business_reminders_enabled: merged.business_reminders_enabled === true,
    business_reminder_offsets: normalizeDurationList(merged.business_reminder_offsets, [60]),
    business_reminder_channels: normalizeChannelList(merged.business_reminder_channels, ['email']),
    business_notification_email: String(merged.business_notification_email || '').trim(),
    business_notification_phone: String(merged.business_notification_phone || '').trim(),
  };
}

function withTimestamps(data) {
  return {
    ...data,
    updated_at: new Date().toISOString(),
  };
}

export class BookingSettings {
  static normalize(input) {
    return normalizeSettings(input);
  }

  static async findByBusinessId(businessId) {
    const { data, error } = await supabaseClient
      .from('booking_settings')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingSettings] booking_settings table missing; returning defaults until migrations run.');
      return { business_id: businessId, ...DEFAULT_BOOKING_SETTINGS };
    }
    if (error) throw error;
    if (!data) return { business_id: businessId, ...DEFAULT_BOOKING_SETTINGS };
    const { availability_rules: _legacyAvailabilityRules, ...persisted } = data;
    return { ...persisted, ...normalizeSettings(data) };
  }

  static async upsertByBusinessId(businessId, input) {
    const normalized = normalizeSettings(input);
    const payload = withTimestamps({
      business_id: businessId,
      ...normalized,
    });
    const { data, error } = await supabaseClient
      .from('booking_settings')
      .upsert(payload, { onConflict: 'business_id' })
      .select('*')
      .single();

    if (error) throw error;
    const { availability_rules: _legacyAvailabilityRules, ...persisted } = data;
    return { ...persisted, ...normalizeSettings(data) };
  }
}

export class Booking {
  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('bookings')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error && isMissingBookingTableError(error)) {
      console.warn('[Booking] bookings table missing; findById returning null.');
      return null;
    }
    if (error) throw error;
    return data || null;
  }

  static async findByBusinessId(businessId, options = {}) {
    const {
      status,
      search,
      startDate,
      endDate,
      limit = 200,
      offset = 0,
    } = options;

    let query = supabaseClient
      .from('bookings')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('start_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (startDate) query = query.gte('start_at', startDate);
    if (endDate) query = query.lte('start_at', endDate);
    if (search) {
      const q = String(search).trim();
      if (q) {
        query = query.or(`customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%,customer_email.ilike.%${q}%,reason.ilike.%${q}%`);
      }
    }

    const { data, error } = await query;
    if (error && isMissingBookingTableError(error)) {
      console.warn('[Booking] bookings table missing; findByBusinessId returning [].');
      return [];
    }
    if (error) throw error;
    return data || [];
  }

  static async findOverlapping(businessId, startAt, endAt, excludeId = null) {
    let query = supabaseClient
      .from('bookings')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .in('status', ['scheduled', 'confirmed', 'completed'])
      .lt('start_at', endAt)
      .gt('end_at', startAt);

    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query;
    if (error && isMissingBookingTableError(error)) {
      console.warn('[Booking] bookings table missing; findOverlapping returning [].');
      return [];
    }
    if (error) throw error;
    return data || [];
  }

  static async findDuplicatesByPhone(businessId, customerPhone, startAt, windowMinutes, excludeId = null) {
    const center = new Date(startAt);
    const before = new Date(center.getTime() - windowMinutes * 60 * 1000).toISOString();
    const after = new Date(center.getTime() + windowMinutes * 60 * 1000).toISOString();

    let query = supabaseClient
      .from('bookings')
      .select('*')
      .eq('business_id', businessId)
      .eq('customer_phone', customerPhone)
      .is('deleted_at', null)
      .in('status', ['scheduled', 'confirmed', 'completed'])
      .gte('start_at', before)
      .lte('start_at', after);

    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query;
    if (error && isMissingBookingTableError(error)) {
      console.warn('[Booking] bookings table missing; duplicate lookup returning [].');
      return [];
    }
    if (error) throw error;
    return data || [];
  }

  static async create(payload) {
    const { data, error } = await supabaseClient
      .from('bookings')
      .insert(payload)
      .select('*')
      .single();
    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingBlock] booking_blocks table missing; returning [].');
      return [];
    }
    if (error) throw error;
    return data;
  }

  static async update(id, input) {
    const { data, error } = await supabaseClient
      .from('bookings')
      .update(withTimestamps(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingBlock] booking_blocks table missing; findById returning null.');
      return null;
    }
    if (error) throw error;
    return data;
  }

  static async softDelete(id, deletedByUserId = null) {
    return this.update(id, {
      deleted_at: new Date().toISOString(),
      updated_by_user_id: deletedByUserId,
    });
  }
}

export class BookingBlock {
  static async findByBusinessId(businessId, options = {}) {
    const { startDate, endDate } = options;
    let query = supabaseClient
      .from('booking_blocks')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('start_at', { ascending: true });

    if (startDate) query = query.gte('end_at', startDate);
    if (endDate) query = query.lte('start_at', endDate);

    const { data, error } = await query;
    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingNotification] booking_notifications table missing; returning [].');
      return [];
    }
    if (error) throw error;
    return data || [];
  }

  static async findById(id) {
    const { data, error } = await supabaseClient
      .from('booking_blocks')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingNotification] booking_notifications table missing; skipping cancelQueuedForBooking.');
      return;
    }
    if (error) throw error;
    return data || null;
  }

  static async create(payload) {
    const { data, error } = await supabaseClient
      .from('booking_blocks')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async update(id, input) {
    const { data, error } = await supabaseClient
      .from('booking_blocks')
      .update(withTimestamps(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async softDelete(id, deletedByUserId = null) {
    return this.update(id, {
      deleted_at: new Date().toISOString(),
      updated_by_user_id: deletedByUserId,
    });
  }
}

export class BookingNotification {
  static async createMany(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const { data, error } = await supabaseClient
      .from('booking_notifications')
      .insert(rows)
      .select('*');
    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingNotification] booking_notifications table missing; skipping notification inserts.');
      return [];
    }
    if (error) throw error;
    return data || [];
  }

  static async findDue(limit = 100) {
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from('booking_notifications')
      .select('*')
      .eq('status', 'queued')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(limit);
    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingNotification] booking_notifications table missing; findDue returning [].');
      return [];
    }
    if (error) throw error;
    return data || [];
  }

  static async cancelQueuedForBooking(bookingId) {
    const { error } = await supabaseClient
      .from('booking_notifications')
      .update(withTimestamps({ status: 'cancelled' }))
      .eq('booking_id', bookingId)
      .eq('status', 'queued');
    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingNotification] booking_notifications table missing; skipping cancelQueuedForBooking.');
      return;
    }
    if (error) throw error;
  }

  static async update(id, input) {
    const { data, error } = await supabaseClient
      .from('booking_notifications')
      .update(withTimestamps(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error && isMissingBookingTableError(error)) {
      console.warn('[BookingNotification] booking_notifications table missing; skipping update.');
      return null;
    }
    if (error) throw error;
    return data;
  }
}
