# Helcim Webhook Setup Guide

## Webhook URL Format

Your Helcim webhook URL should be:
```
https://YOUR-BACKEND-URL/api/billing/webhook
```

## Finding Your Backend URL

### Option 1: Check Your Deployment Service

**If using Railway:**
1. Go to Railway Dashboard
2. Select your backend service
3. Look for the "Public URL" or "Domain"
4. It will be something like: `https://your-app-name.railway.app`
5. Your webhook URL: `https://your-app-name.railway.app/api/billing/webhook`

**If using Render:**
1. Go to Render Dashboard
2. Select your backend service
3. Look for the "URL" or "Public URL"
4. It will be something like: `https://your-app-name.onrender.com`
5. Your webhook URL: `https://your-app-name.onrender.com/api/billing/webhook`

**If using a custom domain:**
- If your backend is at `api.tavarios.com`, your webhook URL is:
  ```
  https://api.tavarios.com/api/billing/webhook
  ```

### Option 2: Check Environment Variables

Check your `.env` file or deployment environment variables for:
- `SERVER_URL`
- `BACKEND_URL`
- `WEBHOOK_BASE_URL`
- `NEXT_PUBLIC_API_URL` (this is your backend URL)

### Option 3: Test Your Backend

1. Try accessing: `https://your-backend-url/health`
2. If it works, use that base URL + `/api/billing/webhook`

## Local Development (Testing)

For local testing, you'll need to expose your local server to the internet:

1. **Use ngrok** (recommended):
   ```bash
   ngrok http 5001
   ```
   This will give you a URL like: `https://abc123.ngrok.io`
   Your webhook URL: `https://abc123.ngrok.io/api/billing/webhook`

2. **Or use a similar tunneling service** (localtunnel, cloudflared, etc.)

## Setting Up the Webhook in Helcim Dashboard

1. Log in to your Helcim Dashboard
2. Go to **Settings** → **Webhooks** (or **API** → **Webhooks**)
3. Click **Add Webhook** or **Create Webhook**
4. Enter your webhook URL: `https://your-backend-url/api/billing/webhook`
5. Select the events you want to receive:
   - `payment.completed`
   - `payment.failed`
   - `subscription.created`
   - `subscription.updated`
   - `subscription.cancelled`
6. Save the webhook
7. Copy the webhook secret (if provided)
8. Add it to your `.env` file as `HELCIM_WEBHOOK_SECRET`

## Environment Variable

After setting up the webhook, add this to your `.env` file:

```bash
HELCIM_WEBHOOK_SECRET=your-webhook-secret-from-helcim
```

## Testing the Webhook

1. Make a test payment or subscription in Helcim
2. Check your backend logs for webhook events
3. You should see: `[Helcim] Webhook received: ...`

## Troubleshooting

**Webhook not receiving events:**
- Verify the URL is accessible from the internet (not localhost)
- Check that your backend is running and accessible
- Verify the webhook URL in Helcim dashboard matches exactly
- Check backend logs for incoming requests

**401 Unauthorized errors:**
- Verify `HELCIM_API_TOKEN` is set correctly
- Check that the API token has the right permissions
- Ensure the account is fully activated (not under review)

