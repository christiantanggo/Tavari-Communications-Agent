# Fix VAPI Credential - Step by Step Guide

## Problem
The VAPI credential references a Voice API Application (`2843154782451926416`) that doesn't exist in Telnyx, causing calls to show "out of service".

## Solution: Create New Voice API Application + Update VAPI Credential

---

## STEP 1: Create Voice API Application in Telnyx

### 1.1 Go to Telnyx Dashboard
- **URL:** https://portal.telnyx.com/
- Log in with your Telnyx account

### 1.2 Navigate to Voice API Applications
- In the left sidebar, click **"Voice"**
- Then click **"Voice API Applications"** (or **"Programmable Voice"** → **"Voice API Applications"**)

### 1.3 Create New Application
- Click the **"+ Create"** or **"New Application"** button (usually top right)
- Fill in the form:
  - **Application Name:** `Tavari-VAPI-Routing`
  - **Webhook URL:** `https://api.vapi.ai/webhook`
  - **Webhook Event Filters:** Select:
    - `call.initiated`
    - `call.answered`
    - `call.hangup`
- Click **"Save"** or **"Create"**

### 1.4 Copy the Application ID
- After creating, you'll see the application details
- **IMPORTANT:** Copy the **Application ID** (it's a long number like `1234567890123456789`)
- **Write it down** - you'll need it in Step 2

---

## STEP 2: Update VAPI Credential

### 2.1 Go to VAPI Dashboard
- **URL:** https://dashboard.vapi.ai/
- Log in with your VAPI account

### 2.2 Navigate to Credentials
- In the left sidebar, click **"Settings"** (or gear icon)
- Click **"Credentials"** (or **"Integrations"** → **"Credentials"**)

### 2.3 Delete Old Telnyx Credential
- Find the Telnyx credential (it should show `telnyxApplicationId: 2843154782451926416`)
- Click the **three dots** (⋯) or **"Delete"** button next to it
- Confirm deletion

### 2.4 Create New Telnyx Credential
- Click **"+ Add Credential"** or **"New Credential"**
- Select **"Telnyx"** as the provider
- Fill in:
  - **Credential Name:** `Tavari Telnyx` (or any name)
  - **Telnyx API Key:** Your Telnyx API key (from `.env` file: `TELNYX_API_KEY`)
  - **Voice API Application ID:** Paste the Application ID from Step 1.4
- Click **"Save"** or **"Create"**

### 2.5 Note the New Credential
- After creating, you'll see the new credential
- **Note:** You don't need to copy the credential ID - VAPI will auto-detect it when provisioning

---

## STEP 3: Re-provision Phone Number

### 3.1 Run the Re-provision Script
Open your terminal in the project directory and run:

```bash
node scripts/reprovision-vapi-with-voice.js
```

This script will:
- Delete the phone number from VAPI
- Re-provision it with the new credential
- Link it to your assistant

### 3.2 Verify
After the script completes, verify:
- Phone number is active in VAPI
- Phone number is linked to your assistant
- Check Railway logs for any errors

**Note:** The script will automatically use the new Telnyx credential you created in Step 2.

---

## STEP 4: Test the Phone Number

1. **Wait 2-3 minutes** for changes to propagate
2. **Call:** `+1 (669) 240-7730`
3. **Expected:** VAPI assistant should answer

---

## Troubleshooting

### If the phone still says "out of service":
1. Check Telnyx → Numbers → Your Number → Voice tab
2. Verify the number is assigned to the new Voice API Application
3. If not assigned, assign it manually:
   - Go to Numbers → Your Number
   - Voice tab → SIP Connection/Application
   - Select the new "Tavari-VAPI-Routing" application
   - Save

### If VAPI credential creation fails:
- Make sure your Telnyx API key is correct
- Check that the Voice API Application ID is correct (no extra spaces)
- Try creating the credential without the Application ID first, then update it

### If re-provisioning fails:
- Check that the new credential ID is correct
- Verify the phone number exists in Telnyx
- Check Railway logs for detailed error messages

---

## Quick Reference

- **Telnyx Dashboard:** https://portal.telnyx.com/
- **VAPI Dashboard:** https://dashboard.vapi.ai/
- **Phone Number:** +1 (669) 240-7730
- **Old Credential ID:** `c978be20-580b-435d-a03a-51ad7bfdfa1c` (delete this)
- **Old Application ID:** `2843154782451926416` (doesn't exist - don't use)

---

## Need Help?

If you get stuck at any step:
1. Take a screenshot of what you see
2. Note any error messages
3. Check the troubleshooting section above

