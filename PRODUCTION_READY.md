# Production Readiness Guide

This document outlines all the features and configurations needed for production deployment.

## ✅ Completed Features

### Core Functionality
- ✅ VAPI integration (phone provisioning, assistant creation, webhooks)
- ✅ Business management (signup, onboarding, settings)
- ✅ AI agent configuration (hours, FAQs, greetings, holiday hours)
- ✅ Call tracking and message extraction
- ✅ Usage tracking and billing cycles
- ✅ Email/SMS notifications
- ✅ Dashboard and settings UI

### Billing & Payments
- ✅ Stripe integration (checkout, billing portal, webhooks)
- ✅ Subscription management
- ✅ Plan upgrades/downgrades
- ✅ Invoice generation
- ✅ Usage-based billing
- ✅ Overage handling

### Admin Features
- ✅ Admin authentication
- ✅ Business management
- ✅ Usage monitoring
- ✅ Activity logging
- ✅ Account management

### Analytics & Reporting
- ✅ Call analytics (duration, peak times, intents)
- ✅ Usage trends
- ✅ Data export (CSV)

### Security
- ✅ Rate limiting (API, auth, admin, webhooks)
- ✅ JWT authentication
- ✅ Password hashing (bcrypt)
- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Input validation middleware

### Error Handling
- ✅ Sentry integration (optional)
- ✅ Error logging
- ✅ Graceful error handling

## 🔧 Production Configuration

### Environment Variables

#### Backend (Railway)
```env
# Server
NODE_ENV=production
PORT=5001
FRONTEND_URL=https://your-frontend-domain.com
BACKEND_URL=https://api.your-domain.com

# Database
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[key]
SUPABASE_ANON_KEY=[key]

# VAPI
VAPI_API_KEY=[key]
VAPI_WEBHOOK_SECRET=[secret]

# Telnyx
TELNYX_API_KEY=[key]
TELNYX_VOICE_APPLICATION_ID=[id]
TELNYX_MESSAGING_PROFILE_ID=[id]

# Stripe
STRIPE_SECRET_KEY=sk_live_[key]
STRIPE_PUBLISHABLE_KEY=pk_live_[key]
STRIPE_WEBHOOK_SECRET=whsec_[secret]

# AWS SES (for Supabase Edge Function)
AWS_SES_FROM_EMAIL=noreply@your-domain.com
SES_ACCESS_KEY_ID=[key]
SES_SECRET_ACCESS_KEY=[secret]
AWS_REGION=us-east-2

# Sentry (optional)
SENTRY_DSN=[dsn]
```

#### Frontend (Vercel)
```env
NEXT_PUBLIC_API_URL=https://api.your-domain.com
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_[id]
NEXT_PUBLIC_STRIPE_CORE_PRICE_ID=price_[id]
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_[id]
```

### Database Setup

1. Run all migrations:
   - `RUN_THIS_MIGRATION.sql`
   - `ADD_HOLIDAY_HOURS.sql`
   - `FIX_ALL_MISSING_COLUMNS.sql`

2. Create indexes for performance:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_call_sessions_business_started ON call_sessions(business_id, started_at);
   CREATE INDEX IF NOT EXISTS idx_messages_business_created ON messages(business_id, created_at);
   CREATE INDEX IF NOT EXISTS idx_usage_minutes_business_date ON usage_minutes(business_id, date);
   ```

### Webhook Configuration

#### VAPI Webhook
- URL: `https://api.your-domain.com/api/vapi/webhook`
- Secret: Set in `VAPI_WEBHOOK_SECRET`

#### Stripe Webhook
- URL: `https://api.your-domain.com/api/billing/webhook`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

### Supabase Edge Function

Deploy the email sending function:
```bash
cd supabase/functions/mail-send
supabase functions deploy mail-send
```

Set secrets in Supabase dashboard:
- `SES_ACCESS_KEY_ID`
- `SES_SECRET_ACCESS_KEY`
- `AWS_REGION`

## 📊 Monitoring & Maintenance

### Health Checks
- `/health` - Basic health check
- `/ready` - Database connectivity check

### Logging
- All errors are logged to console
- Sentry captures errors in production (if configured)
- Railway logs are available in dashboard

### Daily Tasks
- Billing cycle resets (automated via cron or scheduled task)
- Usage tracking updates
- Invoice generation

### Weekly Tasks
- Review error logs
- Check system health
- Monitor usage trends

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All environment variables set
- [ ] Database migrations run
- [ ] Stripe products created
- [ ] Webhooks configured
- [ ] Supabase Edge Function deployed
- [ ] Domain names configured
- [ ] SSL certificates valid

### Post-Deployment
- [ ] Test signup flow
- [ ] Test phone provisioning
- [ ] Test call handling
- [ ] Test billing checkout
- [ ] Test webhooks
- [ ] Test email notifications
- [ ] Test admin dashboard
- [ ] Monitor error logs

## 🔒 Security Checklist

- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Helmet.js security headers enabled
- [ ] JWT secrets are strong and unique
- [ ] Passwords are hashed (bcrypt)
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (input sanitization)
- [ ] HTTPS enforced
- [ ] Secrets stored securely (not in code)

## 📈 Performance Optimization

### Database
- Indexes on frequently queried columns
- Connection pooling (Supabase handles this)
- Query optimization

### API
- Rate limiting prevents abuse
- Response caching where appropriate
- Efficient database queries

### Frontend
- Next.js automatic optimizations
- Image optimization
- Code splitting

## 🧪 Testing

### Manual Testing
1. Signup and onboarding
2. Phone number provisioning
3. Call handling (test call)
4. Message extraction
5. Billing checkout
6. Admin dashboard
7. Analytics export

### Automated Testing
- Unit tests (to be added)
- Integration tests (to be added)
- E2E tests (to be added)

## 📚 Documentation

- API documentation: See `API_DOCUMENTATION.md`
- Deployment guide: See `DEPLOYMENT.md`
- User guide: See `USER_GUIDE.md`

## 🆘 Support & Troubleshooting

### Common Issues

1. **Webhook not receiving events**
   - Check webhook URL is publicly accessible
   - Verify webhook secret matches
   - Check logs for errors

2. **Phone number not provisioning**
   - Verify VAPI API key
   - Check VAPI account balance
   - Review VAPI logs

3. **Billing issues**
   - Verify Stripe webhook is receiving events
   - Check Stripe dashboard for subscription status
   - Review billing logs

4. **Email not sending**
   - Verify Supabase Edge Function is deployed
   - Check AWS SES credentials
   - Review Edge Function logs

### Getting Help
- Check logs in Railway dashboard
- Review Sentry for errors
- Check Supabase logs
- Contact support: support@your-domain.com

---

**Last Updated**: December 2025
**Status**: Production Ready ✅

