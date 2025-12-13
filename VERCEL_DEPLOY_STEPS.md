# Deploy Frontend to Vercel - Step by Step

## Prerequisites
✅ Vercel CLI installed (already done)
✅ Code pushed to GitHub
✅ Backend deployed at `api.tavarios.com`

## Step-by-Step Deployment

### Step 1: Login to Vercel
```bash
vercel login
```
This will open your browser to authenticate with Vercel.

### Step 2: Link to Project (First Time Only)
From the project root directory:
```bash
vercel link
```
- It will ask if you want to link to an existing project or create a new one
- Choose "Create a new project"
- Project name: `tavari-frontend` (or any name you prefer)
- Directory: `./frontend` (important!)
- Override settings? **Yes**
  - Framework: Next.js
  - Root Directory: `frontend`
  - Build Command: `npm run build`
  - Output Directory: `.next`
  - Install Command: `npm install`

### Step 3: Set Environment Variables
```bash
vercel env add NEXT_PUBLIC_API_URL production
```
When prompted, enter: `https://api.tavarios.com`

This sets the production environment variable. The frontend will use this to connect to your backend.

### Step 4: Deploy to Production
```bash
vercel --prod
```

This will:
1. Build your Next.js app
2. Deploy it to Vercel
3. Give you a production URL

### Step 5: Configure Custom Domain (tavarios.com)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project
3. Go to **Settings** → **Domains**
4. Click **Add Domain**
5. Enter: `tavarios.com` and `www.tavarios.com`
6. Vercel will give you DNS instructions

### Step 6: Update DNS in Porkbun

Add these DNS records in Porkbun:

**For tavarios.com (root domain):**
- Type: `A` or `ALIAS`
- Host: `@` or `tavarios.com`
- Value: Vercel's IP addresses (Vercel will show these)

**For www.tavarios.com:**
- Type: `CNAME`
- Host: `www`
- Value: `cname.vercel-dns.com` (or what Vercel specifies)

## Quick Deploy Commands

**Deploy to preview (for testing):**
```bash
vercel
```

**Deploy to production:**
```bash
vercel --prod
```

**View deployment logs:**
```bash
vercel logs
```

## Environment Variables

Make sure these are set in Vercel Dashboard → Settings → Environment Variables:

- `NEXT_PUBLIC_API_URL` = `https://api.tavarios.com` (for production)

## Troubleshooting

**If deployment fails:**
- Check that you're in the project root directory
- Verify `vercel.json` exists
- Check Vercel dashboard for error logs

**If frontend can't connect to backend:**
- Verify `NEXT_PUBLIC_API_URL` is set correctly
- Check CORS settings in backend (should allow `tavarios.com`)
- Test backend health: `https://api.tavarios.com/health`

## After Deployment

Once deployed:
1. Test the frontend at your Vercel URL
2. Configure custom domain `tavarios.com` in Vercel
3. Update DNS in Porkbun
4. Test end-to-end: signup → setup → purchase phone number

