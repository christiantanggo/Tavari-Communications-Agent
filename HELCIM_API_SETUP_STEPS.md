# Helcim API Setup - Step by Step

Based on the Helcim dashboard you're viewing, here's exactly what to do:

## Step 1: Create New API Access

1. **Click the "New API Access" button** (purple button on the page)

2. **Fill in the API Access form:**
   - **Name**: `Tavari Communications App` (or any descriptive name)
   - **Description**: `Payment processing for Tavari AI phone service` (optional)
   - **Permissions**: Select the permissions you need:
     - ✅ Payments (required)
     - ✅ Customers (required)
     - ✅ Subscriptions/Recurring (required)
     - ✅ Invoices (optional, but recommended)

3. **Click "Create" or "Save"**

4. **Copy the API Token** - This is critical!
   - The token will be displayed after creation
   - **Copy it immediately** - you may not be able to see it again
   - It will look something like: `sk_live_...` or `sk_test_...`

## Step 2: Add API Token to Environment Variables

Add to your `.env` file:
```bash
HELCIM_API_TOKEN=paste-your-token-here
```

Or in Railway/Vercel:
- Go to your project settings
- Add environment variable: `HELCIM_API_TOKEN`
- Paste your token value

## Step 3: Test the Connection

Run the test script:
```bash
npm run test:helcim
```

This will verify:
- ✅ API token is valid
- ✅ Can create customers
- ✅ API is responding correctly

## Step 4: Run Database Migration

Run the SQL migration in your Supabase SQL Editor:
```sql
-- Copy and paste ADD_HELCIM_FIELDS.sql
```

This adds the necessary columns to your `businesses` table.

## Step 5: Set Up Webhooks (Optional but Recommended)

1. In Helcim dashboard, go to **"Webhooks"** (in the left sidebar)
2. Click **"Add Webhook"** or **"New Webhook"**
3. Enter your webhook URL:
   ```
   https://your-backend-url.com/api/billing/webhook
   ```
4. Select events:
   - Payment completed
   - Payment failed
   - Subscription created
   - Subscription updated
   - Subscription cancelled
5. Copy the webhook secret and add to `.env`:
   ```bash
   HELCIM_WEBHOOK_SECRET=your-webhook-secret
   ```

## Next Steps

1. ✅ Create API Access (you're doing this now)
2. ✅ Get API Token
3. ✅ Add to environment variables
4. ✅ Test connection
5. ✅ Run database migration
6. ✅ Set up webhooks
7. ✅ Test checkout flow

---

**Important Notes:**
- Keep your API token secure - never commit it to git
- Use test/sandbox mode for development
- Switch to live mode when ready for production
- The API token is different from Helcim.js tokens (those are for frontend)

---

**Need help?** Check `HELCIM_QUICK_START.md` for more details.

