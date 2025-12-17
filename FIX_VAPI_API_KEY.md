# Fix VAPI API Key Issue

## Problem
Error: "Invalid Key. Hot tip, you may be using the private key instead of the public key, or vice versa."

## Solution

### Step 1: Get Your Correct VAPI API Key

1. Go to **https://dashboard.vapi.ai**
2. Log in to your account
3. Navigate to **Settings** → **API Keys**
4. You'll see two types of keys:
   - **Public Key** (starts with something like `pk_...`)
   - **Private Key** (starts with something like `sk_...`)

### Step 2: Determine Which Key You Need

For **server-side API calls** (what we're doing), you need the **PRIVATE KEY** (starts with `sk_`).

**Important:** 
- Public keys are for client-side use
- Private keys are for server-side use
- We're making server-side calls, so we need the **PRIVATE KEY**

### Step 3: Update Your .env File

1. Open your `.env` file in the project root
2. Find the line: `VAPI_API_KEY=dfe3b948-cb12-4dea-b684-4d65dd5399ae`
3. Replace it with your **private key** from VAPI dashboard:

```env
VAPI_API_KEY=sk_your_actual_private_key_here
```

**Important:**
- No quotes around the key
- No spaces before or after
- Should start with `sk_`
- Should be a long string (not a UUID)

4. **Save the file**

### Step 4: Restart Your Server

After updating the `.env` file, restart your server:

```bash
# Stop the server (Ctrl+C if running)
# Then start it again:
npm start
```

### Step 5: Test Again

Run the test again:

```bash
npm run test:phone
```

It should now work!

## Verification

After updating, you should see:
- ✅ VAPI_API_KEY is set
- ✅ Found 1 Telnyx credential(s)
- ✅ Phone number provisioned successfully

## Common Mistakes

❌ **Wrong:** Using public key (`pk_...`) for server-side calls
✅ **Correct:** Using private key (`sk_...`) for server-side calls

❌ **Wrong:** Key has extra spaces or quotes
✅ **Correct:** Key is exactly as shown in dashboard (no spaces, no quotes)

❌ **Wrong:** Key from wrong account
✅ **Correct:** Key from the same account where you set up Telnyx credentials

## Still Not Working?

1. **Double-check the key:**
   - Copy it directly from VAPI dashboard
   - Make sure there are no extra spaces
   - Make sure it starts with `sk_`

2. **Verify the key is active:**
   - In VAPI dashboard, check if the key is enabled
   - Check if the key has expired (some keys have expiration dates)

3. **Check for typos:**
   - Make sure `VAPI_API_KEY` (not `VAPI_KEY` or `VAPI_API`)
   - Make sure there's no `=` sign in the key itself

4. **Try creating a new key:**
   - In VAPI dashboard, create a new private key
   - Update your `.env` with the new key
   - Restart server

