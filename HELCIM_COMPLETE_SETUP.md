# Helcim Complete Setup - Step by Step Checklist

Follow these steps **in order** to set up Helcim payment processing from scratch.

## ✅ Step 1: Create Helcim Account

1. Go to [https://www.helcim.com](https://www.helcim.com)
2. Click **"Get Started"** or **"Sign Up"**
3. Fill in your business information:
   - Business name
   - Email address
   - Phone number
   - Business address
4. Complete the registration process
5. **Wait for account verification** (1-2 business days)
   - ⚠️ API may not work until verification is complete
   - 401 errors are normal during review period

**Status Check:** Can you log into [https://secure.helcim.com](https://secure.helcim.com)?

---

## ✅ Step 2: Get API Token (Backend)

1. Log into [Helcim Dashboard](https://secure.helcim.com)
2. Navigate to **"All Tools"** → **"Integrations"** → **"API Access Configurations"**
3. Click **"New API Access"** button
4. Fill in the form:
   - **Name**: `Tavari Communications App`
   - **Access Restrictions**: Set:
     - ✅ **General** → Select **"Read and Write"**
     - ✅ **Settings** → Select **"Read and Write"**
     - ✅ **Transaction Processing** → Select **"Admin"**
   - **Note**: There are no separate "Customers" or "Subscriptions" options - these are covered by "Transaction Processing: Admin"
5. Click **"Create"** or **"Save"**
6. **IMPORTANT:** Copy the API Token immediately
   - It will look like: `aHzNEwIt81...` or similar
   - You may not be able to see it again after closing the page
   - This is your `HELCIM_API_TOKEN`

**Status Check:** Do you have an API token copied?

---

## ✅ Step 3: Get Helcim.js Token (Frontend)

1. In Helcim Dashboard, go to **"All Tools"** → **"Integrations"** → **"Helcim.js Configurations"**
2. Click **"New Configuration"** or **"Add Configuration"**
3. Fill in the form:

   **General Settings:**
   - **Active**: Turn **ON** (toggle switch)
   - **Name**: `Tavari Frontend` (fill in the Name field)

   **Transaction Settings:**
   - **Test Mode**: Turn **ON** (for testing, switch to OFF when going live)
   - **Currency**: `CAD ($) - Canadian Dollar` (or your currency)
   - **Transaction Type**: Select **"Card Verify (Tokenize Only)"** ⚠️ IMPORTANT: This is for tokenizing cards, not processing payments
   - **Terminal**: Select your terminal (e.g., "Tavari OS - 749 (CAD)")

   **Security Settings:**
   - Leave defaults for now (can configure later)

4. Click **"Save"**
5. **IMPORTANT:** After saving, you'll see two values:
   - **Token** → Copy THIS one (this is what you need for the frontend)
   - **Secret Key** → Ignore this (only needed for server-side verification)
   - The **Token** is your `NEXT_PUBLIC_HELCIM_JS_TOKEN`

**Status Check:** Do you have a Helcim.js token copied?

---

## ✅ Step 4: Run Database Migration

1. Open your Supabase Dashboard → SQL Editor
2. Run this SQL:

```sql
-- Add Helcim fields to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS helcim_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS helcim_subscription_id VARCHAR(255);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_businesses_helcim_customer_id ON businesses(helcim_customer_id);
CREATE INDEX IF NOT EXISTS idx_businesses_helcim_subscription_id ON businesses(helcim_subscription_id);
```

**Status Check:** Did the SQL run successfully?

---

## ✅ Step 5: Add Environment Variables - Backend (Railway)

1. Go to [Railway Dashboard](https://railway.app)
2. Select your backend service
3. Go to **Variables** tab
4. Add these variables:

```
HELCIM_API_TOKEN=paste-your-api-token-here
HELCIM_WEBHOOK_SECRET=leave-empty-for-now
```

**Status Check:** Are both variables added in Railway?

---

## ✅ Step 6: Add Environment Variables - Frontend (Vercel)

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your `tavari-communications-agent` project
3. Go to **Settings** → **Environment Variables**
4. Add this variable:

```
NEXT_PUBLIC_HELCIM_JS_TOKEN=paste-your-helcim-js-token-here
```

5. Make sure it's set for **Production** environment
6. Click **Save**

**Status Check:** Is `NEXT_PUBLIC_HELCIM_JS_TOKEN` added in Vercel?

---

## ✅ Step 7: Test API Connection

1. In your local project, make sure `.env` has:
   ```bash
   HELCIM_API_TOKEN=your-api-token-here
   ```

2. Run the test script:
   ```bash
   npm run test:helcim
   ```

3. **Expected output:**
   ```
   ✅ API Token found
   ✅ Connection test successful
   ✅ Customer created: [customer-id]
   ✅ All basic tests passed!
   ```

**Status Check:** Does `npm run test:helcim` show all green checkmarks?

---

## ✅ Step 8: Create Pricing Packages in Database

1. Open Supabase Dashboard → SQL Editor
2. Run this SQL to create packages:

```sql
-- Insert pricing packages
INSERT INTO pricing_packages (name, description, monthly_price, minutes_included, overage_price_per_minute, max_faqs, is_active, is_public)
VALUES 
  ('Starter', '250 minutes/month - Perfect for small businesses', 79.00, 250, 0.30, 5, true, true),
  ('Core', '500 minutes/month - Best seller', 129.00, 500, 0.25, 10, true, true),
  ('Pro', '750 minutes/month - For busy businesses', 179.00, 750, 0.20, 20, true, true)
ON CONFLICT (name) DO NOTHING;
```

**Status Check:** Can you see packages in your admin dashboard at `/admin/packages`?

---

## ✅ Step 9: Configure Webhook (Production)

1. In Helcim Dashboard, go to **"All Tools"** → **"Integrations"** → **"Webhooks"**
2. Click **"Add Webhook"** or **"New Webhook"**
3. Enter webhook URL:
   ```
   https://api.tavarios.com/api/billing/webhook
   ```
4. **Select events to listen to:**
   - ✅ Payment completed
   - ✅ Payment failed
   - ✅ Subscription created
   - ✅ Subscription updated
   - ✅ Subscription cancelled
5. Click **"Save"** or **"Create"**
6. **Copy the webhook secret** (if provided)
7. Add to Railway environment variables:
   ```
   HELCIM_WEBHOOK_SECRET=paste-webhook-secret-here
   ```

**Status Check:** Is the webhook configured in Helcim Dashboard?

---

## ✅ Step 10: Verify Everything is Working

### Test 1: Backend API
1. Make sure Railway has deployed with the latest code
2. Test the health endpoint:
   ```bash
   curl https://api.tavarios.com/health
   ```
   Should return: `{"status":"ok"}`

### Test 2: Frontend Payment Form
1. Make sure Vercel has deployed with the latest code
2. Log into your app at `www.tavarios.com`
3. Go to `/dashboard/billing`
4. Click **"Add Payment Method"**
5. **Expected:** Payment form modal should open
6. **Expected:** Form should load without "Helcim.js is not loaded" error

### Test 3: Customer Creation
1. Click "Add Payment Method" in the app
2. Check Railway logs - you should see:
   ```
   [HelcimService] ✅ Customer created: [customer-id]
   ```
3. If you see this, customer creation is working!

### Test 4: Payment Method Collection
1. Fill out the payment form with a test card
2. Submit the form
3. **Expected:** Form should process (may need to verify Helcim API endpoint)

---

## 🔍 Troubleshooting

### Issue: "Invalid API Token"
- ✅ Verify `HELCIM_API_TOKEN` is set in Railway
- ✅ Check for extra spaces or quotes
- ✅ Make sure you're using the **API Token**, not the Helcim.js token
- ✅ Verify account is verified (may take 1-2 days)

### Issue: "Helcim.js is not loaded"
- ✅ Verify `NEXT_PUBLIC_HELCIM_JS_TOKEN` is set in Vercel
- ✅ Make sure it's set for **Production** environment
- ✅ Check browser console for script loading errors
- ✅ Verify Helcim.js token was created in Helcim Dashboard

### Issue: "Customer creation failed"
- ✅ Check Railway logs for detailed error
- ✅ Verify API token has customer creation permissions
- ✅ Make sure account is verified

### Issue: "Payment method save failed"
- ✅ Check Railway logs for API response
- ✅ Verify Helcim API endpoint is correct
- ✅ Check that customer exists in Helcim

---

## 📋 Current Status Checklist

Use this to track your progress:

- [ ] Step 1: Helcim account created and verified
- [ ] Step 2: API Token obtained and copied
- [ ] Step 3: Helcim.js Token obtained and copied
- [ ] Step 4: Database migration run successfully
- [ ] Step 5: Backend environment variables added to Railway
- [ ] Step 6: Frontend environment variables added to Vercel
- [ ] Step 7: `npm run test:helcim` passes all tests
- [ ] Step 8: Pricing packages created in database
- [ ] Step 9: Webhook configured in Helcim Dashboard
- [ ] Step 10: Payment form opens without errors
- [ ] Step 10: Customer creation works (check logs)
- [ ] Step 10: Payment method can be added

---

## 🎯 Next Steps After Setup

Once all steps are complete:

1. Test the full checkout flow:
   - Select a package
   - Add payment method
   - Complete subscription

2. Monitor Railway logs for any errors

3. Check Helcim Dashboard for:
   - Customer records
   - Payment methods
   - Subscriptions

---

**Need Help?** Check the detailed guides:
- `HELCIM_SETUP_GUIDE.md` - Full detailed guide
- `HELCIM_QUICK_START.md` - Quick reference
- `HELCIM_API_SETUP_STEPS.md` - API-specific steps

