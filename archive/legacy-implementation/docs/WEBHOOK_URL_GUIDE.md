# How to Set Your Webhook URL

The webhook URL is the **public URL** where Telnyx can reach your backend server to send call events.

## Format

The webhook URL always ends with: `/api/calls/webhook`

Full format: `https://your-server-url.com/api/calls/webhook`

## Two Scenarios

### 1. Local Development (Testing)

If you're testing locally, you need a **tunnel** because `localhost` isn't accessible from the internet.

#### Option A: Using ngrok (Recommended)

1. **Install ngrok:**
   ```bash
   # Download from https://ngrok.com/download
   # Or via npm: npm install -g ngrok
   ```

2. **Start your backend server:**
   ```bash
   npm run dev
   # Server runs on http://localhost:5001
   ```

3. **Start ngrok in a new terminal:**
   ```bash
   ngrok http 5001
   ```

4. **Copy the ngrok URL:**
   ```
   Forwarding: https://abc123.ngrok.io -> http://localhost:5001
   ```
   Your webhook URL would be: `https://abc123.ngrok.io/api/calls/webhook`

5. **Add to `.env`:**
   ```bash
   WEBHOOK_URL=https://abc123.ngrok.io/api/calls/webhook
   SERVER_URL=https://abc123.ngrok.io
   ```

**Note:** Free ngrok URLs change each time you restart. For production, use a paid ngrok plan or deploy your server.

#### Option B: Using localtunnel (Free Alternative)

```bash
npm install -g localtunnel
lt --port 5001
# Copy the URL it gives you
```

### 2. Production (Deployed Server)

**Important:** Vercel is typically for frontend deployment. Your backend (Express server) needs to be deployed separately to a service that supports long-running Node.js servers.

#### Option A: Backend on Subdomain (Recommended)

If your backend is on a subdomain like `api.tavarios.com`:

```bash
WEBHOOK_URL=https://api.tavarios.com/api/calls/webhook
SERVER_URL=https://api.tavarios.com
```

#### Option B: Backend on Separate Service

If your backend is deployed to Railway, Render, etc.:

**Railway:**
```bash
WEBHOOK_URL=https://your-backend.railway.app/api/calls/webhook
SERVER_URL=https://your-backend.railway.app
```

**Render:**
```bash
WEBHOOK_URL=https://your-backend.onrender.com/api/calls/webhook
SERVER_URL=https://your-backend.onrender.com
```

#### Option C: Vercel Serverless Functions

If you're using Vercel Serverless Functions for your backend:

```bash
WEBHOOK_URL=https://tavarios.com/api/calls/webhook
SERVER_URL=https://tavarios.com
```

**Note:** Vercel Serverless Functions have execution time limits (10s on free, 60s on Pro). For real-time WebSocket connections, you'll need a separate WebSocket server.

## How the Code Uses It

The code automatically constructs the webhook URL like this:

```javascript
// In services/telnyx.js
const webhookUrl = process.env.WEBHOOK_URL || 
                   `${process.env.SERVER_URL || 'http://localhost:5001'}/api/calls/webhook`;
```

**Priority:**
1. Uses `WEBHOOK_URL` if set (most specific)
2. Otherwise uses `SERVER_URL + /api/calls/webhook`
3. Otherwise defaults to `http://localhost:5001/api/calls/webhook` (won't work for production!)

## Quick Setup Checklist

### For Local Development:
- [ ] Install ngrok: `npm install -g ngrok` or download from ngrok.com
- [ ] Start backend: `npm run dev`
- [ ] Start ngrok: `ngrok http 5001`
- [ ] Copy ngrok URL (e.g., `https://abc123.ngrok.io`)
- [ ] Add to `.env`:
  ```bash
  WEBHOOK_URL=https://abc123.ngrok.io/api/calls/webhook
  SERVER_URL=https://abc123.ngrok.io
  ```
- [ ] Restart backend to pick up new env vars

### For Production:
- [ ] Deploy backend to hosting service (Railway, Render, etc.)
- [ ] Get your deployment URL
- [ ] Add to environment variables (in hosting dashboard or `.env`):
  ```bash
  WEBHOOK_URL=https://your-deployed-url.com/api/calls/webhook
  SERVER_URL=https://your-deployed-url.com
  ```

## Testing Your Webhook URL

1. **Test the endpoint directly:**
   ```bash
   curl https://your-webhook-url.com/api/calls/webhook
   ```
   Should return an error (expected - needs POST with Telnyx data)

2. **Check backend logs** when Telnyx sends a webhook

3. **Use Telnyx dashboard** to test webhook delivery

## Common Issues

### "Webhook not receiving calls"
- ✅ Check `WEBHOOK_URL` is set correctly in `.env`
- ✅ Verify server is running and accessible
- ✅ For local: Make sure ngrok is running
- ✅ Check backend logs for incoming requests

### "ngrok URL keeps changing"
- Free ngrok URLs change on restart
- Solution: Use paid ngrok plan for static URL, or deploy to production

### "Can't reach localhost"
- `localhost` only works on your computer
- Telnyx can't reach it from the internet
- **Solution:** Use ngrok or deploy to production

## Example `.env` File

```bash
# Telnyx Configuration
TELNYX_API_KEY=your_api_key_here

# For Local Development (with ngrok)
WEBHOOK_URL=https://abc123.ngrok.io/api/calls/webhook
SERVER_URL=https://abc123.ngrok.io

# OR For Production
# WEBHOOK_URL=https://your-app.railway.app/api/calls/webhook
# SERVER_URL=https://your-app.railway.app

# Backend Port
PORT=5001
```

## Summary

**The webhook URL is simply:**
- Your server's public URL + `/api/calls/webhook`
- For local: Use ngrok to create a public tunnel
- For production: Use your deployment URL

That's it! Once set, the code automatically configures it when users purchase numbers.

