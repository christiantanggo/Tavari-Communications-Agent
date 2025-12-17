# VAPI Credentials Setup Guide

## Required VAPI Environment Variables

You need these 3 VAPI environment variables:

1. **`VAPI_API_KEY`** (REQUIRED)
   - Your VAPI API key from https://dashboard.vapi.ai
   - Format: UUID (e.g., `12345678-1234-1234-1234-123456789abc`)

2. **`VAPI_BASE_URL`** (OPTIONAL)
   - Defaults to `https://api.vapi.ai` if not set
   - Only change if using a custom VAPI endpoint

3. **`VAPI_WEBHOOK_SECRET`** (OPTIONAL)
   - Secret for verifying webhook signatures
   - Get this from VAPI dashboard → Settings → Webhooks

## Where to Set Them

### For Local Development (.env file)

Create or edit `.env` in the project root:

```env
# VAPI Credentials
VAPI_API_KEY=your-vapi-api-key-here
VAPI_BASE_URL=https://api.vapi.ai
VAPI_WEBHOOK_SECRET=your-webhook-secret-here
```

**Location:** `C:\Apps\Tavari-Communications-App\.env`

### For Production (Railway)

1. Go to Railway Dashboard: https://railway.app/dashboard
2. Click on your service (the backend service)
3. Click the **"Variables"** tab
4. Add each variable:

   **Variable 1:**
   - **Name:** `VAPI_API_KEY`
   - **Value:** Your VAPI API key
   - Click **"Add"**

   **Variable 2:**
   - **Name:** `VAPI_BASE_URL`
   - **Value:** `https://api.vapi.ai`
   - Click **"Add"**

   **Variable 3 (Optional):**
   - **Name:** `VAPI_WEBHOOK_SECRET`
   - **Value:** Your webhook secret
   - Click **"Add"**

5. Railway will automatically redeploy after adding variables

## How to Get Your VAPI Credentials

### VAPI_API_KEY (Required)

1. Go to https://dashboard.vapi.ai
2. Log in to your account
3. Go to **Settings** → **API Keys**
4. Copy your API key (or create a new one)
   - Format: UUID like `12345678-1234-1234-1234-123456789abc`

### VAPI_BASE_URL (Optional - Use Default)

**You don't need to find this!** Just use:
```
https://api.vapi.ai
```

This is the standard VAPI API endpoint. Only change it if VAPI tells you to use a different endpoint (very rare).

### VAPI_WEBHOOK_SECRET (Optional)

1. Go to https://dashboard.vapi.ai
2. Log in to your account
3. Go to **Settings** → **Webhooks** (or **Security** → **Webhooks**)
4. Look for "Webhook Secret" or "Signature Secret"
5. Copy the secret value

**Note:** This is OPTIONAL. Your webhooks will work without it. It's only used for verifying that webhooks actually came from VAPI (security feature).

If you can't find it:
- It might not be shown in the dashboard
- You can leave it blank - webhooks will still work
- The code has a TODO to implement signature verification anyway

## Verification

After setting the credentials, verify they're working:

```bash
# Test locally (uses .env file)
node scripts/test-vapi-key-direct.js

# Or verify VAPI setup
node scripts/verify-vapi-setup.js
```

## Important Notes

- **Never commit `.env` to git** - it's in `.gitignore`
- **Railway variables are separate** - they don't automatically sync with `.env`
- **Both must be set** - `.env` for local dev, Railway for production
- **Same values** - Use the same API key in both places (or different keys for dev/prod if you prefer)

## Troubleshooting

If VAPI functions aren't working:

1. **Check if variable is set:**
   ```bash
   # Local
   echo $VAPI_API_KEY
   
   # Railway - check in dashboard Variables tab
   ```

2. **Check logs for warnings:**
   - Look for: `⚠️ VAPI_API_KEY not set. VAPI functions will not work.`

3. **Verify API key format:**
   - Should be a UUID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
   - Should NOT have quotes around it in Railway

4. **Restart server after adding variables:**
   - Railway auto-restarts
   - Local: Stop and restart `npm start`

