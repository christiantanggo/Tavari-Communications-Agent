# Tavari Communications App - Project Status

**Last Updated:** December 17, 2024  
**Current Phase:** Phase 1 - VAPI-Based AI Phone Receptionist  
**Status:** ~85% Complete - Core functionality working, some issues to resolve

---

## 📋 What We're Building

**Tavari** is a self-serve AI phone receptionist service for restaurants and small businesses. The system:

1. **Takes calls** when businesses are busy or after-hours
2. **Answers FAQs** automatically using AI
3. **Takes messages** and callback requests
4. **Sends summaries** via email (and optional SMS)
5. **Manages billing** with tiered pricing plans

### Core Value Proposition
- Restaurant keeps their existing public phone number
- Customer sets up call forwarding to Tavari number
- VAPI AI answers calls, handles FAQs, takes messages
- Business receives email summaries of all AI-answered calls
- Simple dashboard for configuration and management

---

## 🏗️ Architecture Overview

### Technology Stack

**Backend:**
- Node.js + Express
- Supabase (PostgreSQL database)
- VAPI (AI & Telephony platform)
- Stripe (Billing & subscriptions)
- AWS SES (Email notifications)
- Telnyx (SMS notifications)
- AWS S3 (Invoice storage)

**Frontend:**
- Next.js 14 (App Router)
- React
- Tailwind CSS
- Axios (API client)

**Infrastructure:**
- Railway (Backend hosting)
- Vercel (Frontend hosting)
- Winston (Logging)
- Sentry (Error tracking - configured but not fully integrated)

### Key Integrations

1. **VAPI** - Handles all AI conversations and phone number management
2. **Telnyx** - Used for purchasing phone numbers and SMS
3. **Stripe** - Subscription billing with 3 tiers ($79/250min, $129/500min, $179/750min)
4. **Supabase** - PostgreSQL database with REST API

---

## ✅ What's Completed (85%)

### Core Infrastructure ✅
- [x] Project structure and organization
- [x] Legacy OpenAI Realtime + Telnyx code archived
- [x] Database schema with VAPI fields
- [x] VAPI service layer (`services/vapi.js`)
- [x] VAPI assistant template (`templates/vapi-assistant-template.js`)
- [x] VAPI webhook handler (`routes/vapi.js`)
- [x] Server refactored and cleaned up

### Authentication & User Management ✅
- [x] User signup/login with JWT
- [x] Business account creation
- [x] Multi-tenant isolation
- [x] Password hashing and security

### VAPI Integration ✅
- [x] Assistant creation with business data
- [x] Phone number provisioning (via Telnyx → VAPI)
- [x] Assistant-to-phone-number linking
- [x] Webhook endpoint for call events
- [x] Call session tracking
- [x] Transcriber configuration (Deepgram)
- [x] Start speaking plan configuration

### Business Dashboard ✅
- [x] Main dashboard with phone number display
- [x] Settings page:
  - AI enable/disable toggle
  - Call forwarding settings (rings before forwarding)
  - After-hours behavior
  - Call transfer toggle
  - Notification preferences
- [x] FAQs management page (tier-based limits: 5/10/20)
- [x] Call history page
- [x] Messages page
- [x] Billing page:
  - Plan details and usage
  - Minutes exhaustion settings
  - Upgrade flow
- [x] Invoices page (list, detail, PDF download)
- [x] Support ticket submission
- [x] All pages mobile responsive

### Backend Services ✅
- [x] Usage tracking (`services/usage.js`)
- [x] Billing cycle management (`services/billing.js`)
- [x] Invoice generation (`services/invoices.js`)
- [x] Email notifications (`services/notifications.js`)
- [x] SMS notifications (optional, 3x Telnyx cost)
- [x] FAQ validation (`services/faqValidation.js`)
- [x] Email templates (`services/emailTemplates.js`)

### API Routes ✅
- [x] Authentication (`routes/auth.js`)
- [x] VAPI webhook (`routes/vapi.js`)
- [x] Business settings (`routes/business.js`)
- [x] Billing (`routes/billing.js`)
- [x] Invoices (`routes/invoices.js`)
- [x] Support tickets (`routes/support.js`)
- [x] Account management (`routes/account.js`)
- [x] Admin routes (`routes/admin.js`)
- [x] Setup wizard (`routes/setup.js`)

### Database Models ✅
- [x] Business model (with VAPI fields)
- [x] User model
- [x] AIAgent model
- [x] CallSession model (with VAPI fields)
- [x] Message model
- [x] UsageMinutes model (with billing cycle fields)
- [x] AdminUser model
- [x] AdminActivityLog model

### Billing & Subscriptions ✅
- [x] Stripe products created (3 tiers)
- [x] Checkout flow
- [x] Billing portal
- [x] Webhook handling
- [x] Monthly billing cycles
- [x] Prorated upgrades
- [x] Minutes exhaustion handling (Option A: disable AI, Option B: overage with cap)
- [x] Invoice generation (PDF)
- [x] Automatic invoice emailing
- [x] Usage threshold notifications (configurable)
- [x] Mandatory AI shutdown/resumption notifications

### Legal & Compliance ✅
- [x] Terms of Service page
- [x] Privacy Policy page
- [x] Account cancellation flow
- [x] Account deletion flow
- [x] Data export (GDPR/CCPA compliance)

---

## ⚠️ Current Issues & Known Problems

### Critical Issues (Blocking Production)

1. **VAPI Webhook Not Receiving Events** 🔴
   - **Status:** Webhook endpoint returns 404
   - **Impact:** No call logs, no call summaries, no message extraction
   - **Location:** `routes/vapi.js` - webhook route may not be properly mounted
   - **Next Steps:** 
     - Verify route mounting in `server.js`
     - Test webhook endpoint accessibility
     - Check VAPI dashboard webhook configuration

2. **Assistant Not Responding After Greeting** 🟡
   - **Status:** Partially fixed - transcriber settings added
   - **Impact:** AI says greeting but doesn't continue conversation
   - **Recent Fix:** Added Deepgram transcriber and start speaking plan
   - **Next Steps:**
     - Test calls to verify fix works
     - Check VAPI dashboard for call logs
     - Verify assistant configuration

3. **Phone Number Area Code Matching** 🟡
   - **Status:** Fixed in code, needs testing
   - **Impact:** Phone numbers may not match business area code
   - **Location:** `services/vapi.js` - `searchAvailablePhoneNumbers` function
   - **Next Steps:** Test phone number selection during signup

### Non-Critical Issues

4. **Database Column Missing** 🟡
   - **Error:** `column usage_minutes.billing_cycle_start does not exist`
   - **Status:** Migration file exists (`RUN_THIS_MIGRATION.sql`) but may not have been run
   - **Next Steps:** Run migration on production database

5. **Port Already in Use** 🟡
   - **Error:** `EADDRINUSE: address already in use :::5001`
   - **Status:** Common development issue
   - **Solution:** Kill existing process or change port

---

## 🚧 What's Remaining to Build

### High Priority (Required for Launch)

1. **Fix VAPI Webhook Integration** 🔴
   - Debug why webhook returns 404
   - Verify route is properly mounted
   - Test webhook receives events from VAPI
   - Ensure call events are properly handled
   - **Estimated Time:** 2-4 hours

2. **Complete End-to-End Testing** 🔴
   - Test complete signup → activation → call → summary flow
   - Test all error scenarios
   - Test billing and subscription flows
   - Test cancellation and deletion flows
   - **Estimated Time:** 4-8 hours

3. **Admin Dashboard Frontend** 🟡
   - Build admin UI (`frontend/app/admin/`)
   - Account management interface
   - Usage monitoring dashboard
   - Error logs viewer
   - Activity tracking display
   - **Estimated Time:** 8-12 hours

### Medium Priority (Important for Production)

4. **Security Hardening** 🟡
   - Implement rate limiting (partially done)
   - Add input validation middleware
   - Implement webhook signature verification
   - Add data encryption for sensitive fields
   - **Estimated Time:** 4-6 hours

5. **Monitoring & Observability** 🟡
   - Complete Sentry integration
   - Set up uptime monitoring
   - Add analytics tracking
   - Implement log aggregation
   - **Estimated Time:** 4-6 hours

6. **Reusable Frontend Components** 🟡
   - Create ResponsiveTable component
   - Create MobileNav component
   - Create ResponsiveCard component
   - Ensure consistent mobile experience
   - **Estimated Time:** 4-6 hours

### Low Priority (Nice to Have)

7. **Documentation** 🟢
   - User guide for customers
   - API documentation
   - Deployment runbook
   - Troubleshooting guide
   - **Estimated Time:** 4-8 hours

8. **Backup & Recovery** 🟢
   - Implement backup strategy
   - Create recovery procedures
   - Document disaster recovery plan
   - **Estimated Time:** 2-4 hours

---

## 📁 Project Structure

```
tavari-ai-phone-agent/
├── server.js                    # Main Express server
├── config/
│   ├── database.js            # Supabase client
│   └── sentry.js              # Sentry error tracking
├── models/                    # Database models (Supabase)
│   ├── Business.js
│   ├── User.js
│   ├── AIAgent.js
│   ├── CallSession.js
│   ├── Message.js
│   ├── UsageMinutes.js
│   ├── AdminUser.js
│   └── AdminActivityLog.js
├── routes/                    # API routes
│   ├── auth.js               # Authentication
│   ├── business.js           # Business settings
│   ├── vapi.js               # VAPI webhook handler
│   ├── billing.js            # Stripe billing
│   ├── invoices.js           # Invoice management
│   ├── support.js            # Support tickets
│   ├── account.js            # Account management
│   ├── admin.js              # Admin endpoints
│   └── ...
├── services/                  # Business logic
│   ├── vapi.js               # VAPI API client
│   ├── billing.js            # Billing logic
│   ├── usage.js              # Usage tracking
│   ├── invoices.js           # Invoice generation
│   ├── notifications.js      # Email/SMS
│   └── ...
├── templates/
│   ├── vapi-assistant-template.js  # AI prompt generator
│   └── emailTemplates.js           # Email templates
├── middleware/
│   ├── auth.js               # JWT authentication
│   ├── adminAuth.js          # Admin authentication
│   ├── errorHandler.js       # Error handling
│   ├── rateLimiter.js        # Rate limiting
│   └── validator.js          # Input validation
├── frontend/                  # Next.js frontend
│   ├── app/                  # Next.js app router
│   │   ├── dashboard/       # Dashboard pages
│   │   ├── signup/          # Signup flow
│   │   └── ...
│   ├── components/           # React components
│   └── lib/                  # Frontend utilities
├── scripts/                  # Utility scripts
│   ├── verify-vapi-setup.js
│   ├── check-assistant-details.js
│   ├── fix-assistant-webhook.js
│   └── ...
└── archive/                  # Legacy code (OpenAI Realtime + Telnyx)
    └── legacy-implementation/
```

---

## 🔑 Key Environment Variables

Required environment variables (see `.env.example` for full list):

```env
# Database
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# VAPI
VAPI_API_KEY=                    # Private key from VAPI dashboard
VAPI_WEBHOOK_SECRET=             # Optional, for webhook security
VAPI_TELNYX_CREDENTIAL_ID=      # UUID from VAPI → Settings → Credentials

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=
NEXT_PUBLIC_STRIPE_CORE_PRICE_ID=
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=

# AWS
AWS_SES_REGION=
AWS_SES_FROM_EMAIL=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=

# Telnyx
TELNYX_API_KEY=

# Frontend
NEXT_PUBLIC_API_URL=
FRONTEND_URL=
BACKEND_URL=                     # Production backend URL for webhooks

# Admin
ADMIN_SECRET_KEY=
```

---

## 🚀 Getting Started (For New Developers)

### 1. Clone and Install
```bash
git clone <repository-url>
cd Tavari-Communications-App
npm install
cd frontend && npm install && cd ..
```

### 2. Set Up Environment
```bash
cp .env.example .env
# Fill in all required environment variables
```

### 3. Run Database Migrations
```bash
# Check if RUN_THIS_MIGRATION.sql needs to be run
psql $DATABASE_URL -f RUN_THIS_MIGRATION.sql
```

### 4. Verify VAPI Setup
```bash
npm run verify:vapi          # Check assistants and phone numbers
npm run check:assistant      # Check assistant details
npm run check:mapping        # Check business ↔ phone mapping
```

### 5. Start Development Servers
```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

### 6. Test Key Flows
1. Sign up a new account
2. Complete setup wizard
3. Verify phone number provisioning
4. Test assistant configuration
5. Make a test call
6. Check webhook receives events

---

## 📝 Important Notes for New Developers

### Architecture Decisions

1. **VAPI vs Custom AI**
   - We migrated from custom OpenAI Realtime + Telnyx to VAPI
   - VAPI handles all AI conversations and telephony
   - Legacy code is in `archive/legacy-implementation/`
   - **DO NOT** modify archived code

2. **Database**
   - Using Supabase (PostgreSQL) with REST API
   - Models use Supabase client, not raw SQL
   - All models in `models/` directory

3. **Phone Number Flow**
   - Numbers purchased via Telnyx API
   - Then provisioned to VAPI
   - VAPI manages call routing
   - Business forwards their number to VAPI number

4. **Billing**
   - Stripe handles subscriptions
   - Billing cycles are monthly (same calendar day)
   - Minutes do NOT roll over
   - Upgrades are prorated but don't change billing date

### Key Files to Understand

- `services/vapi.js` - All VAPI API interactions
- `templates/vapi-assistant-template.js` - AI prompt generation
- `routes/vapi.js` - Webhook handler for call events
- `routes/business.js` - Business settings and phone provisioning
- `services/billing.js` - Billing cycle and usage logic

### Common Issues

1. **Webhook 404** - Check route mounting in `server.js`
2. **Assistant not responding** - Check transcriber settings in VAPI dashboard
3. **No call logs** - Verify assistant is linked to phone number
4. **Database errors** - Run migrations in `RUN_THIS_MIGRATION.sql`

---

## 🎯 Immediate Next Steps

1. **Fix VAPI Webhook** (Priority 1)
   - Debug 404 error
   - Test webhook receives events
   - Verify call events are processed

2. **Test Complete Flow** (Priority 2)
   - End-to-end testing
   - Fix any bugs found
   - Verify all features work

3. **Build Admin Dashboard** (Priority 3)
   - Create admin UI
   - Test admin functionality
   - Deploy to production

---

## 📞 Support & Resources

- **VAPI Documentation:** https://docs.vapi.ai
- **VAPI Dashboard:** https://dashboard.vapi.ai
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Supabase Dashboard:** https://app.supabase.com

### Useful Scripts

```bash
npm run verify:vapi          # Verify VAPI setup
npm run check:assistant      # Check assistant details
npm run check:mapping        # Check business ↔ phone mapping
npm run fix:webhook          # Fix webhook URL
npm run fix:transcriber      # Fix transcriber settings
npm run test:webhook         # Test webhook endpoint
```

---

## 📊 Project Health

- **Code Completeness:** ~85%
- **Testing:** ~30% (needs comprehensive testing)
- **Documentation:** ~60% (needs user guides)
- **Production Readiness:** ~70% (critical issues need fixing)

**Estimated Time to Production:** 2-3 weeks with focused effort

---

**Last Updated:** December 17, 2024  
**Maintained By:** Development Team  
**Questions?** Check existing documentation or review code comments

