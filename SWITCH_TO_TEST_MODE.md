# How to Switch Stripe Back to Test Mode

This guide will help you switch Stripe from live mode back to test mode so you can test the setup wizard without making real payments.

## Step 1: Get Your Stripe Test Mode Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. **Make sure you're in TEST MODE** (toggle in the top right should say "Test mode")
3. Navigate to **Developers** → **API keys**
4. Copy your **Secret key** (starts with `sk_test_...`)
5. Copy your **Publishable key** (starts with `pk_test_...`)

## Step 2: Update Your .env File

You have two options:

### Option A: Use Separate Test/Live Keys (Recommended)

Add both sets of keys to your `.env` file and use `STRIPE_MODE` to switch:

```env
# Stripe Test Mode Keys
STRIPE_SECRET_KEY_TEST=sk_test_YOUR_TEST_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_YOUR_TEST_PUBLISHABLE_KEY_HERE
STRIPE_WEBHOOK_SECRET_TEST=whsec_YOUR_TEST_WEBHOOK_SECRET

# Stripe Live Mode Keys
STRIPE_SECRET_KEY_LIVE=sk_live_YOUR_LIVE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_YOUR_LIVE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET_LIVE=whsec_YOUR_LIVE_WEBHOOK_SECRET

# Set mode to 'test' to use test keys
STRIPE_MODE=test
```

**To switch modes, just change `STRIPE_MODE`:**
- `STRIPE_MODE=test` → Uses test keys
- `STRIPE_MODE=live` → Uses live keys
- `STRIPE_MODE=auto` → Auto-detects (defaults to test if both exist)

### Option B: Replace Single Keys (Old Method)

If you prefer to only have one set of keys at a time:

```env
# OLD (Live Mode)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# NEW (Test Mode)
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_SECRET_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_PUBLISHABLE_KEY_HERE
```

**Example:**
```env
STRIPE_SECRET_KEY=sk_test_51ABC123xyz789...
STRIPE_PUBLISHABLE_KEY=pk_test_51DEF456uvw012...
```

See `STRIPE_KEYS_SETUP.md` for more details on the new dual-key system.

## Step 3: Clear Old Stripe Price IDs (Optional but Recommended)

If you have old live mode price IDs in your database, you may want to clear them so new test mode prices are created:

1. Run the SQL script to clear old Stripe IDs:
   ```sql
   -- Clear old Stripe price/product IDs
   UPDATE pricing_packages
   SET 
     stripe_product_id = NULL,
     stripe_price_id = NULL,
     updated_at = NOW()
   WHERE stripe_price_id IS NOT NULL;
   ```

2. Or use the provided SQL file:
   ```bash
   # If you have psql installed
   psql $DATABASE_URL -f CLEAR_OLD_STRIPE_IDS.sql
   ```

## Step 4: Restart Your Servers

**Backend Server:**
```bash
# Stop the current server (Ctrl+C)
# Then restart it
npm run dev
```

**Frontend Server (if running separately):**
```bash
# Stop the current server (Ctrl+C)
# Then restart it
cd frontend
npm run dev
```

## Step 5: Verify Test Mode is Active

1. Open your browser and go to the setup wizard
2. You should see a yellow banner at the top saying "TEST MODE ACTIVE"
3. When you reach Step 5 (Payment), it should use Stripe test mode
4. You can use Stripe's test cards:
   - **Success:** `4242 4242 4242 4242`
   - **Decline:** `4000 0000 0000 0002`
   - Use any future expiry date (e.g., 12/25)
   - Use any 3-digit CVC (e.g., 123)
   - Use any ZIP code (e.g., 12345)

## How to Verify Stripe Mode

The setup wizard automatically detects if Stripe is in test mode by checking if your `STRIPE_SECRET_KEY` starts with `sk_test_`:
- ✅ `sk_test_...` = **Test Mode** (sandbox)
- ❌ `sk_live_...` = **Live Mode** (production)

## Troubleshooting

### Still seeing live mode?
- Make sure you updated the `.env` file with test keys
- Make sure you restarted the backend server after updating `.env`
- Check the server console logs - it should show which Stripe key is being used
- Verify your keys start with `sk_test_` and `pk_test_`

### Payment still going through?
- Make sure you're using test cards (see Step 5 above)
- Check the Stripe Dashboard - test mode transactions appear in the "Test mode" section
- Verify the checkout URL is `checkout.stripe.com` (not a custom domain)

### Need to switch back to live mode later?
- Follow the same steps but use your live mode keys (`sk_live_...` and `pk_live_...`)
- See `SWITCH_TO_LIVE_STRIPE.md` for detailed live mode instructions

## Important Notes

- **Test mode transactions are free** - no real charges are made
- **Test data is separate** - test mode customers/products don't appear in live mode
- **You can test the full flow** - including webhooks, subscriptions, and payment failures
- **Test cards work immediately** - no need to wait for verification

