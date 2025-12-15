# GitHub Actions Workflows

⚠️ **Note**: These workflows are optional. The project currently uses **native platform integrations** (Vercel and Railway connected directly to GitHub) for automatic deployments. These workflows are available if you need custom deployment logic.

**Current Setup**: Native integrations (recommended - already configured)
- Railway: Connected to GitHub, auto-deploys on push
- Vercel: Connected to GitHub, auto-deploys on push

**Alternative**: GitHub Actions workflows (optional - for custom needs)

## Workflows

### 1. `ci.yml` - Continuous Integration
- Runs on pull requests and pushes to main/master
- Tests backend and frontend builds
- Ensures code quality before deployment

### 2. `deploy-backend.yml` - Backend Deployment to Railway
- Triggers on pushes to main/master when backend files change
- Deploys the backend API to Railway
- Requires `RAILWAY_TOKEN` secret

### 3. `deploy-frontend.yml` - Frontend Deployment to Vercel
- Triggers on pushes to main/master when frontend files change
- Builds and deploys the frontend to Vercel
- Requires Vercel secrets (see setup below)

## Setup Instructions

### Railway (Backend)

1. **Get Railway Token:**
   - Go to Railway dashboard → Settings → Tokens
   - Create a new token
   - Copy the token

2. **Add GitHub Secret:**
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add new secret: `RAILWAY_TOKEN` with your Railway token

3. **Alternative: Railway GitHub Integration**
   - Railway can auto-deploy when connected to GitHub
   - Go to Railway project → Settings → Connect GitHub
   - This is easier than using the workflow

### Vercel (Frontend)

1. **Get Vercel Credentials:**
   - Install Vercel CLI: `npm i -g vercel`
   - Run `vercel login`
   - Run `vercel link` in the `frontend` directory
   - This will give you:
     - `VERCEL_TOKEN` (from `~/.vercel/auth.json`)
     - `VERCEL_ORG_ID` (from `.vercel/project.json`)
     - `VERCEL_PROJECT_ID` (from `.vercel/project.json`)

2. **Add GitHub Secrets:**
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add secrets:
     - `VERCEL_TOKEN`
     - `VERCEL_ORG_ID`
     - `VERCEL_PROJECT_ID`
     - `NEXT_PUBLIC_API_URL` (optional, defaults to `https://api.tavarios.com`)

3. **Alternative: Vercel GitHub Integration**
   - Vercel can auto-deploy when connected to GitHub
   - Go to Vercel dashboard → Project Settings → Git
   - Connect your GitHub repo
   - This is easier than using the workflow

## Current Setup (Recommended)

**✅ The project is already configured with native GitHub integrations:**

1. **Railway (Backend):**
   - ✅ Connected to GitHub repository
   - ✅ Automatically deploys on every push to main/master
   - ✅ No GitHub Actions needed!

2. **Vercel (Frontend):**
   - ✅ Connected to GitHub repository
   - ✅ Root directory set to `frontend`
   - ✅ Automatically deploys on every push to main/master
   - ✅ Preview deployments for pull requests
   - ✅ No GitHub Actions needed!

**Why native integrations are better:**
- ✅ Zero configuration needed
- ✅ Automatic deployments on push
- ✅ Preview deployments for PRs
- ✅ Built-in rollback capabilities
- ✅ No secrets management needed
- ✅ Platform handles all deployment logic

**Use GitHub Actions workflows only if you need:**
- Custom build steps before deployment
- Conditional deployments based on file paths
- Deployment notifications to external services
- Integration with other CI/CD tools
- Custom deployment logic not available in native integrations

## Manual Deployment

You can also trigger deployments manually:

1. Go to Actions tab in GitHub
2. Select the workflow (e.g., "Deploy Backend to Railway")
3. Click "Run workflow"
4. Select branch and click "Run workflow"
