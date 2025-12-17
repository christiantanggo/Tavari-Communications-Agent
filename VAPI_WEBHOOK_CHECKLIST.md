# VAPI Webhook Configuration Checklist

## Current Assistant
- **Name:** The Fort Fun Center - Tavari Assistant
- **ID:** `d01a8d92-6236-45c6-a7bb-5827419a255f`

## Steps to Check/Update Webhook URL

### 1. Navigate to Advanced Tab
- Click on the **"Advanced"** tab in the assistant configuration
- This is where the Server URL (webhook URL) is typically configured

### 2. Find Server URL Field
Look for a field labeled:
- "Server URL"
- "Webhook URL" 
- "Server Endpoint"
- "Function Server URL"

### 3. Verify the URL
The webhook URL should be:
```
https://api.tavarios.com/api/vapi/webhook
```

OR if using Railway:
```
https://your-railway-domain.railway.app/api/vapi/webhook
```

### 4. Check Server URL Secret (if applicable)
If there's a "Server URL Secret" or "Webhook Secret" field:
- Should match your `VAPI_WEBHOOK_SECRET` environment variable
- Or leave empty if not using webhook verification

### 5. Save Changes
- Click "Save" or "Update" after making changes
- VAPI will test the webhook URL when you save

## What to Look For

✅ **Correct Configuration:**
- Server URL: `https://api.tavarios.com/api/vapi/webhook`
- Server URL Secret: (matches your env var or empty)

❌ **Common Issues:**
- Server URL is empty
- Server URL points to wrong domain
- Server URL missing `/api/vapi/webhook` path
- Server URL uses `http://` instead of `https://`
- Server URL Secret mismatch

## After Updating

1. **Test the webhook:**
   - Make a test call to your VAPI phone number
   - Check Railway logs for `[VAPI Webhook]` entries

2. **Expected logs after fix:**
   ```
   [VAPI Webhook] 📥 Incoming POST request to /api/vapi/webhook
   [VAPI Webhook] 📞 Received event: call-start
   [VAPI Webhook] ✅ Call session created for call <call-id>
   ```

3. **If still not working:**
   - Verify your server is publicly accessible
   - Check Railway environment variables
   - Test webhook endpoint manually: `curl https://api.tavarios.com/api/vapi/webhook`

