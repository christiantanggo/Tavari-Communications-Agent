# Automatic Deployment Setup Guide

This guide explains how automatic deployment works for the Tavari AI Phone Agent. The system uses native GitHub integrations with Vercel (frontend) and Railway (backend) - no GitHub Actions required!

## How It Works (Current Setup)

The project uses **native platform integrations** - no GitHub Actions needed! Here's how it's configured:

### Railway (Backend) - Already Connected

✅ **Status**: Connected to GitHub repository  
✅ **Auto-deploys**: On every push to `main` branch  
✅ **Root Directory**: `/` (project root)  
✅ **Start Command**: `npm start` (runs `node server.js`)

**To verify/update:**
1. Go to [Railway Dashboard](https://railway.app)
2. Select your service
3. Check Settings → Source → GitHub integration is connected
4. Environment variables are in Variables tab

### Vercel (Frontend) - Already Connected

✅ **Status**: Connected to GitHub repository  
✅ **Auto-deploys**: On every push to `main` branch  
✅ **Root Directory**: `frontend`  
✅ **Framework**: Next.js (auto-detected)

**To verify/update:**
1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Check Settings → Git → GitHub integration is connected
4. Environment variables are in Settings → Environment Variables

### Deployment Flow

```
Developer pushes to GitHub
    ↓
GitHub receives push to main branch
    ↓
    ├─→ Vercel detects changes → Builds & deploys frontend (~2-3 min)
    │
    └─→ Railway detects changes → Installs & deploys backend (~2-5 min)
```

**Total deployment time**: Usually complete within 5 minutes

## GitHub Actions Workflows (Optional - Not Currently Used)

The project includes GitHub Actions workflows in `.github/workflows/`, but they are **not required** since native integrations are already set up. You can use them if you need:

### Setup Railway Deployment

1. **Get Railway Token:**
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli
   
   # Login
   railway login
   
   # Get token (or get from Railway dashboard → Settings → Tokens)
   ```

2. **Add GitHub Secret:**
   - Go to GitHub repo → Settings → Secrets and variables → Actions
   - Add secret: `RAILWAY_TOKEN` with your Railway token

3. **Workflow will automatically deploy:**
   - On push to main/master
   - When backend files change (server.js, routes/, services/, etc.)

### Setup Vercel Deployment

1. **Get Vercel Credentials:**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Login
   vercel login
   
   # Link project (in frontend directory)
   cd frontend
   vercel link
   ```

2. **Get credentials from:**
   - `VERCEL_TOKEN`: From `~/.vercel/auth.json`
   - `VERCEL_ORG_ID`: From `.vercel/project.json`
   - `VERCEL_PROJECT_ID`: From `.vercel/project.json`

3. **Add GitHub Secrets:**
   - Go to GitHub repo → Settings → Secrets and variables → Actions
   - Add secrets:
     - `VERCEL_TOKEN`
     - `VERCEL_ORG_ID`
     - `VERCEL_PROJECT_ID`
     - `NEXT_PUBLIC_API_URL` (optional, defaults to `https://api.tavarios.com`)

4. **Workflow will automatically deploy:**
   - On push to main/master
   - When frontend files change

## Workflow Files

The project includes these GitHub Actions workflows:

- `.github/workflows/ci.yml` - Runs tests and builds on PRs
- `.github/workflows/deploy-backend.yml` - Deploys backend to Railway
- `.github/workflows/deploy-frontend.yml` - Deploys frontend to Vercel

## Testing the Setup

1. **Make a small change:**
   ```bash
   # Update README or add a comment
   echo "# Test" >> README.md
   git add .
   git commit -m "Test deployment"
   git push origin main
   ```

2. **Check deployments:**
   - Railway: Go to Railway dashboard → Deployments tab
   - Vercel: Go to Vercel dashboard → Deployments tab
   - GitHub: Go to Actions tab to see workflow runs

## Troubleshooting

### Railway Deployment Fails

1. **Check logs:**
   - Railway dashboard → Deployments → View logs
   - Look for build errors or missing dependencies

2. **Verify environment variables:**
   - All required env vars must be set in Railway
   - Check Railway → Variables tab

3. **Check Node.js version:**
   - Railway auto-detects, but you can set it in `package.json`:
   ```json
   "engines": {
     "node": ">=18.0.0"
   }
   ```

### Vercel Deployment Fails

1. **Check build logs:**
   - Vercel dashboard → Deployments → View build logs
   - Common issues: missing env vars, build errors

2. **Verify root directory:**
   - Must be set to `frontend` in Vercel project settings

3. **Check environment variables:**
   - `NEXT_PUBLIC_API_URL` must be set
   - Other public env vars must start with `NEXT_PUBLIC_`

### GitHub Actions Fail

1. **Check workflow logs:**
   - GitHub → Actions tab → Click on failed workflow
   - Review each step's logs

2. **Verify secrets:**
   - Go to Settings → Secrets and variables → Actions
   - Ensure all required secrets are set

3. **Check workflow file syntax:**
   - Validate YAML syntax
   - Ensure paths and commands are correct

## Environment Variables Checklist

### Railway (Backend) - Required Variables

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Random secret for JWT
- `OPENAI_API_KEY` - OpenAI API key
- `TELNYX_API_KEY` - Telnyx API key (if using Telnyx)
- `TELNYX_VOICE_APPLICATION_ID` - Telnyx Voice API Application ID
- `TELNYX_MESSAGING_PROFILE_ID` - Telnyx Messaging Profile ID
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `SERVER_URL` - Your Railway backend URL (e.g., `https://your-app.railway.app`)
- `WEBHOOK_URL` - Full webhook URL (e.g., `https://your-app.railway.app/api/calls/webhook`)

### Vercel (Frontend) - Required Variables

- `NEXT_PUBLIC_API_URL` - Your Railway backend URL (e.g., `https://your-app.railway.app`)

## Best Practices

1. **Use environment-specific variables:**
   - Production: Set in Railway/Vercel dashboards
   - Development: Use `.env` file locally

2. **Never commit secrets:**
   - All secrets should be in `.gitignore`
   - Use platform secrets management

3. **Test before deploying:**
   - Run `npm run lint` locally
   - Test builds locally before pushing

4. **Monitor deployments:**
   - Set up alerts for failed deployments
   - Monitor application health after deployment

5. **Use branch protection:**
   - Require PR reviews before merging to main
   - Run CI checks before allowing merges

## Next Steps

After setting up automatic deployment:

1. ✅ Test a deployment by making a small change
2. ✅ Verify both frontend and backend deploy successfully
3. ✅ Check that environment variables are set correctly
4. ✅ Test the deployed application end-to-end
5. ✅ Set up monitoring and alerts

For more details, see:
- `.github/workflows/README.md` - Workflow documentation
- `DEPLOYMENT.md` - General deployment guide
- `README.md` - Project overview
