# Helcim Setup Guide - Tavari Communications App

This guide will walk you through setting up Helcim for payment processing in the Tavari Communications App.

## 📋 Table of Contents
1. [Create Helcim Account](#1-create-helcim-account)
2. [Get API Credentials](#2-get-api-credentials)
3. [Configure Environment Variables](#3-configure-environment-variables)
4. [Set Up Products/Packages](#4-set-up-productspackages)
5. [Configure Webhooks](#5-configure-webhooks)
6. [Test the Integration](#6-test-the-integration)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Create Helcim Account

### Step 1: Sign Up
1. Go to [https://www.helcim.com](https://www.helcim.com)
2. Click **"Get Started"** or **"Sign Up"**
3. Fill in your business information:
   - Business name
   - Email address
   - Phone number
   - Business address
4. Complete the registration process

### Step 2: Complete Business Profile
1. Provide business details:
   - Business type
   - Industry
   - Tax ID (if applicable)
   - Bank account information (for payouts)

### Step 3: Account Verification
1. Helcim will verify your business information
2. This may take 1-2 business days
3. You can use the sandbox/test environment while waiting

---

## 2. Get API Credentials

### Get API Token

1. Log into [Helcim Dashboard](https://secure.helcim.com)
2. Navigate to **"All Tools"** → **"Integrations"** → **"API Access Configurations"**
3. Click **"New API Access"**
4. Configure API access:
   - Name: `Tavari Communications App`
   - Permissions: Select appropriate permissions (payments, customers, subscriptions)
5. Click **"Create"**
6. **Copy the API Token** - you'll need this for `HELCIM_API_TOKEN`

### Get Webhook Secret (Optional)

1. In Helcim Dashboard, go to **"All Tools"** → **"Integrations"** → **"Webhooks"**
2. Create a new webhook endpoint
3. Copy the webhook secret (if provided)

---

## 3. Configure Environment Variables

### Backend Environment Variables

Add these to your `.env` file (or Railway environment variables):

```bash
# Helcim Configuration
HELCIM_API_TOKEN=your-api-token-here
HELCIM_API_BASE_URL=https://api.helcim.com/v2  # Optional, defaults to this
HELCIM_WEBHOOK_SECRET=your-webhook-secret  # Optional, for webhook verification
```

### Frontend Environment Variables

For frontend, you may need Helcim.js configuration:

```bash
# Helcim.js (if using frontend payment forms)
NEXT_PUBLIC_HELCIM_JS_TOKEN=your-helcim-js-token
```

**Note:** Helcim.js tokens are created separately in the Helcim Dashboard under **"Helcim.js Configurations"**.

### Railway (Backend) Setup

1. Go to your Railway project dashboard
2. Select your backend service
3. Go to **Variables** tab
4. Add:
   - `HELCIM_API_TOKEN`
   - `HELCIM_API_BASE_URL` (optional)
   - `HELCIM_WEBHOOK_SECRET` (optional)

---

## 4. Set Up Products/Packages

The app uses the `pricing_packages` table in your database. You can create packages either:

### Option A: Via Admin Portal

1. Login to your app's admin portal
2. Go to **Packages** section
3. Create packages with:
   - Name (e.g., "Starter", "Core", "Pro")
   - Monthly price
   - Minutes included
   - Overage rate
   - Max FAQs

### Option B: Via Database

Run SQL to create packages:

```sql
INSERT INTO pricing_packages (name, description, monthly_price, minutes_included, overage_price_per_minute, max_faqs, is_active, is_public)
VALUES 
  ('Starter', '250 minutes/month - Perfect for small restaurants', 79.00, 250, 0.30, 5, true, true),
  ('Core', '500 minutes/month - Best seller for restaurants', 129.00, 500, 0.25, 10, true, true),
  ('Pro', '750 minutes/month - For busy restaurants', 179.00, 750, 0.20, 20, true, true);
```

### Option C: Via Setup Script

Run the setup script (if available):

```bash
npm run setup:helcim
```

---

## 5. Configure Webhooks

Webhooks allow Helcim to notify your app about payment events.

### Step 1: Get Your Webhook URL

Your webhook endpoint is:
```
https://your-backend-url.com/api/billing/webhook
```

### Step 2: Add Webhook in Helcim Dashboard

1. Go to **"All Tools"** → **"Integrations"** → **"Webhooks"**
2. Click **"Add Webhook"** or **"New Webhook"**
3. Enter your webhook URL:
   ```
   https://api.tavarios.com/api/billing/webhook
   ```
   (Replace with your actual backend URL)

4. **Select events to listen to:**
   - Payment completed
   - Payment failed
   - Subscription created
   - Subscription updated
   - Subscription cancelled

5. Click **"Save"** or **"Create"**

6. **Copy the webhook secret** (if provided) - you'll need it for `HELCIM_WEBHOOK_SECRET`

### Step 3: Test Webhook

1. Use Helcim's webhook testing tool (if available)
2. Or trigger a test payment/subscription
3. Check your server logs for webhook events

---

## 6. Test the Integration

### Step 1: Test API Connection

Run the test script:
```bash
npm run test:helcim
```

This will verify:
- ✅ Helcim API token is valid
- ✅ Can create a test customer
- ✅ Can create a test subscription
- ✅ Webhook configuration is correct

### Step 2: Test Checkout Flow

1. **Start your backend server:**
   ```bash
   npm start
   ```

2. **Start your frontend:**
   ```bash
   cd frontend && npm run dev
   ```

3. **Login to your app** and go to `/dashboard/billing`

4. **Select a package** - this should create a subscription

5. **Complete payment** - use Helcim's test card or your payment method

6. **Verify subscription** - check that:
   - Subscription shows as "active" in billing page
   - Payment method is displayed
   - Usage limits are updated

### Step 3: Test Webhook

1. **Trigger a test event** (make a test payment)
2. **Check your server logs** - you should see webhook processing
3. **Verify in database** - subscription should be updated

---

## 7. Troubleshooting

### Issue: "Invalid API Token"

**Solution:**
- Verify `HELCIM_API_TOKEN` is set correctly
- Check for extra spaces or quotes in environment variable
- Ensure token has correct permissions
- Verify you're using the right token (not Helcim.js token)

### Issue: "Webhook not receiving events"

**Solution:**
- Verify webhook URL is correct and accessible
- Check webhook is enabled in Helcim Dashboard
- Verify `HELCIM_WEBHOOK_SECRET` matches (if using signature verification)
- Check server logs for webhook requests
- Ensure webhook endpoint accepts POST requests

### Issue: "Customer creation failed"

**Solution:**
- Verify API token has customer creation permissions
- Check required customer fields are provided
- Ensure business email/phone are valid

### Issue: "Subscription creation failed"

**Solution:**
- Verify customer exists in Helcim
- Check subscription amount is valid
- Ensure API token has subscription permissions
- Verify recurring payment is enabled in Helcim account

### Issue: "Payment processing failed"

**Solution:**
- Check payment method is valid
- Verify account is activated (not in sandbox if using live)
- Check Helcim account has sufficient permissions
- Review Helcim dashboard for error details

---

## 8. Going Live

When ready for production:

1. **Complete Helcim account verification:**
   - Business verification
   - Bank account setup
   - Identity verification

2. **Switch to Live Mode:**
   - Get live API token
   - Update environment variables

3. **Test with real payment:**
   - Use a real card with small amount
   - Verify webhook events are received
   - Check subscription is created correctly

4. **Monitor transactions:**
   - Check Helcim dashboard regularly
   - Monitor webhook logs
   - Set up alerts for failed payments

---

## 9. Additional Resources

- [Helcim API Documentation](https://devdocs.helcim.com/docs/overview-of-helcim-api)
- [Helcim.js Documentation](https://www.helcim.com/helcim-js/)
- [Helcim Support](https://www.helcim.com/support/)
- [Helcim Learning Center](https://learn.helcim.com/)

---

## Quick Reference

### Required Environment Variables
```bash
# Backend
HELCIM_API_TOKEN=your-api-token
HELCIM_WEBHOOK_SECRET=your-webhook-secret  # Optional
```

### Key Endpoints
- Checkout: `POST /api/billing/checkout`
- Webhook: `POST /api/billing/webhook`
- Portal: `GET /api/billing/portal`
- Status: `GET /api/billing/status`

### Database Fields
- `businesses.helcim_customer_id` - Helcim customer ID
- `businesses.helcim_subscription_id` - Helcim subscription ID
- `businesses.package_id` - Reference to pricing_packages table

---

**Last Updated**: December 2024

