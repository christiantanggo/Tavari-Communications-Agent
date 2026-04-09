import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Business } from '../models/Business.js';
import { AIAgent } from '../models/AIAgent.js';
import {
  Booking,
  BookingBlock,
  BookingNotification,
  BookingSettings,
} from '../models/Booking.js';
import { addBusinessIdentification, sendEmail, sendSMSDirect } from './notifications.js';
import { formatPhoneNumberE164 } from '../utils/phoneFormatter.js';

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ACTIVE_BOOKING_STATUSES = new Set(['scheduled', 'confirmed', 'completed']);
const DEFAULT_REMINDER_LIMIT = 100;

function parseTimeToMinutes(timeValue = '00:00') {
  const [hours, minutes] = String(timeValue || '00:00').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minutesToTime(minutes) {
  const safe = Math.max(0, minutes);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function localDateToUtc(dateStr, timeStr, timezone) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number);
  const [hours, minutes] = String(timeStr || '').split(':').map(Number);
  const wallClock = new Date(year || 2000, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  return fromZonedTime(wallClock, timezone);
}

function getDatePartsInZone(dateInput, timezone) {
  const date = new Date(dateInput);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: String(lookup.weekday || '').toLowerCase(),
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    time: `${lookup.hour}:${lookup.minute}`,
  };
}

function normalizeRecipient(value) {
  return String(value || '').trim();
}

function normalizeChannels(values, fallback = []) {
  const normalized = Array.isArray(values)
    ? values.map((value) => String(value || '').trim().toLowerCase()).filter((value) => ['email', 'sms'].includes(value))
    : [];
  return normalized.length ? Array.from(new Set(normalized)) : fallback;
}

function normalizeOffsets(values, fallback = []) {
  const normalized = Array.isArray(values)
    ? Array.from(new Set(values.map((value) => parseInt(value, 10)).filter((value) => Number.isFinite(value) && value > 0))).sort((a, b) => a - b)
    : [];
  return normalized.length ? normalized : fallback;
}

function buildSmsFromNumber(business) {
  return [business?.vapi_phone_number, business?.telnyx_number, business?.public_phone_number]
    .map((value) => formatPhoneNumberE164(value || ''))
    .find(Boolean) || null;
}

function buildHumanDateTime(booking, timezone) {
  return formatInTimeZone(
    new Date(booking.start_at),
    timezone,
    "EEE, MMM d 'at' h:mm a"
  );
}

function getHolidayOverride(holidayHours, dateStr) {
  if (!Array.isArray(holidayHours)) return null;
  return holidayHours.find((holiday) => String(holiday?.date || '') === dateStr) || null;
}

function getAvailabilityBlocksForDate(agent, dateStr, timezone) {
  const holiday = getHolidayOverride(agent?.holiday_hours, dateStr);
  if (holiday) {
    if (holiday.closed) return [];
    if (holiday.open && holiday.close && holiday.close > holiday.open) {
      return [{ start: holiday.open, end: holiday.close }];
    }
  }

  const weekday = getDatePartsInZone(localDateToUtc(dateStr, '12:00', timezone), timezone).weekday;
  const dayHours = agent?.business_hours?.[weekday];
  if (!dayHours || dayHours.closed) {
    return [];
  }
  if (dayHours.open && dayHours.close && dayHours.close > dayHours.open) {
    return [{ start: dayHours.open, end: dayHours.close }];
  }
  return [];
}

async function getActiveBookingsAndBlocks(businessId, startIso, endIso) {
  const [bookings, blocks] = await Promise.all([
    Booking.findByBusinessId(businessId, { startDate: startIso, endDate: endIso, limit: 500 }),
    BookingBlock.findByBusinessId(businessId, { startDate: startIso, endDate: endIso }),
  ]);
  return {
    bookings: bookings.filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status)),
    blocks,
  };
}

function overlaps(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

export async function getBookingContext(businessId) {
  const [business, agent, settings] = await Promise.all([
    Business.findById(businessId),
    AIAgent.findByBusinessId(businessId),
    BookingSettings.findByBusinessId(businessId),
  ]);

  if (!business) {
    throw new Error('Business not found');
  }

  return { business, agent, settings };
}

/** Today and last bookable date (YYYY-MM-DD) in the business timezone, plus settings. */
export async function getBookingCalendarBoundsForBusiness(businessId) {
  const { business, settings } = await getBookingContext(businessId);
  const timezone = business.timezone || 'America/New_York';
  const now = new Date();
  const todayInZone = getDatePartsInZone(now, timezone).date;
  const maxAllowedDate = getDatePartsInZone(
    new Date(now.getTime() + settings.max_days_ahead * 24 * 60 * 60 * 1000),
    timezone,
  ).date;
  return {
    timezone,
    todayInZone,
    maxAllowedDate,
    maxDaysAhead: settings.max_days_ahead,
  };
}

export async function getAvailableSlotsForDate(businessId, dateStr, durationMinutes = null) {
  const { business, agent, settings } = await getBookingContext(businessId);
  const timezone = business.timezone || 'America/New_York';
  const slotDuration = durationMinutes && settings.allowed_durations_minutes.includes(parseInt(durationMinutes, 10))
    ? parseInt(durationMinutes, 10)
    : settings.slot_duration_minutes;
  const slotIncrement = Math.min(...(settings.allowed_durations_minutes || [settings.slot_duration_minutes]).filter((value) => Number.isFinite(value) && value > 0));

  const startOfDayIso = localDateToUtc(dateStr, '00:00', timezone).toISOString();
  const endOfDayIso = localDateToUtc(dateStr, '23:59', timezone).toISOString();
  const now = new Date();
  const minStart = new Date(now.getTime() + settings.minimum_notice_minutes * 60 * 1000);

  const todayInZone = getDatePartsInZone(now, timezone).date;
  const maxAllowedDate = getDatePartsInZone(
    new Date(now.getTime() + settings.max_days_ahead * 24 * 60 * 60 * 1000),
    timezone,
  ).date;
  if (dateStr < todayInZone || dateStr > maxAllowedDate) {
    return [];
  }

  const availabilityBlocks = getAvailabilityBlocksForDate(agent, dateStr, timezone);
  if (!availabilityBlocks.length) {
    return [];
  }

  const { bookings, blocks } = await getActiveBookingsAndBlocks(businessId, startOfDayIso, endOfDayIso);
  const slots = [];

  for (const block of availabilityBlocks) {
    const startMinutes = parseTimeToMinutes(block.start);
    const endMinutes = parseTimeToMinutes(block.end);
    for (let cursor = startMinutes; cursor + slotDuration <= endMinutes; cursor += slotIncrement) {
      const slotStartIso = localDateToUtc(dateStr, minutesToTime(cursor), timezone).toISOString();
      const slotEndIso = localDateToUtc(dateStr, minutesToTime(cursor + slotDuration), timezone).toISOString();
      if (new Date(slotStartIso) < minStart) continue;

      const blockConflict = blocks.some((entry) => overlaps(slotStartIso, slotEndIso, entry.start_at, entry.end_at));
      if (blockConflict) continue;

      const overlapCount = bookings.filter((entry) => overlaps(slotStartIso, slotEndIso, entry.start_at, entry.end_at)).length;
      const capacityRemaining = Math.max(0, settings.capacity_per_slot - overlapCount);
      if (capacityRemaining <= 0) continue;

      slots.push({
        start_at: slotStartIso,
        end_at: slotEndIso,
        local_date: dateStr,
        local_time: minutesToTime(cursor),
        duration_minutes: slotDuration,
        capacity_remaining: capacityRemaining,
      });
    }
  }

  return slots;
}

function resolveBookingWindow({
  start_at,
  date,
  start_time,
  duration_minutes,
  timezone,
}) {
  if (start_at) {
    const startDate = new Date(start_at);
    const duration = Math.max(1, parseInt(duration_minutes, 10) || 30);
    return {
      startAtIso: startDate.toISOString(),
      endAtIso: new Date(startDate.getTime() + duration * 60 * 1000).toISOString(),
      durationMinutes: duration,
      localDate: getDatePartsInZone(startDate, timezone).date,
    };
  }

  const safeDate = String(date || '').trim();
  const safeStart = String(start_time || '').trim();
  const duration = Math.max(1, parseInt(duration_minutes, 10) || 30);
  const startAt = localDateToUtc(safeDate, safeStart, timezone);
  return {
    startAtIso: startAt.toISOString(),
    endAtIso: new Date(startAt.getTime() + duration * 60 * 1000).toISOString(),
    durationMinutes: duration,
    localDate: safeDate,
  };
}

function buildBookingPayload(input, context, userId, overrides = {}) {
  const timezone = context.business.timezone || 'America/New_York';
  const bookingWindow = resolveBookingWindow({
    start_at: input.start_at,
    date: input.date,
    start_time: input.start_time,
    duration_minutes: input.duration_minutes,
    timezone,
  });

  const payload = {
    business_id: context.business.id,
    customer_name: String(input.customer_name || '').trim(),
    customer_phone: formatPhoneNumberE164(String(input.customer_phone || '').trim()) || String(input.customer_phone || '').trim(),
    customer_email: normalizeRecipient(input.customer_email) || null,
    reason: normalizeRecipient(input.reason) || null,
    notes: normalizeRecipient(input.notes) || null,
    timezone,
    duration_minutes: bookingWindow.durationMinutes,
    start_at: bookingWindow.startAtIso,
    end_at: bookingWindow.endAtIso,
    source: input.source || 'dashboard',
    source_call_id: input.source_call_id || null,
    updated_by_user_id: userId || null,
    ...overrides,
  };
  if (!input.id) {
    payload.created_by_user_id = userId || null;
  }
  return payload;
}

/** Rules that always apply (public + staff). Does not enforce business hours, notice window, or capacity. */
function validateBookingWindowBasics(bookingPayload, context) {
  const settings = context.settings;
  const timezone = bookingPayload.timezone || context.business.timezone || 'America/New_York';
  const allowedDurations = settings.allowed_durations_minutes || [settings.slot_duration_minutes];
  if (!allowedDurations.includes(bookingPayload.duration_minutes)) {
    throw new Error('Selected duration is not allowed for this business');
  }

  const startParts = getDatePartsInZone(bookingPayload.start_at, timezone);
  const endParts = getDatePartsInZone(bookingPayload.end_at, timezone);
  const localDate = startParts.date;
  if (endParts.date !== localDate) {
    throw new Error('Bookings must start and end on the same day');
  }
  if (new Date(bookingPayload.end_at) <= new Date(bookingPayload.start_at)) {
    throw new Error('Booking end time must be after start time');
  }
}

async function validateBookingAgainstAvailability(context, bookingPayload, excludeId = null) {
  const settings = context.settings;
  const timezone = bookingPayload.timezone || context.business.timezone || 'America/New_York';
  validateBookingWindowBasics(bookingPayload, context);

  const startParts = getDatePartsInZone(bookingPayload.start_at, timezone);
  const endParts = getDatePartsInZone(bookingPayload.end_at, timezone);
  const localDate = startParts.date;

  const now = new Date();
  const minStart = new Date(now.getTime() + settings.minimum_notice_minutes * 60 * 1000);
  const todayInZone = getDatePartsInZone(now, timezone).date;
  const maxAllowedDate = getDatePartsInZone(
    new Date(now.getTime() + settings.max_days_ahead * 24 * 60 * 60 * 1000),
    timezone,
  ).date;
  if (localDate < todayInZone || localDate > maxAllowedDate || new Date(bookingPayload.start_at) < minStart) {
    throw new Error('The selected time slot is not available');
  }

  const availabilityBlocks = getAvailabilityBlocksForDate(context.agent, localDate, timezone);
  const startMinutes = parseTimeToMinutes(startParts.time);
  const endMinutes = parseTimeToMinutes(endParts.time);
  const fitsAvailability = availabilityBlocks.some((block) => {
    const blockStart = parseTimeToMinutes(block.start);
    const blockEnd = parseTimeToMinutes(block.end);
    return startMinutes >= blockStart && endMinutes <= blockEnd;
  });
  if (!fitsAvailability) {
    throw new Error('The selected time slot is not available');
  }

  const conflicts = await Booking.findOverlapping(
    context.business.id,
    bookingPayload.start_at,
    bookingPayload.end_at,
    excludeId,
  );
  if (conflicts.length >= settings.capacity_per_slot) {
    throw new Error('This time slot has reached capacity');
  }

  const blocks = await BookingBlock.findByBusinessId(context.business.id, {
    startDate: bookingPayload.start_at,
    endDate: bookingPayload.end_at,
  });
  if (blocks.some((block) => overlaps(bookingPayload.start_at, bookingPayload.end_at, block.start_at, block.end_at))) {
    throw new Error('This time slot is currently blocked');
  }
}

function buildNotificationRows(booking, context, mode = 'create') {
  const business = context.business;
  const rows = [];
  const nowIso = new Date().toISOString();

  const settings = context.settings || {};
  const config = {
    customer_confirmation_enabled: business.booking_customer_confirmation_enabled ?? settings.customer_confirmation_enabled ?? true,
    customer_confirmation_channels: normalizeChannels(
      business.booking_customer_confirmation_channels,
      normalizeChannels(settings.customer_confirmation_channels, ['sms']),
    ),
    customer_reminders_enabled: business.booking_customer_reminders_enabled ?? settings.customer_reminders_enabled ?? false,
    customer_reminder_offsets: normalizeOffsets(
      business.booking_customer_reminder_offsets,
      normalizeOffsets(settings.customer_reminder_offsets, [1440]),
    ),
    customer_reminder_channels: normalizeChannels(
      business.booking_customer_reminder_channels,
      normalizeChannels(settings.customer_reminder_channels, ['sms']),
    ),
    business_confirmation_enabled: business.booking_business_confirmation_enabled ?? settings.business_confirmation_enabled ?? true,
    business_confirmation_channels: normalizeChannels(
      business.booking_business_confirmation_channels,
      normalizeChannels(settings.business_confirmation_channels, ['email']),
    ),
    business_reminders_enabled: business.booking_business_reminders_enabled ?? settings.business_reminders_enabled ?? false,
    business_reminder_offsets: normalizeOffsets(
      business.booking_business_reminder_offsets,
      normalizeOffsets(settings.business_reminder_offsets, [60]),
    ),
    business_reminder_channels: normalizeChannels(
      business.booking_business_reminder_channels,
      normalizeChannels(settings.business_reminder_channels, ['email']),
    ),
  };

  const businessEmail = normalizeRecipient(business.email);
  const businessPhone = business.sms_enabled ? formatPhoneNumberE164(business.sms_notification_number || '') : null;

  const queueRecipient = (kind, channel, recipient, scheduledFor) => {
    if (!recipient) return;
    rows.push({
      booking_id: booking.id,
      business_id: booking.business_id,
      kind,
      channel,
      recipient,
      payload: { mode },
      scheduled_for: scheduledFor,
      status: 'queued',
    });
  };

  if (config.customer_confirmation_enabled) {
    for (const channel of config.customer_confirmation_channels) {
      if (channel === 'sms') queueRecipient('customer_confirmation', channel, formatPhoneNumberE164(booking.customer_phone), nowIso);
      if (channel === 'email' && booking.customer_email) queueRecipient('customer_confirmation', channel, booking.customer_email, nowIso);
    }
  }

  if (config.business_confirmation_enabled) {
    for (const channel of config.business_confirmation_channels) {
      if (channel === 'sms') queueRecipient('business_confirmation', channel, businessPhone, nowIso);
      if (channel === 'email') queueRecipient('business_confirmation', channel, businessEmail, nowIso);
    }
  }

  if (config.customer_reminders_enabled) {
    for (const offset of config.customer_reminder_offsets) {
      const scheduledFor = new Date(new Date(booking.start_at).getTime() - offset * 60 * 1000);
      if (scheduledFor <= new Date()) continue;
      for (const channel of config.customer_reminder_channels) {
        if (channel === 'sms') queueRecipient(`customer_reminder_${offset}`, channel, formatPhoneNumberE164(booking.customer_phone), scheduledFor.toISOString());
        if (channel === 'email' && booking.customer_email) queueRecipient(`customer_reminder_${offset}`, channel, booking.customer_email, scheduledFor.toISOString());
      }
    }
  }

  if (config.business_reminders_enabled) {
    for (const offset of config.business_reminder_offsets) {
      const scheduledFor = new Date(new Date(booking.start_at).getTime() - offset * 60 * 1000);
      if (scheduledFor <= new Date()) continue;
      for (const channel of config.business_reminder_channels) {
        if (channel === 'sms') queueRecipient(`business_reminder_${offset}`, channel, businessPhone, scheduledFor.toISOString());
        if (channel === 'email') queueRecipient(`business_reminder_${offset}`, channel, businessEmail, scheduledFor.toISOString());
      }
    }
  }

  return rows;
}

async function refreshNotificationsForBooking(booking, context, mode = 'create') {
  try {
    await BookingNotification.cancelQueuedForBooking(booking.id);
    const rows = buildNotificationRows(booking, context, mode);
    if (rows.length) {
      await BookingNotification.createMany(rows);
    }
  } catch (error) {
    console.warn('[Bookings] Notification scheduling failed; booking was still saved.', error?.message || error);
  }
}

export async function createBooking(input, userId = null) {
  const context = await getBookingContext(input.business_id);
  if (!context.settings.enabled) {
    throw new Error('Bookings are not enabled for this business');
  }

  const payload = buildBookingPayload(input, context, userId);
  if (!payload.customer_name || !payload.customer_phone) {
    throw new Error('Customer name and phone are required');
  }

  const source = String(input.source || '').toLowerCase();
  const staffSkipsPublicSlotRules =
    source === 'dashboard' || input.skip_availability_check === true;
  if (staffSkipsPublicSlotRules) {
    validateBookingWindowBasics(payload, context);
  } else {
    await validateBookingAgainstAvailability(context, payload);
  }
  const duplicates = await Booking.findDuplicatesByPhone(
    context.business.id,
    payload.customer_phone,
    payload.start_at,
    context.settings.duplicate_window_minutes,
  );
  const requiresConfirmation = duplicates.length > 0 && context.settings.require_confirmation_for_duplicates;
  const status = requiresConfirmation ? 'scheduled' : 'confirmed';
  const booking = await Booking.create({
    ...payload,
    status,
    requires_confirmation: requiresConfirmation,
    confirmed_at: requiresConfirmation ? null : new Date().toISOString(),
  });

  await refreshNotificationsForBooking(booking, context, requiresConfirmation ? 'pending_confirmation' : 'create');
  return { booking, duplicate_matches: duplicates, requires_confirmation: requiresConfirmation };
}

export async function updateBookingDetails(bookingId, input, userId = null) {
  const existing = await Booking.findById(bookingId);
  if (!existing) throw new Error('Booking not found');
  const context = await getBookingContext(existing.business_id);
  const shouldRevalidateSlot =
    input.start_at !== undefined ||
    input.date !== undefined ||
    input.start_time !== undefined ||
    input.duration_minutes !== undefined;
  const payload = buildBookingPayload(
    {
      ...existing,
      ...input,
      start_at: input.start_at || existing.start_at,
      duration_minutes: input.duration_minutes || existing.duration_minutes,
    },
    context,
    userId,
    {
      status: input.status || existing.status,
      requires_confirmation: input.requires_confirmation ?? existing.requires_confirmation,
      confirmed_at: input.confirmed_at ?? existing.confirmed_at,
    },
  );

  if (shouldRevalidateSlot) {
    const staffSkipsPublicSlotRules = input.skip_availability_check === true;
    if (staffSkipsPublicSlotRules) {
      validateBookingWindowBasics(payload, context);
    } else {
      await validateBookingAgainstAvailability(context, payload, bookingId);
    }
  }
  const updated = await Booking.update(bookingId, {
    ...payload,
    updated_by_user_id: userId || existing.updated_by_user_id || null,
  });
  if (['cancelled', 'completed', 'no_show', 'rescheduled'].includes(updated.status)) {
    await BookingNotification.cancelQueuedForBooking(updated.id);
  } else {
    await refreshNotificationsForBooking(updated, context, 'update');
  }
  return updated;
}

export async function confirmBooking(bookingId, userId = null) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error('Booking not found');
  const updated = await Booking.update(bookingId, {
    status: 'confirmed',
    requires_confirmation: false,
    confirmed_at: new Date().toISOString(),
    updated_by_user_id: userId,
  });
  const context = await getBookingContext(updated.business_id);
  await refreshNotificationsForBooking(updated, context, 'confirmed');
  return updated;
}

export async function cancelBooking(bookingId, cancelReason, userId = null) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error('Booking not found');
  const updated = await Booking.update(bookingId, {
    status: 'cancelled',
    cancel_reason: normalizeRecipient(cancelReason) || null,
    updated_by_user_id: userId,
  });
  await BookingNotification.cancelQueuedForBooking(bookingId);
  return updated;
}

export async function rescheduleBooking(bookingId, input, userId = null) {
  const existing = await Booking.findById(bookingId);
  if (!existing) throw new Error('Booking not found');

  await Booking.update(bookingId, {
    status: 'rescheduled',
    updated_by_user_id: userId,
  });
  await BookingNotification.cancelQueuedForBooking(bookingId);

  const result = await createBooking(
    {
      business_id: existing.business_id,
      customer_name: input.customer_name || existing.customer_name,
      customer_phone: input.customer_phone || existing.customer_phone,
      customer_email: input.customer_email ?? existing.customer_email,
      reason: input.reason ?? existing.reason,
      notes: input.notes ?? existing.notes,
      start_at: input.start_at,
      duration_minutes: input.duration_minutes || existing.duration_minutes,
      source: existing.source,
      source_call_id: existing.source_call_id,
      skip_availability_check: input.skip_availability_check,
    },
    userId,
  );

  await Booking.update(result.booking.id, {
    rescheduled_from_booking_id: existing.id,
    updated_by_user_id: userId,
  });

  return result.booking;
}

export async function createBookingBlock(input, userId = null) {
  const context = await getBookingContext(input.business_id);
  const timezone = context.business.timezone || 'America/New_York';
  const startAt = input.start_at && /[zZ]|[+-]\d{2}:\d{2}$/.test(String(input.start_at))
    ? new Date(input.start_at).toISOString()
    : localDateToUtc(
        input.date || String(input.start_at || '').slice(0, 10),
        input.all_day ? '00:00' : (input.start_time || String(input.start_at || '').slice(11, 16) || '00:00'),
        timezone,
      ).toISOString();
  const endAt = input.end_at && /[zZ]|[+-]\d{2}:\d{2}$/.test(String(input.end_at))
    ? new Date(input.end_at).toISOString()
    : localDateToUtc(
        input.date || String(input.end_at || '').slice(0, 10),
        input.all_day ? '23:59' : (input.end_time || String(input.end_at || '').slice(11, 16) || '23:59'),
        timezone,
      ).toISOString();
  const payload = {
    business_id: input.business_id,
    type: input.type || 'blocked',
    title: String(input.title || input.type || 'Blocked').trim(),
    start_at: startAt,
    end_at: endAt,
    all_day: input.all_day === true,
    notes: normalizeRecipient(input.notes) || null,
    source: input.source || 'dashboard',
    created_by_user_id: userId || null,
    updated_by_user_id: userId || null,
  };
  return BookingBlock.create(payload);
}

export async function updateBookingBlock(blockId, input, userId = null) {
  const block = await BookingBlock.findById(blockId);
  if (!block) throw new Error('Booking block not found');
  const context = await getBookingContext(block.business_id);
  const timezone = context.business.timezone || 'America/New_York';
  const startAt = input.start_at
    ? (/[zZ]|[+-]\d{2}:\d{2}$/.test(String(input.start_at))
        ? new Date(input.start_at).toISOString()
        : localDateToUtc(
            input.date || String(input.start_at || '').slice(0, 10),
            input.all_day ? '00:00' : (input.start_time || String(input.start_at || '').slice(11, 16) || '00:00'),
            timezone,
          ).toISOString())
    : block.start_at;
  const endAt = input.end_at
    ? (/[zZ]|[+-]\d{2}:\d{2}$/.test(String(input.end_at))
        ? new Date(input.end_at).toISOString()
        : localDateToUtc(
            input.date || String(input.end_at || '').slice(0, 10),
            input.all_day ? '23:59' : (input.end_time || String(input.end_at || '').slice(11, 16) || '23:59'),
            timezone,
          ).toISOString())
    : block.end_at;
  return BookingBlock.update(blockId, {
    ...input,
    start_at: startAt,
    end_at: endAt,
    updated_by_user_id: userId || null,
  });
}

function buildNotificationMessage(kind, booking, business) {
  const timezone = booking.timezone || business.timezone || 'America/New_York';
  const whenText = buildHumanDateTime(booking, timezone);
  const reasonText = booking.reason ? ` Reason: ${booking.reason}.` : '';
  const pendingText = booking.requires_confirmation ? ' This booking still needs confirmation.' : '';
  const customerName = booking.customer_name || 'Customer';

  if (kind.startsWith('customer_confirmation')) {
    return {
      subject: `${business.name}: booking ${booking.requires_confirmation ? 'pending confirmation' : 'confirmed'}`,
      text: `${business.name}: ${customerName}, your booking for ${whenText} has been ${booking.requires_confirmation ? 'received and is pending confirmation' : 'confirmed'}.${reasonText}${pendingText}`,
    };
  }
  if (kind.startsWith('business_confirmation')) {
    return {
      subject: `New booking: ${customerName}`,
      text: `New booking for ${whenText}. Customer: ${customerName}. Phone: ${booking.customer_phone}.${booking.customer_email ? ` Email: ${booking.customer_email}.` : ''}${reasonText}${pendingText}`,
    };
  }
  if (kind.startsWith('customer_reminder')) {
    return {
      subject: `${business.name}: booking reminder`,
      text: `${business.name}: reminder for your booking on ${whenText}.${reasonText}`,
    };
  }
  return {
    subject: `Upcoming booking reminder: ${customerName}`,
    text: `Reminder: ${customerName} is booked for ${whenText}.${reasonText}`,
  };
}

export async function processQueuedBookingNotifications(limit = DEFAULT_REMINDER_LIMIT) {
  const dueRows = await BookingNotification.findDue(limit);
  for (const row of dueRows) {
    try {
      const booking = await Booking.findById(row.booking_id);
      if (!booking || ['cancelled', 'rescheduled', 'no_show'].includes(booking.status)) {
        await BookingNotification.update(row.id, {
          status: 'cancelled',
        });
        continue;
      }

      const business = await Business.findById(row.business_id);
      const message = buildNotificationMessage(row.kind, booking, business);

      if (row.channel === 'email') {
        await sendEmail(row.recipient, message.subject, message.text, null, business?.name || 'Tavari', business?.id || null);
      } else if (row.channel === 'sms') {
        const fromNumber = buildSmsFromNumber(business);
        if (!fromNumber) throw new Error('No SMS-capable business number configured');
        const body = addBusinessIdentification(message.text, business?.name || 'Tavari');
        await sendSMSDirect(fromNumber, row.recipient, body);
      }

      await BookingNotification.update(row.id, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        failed_at: null,
        error_message: null,
      });
    } catch (error) {
      await BookingNotification.update(row.id, {
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: error.message,
      });
    }
  }

  return dueRows.length;
}

export function summarizeAvailableSlots(slots, timezone) {
  if (!slots.length) {
    return 'No booking slots are available for that request.';
  }
  const formatted = slots.slice(0, 8).map((slot) => {
    const label = formatInTimeZone(new Date(slot.start_at), timezone, "EEE MMM d 'at' h:mm a");
    return `${label} (${slot.capacity_remaining} left)`;
  });
  return `Available slots: ${formatted.join('; ')}.`;
}
