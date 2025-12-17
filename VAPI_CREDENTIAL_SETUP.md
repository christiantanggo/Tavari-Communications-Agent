# VAPI Telnyx Credential Setup

## Problem
Error: "credentialId must be a UUID" when provisioning phone numbers

## ✅ Quick Fix (Auto-Detection)

**Good news!** The code now automatically detects your Telnyx credential from VAPI. However, for best performance, you can explicitly set it in your `.env` file.

## Solution

VAPI requires a Telnyx credential to be configured before you can provision phone numbers.

### Step 1: Get Telnyx API Key
1. Go to https://portal.telnyx.com
2. Sign up or log in
3. Navigate to **Settings** → **API Keys**
4. Create a new API key or copy an existing one
5. Save this key - you'll need it for VAPI

### Step 2: Configure Credential in VAPI
1. Go to https://dashboard.vapi.ai
2. Navigate to **Settings** → **Credentials**
3. Click **Add Credential** or **New Credential**
4. Select **Telnyx** as the provider
5. Enter your Telnyx API key
6. Save the credential
7. **Copy the Credential ID** (it's a UUID like `123e4567-e89b-12d3-a456-426614174000`)

### Step 3: Add to Environment Variables (Optional but Recommended)

**Your Telnyx Credential ID:** `c978be20-580b-435d-a03a-51ad7bfdfa1c`

Add the credential ID to your `.env` file:

```env
VAPI_TELNYX_CREDENTIAL_ID=c978be20-580b-435d-a03a-51ad7bfdfa1c
```

**Note:** The code will auto-detect this credential if not set, but explicitly setting it improves performance and reliability.

### Step 4: Restart Server
Restart your server for the changes to take effect:

```bash
npm start
```

## Alternative: Use VAPI's Default Credential

If VAPI has a default Telnyx credential configured for your account, you might not need to set this. Check your VAPI dashboard to see if there's already a credential set up.

## Verification

After setting up the credential, test phone provisioning:

```bash
npm run test:vapi
```

The test should now pass the phone number provisioning step.

## Troubleshooting

**Error: "credentialId must be a UUID"**
- Make sure you copied the full UUID from VAPI dashboard
- Check that there are no extra spaces in your `.env` file
- Verify the credential is active in VAPI dashboard

**Error: "Invalid credential"**
- Verify your Telnyx API key is correct
- Check that the credential is properly configured in VAPI
- Make sure the credential hasn't been deleted or deactivated

