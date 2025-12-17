/**
 * Business Hours Utilities
 * Functions for checking business hours and converting time formats
 */

/**
 * Convert 24-hour time (HH:MM) to 12-hour time (h:MM AM/PM)
 * @param {string} time24 - Time in 24-hour format (e.g., "14:30")
 * @returns {string} Time in 12-hour format (e.g., "2:30 PM")
 */
export function convertTo12Hour(time24) {
  if (!time24 || typeof time24 !== 'string') return '';
  
  const [hours, minutes] = time24.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return time24;
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Convert 12-hour time (h:MM AM/PM) to 24-hour time (HH:MM)
 * @param {string} time12 - Time in 12-hour format (e.g., "2:30 PM")
 * @returns {string} Time in 24-hour format (e.g., "14:30")
 */
export function convertTo24Hour(time12) {
  if (!time12 || typeof time12 !== 'string') return '';
  
  // Handle formats like "2:30 PM", "2:30PM", "14:30" (already 24-hour)
  const trimmed = time12.trim();
  
  // If it's already in 24-hour format (contains no AM/PM), return as-is
  if (!trimmed.match(/[AP]M/i)) {
    return trimmed;
  }
  
  const match = trimmed.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return time12;
  
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

/**
 * Check if business is currently open based on business hours and timezone
 * @param {Object} businessHours - Business hours object (e.g., { monday: { open: "09:00", close: "17:00", closed: false } })
 * @param {string} timezone - Business timezone (e.g., "America/New_York")
 * @returns {boolean} True if business is currently open
 */
export function isBusinessOpen(businessHours, timezone = 'America/New_York') {
  if (!businessHours || typeof businessHours !== 'object') {
    return false;
  }

  try {
    // Get current time in business timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const dayName = parts.find(p => p.type === 'weekday')?.value?.toLowerCase();
    const hour = parts.find(p => p.type === 'hour')?.value;
    const minute = parts.find(p => p.type === 'minute')?.value;
    const currentTime = `${hour}:${minute}`;

    if (!dayName) {
      return false;
    }

    const todayHours = businessHours[dayName];
    
    if (!todayHours || todayHours.closed) {
      return false;
    }

    const openTime = todayHours.open || '09:00';
    const closeTime = todayHours.close || '17:00';

    // Compare times (HH:MM format)
    return currentTime >= openTime && currentTime <= closeTime;
  } catch (error) {
    console.error('[Business Hours] Error checking if business is open:', error);
    return false;
  }
}

/**
 * Format business hours for display (12-hour format)
 * @param {Object} businessHours - Business hours object
 * @returns {string} Formatted business hours text
 */
export function formatBusinessHours(businessHours) {
  if (!businessHours || typeof businessHours !== 'object') {
    return 'Business hours not specified';
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const formatted = [];

  for (const day of days) {
    const dayLower = day.toLowerCase();
    const hours = businessHours[dayLower];
    
    if (!hours || hours.closed) {
      formatted.push(`${day}: Closed`);
    } else {
      const open12 = convertTo12Hour(hours.open || '09:00');
      const close12 = convertTo12Hour(hours.close || '17:00');
      formatted.push(`${day}: ${open12} - ${close12}`);
    }
  }

  return formatted.join('\n');
}

/**
 * Check if business was open at a specific time
 * @param {Object} businessHours - Business hours object
 * @param {string} timezone - Business timezone
 * @param {Date} dateTime - Date/time to check
 * @returns {boolean} True if business was open at that time
 */
export function isBusinessOpenAtTime(businessHours, timezone = 'America/New_York', dateTime = new Date()) {
  if (!businessHours || typeof businessHours !== 'object') {
    return false;
  }

  try {
    // Get time in business timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(dateTime);
    const dayName = parts.find(p => p.type === 'weekday')?.value?.toLowerCase();
    const hour = parts.find(p => p.type === 'hour')?.value;
    const minute = parts.find(p => p.type === 'minute')?.value;
    const checkTime = `${hour}:${minute}`;

    if (!dayName) {
      return false;
    }

    const dayHours = businessHours[dayName];
    
    if (!dayHours || dayHours.closed) {
      return false;
    }

    const openTime = dayHours.open || '09:00';
    const closeTime = dayHours.close || '17:00';

    // Compare times (HH:MM format)
    return checkTime >= openTime && checkTime <= closeTime;
  } catch (error) {
    console.error('[Business Hours] Error checking if business was open at time:', error);
    return false;
  }
}

/**
 * Get current day name in business timezone
 * @param {string} timezone - Business timezone
 * @returns {string} Day name in lowercase (e.g., "monday")
 */
export function getCurrentDay(timezone = 'America/New_York') {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    });
    const dayName = formatter.format(now);
    return dayName.toLowerCase();
  } catch (error) {
    console.error('[Business Hours] Error getting current day:', error);
    // Fallback to local time
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date().getDay()];
  }
}

