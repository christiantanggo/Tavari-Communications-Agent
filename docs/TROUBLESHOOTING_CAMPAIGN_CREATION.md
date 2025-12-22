# Troubleshooting: Campaign Creation 400 Error

## Problem
Getting `400 Bad Request` when trying to create an SMS campaign with error:
```
"No valid contacts found. Make sure contacts have phone numbers, are not opted out, and have provided SMS consent"
```

## Root Cause
The new compliance system requires **SMS consent** for all contacts. Existing contacts created before consent tracking was implemented don't have `sms_consent = true`, so they're being filtered out.

## Solution

### Option 1: Set Consent for Existing Contacts (If You Have Proof)

If you have documented proof that existing contacts provided consent (e.g., waiver checkboxes), you can set consent for them:

```sql
-- Run in Supabase SQL Editor
-- ONLY if you have proof of consent for these contacts

UPDATE contacts
SET sms_consent = TRUE,
    sms_consent_timestamp = created_at, -- Use creation date as consent timestamp
    sms_consent_method = 'waiver_checkbox', -- Or 'csv_upload', 'web_form', etc.
    sms_consent_source = 'Facility Waiver - Checkbox checked' -- Describe where consent was obtained
WHERE (sms_consent IS NULL OR sms_consent = FALSE)
  AND phone_number IS NOT NULL
  AND opted_out = FALSE;
```

### Option 2: Check Which Contacts Need Consent

First, see how many contacts need consent:

```sql
SELECT 
  COUNT(*) as total_contacts,
  COUNT(*) FILTER (WHERE sms_consent = TRUE) as has_consent,
  COUNT(*) FILTER (WHERE sms_consent IS NULL OR sms_consent = FALSE) as needs_consent,
  COUNT(*) FILTER (WHERE phone_number IS NOT NULL AND (sms_consent IS NULL OR sms_consent = FALSE)) as needs_consent_with_phone
FROM contacts;
```

### Option 3: Update Contacts Individually

If you need to set consent for specific contacts based on your records:

```sql
-- Example: Set consent for a specific contact
UPDATE contacts
SET sms_consent = TRUE,
    sms_consent_timestamp = '2024-01-15 10:00:00', -- Actual consent date
    sms_consent_method = 'waiver_checkbox',
    sms_consent_source = 'Facility Waiver - Checkbox checked'
WHERE id = 'contact-uuid-here';
```

### Option 4: Re-upload Contacts with Consent

If you have the original CSV files, re-upload them with the consent checkbox checked. The system will automatically set consent for newly uploaded contacts.

## Requirements for SMS Consent

For a contact to be included in campaigns, they must have:
1. ✅ `sms_consent = TRUE`
2. ✅ `sms_consent_timestamp` (not null)
3. ✅ `phone_number` (not null)
4. ✅ `opted_out = FALSE`

## Prevention

Going forward, all new contacts should have consent set when created:
- CSV uploads require consent checkbox
- Manual contact creation should include consent
- API integrations should pass consent information

## Verification

After setting consent, verify it worked:

```sql
-- Check contacts with consent
SELECT id, phone_number, sms_consent, sms_consent_timestamp, sms_consent_method
FROM contacts
WHERE sms_consent = TRUE
LIMIT 10;
```

Then try creating a campaign again - it should work!

---

**Last Updated**: 2024
**Status**: ✅ Fixed with better error messages and consent migration script

