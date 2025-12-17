# Telnyx Automatic Webhook Configuration

## ✅ Yes! Users Can Purchase Numbers Directly in Tavari

**The webhook is configured automatically** when users purchase phone numbers through Tavari. No manual configuration needed!

## How It Works

When a user purchases a phone number in Tavari:

1. **User selects a number** in the setup wizard or settings page
2. **User clicks "Save"** or "Purchase"
3. **Backend automatically:**
   - Purchases the number from Telnyx API
   - **Configures the webhook URL** via Telnyx API (`PATCH /phone_numbers/{id}`)
   - Assigns the number to the business
   - Saves it to the database

## Code Flow

### Backend (`services/telnyx.js`)

```javascript
static async purchaseAndAssignPhoneNumber(businessId, phoneNumber, countryCode = 'US') {
  // Step 1: Purchase the phone number
  const purchaseResult = await this.purchasePhoneNumber(phoneNumber);
  const phoneNumberId = purchaseResult.phone_number_id;

  // Step 2: Configure webhook URL AUTOMATICALLY
  const webhookUrl = process.env.WEBHOOK_URL || 
                     `${process.env.SERVER_URL || 'http://localhost:5001'}/api/calls/webhook`;
  await this.configurePhoneNumber(phoneNumberId, webhookUrl);

  // Step 3: Update business record
  await Business.setTelnyxNumber(businessId, formattedNumber);
}
```

### Frontend (`frontend/app/dashboard/setup/page.jsx`)

```javascript
// User selects number and clicks "Save All Settings"
const purchaseResult = await telnyxPhoneNumbersAPI.purchase(selectedPhoneNumber, phoneNumberCountry);
// Webhook is automatically configured by the backend!
```

## Environment Variables

Make sure these are set in your `.env`:

```bash
# Telnyx API Key
TELNYX_API_KEY=your_api_key_here

# Webhook URL (for production)
WEBHOOK_URL=https://your-domain.com/api/calls/webhook
SERVER_URL=https://your-domain.com

# Or for local development with ngrok
WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/calls/webhook
SERVER_URL=https://your-ngrok-url.ngrok.io
```

## What Users See

1. **Search for numbers** - Browse available Telnyx numbers by country and type
2. **Select a number** - Click on a number to select it
3. **Save** - Click "Save All Settings" to purchase
4. **Done!** - Number is purchased, webhook configured, and ready to receive calls

**No manual webhook configuration required!**

## Verification

After purchase, you can verify the webhook is set:

1. Check Telnyx Dashboard → Phone Numbers → Your Number
2. Look for "Inbound Webhook URL" - should be your server URL
3. Or use the API: `GET /api/telnyx-phone-numbers/current`

## Troubleshooting

### Webhook not configured?
- Check `WEBHOOK_URL` or `SERVER_URL` is set in `.env`
- Check backend logs for errors during purchase
- Verify Telnyx API key has proper permissions

### Calls not routing?
- Verify webhook URL is correct in Telnyx dashboard
- Check backend logs for webhook events
- Ensure server is accessible (not localhost without ngrok)

## Benefits

✅ **Zero manual configuration** - Everything is automatic  
✅ **Better UX** - Users don't need to understand webhooks  
✅ **Fewer support tickets** - No "how do I configure webhook?" questions  
✅ **Faster setup** - Users can go from signup to receiving calls in minutes  

This is one of the key advantages of using Telnyx over Voximplant - the API makes it easy to configure everything programmatically!

