# Helcim Quick Start Guide

Get Helcim payment processing up and running in 5 minutes!

## 🚀 Quick Setup (4 Steps)

### Step 1: Create Helcim Account (2 minutes)
1. Go to [https://www.helcim.com](https://www.helcim.com)
2. Click **"Get Started"** and sign up
3. Complete basic business information
4. **Note**: Account verification may take 1-2 business days
5. API may not work until verification is complete (401 errors are normal during review)

### Step 2: Get Your API Token (1 minute)
1. In Helcim Dashboard, go to **"All Tools"** → **"Integrations"** → **"API Access Configurations"**
2. Click **"New API Access"**
3. Name it: `Tavari Communications App`
4. Select permissions: Payments, Customers, Subscriptions
5. Click **"Create"**
6. **Copy the API Token**

### Step 3: Set Environment Variable (30 seconds)
Add to your `.env` file:
```bash
HELCIM_API_TOKEN=your-api-token-here
```

### Step 4: Run Database Migration (30 seconds)
Run this SQL in your Supabase SQL Editor:
```sql
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS helcim_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS helcim_subscription_id VARCHAR(255);
```

### Step 5: Test Connection (30 seconds)
```bash
npm run test:helcim
```

If all tests pass, you're ready! ✅

---

## 🧪 Test the Payment Flow

1. **Start your server:**
   ```bash
   npm start
   ```

2. **Start frontend:**
   ```bash
   cd frontend && npm run dev
   ```

3. **Login and go to:** `/dashboard/billing`

4. **Select a package** → This will create a Helcim subscription

5. **Complete payment** → Use your payment method

6. **Verify subscription** → Check that subscription is active!

---

## 🔧 Webhook Setup (For Production)

### Production Setup

1. In Helcim Dashboard → **"All Tools"** → **"Integrations"** → **"Webhooks"**
2. Click **"Add Webhook"**
3. URL: `https://your-backend-url.com/api/billing/webhook`
4. Select events:
   - Payment completed
   - Payment failed
   - Subscription created/updated/cancelled
5. Copy the **Webhook Secret** → Add to environment variables:
   ```bash
   HELCIM_WEBHOOK_SECRET=your-webhook-secret
   ```

---

## 📋 What You Need

### Minimum Required
- ✅ Helcim account (free)
- ✅ `HELCIM_API_TOKEN` in `.env`
- ✅ Database migration run

### For Full Functionality
- ✅ `HELCIM_WEBHOOK_SECRET` (for webhook events)
- ✅ Packages created in database
- ✅ Webhook configured in Helcim

---

## 🆘 Troubleshooting

### "Invalid API Token"
- Make sure `HELCIM_API_TOKEN` is set in `.env`
- Check for extra spaces or quotes
- Verify token has correct permissions

### "Customer creation failed"
- Check API token has customer permissions
- Verify business email/phone are valid

### "Webhook not working"
- Verify webhook URL is accessible
- Check `HELCIM_WEBHOOK_SECRET` is set correctly
- Check server logs for webhook requests

---

## 📚 Next Steps

- Read the full guide: [HELCIM_SETUP_GUIDE.md](./HELCIM_SETUP_GUIDE.md)
- Test payment flow
- Set up webhooks for production
- Create packages in your database

---

**Need help?** Check [HELCIM_SETUP_GUIDE.md](./HELCIM_SETUP_GUIDE.md) for detailed instructions.

