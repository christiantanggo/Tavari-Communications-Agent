# Backend Deployment Guide

Your backend code has been pushed to GitHub. Now you need to deploy it to a hosting service.

## Recommended: Railway (Easiest)

### Step 1: Connect GitHub to Railway

1. Go to [Railway.app](https://railway.app)
2. Sign in with your GitHub account
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose your repository: `Tavari-Communications-Agent`
6. Select the `main` branch

### Step 2: Configure the Service

1. Railway will auto-detect it's a Node.js project
2. Set the **Root Directory** (if needed): Leave as root `/`
3. Set the **Start Command**: `node server.js`
4. Set the **Port**: Railway will auto-assign, but your code uses `process.env.PORT || 5001`

### Step 3: Add Environment Variables

In Railway Dashboard → Your Service → Variables, add:

**Required:**
```
PORT=5001
NODE_ENV=production
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TELNYX_API_KEY=your_telnyx_api_key
VAPI_API_KEY=your_vapi_api_key
```

**Optional (but recommended):**
```
BACKEND_URL=https://api.tavarios.com
FRONTEND_URL=https://www.tavarios.com
HELCIM_API_TOKEN=your_helcim_token
HELCIM_CUSTOMER_REGISTRATION_URL=your_customer_registration_url
HELCIM_PAYMENT_PAGE_URL=your_payment_page_url
```

### Step 4: Deploy

1. Railway will automatically deploy when you connect the repo
2. Wait for deployment to complete
3. Copy your Railway public domain (e.g., `your-app.railway.app`)

### Step 5: Update Webhook URLs

1. **Telnyx Webhook**: Update to `https://api.tavarios.com/api/bulk-sms/webhook`
2. **VAPI Webhook**: Update to `https://api.tavarios.com/api/vapi/webhook`

**Note:** If you're using a custom domain (`api.tavarios.com`), make sure:
- Your Railway/Render service has the custom domain configured
- SSL certificate is valid
- DNS is pointing to your hosting service

## Alternative: Render

### Step 1: Connect GitHub

1. Go to [Render.com](https://render.com)
2. Sign in with GitHub
3. Click **"New +"** → **"Web Service"**
4. Connect your GitHub repository
5. Select `Tavari-Communications-Agent`

### Step 2: Configure

- **Name**: `tavari-backend` (or your choice)
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Plan**: Free or Starter

### Step 3: Environment Variables

Add the same environment variables as Railway (see above)

### Step 4: Deploy

Render will auto-deploy. Update webhook URLs to your Render domain.

## After Deployment

1. **Test the health endpoint**: `https://your-domain.com/health`
2. **Update Telnyx webhook** to point to your production backend
3. **Update VAPI webhook** if needed
4. **Test SMS opt-out** by sending "STOP" to your business number

## Important Notes

- Your backend must be accessible via HTTPS for webhooks to work
- Make sure `BACKEND_URL` environment variable matches your actual domain
- The webhook endpoint is: `/api/bulk-sms/webhook` (no authentication required)
- All SMS messages will automatically include the footer: "MSG & Data Rates Apply\nSTOP=stop, START=start"

## Troubleshooting

- **Webhook not receiving**: Check that your domain is accessible and SSL is working
- **Database errors**: Verify Supabase credentials are correct
- **SMS not sending**: Check Telnyx API key is set correctly

