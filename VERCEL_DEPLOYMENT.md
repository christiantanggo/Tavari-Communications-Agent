# Vercel Deployment Guide for Tavarios.com

## Overview

This guide covers deploying Tavari to Vercel with the domain `tavarios.com`.

## Architecture

**Frontend (Vercel):**
- Next.js app deployed to `tavarios.com`
- Uses Vercel's Next.js integration

**Backend (Separate Service Required):**
- Express server needs a separate deployment
- Vercel doesn't support long-running Node.js servers
- Options: Railway, Render, Fly.io, or AWS/GCP

## Step 1: Deploy Frontend to Vercel

1. **Connect your repository to Vercel:**
   - Go to [Vercel Dashboard](https://vercel.com)
   - Import your repository
   - Set root directory to `frontend/`

2. **Configure build settings:**
   - Framework Preset: Next.js
   - Build Command: `npm run build` (or leave default)
   - Output Directory: `.next` (default)
   - Install Command: `npm install`

3. **Set environment variables in Vercel:**
   ```
   NEXT_PUBLIC_API_URL=https://api.tavarios.com
   ```
   (Replace with your actual backend URL)

4. **Configure custom domain:**
   - Go to Project Settings → Domains
   - Add `tavarios.com` and `www.tavarios.com`
   - Follow DNS configuration instructions

## Step 2: Deploy Backend (Choose One)

### Option A: Railway (Recommended for Simplicity)

1. **Deploy to Railway:**
   - Go to [Railway](https://railway.app)
   - Create new project from GitHub
   - Select your repository
   - Set root directory to project root (not `frontend/`)

2. **Configure Railway:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variables (see below)

3. **Get Railway URL:**
   - Railway provides: `https://your-app.railway.app`
   - Or use custom domain: `api.tavarios.com` (requires DNS setup)

### Option B: Render

1. **Deploy to Render:**
   - Go to [Render](https://render.com)
   - Create new Web Service
   - Connect GitHub repository
   - Set root directory to project root

2. **Configure Render:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variables

3. **Get Render URL:**
   - Render provides: `https://your-app.onrender.com`
   - Or use custom domain: `api.tavarios.com`

### Option C: Fly.io

1. **Deploy to Fly.io:**
   ```bash
   fly launch
   ```
   - Follow prompts
   - Set up custom domain: `api.tavarios.com`

## Step 3: Configure Environment Variables

### Backend Environment Variables

Add these to your backend hosting service (Railway, Render, etc.):

```bash
# Server
PORT=5001
NODE_ENV=production

# Database
DATABASE_URL=your-supabase-connection-string

# JWT
JWT_SECRET=your-secret-key

# OpenAI
OPENAI_API_KEY=your-openai-key

# Telnyx
TELNYX_API_KEY=your-telnyx-key

# Webhook URL (IMPORTANT!)
WEBHOOK_URL=https://api.tavarios.com/api/calls/webhook
SERVER_URL=https://api.tavarios.com

# Stripe
STRIPE_SECRET_KEY=your-stripe-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret
```

### Frontend Environment Variables (Vercel)

Add these in Vercel Dashboard → Project Settings → Environment Variables:

```bash
NEXT_PUBLIC_API_URL=https://api.tavarios.com
```

## Step 4: Configure DNS

### For tavarios.com (Frontend)

Point your domain to Vercel:
- Add A record or CNAME as instructed by Vercel
- Usually: `CNAME www → cname.vercel-dns.com`
- Or: `A @ → Vercel IP addresses`

### For api.tavarios.com (Backend)

Point subdomain to your backend service:

**Railway:**
- Add custom domain in Railway dashboard
- Add CNAME: `api → your-app.railway.app`

**Render:**
- Add custom domain in Render dashboard
- Add CNAME: `api → your-app.onrender.com`

**Fly.io:**
```bash
fly domains add api.tavarios.com
```

## Step 5: Webhook URL Configuration

Once your backend is deployed and accessible at `api.tavarios.com`, set:

```bash
WEBHOOK_URL=https://api.tavarios.com/api/calls/webhook
SERVER_URL=https://api.tavarios.com
```

This tells Telnyx where to send call events. The code automatically configures this when users purchase numbers.

## Step 6: Database Migration

Run migrations on your production database:

```bash
# Connect to production database
npm run migrate
```

Or run SQL directly in Supabase dashboard.

## Step 7: Test Deployment

1. **Test frontend:**
   - Visit `https://tavarios.com`
   - Should load and connect to backend

2. **Test backend:**
   - Visit `https://api.tavarios.com/health`
   - Should return `{"status":"ok"}`

3. **Test webhook:**
   - Purchase a phone number in Tavari
   - Check backend logs for webhook configuration
   - Make a test call to verify routing

## Troubleshooting

### Frontend can't connect to backend
- ✅ Check `NEXT_PUBLIC_API_URL` in Vercel environment variables
- ✅ Verify backend is accessible at that URL
- ✅ Check CORS settings in backend

### Webhook not receiving calls
- ✅ Verify `WEBHOOK_URL` is set correctly
- ✅ Check backend is accessible from internet
- ✅ Verify DNS is configured correctly
- ✅ Check backend logs for incoming requests

### SSL Certificate Issues
- ✅ Vercel handles SSL automatically
- ✅ Railway/Render handle SSL automatically
- ✅ Fly.io handles SSL automatically
- ✅ Just ensure DNS is pointing correctly

## Production Checklist

- [ ] Frontend deployed to Vercel at `tavarios.com`
- [ ] Backend deployed to Railway/Render/Fly.io
- [ ] Backend accessible at `api.tavarios.com`
- [ ] DNS configured for both domains
- [ ] Environment variables set in both services
- [ ] Database migrations run
- [ ] `WEBHOOK_URL` set to `https://api.tavarios.com/api/calls/webhook`
- [ ] `NEXT_PUBLIC_API_URL` set to `https://api.tavarios.com`
- [ ] Test signup/login flow
- [ ] Test phone number purchase
- [ ] Test call routing

## Cost Estimate

**Vercel (Frontend):**
- Free tier: Good for MVP
- Pro: $20/month (if needed)

**Railway (Backend):**
- Free tier: $5 credit/month
- Hobby: ~$5-10/month

**Render (Backend):**
- Free tier: Available (with limitations)
- Starter: $7/month

**Total: ~$0-30/month** for MVP deployment

## Next Steps

1. Deploy frontend to Vercel
2. Deploy backend to Railway/Render
3. Configure DNS
4. Set environment variables
5. Test end-to-end

For detailed webhook URL setup, see `WEBHOOK_URL_GUIDE.md`.

