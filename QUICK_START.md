# Quick Start Guide - Immediate Next Steps

Follow these steps in order to get the project running locally.

## Step 1: Install Dependencies (5 minutes)

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

## Step 2: Set Up Accounts (30-60 minutes)

You need accounts for these services:

1. **PostgreSQL Database** (choose one):
   - Supabase: https://supabase.com (free tier available)
   - Railway: https://railway.app (free tier available)
   - Or use existing PostgreSQL

2. **OpenAI**: https://platform.openai.com
   - Create account
   - Get API key
   - Add billing (Realtime API requires paid account)

3. **Voximplant**: https://voximplant.com
   - Create account
   - Create application
   - Get credentials (Account ID, Application ID, API Key)

4. **Stripe**: https://stripe.com
   - Create account
   - Get test API keys

## Step 3: Create .env File (5 minutes)

Create a `.env` file in the root directory with:

```env
PORT=3000
NODE_ENV=development

# Database - Replace with your connection string
DATABASE_URL=postgresql://user:password@host:5432/dbname

# JWT - Generate random string (32+ characters)
JWT_SECRET=change-this-to-random-string-min-32-chars

# OpenAI - Your API key
OPENAI_API_KEY=sk-your-key-here

# Voximplant - From your account
VOXIMPLANT_ACCOUNT_ID=your-id
VOXIMPLANT_APPLICATION_ID=your-id
VOXIMPLANT_API_KEY=your-key
VOXIMPLANT_ACCOUNT_NAME=your-name

# Stripe - Test keys
STRIPE_SECRET_KEY=sk_test_your-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-secret

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Step 4: Set Up Database (2 minutes)

```bash
# Run migrations to create tables
npm run migrate
```

## Step 5: Create Stripe Products (1 minute)

```bash
# This creates the subscription plans
node scripts/create-stripe-products.js
```

Copy the Price IDs it outputs and add to `.env`:
```env
STRIPE_STARTER_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
STRIPE_ENTERPRISE_PRICE_ID=price_xxx
```

## Step 6: Start the Servers (1 minute)

```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

## Step 7: Test It Works (5 minutes)

1. Open http://localhost:3000 (or Next.js port)
2. Click "Get Started" or "Sign Up"
3. Create an account
4. Complete the setup wizard
5. You should see the dashboard!

## What to Test

- [ ] Signup creates account
- [ ] Login works
- [ ] Setup wizard saves data
- [ ] Dashboard loads
- [ ] API endpoints respond (check browser console)

## Common Issues

**Database connection error?**
- Verify DATABASE_URL is correct
- Check database is running
- Verify credentials

**"Cannot find module" errors?**
- Run `npm install` again
- Delete `node_modules` and reinstall

**Frontend can't connect to backend?**
- Verify `NEXT_PUBLIC_API_URL` in `.env` matches backend port
- Check backend is running
- Check CORS settings

## Next Steps After Local Works

1. Complete the full `SETUP_CHECKLIST.md`
2. Configure Voximplant webhooks
3. Test actual phone calls
4. Deploy to production

---

**Estimated Time:** 1-2 hours for basic setup
**Difficulty:** Medium (requires multiple service accounts)

