# Automatic Phone Number Configuration

## ✅ **GUARANTEE: 100% Automatic for New Users**

When a new user purchases a phone number through Tavari, **everything is configured automatically** - no manual steps required.

## How It Works

### 1. **User Purchases Number**
   - User selects a number in the setup wizard
   - Clicks "Save" or "Complete Setup"
   - Frontend calls: `POST /api/telnyx-phone-numbers/purchase`

### 2. **Backend Purchases Number from Telnyx**
   - Tries Number Orders endpoint first (recommended by Telnyx)
   - Falls back to direct purchase if needed
   - Number is purchased and added to your Telnyx account

### 3. **Automatic Configuration (Happens Immediately After Purchase)**
   The system automatically configures:
   
   ✅ **Voice API Application** (`TELNYX_VOICE_APPLICATION_ID`)
   - Routes incoming calls to your webhook
   - Required for call handling
   
   ✅ **Messaging Profile** (`TELNYX_MESSAGING_PROFILE_ID`)
   - Routes incoming SMS/MMS to your webhook
   - Required for message handling
   
   ✅ **Webhook URL** (`https://api.tavarios.com/api/calls/webhook`)
   - Where Telnyx sends call events
   - Where Telnyx sends SMS events
   - Automatically set from environment variables

### 4. **Database Update**
   - Phone number is saved to the business record
   - User can immediately see their number in the dashboard

## Required Environment Variables (Railway)

These **must** be set in Railway for automatic configuration to work:

```bash
TELNYX_API_KEY=your_api_key
TELNYX_VOICE_APPLICATION_ID=your_voice_app_id
TELNYX_MESSAGING_PROFILE_ID=your_messaging_profile_id
WEBHOOK_URL=https://api.tavarios.com/api/calls/webhook
```

## What Happens If Configuration Fails?

If configuration fails (e.g., invalid Voice API Application ID):
- ✅ Number is still purchased (you own it)
- ⚠️  Warning is logged in Railway
- ❌ Number will NOT route calls/SMS automatically
- 🔧 User would need to configure manually in Telnyx dashboard

**However**, if environment variables are set correctly in Railway, this should never happen.

## Testing Configuration

### Test on Existing Number (FREE - No Purchase Needed)

Run this script to test configuration on one of your existing numbers:

```bash
node update-existing-number.js
```

This will:
1. Find a number that needs configuration
2. Show what would be configured
3. Actually update it (if you confirm)
4. Verify it works

### Test New Purchase Flow

1. Wait for Railway to deploy latest code
2. Purchase a new number through the setup wizard
3. Check Railway logs to see:
   - Purchase success
   - Configuration success
   - All three items configured

## Verification Checklist

After a new user purchases a number, verify in Telnyx dashboard:

- [ ] Number appears in "Phone Numbers" list
- [ ] "Voice API Application" is set (not empty)
- [ ] "Messaging Profile" is set (not empty)
- [ ] "Webhook URL" is set to `https://api.tavarios.com/api/calls/webhook`

If all three are set, the number is fully configured and will work automatically.

## Troubleshooting

### Number Purchased But Not Configured

**Symptom:** Number exists in Telnyx but Voice API Application and Messaging Profile are empty.

**Solution:** Run `node update-existing-number.js` to configure it.

### Configuration Fails During Purchase

**Symptom:** Railway logs show "Configuration failed" error.

**Possible Causes:**
1. `TELNYX_VOICE_APPLICATION_ID` not set or invalid
2. `TELNYX_MESSAGING_PROFILE_ID` not set or invalid
3. `WEBHOOK_URL` not set or incorrect
4. Telnyx API permissions issue

**Solution:**
1. Check Railway environment variables
2. Verify IDs exist in Telnyx dashboard
3. Check Railway logs for specific error message

## Summary

✅ **New users:** 100% automatic - no manual steps  
✅ **Configuration:** Happens immediately after purchase  
✅ **No assistance needed:** Everything works automatically  
✅ **Testable:** Use `update-existing-number.js` to verify

