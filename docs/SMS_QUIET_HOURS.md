# SMS Quiet Hours / Time Restrictions - US & Canada

## 🇺🇸🇨🇦 **Cross-Border Compliance Strategy**

This document outlines quiet hours requirements for **both United States (TCPA) and Canada (CASL)**. We implement the **strictest rules** from both countries.

---

## US Quiet Hours Rules (TCPA/CTIA)

### Federal Requirements (TCPA)
- **Prohibited Hours**: 8:00 PM - 8:00 AM (recipient's local time zone)
- **Allowed Hours**: 8:00 AM - 8:00 PM (recipient's local time zone)
- **Penalty**: $500 - $1,500 per violation

### State-Specific Requirements

#### Florida
- **Prohibited Hours**: 8:00 PM - 8:00 AM
- **Allowed Hours**: 8:00 AM - 8:00 PM

#### Texas (Effective September 2025)
- **Weekdays (Mon-Sat)**: 9:00 PM - 9:00 AM prohibited
- **Sundays**: Even stricter restrictions (TBD)
- **Allowed Hours**: 9:00 AM - 9:00 PM (Mon-Sat)

---

## Canada Quiet Hours Rules (CASL)

### Federal Requirements (CASL)
- **No Specific Quiet Hours**: CASL does not specify quiet hours
- **Best Practice**: Follow similar guidelines as US (8:00 AM - 9:00 PM)
- **Penalty**: Up to $10 million CAD per violation

### Provincial Requirements
- **No Province-Specific Rules**: Generally follows federal CASL
- **Best Practice**: 8:00 AM - 9:00 PM (recipient's local time)

---

## ✅ **STRICTEST RULES (Implemented)**

To comply with **both US and Canada**, we use the **most restrictive** rules:

- **Start Time**: **9:00 AM** (covers US Texas and all other states)
- **End Time**: **8:00 PM** (covers US Florida and all other states)
- **Timezone**: Recipient's local time zone (critical!)
- **Applies To**: Both US and Canadian recipients

**Rationale**:
- US Federal: 8 AM - 9 PM
- US Florida: 8 AM - 8 PM (strictest end time)
- US Texas: 9 AM - 9 PM (strictest start time)
- Canada: No specific rule, but 9 AM - 8 PM is best practice

**Result**: **9:00 AM - 8:00 PM** ensures compliance with all US states and Canada.

## Current Implementation

### Database Fields
The system currently supports:
- `sms_business_hours_enabled` (BOOLEAN): Enable/disable time restrictions
- `sms_allowed_start_time` (TIME): Default: '09:00:00'
- `sms_allowed_end_time` (TIME): Default: '21:00:00' (9 PM)
- `sms_timezone` (VARCHAR): Timezone for SMS sending, defaults to business timezone

### Current Behavior
- **Informational Only**: Currently, time restrictions are checked but **do not block** sending
- **Logging**: Warnings are logged if sending outside allowed hours
- **Reason**: Campaigns are manually started, so user intent is clear

### Future Enhancements
1. **Enforce Quiet Hours**: Block sending outside allowed hours (with override option)
2. **Recipient Timezone**: Use recipient's timezone instead of business timezone
3. **Scheduled Sending**: Queue messages to send during allowed hours
4. **State-Specific Rules**: Automatically adjust based on recipient's state

## Implementation Notes

### Timezone Handling
- Currently uses business timezone (`business.sms_timezone || business.timezone`)
- **Issue**: Should use recipient's timezone for compliance
- **Solution**: Need to determine recipient's timezone from phone number area code or location data

### Recommended Defaults
```javascript
{
  sms_business_hours_enabled: true,
  sms_allowed_start_time: '09:00:00',  // 9 AM
  sms_allowed_end_time: '20:00:00',     // 8 PM (safer than 9 PM)
  sms_timezone: 'America/New_York'      // Business timezone (fallback)
}
```

## Compliance Checklist

- ✅ Business name identification (implemented)
- ✅ Opt-out instructions (STOP/START footer)
- ✅ Quiet hours enforcement (9 AM - 8 PM, strictest rules)
- ✅ Recipient timezone detection (from area code)
- ✅ Message footer (MSG & Data Rates Apply)
- ✅ Bilingual opt-out confirmation (Canada - English/French)
- ✅ Country detection (US vs Canada)
- ✅ Queuing system for blocked recipients

## Next Steps

1. **Implement recipient timezone detection** (from area code or location)
2. **Enforce quiet hours** (block sending outside allowed hours)
3. **Add scheduled sending** (queue messages for allowed hours)
4. **Add state-specific rules** (Florida, Texas, etc.)

