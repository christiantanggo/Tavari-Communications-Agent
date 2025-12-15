# Deployment Guide - Automatic Deployments

This guide explains how the Tavari AI Phone Agent is configured for automatic deployments to GitHub, Vercel (frontend), and Railway (backend).

## Overview

- **GitHub**: Source code repository (automatic pushes trigger deployments)
- **Vercel**: Frontend deployment (Next.js app) - auto-deploys from GitHub
- **Railway**: Backend deployment (Node.js/Express API) - auto-deploys from GitHub

---

## 1. GitHub Repository Setup

### Repository Details
- **Repository**: `christiantanggo/Tavari-Communications-Agent`
- **Main Branch**: `main`
- **Structure**:
  ```
  /
  ├── frontend/          # Next.js frontend application
  ├── routes/            # Backend API routes
  ├── services/          # Backend services
  ├── models/           # Database models
  ├── server.js         # Backend entry point
  └── package.json      # Backend dependencies
  ```

### How to Deploy to GitHub

1. **Make changes to code**
2. **Commit changes**:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin main
   ```

3. **GitHub automatically triggers**:
   - Vercel deployment (if frontend files changed)
   - Railway deployment (if backend files changed)

---

## 2. Vercel Frontend Deployment

### Current Configuration

- **Project Name**: `tavari-communications-agent` (or similar)
- **Root Directory**: `frontend`
- **Framework**: Next.js
- **Build Command**: `npm run build` (automatic)
- **Output Directory**: `.next` (automatic)

### Automatic Deployment Setup

Vercel is connected to GitHub and automatically deploys when:

1. **Code is pushed to `main` branch**
2. **Files in `frontend/` directory change**
3. **Pull requests are created** (preview deployments)

### Manual Deployment (if needed)

```bash
cd frontend
npm install
vercel --prod
```

### Environment Variables (Vercel Dashboard)

Set these in Vercel Dashboard → Settings → Environment Variables:

- `NEXT_PUBLIC_API_URL`: `https://api.tavarios.com`
- Any other `NEXT_PUBLIC_*` variables needed by the frontend

### Deployment URL

- **Production**: `https://tavarios.com` (custom domain)
- **Preview**: `https://tavari-communications-agent.vercel.app` (or similar)

### How It Works

1. **GitHub push** → Vercel detects changes
2. **Vercel clones repository**
3. **Vercel runs**: `cd frontend && npm install && npm run build`
4. **Vercel deploys** the built `.next` directory
5. **Vercel serves** the Next.js app

---

## 3. Railway Backend Deployment

### Current Configuration

- **Service Name**: `tavari-ai-phone-agent` (or similar)
- **Root Directory**: `/` (project root)
- **Start Command**: `npm start` (runs `node server.js`)
- **Port**: `5001` (set via `PORT` environment variable)

### Automatic Deployment Setup

Railway is connected to GitHub and automatically deploys when:

1. **Code is pushed to `main` branch**
2. **Any backend files change** (routes, services, server.js, etc.)
3. **`package.json` changes** (dependencies updated)

### Manual Deployment (if needed)

Railway automatically detects and deploys from GitHub. To trigger manually:

1. Go to Railway Dashboard
2. Select the service
3. Click "Redeploy" or push a new commit

### Environment Variables (Railway Dashboard)

Set these in Railway Dashboard → Variables tab:

**Required:**
- `PORT`: `5001`
- `NODE_ENV`: `production`
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
- `TELNYX_API_KEY`: Your Telnyx API key
- `TELNYX_VOICE_APPLICATION_ID`: Your Telnyx Voice API Application ID
- `TELNYX_MESSAGING_PROFILE_ID`: Your Telnyx Messaging Profile ID
- `OPENAI_API_KEY`: Your OpenAI API key
- `JWT_SECRET`: Secret key for JWT tokens
- `SERVER_URL`: `https://api.tavarios.com` (or your Railway URL)
- `WEBHOOK_BASE_URL`: `https://api.tavarios.com` (for webhook URLs)

**Optional:**
- `STRIPE_SECRET_KEY`: For billing (if using Stripe)
- `STRIPE_WEBHOOK_SECRET`: For Stripe webhooks

### Custom Domain Setup

- **Domain**: `api.tavarios.com`
- **DNS**: CNAME record pointing to Railway's provided domain
- **SSL**: Automatically provisioned by Railway

### How It Works

1. **GitHub push** → Railway detects changes
2. **Railway clones repository**
3. **Railway runs**: `npm install` (installs dependencies)
4. **Railway runs**: `npm start` (starts the server)
5. **Railway monitors** the process and restarts on crashes

---

## 4. Deployment Workflow

### Typical Deployment Flow

```
Developer makes code changes
    ↓
git add .
git commit -m "message"
git push origin main
    ↓
GitHub receives push
    ↓
    ├─→ Vercel detects frontend changes
    │   └─→ Builds and deploys frontend
    │
    └─→ Railway detects backend changes
        └─→ Installs dependencies and deploys backend
```

### Deployment Times

- **Vercel**: ~2-3 minutes
- **Railway**: ~2-5 minutes
- **Total**: Usually complete within 5 minutes

---

## 5. Verifying Deployments

### Check Vercel Deployment

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the project
3. Check "Deployments" tab
4. Look for latest deployment status (should be "Ready")

### Check Railway Deployment

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Select the service
3. Check "Deployments" tab
4. Look for latest deployment (should show "Active")

### Test Endpoints

**Frontend:**
```bash
curl https://tavarios.com
# Should return HTML (200 OK)
```

**Backend:**
```bash
curl https://api.tavarios.com/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

## 6. Troubleshooting Deployments

### Vercel Deployment Fails

**Common Issues:**
- Build errors (check build logs in Vercel dashboard)
- Missing environment variables
- Incorrect root directory setting

**Fix:**
1. Check Vercel deployment logs
2. Verify `frontend/package.json` exists
3. Verify all `NEXT_PUBLIC_*` environment variables are set

### Railway Deployment Fails

**Common Issues:**
- Missing environment variables
- Port conflicts
- Build errors

**Fix:**
1. Check Railway deployment logs
2. Verify all required environment variables are set
3. Verify `PORT` is set to `5001`
4. Check `server.js` starts correctly

### Deployment Not Triggering

**If GitHub push doesn't trigger deployment:**

1. **Vercel**: Check GitHub integration in Vercel dashboard
2. **Railway**: Check GitHub integration in Railway dashboard
3. **Both**: Verify repository is connected correctly

---

## 7. Manual Deployment Commands

### If Automatic Deployment Fails

**Frontend (Vercel):**
```bash
cd frontend
vercel login
vercel link  # Link to existing project
vercel --prod
```

**Backend (Railway):**
Railway doesn't have a CLI for manual deployment. Use:
- Railway Dashboard → Redeploy button
- Or push an empty commit: `git commit --allow-empty -m "Trigger deployment" && git push`

---

## 8. Environment-Specific Configurations

### Development (Local)

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5001`
- Uses `.env.local` files

### Production

- Frontend: `https://tavarios.com`
- Backend: `https://api.tavarios.com`
- Uses environment variables in Vercel/Railway dashboards

---

## 9. Important Notes

1. **Never commit `.env` files** - Use environment variables in dashboards
2. **Always test locally first** - Run `npm run dev` before pushing
3. **Check deployment logs** - Both Vercel and Railway provide detailed logs
4. **Monitor deployments** - Watch for errors in deployment logs
5. **Rollback if needed** - Both platforms allow rolling back to previous deployments

---

## 10. Quick Reference

### Deploy Everything
```bash
git add .
git commit -m "Your commit message"
git push origin main
# Wait 5 minutes for both deployments
```

### Check Deployment Status
- **Vercel**: https://vercel.com/dashboard
- **Railway**: https://railway.app/dashboard

### View Logs
- **Vercel**: Dashboard → Project → Deployments → Click deployment → Logs
- **Railway**: Dashboard → Service → Deployments → Click deployment → View logs

---

## Summary

**Automatic Deployment Flow:**
1. Push to GitHub `main` branch
2. Vercel automatically deploys frontend
3. Railway automatically deploys backend
4. Both services are live within 5 minutes

**No manual steps required** - Everything is automated through GitHub integration.

