# Stripe Keys Setup - Test and Live Mode

You can now have both test and live Stripe keys in your `.env` file and switch between them easily.

## Option 1: Separate Test and Live Keys (Recommended)

Add both sets of keys to your `.env` file:

```env
# Stripe Test Mode Keys
STRIPE_SECRET_KEY_TEST=sk_test_YOUR_TEST_SECRET_KEY
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_YOUR_TEST_PUBLISHABLE_KEY
# STRIPE_WEBHOOK_SECRET_TEST=whsec_YOUR_TEST_WEBHOOK_SECRET  # Optional - not required

# Stripe Live Mode Keys
STRIPE_SECRET_KEY_LIVE=sk_live_YOUR_LIVE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_YOUR_LIVE_PUBLISHABLE_KEY
# STRIPE_WEBHOOK_SECRET_LIVE=whsec_YOUR_LIVE_WEBHOOK_SECRET  # Optional - not required

# Stripe Mode: 'test', 'live', or 'auto' (default: 'auto')
# Set this to switch between test and live mode
STRIPE_MODE=test
```

### Switching Between Test and Live Mode

Simply change the `STRIPE_MODE` value in your `.env` file:

**For Test Mode:**
```env
STRIPE_MODE=test
```

**For Live Mode:**
```env
STRIPE_MODE=live
```

**For Auto-Detection (defaults to test if both keys exist):**
```env
STRIPE_MODE=auto
```

Then restart your backend server:
```bash
# Stop server (Ctrl+C)
npm run dev
```

## Option 2: Single Key (Backward Compatible)

If you only want to use one set of keys at a time, you can use the original format:

```env
# For Test Mode
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_TEST_WEBHOOK_SECRET

# For Live Mode (just change the keys)
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_LIVE_WEBHOOK_SECRET
```

## How It Works

1. **If `STRIPE_MODE=test`**: Uses `STRIPE_SECRET_KEY_TEST` (or falls back to `STRIPE_SECRET_KEY`)
2. **If `STRIPE_MODE=live`**: Uses `STRIPE_SECRET_KEY_LIVE` (or falls back to `STRIPE_SECRET_KEY`)
3. **If `STRIPE_MODE=auto` or not set**:
   - If both `STRIPE_SECRET_KEY_TEST` and `STRIPE_SECRET_KEY_LIVE` exist, defaults to **test mode** (for safety)
   - Otherwise, uses whichever key is available
   - Falls back to `STRIPE_SECRET_KEY` if neither test/live keys exist

## Benefits

✅ **Keep both keys in `.env`** - No need to edit keys when switching modes  
✅ **Easy switching** - Just change `STRIPE_MODE` and restart  
✅ **Safe defaults** - Defaults to test mode if both keys exist  
✅ **Backward compatible** - Still works with single `STRIPE_SECRET_KEY`  

## Important Notes

- **Webhook Secrets (Optional)**: Webhook secrets are **NOT required** for the payment flow to work. They're only needed if you want Stripe to automatically notify your server about subscription changes, payment failures, etc. The checkout and payment will work fine without them. If you do set them up, you can use separate secrets for test and live mode.
- **Database**: Test and live mode use the same database, but Stripe price IDs are separate. You may want to clear old price IDs when switching modes (see `CLEAR_OLD_STRIPE_IDS.sql`).
- **Frontend**: The frontend automatically detects test mode by calling `/api/billing/test-mode` endpoint.

## What Are Webhooks? (Optional Feature)

Stripe webhooks are notifications that Stripe sends to your server when events happen (like payment succeeded, subscription canceled, etc.). They're useful for:
- Automatically updating subscription status if a payment fails
- Handling subscription cancellations
- Getting notified of payment issues

**But they're NOT required** - your payment flow works without them. The checkout process updates your database immediately when the user completes payment.

## Example .env File

```env
# Server
PORT=5001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://...

# Stripe - Test Mode Keys
STRIPE_SECRET_KEY_TEST=sk_test_51ABC123xyz789...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_51DEF456uvw012...
# STRIPE_WEBHOOK_SECRET_TEST=whsec_test_...  # Optional - not required

# Stripe - Live Mode Keys
STRIPE_SECRET_KEY_LIVE=sk_live_51GHI789abc123...
STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_51JKL012def456...
# STRIPE_WEBHOOK_SECRET_LIVE=whsec_live_...  # Optional - not required

# Stripe Mode (change this to switch: 'test', 'live', or 'auto')
STRIPE_MODE=test

# Other environment variables...
```

## Troubleshooting

### "Stripe secret key not configured" error
- Make sure you have at least one of: `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_TEST`, or `STRIPE_SECRET_KEY_LIVE` set
- Check that your `.env` file is in the root directory
- Restart the server after changing `.env` file

### Wrong mode being used
- Check the `STRIPE_MODE` value in your `.env` file
- Make sure you restarted the server after changing it
- Check server logs for which key is being used

### Test mode not detected in frontend
- Make sure the backend server is running
- Check that `/api/billing/test-mode` endpoint returns the correct mode
- Verify your `STRIPE_MODE` is set correctly

