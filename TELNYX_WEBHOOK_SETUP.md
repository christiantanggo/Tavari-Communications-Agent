# Telnyx Webhook Configuration Guide

## Issue: "Call Cannot Be Completed"

If calls to your Telnyx number result in "call cannot be completed", the webhook URL needs to be configured on the **Voice API Application**, not just the phone number.

## Step 1: Configure Webhook URL on Voice API Application

1. **Go to Telnyx Dashboard:**
   - Log in at https://portal.telnyx.com/
   - Navigate to **Voice** > **Voice API Applications**

2. **Select Your Application:**
   - Find your Voice API Application (ID: `2843154782451926416` or name: `Tavari-Voice-Agent`)
   - Click on it to open settings

3. **Set Webhook URL:**
   - Find the **Webhook URL** or **Event Webhook URL** field
   - Enter: `https://api.tavarios.com/api/calls/webhook`
   - Set **Webhook Event Filters** to include:
     - `call.initiated`
     - `call.answered`
     - `call.hangup`
   - Save the changes

## Step 2: Verify Phone Number Configuration

1. **Go to Numbers:**
   - Navigate to **Numbers** > **My Numbers**
   - Click on your phone number

2. **Check Voice Tab:**
   - Go to the **Voice** tab
   - Verify **SIP Connection/Application** is set to your Voice API Application
   - If not, select it and save

3. **Check Messaging Tab:**
   - Go to the **Messaging** tab
   - Verify **Messaging Profile** is set
   - If not, select it and save

## Step 3: Test the Call

1. **Make a test call** to your number
2. **Check Railway logs** to see if webhook is received:
   - Go to Railway dashboard
   - Check logs for "Webhook received" messages
   - Look for any errors

## Troubleshooting

### Webhook Not Received

If webhooks aren't being received:

1. **Check Railway logs** - Look for incoming requests to `/api/calls/webhook`
2. **Verify webhook URL** - Make sure it's exactly `https://api.tavarios.com/api/calls/webhook`
3. **Check firewall** - Railway should allow all incoming traffic, but verify
4. **Test webhook endpoint** - Use a tool like Postman to send a test webhook

### Call Control Commands Not Working

The webhook response format might be incorrect. Check Railway logs for:
- What commands are being returned
- Any errors from Telnyx about invalid command format

### Number Not Routing

If the number isn't routing to the webhook:
1. Verify Voice API Application is selected on the phone number
2. Verify webhook URL is set on the Voice API Application
3. Check Telnyx call logs in the dashboard for error messages

## Next Steps

Once the webhook is configured:
1. Test a call
2. Check Railway logs to see if webhook is received
3. Verify the AI responds correctly

