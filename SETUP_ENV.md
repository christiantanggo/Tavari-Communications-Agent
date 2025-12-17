# Environment Variables Setup Guide

## Quick Setup

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Get your VAPI API Key:**
   - Go to https://dashboard.vapi.ai
   - Sign up or log in
   - Navigate to Settings → API Keys
   - Create a new API key or copy an existing one
   - Paste it into `.env` as `VAPI_API_KEY`

3. **Fill in other required variables:**
   - At minimum, you need `VAPI_API_KEY` to test the connection
   - Other variables can be added as you configure each service

## Required for Testing VAPI

**Minimum required:**
- `VAPI_API_KEY` - Your VAPI API key from dashboard.vapi.ai

**Required for phone provisioning:**
- `VAPI_TELNYX_CREDENTIAL_ID` - Telnyx credential UUID from VAPI dashboard (required to provision phone numbers)
- `TELNYX_API_KEY` - Your Telnyx API key from portal.telnyx.com (required for automatic phone number purchase)
- `TELNYX_API_BASE_URL` - Telnyx API base URL (optional, defaults to `https://api.telnyx.com/v2`)

**Optional but recommended:**
- `VAPI_WEBHOOK_SECRET` - Secret for webhook verification
- `BACKEND_URL` - Your backend URL (for webhook testing)

## Getting Your VAPI API Key

1. Visit https://dashboard.vapi.ai
2. Sign up for an account (if you don't have one)
3. Go to **Settings** → **API Keys**
4. **IMPORTANT:** You need the **PRIVATE KEY** (starts with `sk_`) for server-side API calls
   - Public keys (`pk_...`) are for client-side use only
   - Private keys (`sk_...`) are for server-side use (what we need)
5. Copy the **private key** (starts with `sk_`)
6. Paste it into your `.env` file as `VAPI_API_KEY`

**Note:** If you get "Invalid Key" error, make sure you're using the private key, not the public key!

## Getting Your VAPI Telnyx Credential ID

**This is required to provision phone numbers!**

1. Visit https://dashboard.vapi.ai
2. Go to **Settings** → **Credentials**
3. Click **Add Credential** or **New Credential**
4. Select **Telnyx** as the provider
5. Enter your Telnyx API key (get it from https://portal.telnyx.com)
6. Save the credential
7. **Copy the Credential ID** (it's a UUID)
8. Add to your `.env` file as `VAPI_TELNYX_CREDENTIAL_ID`

**Note:** If you don't have a Telnyx account, you'll need to:
- Sign up at https://portal.telnyx.com
- Get an API key from Telnyx
- Configure it in VAPI dashboard

## Testing After Setup

Once you've added your `VAPI_API_KEY` to `.env`, run:

```bash
npm run test:vapi
```

This will verify:
- ✅ API key is valid
- ✅ Can create assistants
- ✅ Can list phone numbers
- ✅ Webhook connectivity (if server is running)

## All Environment Variables

See `.env.example` for the complete list of all environment variables needed for the full application.

## Security Note

⚠️ **Never commit your `.env` file to git!** It contains sensitive credentials.

The `.env` file should already be in `.gitignore`, but double-check to make sure.

