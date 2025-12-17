// utils/phoneFormatter.js
// Phone number formatting and validation using libphonenumber-js

import { parsePhoneNumber, isValidPhoneNumber, formatIncompletePhoneNumber } from "libphonenumber-js";

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phoneNumber, country = "US") {
  if (!phoneNumber) return null;

  try {
    const parsed = parsePhoneNumber(phoneNumber, country);
    return parsed.formatNational();
  } catch (error) {
    // If parsing fails, return as-is
    return phoneNumber;
  }
}

/**
 * Format phone number for E.164 (international format)
 */
export function formatPhoneNumberE164(phoneNumber, country = "US") {
  if (!phoneNumber) return null;

  try {
    const parsed = parsePhoneNumber(phoneNumber, country);
    return parsed.number;
  } catch (error) {
    return phoneNumber;
  }
}

/**
 * Validate phone number
 */
export function validatePhoneNumber(phoneNumber, country = "US") {
  if (!phoneNumber) return false;
  return isValidPhoneNumber(phoneNumber, country);
}

/**
 * Format incomplete phone number as user types
 */
export function formatIncomplete(phoneNumber, country = "US") {
  if (!phoneNumber) return "";
  return formatIncompletePhoneNumber(phoneNumber, country);
}

/**
 * Extract area code from a phone number
 * @param {string} phoneNumber - Phone number in E.164 format or any format
 * @returns {string|null} Area code (3 digits for US/Canada) or null if not found
 */
export function extractAreaCode(phoneNumber) {
  try {
    if (!phoneNumber) return null;
    
    // Parse the phone number
    const parsed = parsePhoneNumber(phoneNumber);
    if (!parsed) return null;
    
    // For US/Canada, get the area code (national destination code)
    const countryCode = parsed.country;
    if (countryCode === 'US' || countryCode === 'CA') {
      // Get the national number and extract first 3 digits
      const nationalNumber = parsed.nationalNumber;
      if (nationalNumber && nationalNumber.length >= 10) {
        // US/Canada format: (area code)(exchange)(number)
        // Extract first 3 digits as area code
        return nationalNumber.substring(0, 3);
      }
    }
    
    return null;
  } catch (error) {
    // If parsing fails, try regex extraction
    const cleaned = phoneNumber.replace(/\D/g, '');
    // For US/Canada numbers, area code is digits 1-3 (after country code 1)
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return cleaned.substring(1, 4);
    } else if (cleaned.length === 10) {
      return cleaned.substring(0, 3);
    }
    return null;
  }
}

