# Tavari AI Phone Agent - Setup Checklist

Use this checklist to track your progress setting up the project. Check off items as you complete them.

## Phase 1: Account Setup & Credentials

### Database
- [ ] Create PostgreSQL database (choose one):
  - [ ] Supabase account: https://supabase.com
  - [ ] Railway account: https://railway.app
  - [ ] Or use existing PostgreSQL instance
- [ ] Get database connection string (DATABASE_URL)
- [ ] Test database connection

### OpenAI
- [ ] Create OpenAI account: https://platform.openai.com
- [ ] Generate API key
- [ ] Add billing method (Realtime API requires paid account)
- [ ] Verify API key works
- [ ] Note: Realtime API is in preview - may need to request access

### Voximplant
- [ ] Create Voximplant account: https://voximplant.com
- [ ] Create new application in dashboard
- [ ] Get Account ID
- [ ] Get Application ID
- [ ] Generate API Key
- [ ] Get Account Name
- [ ] Purchase/assign phone number (or use test number)
- [ ] Configure inbound call scenario (will do later)

### Stripe
- [ ] Create Stripe account: https://stripe.com
- [ ] Get API keys (test mode):
  - [ ] Secret Key (sk_test_...)
  - [ ] Publishable Key (pk_test_...)
- [ ] Set up webhook endpoint (will configure URL later)
- [ ] Note webhook signing secret (whsec_...)

## Phase 2: Local Development Setup

### Project Setup
- [ ] Clone/download project files
- [ ] Install Node.js 18+ (verify: `node --version`)
- [ ] Install backend dependencies: `npm install`
- [ ] Install frontend dependencies: `cd frontend && npm install && cd ..`

### Environment Configuration
- [ ] Create `.env` file in root directory
- [ ] Add all required environment variables (see below)
- [ ] Verify no `.env` file is committed to git

### Environment Variables to Set:
```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# JWT (generate random string)
JWT_SECRET=your-random-secret-here-min-32-chars
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Voximplant
VOXIMPLANT_ACCOUNT_ID=your-account-id
VOXIMPLANT_APPLICATION_ID=your-application-id
VOXIMPLANT_API_KEY=your-api-key
VOXIMPLANT_ACCOUNT_NAME=your-account-name

# Stripe
STRIPE_SECRET_KEY=sk_test_your-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-secret

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Phase 3: Database Setup

- [ ] Verify DATABASE_URL is correct in `.env`
- [ ] Run database migrations: `npm run migrate`
- [ ] Verify tables were created:
  - [ ] businesses
  - [ ] users
  - [ ] ai_agents
  - [ ] call_sessions
  - [ ] messages
  - [ ] usage_minutes
- [ ] Test database connection (server should start without DB errors)

## Phase 4: Stripe Products Setup

- [ ] Run Stripe product creation script: `node scripts/create-stripe-products.js`
- [ ] Copy the returned Price IDs
- [ ] Add Price IDs to `.env`:
  ```env
  STRIPE_STARTER_PRICE_ID=price_xxx
  STRIPE_PRO_PRICE_ID=price_xxx
  STRIPE_ENTERPRISE_PRICE_ID=price_xxx
  ```
- [ ] Update `services/stripe.js` if your price IDs don't match the detection logic

## Phase 5: Backend Testing

- [ ] Start backend server: `npm run dev`
- [ ] Verify server starts without errors
- [ ] Test health endpoint: `curl http://localhost:3000/health`
- [ ] Test API endpoint: `curl http://localhost:3000/api`
- [ ] Check logs directory exists (for Winston logging)

### Test Authentication
- [ ] Test signup: `POST http://localhost:3000/api/auth/signup`
  ```json
  {
    "email": "test@example.com",
    "password": "test123",
    "name": "Test Business",
    "first_name": "Test",
    "last_name": "User"
  }
  ```
- [ ] Verify business and user were created in database
- [ ] Test login: `POST http://localhost:3000/api/auth/login`
- [ ] Verify JWT token is returned
- [ ] Test protected endpoint with token: `GET http://localhost:3000/api/auth/me`

## Phase 5: Frontend Testing

- [ ] Start frontend: `cd frontend && npm run dev`
- [ ] Open http://localhost:3000 (or Next.js default port)
- [ ] Test landing page loads
- [ ] Test signup flow:
  - [ ] Fill out signup form
  - [ ] Submit and verify redirect to dashboard
- [ ] Test login flow:
  - [ ] Logout
  - [ ] Login with created account
  - [ ] Verify dashboard loads
- [ ] Test setup wizard:
  - [ ] Navigate to `/dashboard/setup`
  - [ ] Complete all 5 steps
  - [ ] Verify finalization works

## Phase 6: Voximplant Configuration

### Voximplant Dashboard Setup
- [ ] Log into Voximplant dashboard
- [ ] Navigate to your application
- [ ] Configure inbound call scenario:
  - [ ] Set webhook URL: `https://your-domain.com/api/calls/webhook`
  - [ ] Or for local testing: Use ngrok tunnel
- [ ] Configure audio settings:
  - [ ] Codec: PCM16 or G.711
  - [ ] Sample rate: 8000 Hz (phone quality)
- [ ] Assign phone number to application
- [ ] Test inbound call routing (if possible)

### WebSocket Audio Streaming
- [ ] Verify WebSocket server starts with HTTP server
- [ ] Test WebSocket connection: `ws://localhost:3000/api/calls/{callId}/audio`
- [ ] Note: Full testing requires actual call from Voximplant

## Phase 7: OpenAI Realtime API

### API Access
- [ ] Verify OpenAI Realtime API access (may need to request)
- [ ] Test API key: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`
- [ ] Check Realtime API documentation for latest WebSocket URL format
- [ ] Update `services/aiRealtime.js` if API format changed

### Testing
- [ ] Create test call session in database
- [ ] Test AI service initialization (may need mock for full testing)
- [ ] Verify audio format conversion works

## Phase 8: Integration Testing

### End-to-End Flow
- [ ] Complete signup → setup wizard → finalize
- [ ] Verify AI agent config is saved
- [ ] Verify business onboarding_complete flag is set
- [ ] Test call webhook endpoint (mock Voximplant payload)
- [ ] Test usage tracking:
  - [ ] Make test call (or simulate)
  - [ ] Verify usage_minutes record created
  - [ ] Check usage status endpoint

### Stripe Integration
- [ ] Test checkout session creation
- [ ] Complete test checkout in Stripe test mode
- [ ] Verify webhook is received (use Stripe CLI for local testing)
- [ ] Verify subscription is created in database
- [ ] Test billing portal access

## Phase 9: Production Preparation

### Security
- [ ] Generate strong JWT_SECRET (32+ random characters)
- [ ] Verify all secrets are in `.env` (not hardcoded)
- [ ] Review CORS settings for production
- [ ] Enable rate limiting
- [ ] Review helmet security headers

### Database
- [ ] Set up database backups
- [ ] Configure connection pooling limits
- [ ] Test database failover (if applicable)

### Monitoring
- [ ] Set up error alerting (email, Slack, etc.)
- [ ] Configure logging aggregation
- [ ] Set up health check monitoring
- [ ] Configure uptime monitoring

## Phase 10: Deployment

### Backend Deployment
- [ ] Choose hosting platform:
  - [ ] Railway
  - [ ] Render
  - [ ] Heroku
  - [ ] AWS/GCP/Azure
- [ ] Set environment variables in hosting platform
- [ ] Configure build command: `npm install && npm run migrate`
- [ ] Set start command: `npm start`
- [ ] Deploy backend
- [ ] Verify health endpoint: `https://your-api.com/health`

### Frontend Deployment
- [ ] Choose hosting platform:
  - [ ] Vercel (recommended for Next.js)
  - [ ] Netlify
  - [ ] Other
- [ ] Set `NEXT_PUBLIC_API_URL` to production backend URL
- [ ] Deploy frontend
- [ ] Verify frontend loads and connects to backend

### Webhook Configuration
- [ ] Update Voximplant webhook URL to production: `https://your-api.com/api/calls/webhook`
- [ ] Update Stripe webhook URL to production: `https://your-api.com/api/billing/webhook`
- [ ] Update Stripe webhook secret in production `.env`
- [ ] Test webhooks in production

## Phase 11: Final Testing

### Production Smoke Tests
- [ ] Signup new account in production
- [ ] Complete setup wizard
- [ ] Verify AI number is assigned
- [ ] Test Stripe checkout (test mode)
- [ ] Make test call (if possible)
- [ ] Verify call session is created
- [ ] Verify usage is tracked
- [ ] Test message creation
- [ ] Verify dashboard displays correctly

### Load Testing
- [ ] Test concurrent call handling (if possible)
- [ ] Monitor resource usage
- [ ] Verify database connection pool handles load
- [ ] Check API response times

## Phase 12: Go Live Checklist

- [ ] Switch Stripe to live mode
- [ ] Update Stripe webhook to production
- [ ] Verify all production environment variables
- [ ] Test production checkout flow
- [ ] Set up customer support email
- [ ] Prepare marketing materials
- [ ] **GO LIVE! 🚀**

## Troubleshooting Common Issues

### Database Connection
- [ ] Verify DATABASE_URL format is correct
- [ ] Check database is accessible from deployment platform
- [ ] Verify SSL settings if required

### Voximplant Issues
- [ ] Verify webhook URL is publicly accessible
- [ ] Check scenario XML format
- [ ] Verify audio codec compatibility

### OpenAI Issues
- [ ] Verify API key has Realtime API access
- [ ] Check API rate limits
- [ ] Verify billing is set up

### Stripe Issues
- [ ] Verify webhook secret matches dashboard
- [ ] Check webhook events are being received
- [ ] Verify price IDs are correct

## Notes

- Keep this checklist updated as you progress
- Check off items as you complete them
- Add notes for any issues encountered
- Review before going to production

---

**Current Status:** Not Started
**Last Updated:** [Date]

