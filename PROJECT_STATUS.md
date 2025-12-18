# Tavari Communications App - Project Status

## Project Overview
A self-serve AI phone answering service that uses VAPI (Voice API) to provide AI-powered phone agents for businesses. The system handles call routing, message taking, FAQ answering, and notifications via email/SMS.

## Tech Stack
- **Backend**: Node.js/Express (ES Modules)
- **Frontend**: Next.js 14 (React)
- **Database**: Supabase (PostgreSQL)
- **Voice AI**: VAPI (Voice API)
- **Phone Provider**: Telnyx
- **Email**: AWS SES (via Supabase Edge Function)
- **SMS**: Telnyx
- **Deployment**: Railway (backend), Vercel (frontend, likely)
- **Authentication**: JWT tokens stored in cookies

## Current Status: ✅ Core Features Complete

### ✅ Completed Features

#### 1. **VAPI Integration**
- ✅ Phone number provisioning via VAPI
- ✅ AI assistant creation with dynamic prompts
- ✅ Webhook handling for call events (`/api/vapi/webhook`)
- ✅ Call session tracking and storage
- ✅ Message extraction from call transcripts
- ✅ Usage minutes tracking
- ✅ Automatic assistant rebuilding when settings change
- ✅ Manual rebuild button in dashboard header

#### 2. **Business Management**
- ✅ Business signup and onboarding
- ✅ Setup wizard (5 steps)
- ✅ Business settings management (name, address, phone, timezone)
- ✅ Phone number selection and provisioning
- ✅ Automatic Telnyx Voice API Application assignment
- ✅ Automatic Messaging Profile assignment for SMS

#### 3. **AI Agent Configuration**
- ✅ Business hours (12-hour format, timezone-aware)
- ✅ Holiday hours (with date picker, closed option, custom times)
- ✅ FAQs management (add/edit/delete)
- ✅ Opening and ending greetings
- ✅ Personality settings
- ✅ Voice provider/ID selection
- ✅ Real-time current time checking for business hours
- ✅ AI prompt generation with all business context

#### 4. **Notifications**
- ✅ Email notifications (call summaries, callback requests)
- ✅ SMS notifications (callback requests)
- ✅ Missed call emails (during business hours)
- ✅ Test email/SMS buttons in settings
- ✅ Supabase Edge Function for email sending (`mail-send`)

#### 5. **Dashboard**
- ✅ Main dashboard with metrics
- ✅ Recent calls display
- ✅ Recent messages display
- ✅ Minutes usage tracking with progress bar
- ✅ AI Handled Calls count
- ✅ Setup checklist
- ✅ SMS activation banner
- ✅ Rate limiting and debouncing to prevent 429 errors

#### 6. **Settings Page**
- ✅ Tabbed interface (Business Info, Business Hours, AI Settings, Notifications)
- ✅ All setup wizard fields editable
- ✅ Holiday hours management
- ✅ FAQ management
- ✅ Greeting text fields
- ✅ Notification toggles and configuration

#### 7. **Call & Message Management**
- ✅ Call history page
- ✅ Message inbox page
- ✅ Call details view
- ✅ Message read/unread status

#### 8. **Phone Number Management**
- ✅ Reuse unassigned Telnyx numbers before purchasing new ones
- ✅ Area code matching for number reuse
- ✅ Automatic Voice API Application linking
- ✅ Automatic Messaging Profile assignment

## 🔧 Technical Implementation Details

### Key Files & Their Purposes

#### Backend (`/routes/`)
- `vapi.js` - VAPI webhook handler, call event processing, message extraction
- `business.js` - Business CRUD, phone provisioning, test notifications
- `agents.js` - AI agent config, assistant rebuilding
- `calls.js` - Call history endpoints
- `messages.js` - Message management endpoints
- `usage.js` - Usage minutes tracking
- `auth.js` - Authentication (signup, login, JWT)

#### Services (`/services/`)
- `vapi.js` - VAPI API client (create assistant, provision numbers, rebuild assistant)
- `notifications.js` - Email/SMS sending via Supabase Edge Function
- `usage.js` - Usage minutes calculation and recording
- `telnyx.js` - Telnyx API client (phone numbers, messaging)

#### Models (`/models/`)
- `Business.js` - Business data operations
- `AIAgent.js` - AI agent configuration
- `CallSession.js` - Call session tracking
- `Message.js` - Message storage
- `UsageMinutes.js` - Usage tracking

#### Templates (`/templates/`)
- `vapi-assistant-template.js` - Generates AI assistant system prompt with business context, FAQs, hours, etc.

#### Frontend (`/frontend/`)
- `app/dashboard/page.jsx` - Main dashboard
- `app/dashboard/settings/page.jsx` - Settings page with tabs
- `app/dashboard/calls/page.jsx` - Call history
- `app/dashboard/messages/page.jsx` - Message inbox
- `components/DashboardHeader.jsx` - Shared header with rebuild button
- `lib/api.js` - API client

### Database Schema

#### Key Tables
- `businesses` - Business information, VAPI phone number, assistant ID
- `ai_agents` - AI agent configuration (FAQs, hours, greetings, holiday_hours)
- `call_sessions` - Call records with VAPI call ID, transcripts
- `messages` - Messages taken during calls
- `usage_minutes` - Monthly usage tracking

#### Important Columns
- `businesses.vapi_phone_number` - The AI agent's phone number
- `businesses.vapi_assistant_id` - VAPI assistant ID
- `ai_agents.holiday_hours` - JSONB array of holiday hours
- `ai_agents.business_hours` - JSON object with day-of-week hours
- `call_sessions.vapi_call_id` - Links to VAPI call records
- `call_sessions.message_taken` - Boolean indicating if message was taken

### Environment Variables Required

#### Backend (Railway)
```
# Supabase
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[key]

# VAPI
VAPI_API_KEY=[key]
VAPI_WEBHOOK_SECRET=[secret]

# Telnyx
TELNYX_API_KEY=[key]
TELNYX_VOICE_APPLICATION_ID=[id]
TELNYX_MESSAGING_PROFILE_ID=[id]

# AWS SES (for Supabase Edge Function)
AWS_SES_FROM_EMAIL=noreply@tavarios.ca
SES_ACCESS_KEY_ID=[key]
SES_SECRET_ACCESS_KEY=[secret]
AWS_REGION=us-east-2

# Server
BACKEND_URL=https://api.tavarios.com
PORT=5001
```

#### Supabase Edge Function Secrets
```
SES_ACCESS_KEY_ID
SES_SECRET_ACCESS_KEY
AWS_REGION
```

### API Endpoints

#### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

#### Business
- `PUT /api/business/settings` - Update business settings
- `POST /api/business/test-email` - Send test email
- `POST /api/business/test-sms` - Send test SMS
- `POST /api/business/test-missed-call` - Send test missed call email
- `POST /api/business/phone-numbers/provision` - Provision phone number

#### Agents
- `GET /api/agents` - Get agent config
- `PUT /api/agents` - Update agent config
- `POST /api/agents/rebuild` - Manually rebuild VAPI assistant

#### Calls
- `GET /api/calls` - List calls
- `GET /api/calls/:callId` - Get call details

#### Messages
- `GET /api/messages` - List messages
- `PATCH /api/messages/:id/read` - Mark as read

#### Usage
- `GET /api/usage/status` - Get current usage

#### VAPI Webhook
- `POST /api/vapi/webhook` - Handles all VAPI call events

## 🚧 Known Issues & Limitations

### Current Issues
1. **Rate Limiting**: Added debouncing (2-second minimum between calls) to prevent 429 errors
2. **Hot Reload**: Sometimes requires hard refresh (Ctrl+Shift+R) to pick up changes
3. **Assistant Rebuild**: May need manual rebuild button if automatic rebuild fails

### Potential Improvements
1. **Error Handling**: Some error messages could be more user-friendly
2. **Loading States**: Some async operations could show better loading indicators
3. **Caching**: Could implement client-side caching for frequently accessed data
4. **Webhook Retry**: No retry logic for failed webhook processing

## 📋 What Still Needs to Be Built

### High Priority
1. **Billing Integration**
   - Stripe integration for subscriptions
   - Usage-based billing (minutes)
   - Invoice generation
   - Payment method management
   - Plan upgrades/downgrades

2. **Admin Dashboard**
   - User management
   - Business management
   - Usage monitoring
   - System health checks

3. **Analytics & Reporting**
   - Call analytics (duration, peak times, etc.)
   - Message analytics
   - Usage trends
   - Export functionality

### Medium Priority
1. **Advanced Features**
   - Call recording playback
   - Custom voice training
   - Multi-language support
   - Call transfer to human agents
   - Appointment scheduling integration

2. **Notifications**
   - Email templates customization
   - SMS template customization
   - Notification preferences per user
   - Webhook notifications

3. **Integrations**
   - CRM integrations (HubSpot, Salesforce)
   - Calendar integrations (Google Calendar, Outlook)
   - Slack/Teams notifications

### Low Priority
1. **UI/UX Improvements**
   - Dark mode
   - Mobile app
   - Better error messages
   - Onboarding tutorials

2. **Performance**
   - Database query optimization
   - Caching layer (Redis)
   - CDN for static assets

## 🔑 Important Notes for Continuation

### VAPI Assistant Rebuilding
- The assistant is automatically rebuilt when:
  - Business settings are updated (`routes/business.js`)
  - Agent settings are updated (`routes/agents.js`)
- Manual rebuild available via "🔄 Rebuild Agent" button in header
- Rebuild function: `services/vapi.js::rebuildAssistant()`
- Always includes: business info, FAQs, business hours, holiday hours, greetings

### Phone Number Provisioning Flow
1. User selects area code in UI
2. System checks for unassigned Telnyx numbers matching area code
3. If found, reuses existing number
4. If not found, purchases new number via VAPI
5. Automatically assigns to Telnyx Voice API Application
6. Automatically assigns Messaging Profile for SMS
7. Links to VAPI assistant

### Business Hours Logic
- Stored in 24-hour format in database
- Displayed in 12-hour format in UI
- AI prompt uses 12-hour format
- Holiday hours checked first, then regular hours
- Timezone-aware (uses business timezone)
- Current time checked in real-time for AI responses

### Message Extraction
- Extracts from VAPI call `summary` and `messages` array
- Creates message record if: name/phone present OR substantial message text
- Links to call session via `call_session_id`

### Email/SMS Sending
- Uses Supabase Edge Function (`mail-send`)
- Endpoint: `${SUPABASE_URL}/functions/v1/mail-send`
- Requires `SUPABASE_ANON_KEY` in headers
- Supports attachments (base64 encoded)

### Database Migrations
- `RUN_THIS_MIGRATION.sql` - Initial VAPI columns
- `ADD_HOLIDAY_HOURS.sql` - Holiday hours column
- `FIX_ALL_MISSING_COLUMNS.sql` - Comprehensive column additions

## 🚀 Deployment

### Railway (Backend)
- Auto-deploys on git push to main
- Uses Nixpacks for build
- `nixpacks.toml` configures Node.js 18
- `package-lock.json` must be committed

### Supabase Edge Functions
- Located in `supabase/functions/mail-send/`
- Deploy with: `supabase functions deploy mail-send`
- Requires secrets set in Supabase dashboard

## 📝 Code Style & Patterns

### Backend
- ES Modules (`.js` files, `import/export`)
- Async/await for all async operations
- Error handling with try/catch
- Extensive logging for debugging
- Non-blocking VAPI updates (fire-and-forget)

### Frontend
- Next.js App Router
- Client components (`'use client'`)
- React hooks (useState, useEffect, useRef)
- API calls via `lib/api.js`
- Error handling with user-friendly alerts

## 🔍 Debugging Tips

1. **Check Railway logs** for backend errors
2. **Check browser console** for frontend errors
3. **VAPI dashboard** for assistant/phone number status
4. **Telnyx dashboard** for phone number configuration
5. **Supabase logs** for database queries
6. **Use rebuild button** if AI doesn't have latest info

## 📚 Key Documentation Files
- `BUILD_STATUS_AND_AUTOMATION.md` - Build automation details
- `DEPLOY_EDGE_FUNCTION.md` - Edge function deployment
- `FIX_VAPI_CREDENTIAL_STEP_BY_STEP.md` - VAPI credential setup
- `supabase/functions/mail-send/README.md` - Email function docs

---

**Last Updated**: December 17, 2025
**Status**: Core features complete, ready for billing/admin features
