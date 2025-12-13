# Telnyx Integration Setup Guide

## Overview

This guide will help you set up Telnyx as your phone provider for Tavari. Telnyx offers better number availability and lower costs than Voximplant.

## Prerequisites

- Telnyx account with API key
- Backend server running (port 5001)
- Database with `telnyx_number` column added

## Step 1: Database Migration

Run the migration to add the `telnyx_number` column:

```sql
-- Run this in your Supabase SQL Editor
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS telnyx_number VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_businesses_telnyx_number 
ON businesses(telnyx_number) WHERE telnyx_number IS NOT NULL;
```

Or use the migration file:
```bash
# Copy the SQL from migrations/add_telnyx_number.sql
# and run it in Supabase Dashboard → SQL Editor
```

## Step 2: Environment Variables

Add to your `.env` file:

```bash
# Telnyx Configuration
TELNYX_API_KEY=your_telnyx_api_key_here

# Webhook URL Configuration
# For LOCAL DEVELOPMENT (using ngrok):
# WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/calls/webhook
# SERVER_URL=https://your-ngrok-url.ngrok.io

# For PRODUCTION (tavarios.com):
WEBHOOK_URL=https://api.tavarios.com/api/calls/webhook
SERVER_URL=https://api.tavarios.com
```

**📖 Need help finding your webhook URL?** See `WEBHOOK_URL_GUIDE.md` for detailed instructions.

## Step 3: Configure Telnyx Webhook

**✅ AUTOMATIC - No manual configuration needed!**

When users purchase phone numbers directly inside Tavari, the webhook is **automatically configured** via the Telnyx API. The system will:

1. Purchase the number from Telnyx
2. **Automatically set the webhook URL** to your server
3. Assign it to the business

**Manual Configuration (Optional):**
If you need to manually configure webhooks for existing numbers:
1. Log into [Telnyx Dashboard](https://portal.telnyx.com)
2. Go to **Voice** → **Phone Numbers**
3. For each phone number:
   - Click on the number
   - Set **Inbound Webhook URL** to: `https://your-domain.com/api/calls/webhook`
   - Set **Webhook Method** to: `POST`
   - Save

## Step 4: Test Phone Number Search

The API endpoint is now available:

```bash
# Search for US numbers
GET /api/telnyx-phone-numbers/search?countryCode=US&phoneType=local&limit=20

# Search for Canadian numbers
GET /api/telnyx-phone-numbers/search?countryCode=CA&phoneType=local&limit=20
```

## Step 5: Purchase a Number

Use the frontend or API:

```bash
POST /api/telnyx-phone-numbers/purchase
{
  "phoneNumber": "+12025551234",
  "countryCode": "US"
}
```

The system will:
1. Purchase the number from Telnyx
2. Configure the webhook URL
3. Assign it to your business

## Step 6: Test Call Flow

1. Call your Telnyx number
2. Check backend logs - you should see the webhook being called
3. The call should route to your AI agent

## API Endpoints

### Search Numbers
```
GET /api/telnyx-phone-numbers/search
Query params:
  - countryCode: US, CA, etc.
  - phoneType: local, toll-free, mobile
  - limit: number of results (default: 20)
```

### Purchase Number
```
POST /api/telnyx-phone-numbers/purchase
Body:
{
  "phoneNumber": "+12025551234",
  "countryCode": "US"
}
```

### Get Current Number
```
GET /api/telnyx-phone-numbers/current
```

## Troubleshooting

### No numbers available
- Try different `phoneType` (local, toll-free, mobile)
- Try different country codes
- Check Telnyx dashboard for availability

### Webhook not receiving calls
- Verify webhook URL is set in Telnyx dashboard
- Check that your server is accessible (not localhost)
- Use ngrok for local testing: `ngrok http 5001`

### Authentication errors
- Verify `TELNYX_API_KEY` is correct in `.env`
- Check API key has proper permissions in Telnyx dashboard

### Call not routing to AI
- Check webhook is receiving events (check logs)
- Verify call session is being created
- Check WebSocket connection is established

## Cost Comparison

**Telnyx vs Voximplant:**
- Numbers: $0.50/month (Telnyx) vs $0.99/month (Voximplant)
- Calls: $0.003/min (Telnyx) vs ~$0.01/min (Voximplant)
- **Savings: 50-70% cheaper with Telnyx**

## Next Steps

1. Run database migration
2. Add `TELNYX_API_KEY` to `.env`
3. Test number search
4. Purchase a number
5. Configure webhook in Telnyx dashboard
6. Test call flow

For more details, see `PHONE_PROVIDER_COMPARISON.md`.

