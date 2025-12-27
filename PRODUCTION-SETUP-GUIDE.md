# Production Setup Guide

## Step 1: Run Database Migration for Terms Acceptance

**IMPORTANT:** Before deploying, you must run this migration in your Supabase database:

```sql
-- File: migrations/add_terms_acceptance_fields.sql
-- Run this in Supabase SQL Editor

ALTER TABLE users
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS terms_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS terms_accepted_ip VARCHAR(45);

CREATE INDEX IF NOT EXISTS idx_users_terms_version ON users(terms_version);
```

## Step 2: Configure Sentry (Optional but Recommended)

1. Create a Sentry account at https://sentry.io (free tier available)
2. Create a new project for your Tavari backend
3. Copy your DSN (Data Source Name)
4. Add to Railway environment variables:
   - `SENTRY_DSN=your_sentry_dsn_here`

The code is already configured to use Sentry - it just needs the DSN environment variable.

## Step 3: Verify Database Backups

Supabase automatically provides database backups. To verify:

1. Go to Supabase Dashboard → Database → Backups
2. Verify backups are enabled (should be by default)
3. Check backup retention period (usually 7 days for free tier)
4. Optionally upgrade for longer retention if needed

## Step 4: Set Up Uptime Monitoring (Recommended)

Use a service like UptimeRobot, Pingdom, or Better Uptime:

1. Create account
2. Add monitoring endpoint: `https://your-api-url.com/health`
3. Set check interval (5 minutes recommended)
4. Configure alerts (email/SMS)

## Step 5: Review Rate Limits

Rate limiting is already configured in `middleware/rateLimiter.js`. Review the limits and adjust if needed for your expected traffic:

- API routes: 100 requests per 15 minutes per IP
- Auth endpoints: 5 requests per 15 minutes per IP
- Admin routes: 50 requests per 15 minutes per IP
- Webhook endpoints: 1000 requests per 15 minutes per IP

## Step 6: Test Terms Acceptance Flow

Before going live:

1. Test signup with terms checkbox unchecked - should show error
2. Test signup with terms checkbox checked - should create account
3. Verify database has `terms_accepted_at`, `terms_version`, `privacy_accepted_at`, and `terms_accepted_ip` fields populated
4. Verify Terms of Service page displays correctly with AI disclaimers

## Production Checklist

- [ ] Database migration for terms acceptance fields run
- [ ] Terms acceptance checkbox appears on signup page
- [ ] Terms acceptance is required (cannot signup without checking)
- [ ] Terms acceptance data is stored in database
- [ ] Terms of Service page has comprehensive AI disclaimers
- [ ] Privacy Policy page is accessible and up-to-date
- [ ] Sentry DSN configured (optional but recommended)
- [ ] Database backups verified
- [ ] Uptime monitoring configured
- [ ] Rate limits reviewed and appropriate
- [ ] All environment variables set in Railway
- [ ] Stripe webhooks configured for production
- [ ] VAPI webhooks configured for production
- [ ] Test payment flow end-to-end
- [ ] Test signup → setup → call flow end-to-end

