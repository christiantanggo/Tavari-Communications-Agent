# How to Switch Stripe from Test Mode to Live Mode

## The Issue
Stripe automatically detects test vs live mode based on your API key:
- **Test keys** start with `sk_test_` or `pk_test_` → Shows sandbox/test mode
- **Live keys** start with `sk_live_` or `pk_live_` → Shows live/production mode

## Steps to Switch to Live Mode

### 1. Get Your Live Stripe Keys

1. Go to https://dashboard.stripe.com
2. Make sure you're in **Live mode** (toggle in the top right)
3. Go to **Developers** → **API keys**
4. Copy your **Secret key** (starts with `sk_live_...`)
5. Copy your **Publishable key** (starts with `pk_live_...`)

### 2. Update Your .env File

Open your `.env` file and replace the test keys with live keys:

```env
# Replace these test keys:
STRIPE_SECRET_KEY=sk_test_...  ❌ OLD
STRIPE_PUBLISHABLE_KEY=pk_test_...  ❌ OLD

# With these live keys:
STRIPE_SECRET_KEY=sk_live_...  ✅ NEW
STRIPE_PUBLISHABLE_KEY=pk_live_...  ✅ NEW
```

### 3. Update Webhook Secret (if using webhooks)

1. In Stripe Dashboard → **Developers** → **Webhooks**
2. Make sure you're viewing **Live mode** webhooks
3. Click on your webhook endpoint
4. Copy the **Signing secret** (starts with `whsec_...`)
5. Update in `.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_...  (your live webhook secret)
   ```

### 4. Restart Your Server

After updating `.env`, restart your backend server:

```bash
# Stop the server (Ctrl+C)
# Then restart it
npm run dev
```

### 5. Verify It's Working

1. Go through the setup wizard to Step 5
2. Select a package
3. You should now see the **live Stripe checkout** (not sandbox)
4. The URL will be `checkout.stripe.com` (not test mode)

## Important Notes

⚠️ **Before going live:**
- Make sure you've tested everything in test mode first
- Verify your webhook endpoint is set up correctly
- Test with a real card (you can use Stripe's test cards in test mode)
- Make sure you understand Stripe's pricing and fees

✅ **After switching to live:**
- All payments will be **real** and **charged to real cards**
- You'll receive real money in your Stripe account
- Make sure your Stripe account is fully activated and verified

## Quick Check

To verify which mode you're in, check your `.env` file:
- If `STRIPE_SECRET_KEY` starts with `sk_test_` → **Test Mode** (sandbox)
- If `STRIPE_SECRET_KEY` starts with `sk_live_` → **Live Mode** (production)

