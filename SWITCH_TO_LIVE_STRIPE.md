# How to Switch Stripe from Sandbox (Test) to Live Mode
## Complete Step-by-Step Guide (For Beginners)

---

## Step 1: Log Into Stripe Dashboard

1. Open your web browser
2. Go to: **https://dashboard.stripe.com**
3. Log in with your Stripe account email and password

---

## Step 2: Switch to Live Mode in Stripe Dashboard

1. Look at the **top right corner** of the Stripe dashboard
2. You'll see a toggle that says **"Test mode"** or **"Live mode"**
3. **Click the toggle** to switch it to **"Live mode"**
   - The toggle should turn from gray (test) to blue/purple (live)
   - The text should change from "Test mode" to "Live mode"

**IMPORTANT:** Make sure it says **"Live mode"** before continuing!

---

## Step 3: Get Your Live API Keys

1. In the Stripe dashboard, look at the **left sidebar menu**
2. Click on **"Developers"** (it has a code icon)
3. Click on **"API keys"** (under Developers)
4. You should now see two keys:

   **a) Publishable key:**
   - Starts with `pk_live_...`
   - Click the **"Reveal"** or **"Copy"** button next to it
   - Copy the entire key (it's long, starts with `pk_live_`)

   **b) Secret key:**
   - Starts with `sk_live_...`
   - Click the **"Reveal"** or **"Copy"** button next to it
   - Copy the entire key (it's long, starts with `sk_live_`)

**IMPORTANT:** 
- If you see keys starting with `pk_test_` or `sk_test_`, you're still in test mode!
- Go back to Step 2 and make sure you switched to Live mode
- Live keys MUST start with `pk_live_` and `sk_live_`

---

## Step 4: Open Your .env File

1. Open your code editor (VS Code, Notepad++, etc.)
2. Navigate to your project folder: `C:\Apps\Tavari-Communications-App`
3. Open the file named **`.env`** (it might be hidden, make sure to show hidden files)
4. If you don't have a `.env` file, create a new file and name it exactly `.env`

---

## Step 5: Update Your .env File

1. Find these two lines in your `.env` file:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

2. **Replace them** with your live keys from Step 3:

   ```
   STRIPE_SECRET_KEY=sk_live_YOUR_ACTUAL_LIVE_SECRET_KEY_HERE
   STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_ACTUAL_LIVE_PUBLISHABLE_KEY_HERE
   ```

   **Example:**
   ```
   STRIPE_SECRET_KEY=sk_live_51ABC123xyz789...
   STRIPE_PUBLISHABLE_KEY=pk_live_51DEF456uvw012...
   ```

3. **Save the file** (Ctrl+S)

**IMPORTANT:** 
- Make sure there are NO spaces around the `=` sign
- Make sure you copied the ENTIRE key (they're very long)
- Make sure the keys start with `sk_live_` and `pk_live_` (NOT `sk_test_` or `pk_test_`)

---

## Step 6: Restart Your Server

1. Go to the terminal/command prompt where your server is running
2. **Stop the server** by pressing **Ctrl+C**
3. Wait a few seconds
4. **Start the server again** by typing:
   ```
   npm run dev
   ```
5. Press Enter
6. Wait for the server to start (you'll see "Server running on port 5001" or similar)

---

## Step 7: Verify It's Working

1. Open your browser
2. Go to your app (usually `http://localhost:3000`)
3. Log in or create a new account
4. Go through the setup wizard to **Step 5** (Package Selection)
5. Select a package
6. You should now see the **LIVE Stripe checkout page** (not sandbox)

**How to tell if it's live:**
- The URL will be: `checkout.stripe.com` (not test mode)
- The page won't say "Test mode" or "Sandbox"
- You'll see real payment processing (be careful - real charges!)

---

## Troubleshooting

### Still seeing sandbox/test mode?

1. **Double-check your .env file:**
   - Open `.env` again
   - Make sure `STRIPE_SECRET_KEY` starts with `sk_live_` (NOT `sk_test_`)
   - Make sure `STRIPE_PUBLISHABLE_KEY` starts with `pk_live_` (NOT `pk_test_`)

2. **Make sure you saved the file:**
   - Press Ctrl+S to save
   - Close and reopen the file to verify your changes are there

3. **Make sure you restarted the server:**
   - The server must be restarted for .env changes to take effect
   - Stop it (Ctrl+C) and start it again (`npm run dev`)

4. **Check Stripe Dashboard:**
   - Go back to https://dashboard.stripe.com
   - Make sure the toggle in the top right says **"Live mode"** (not "Test mode")

### Can't find the .env file?

- It might be hidden
- In Windows File Explorer, go to View → Show → Hidden items
- Or create a new file named `.env` in your project root folder

### Keys don't start with "live"?

- You're still in test mode in Stripe Dashboard
- Go back to Step 2 and switch to Live mode
- Then get new keys from Step 3

---

## ⚠️ IMPORTANT WARNINGS

**Before going live:**
- Make sure you've tested everything in test mode first
- Real payments will charge real credit cards
- You'll receive real money in your Stripe account
- Make sure your Stripe account is fully activated and verified

**After switching to live:**
- All payments are REAL
- Test with a small amount first if possible
- Make sure you understand Stripe's fees

---

## Summary Checklist

- [ ] Logged into Stripe Dashboard
- [ ] Switched toggle to "Live mode" (top right)
- [ ] Copied `pk_live_...` key (Publishable key)
- [ ] Copied `sk_live_...` key (Secret key)
- [ ] Updated `.env` file with live keys
- [ ] Saved `.env` file
- [ ] Restarted server (stopped and started again)
- [ ] Tested checkout - no more sandbox!

---

**If you're still having issues after following all these steps, let me know and I'll help you troubleshoot!**

