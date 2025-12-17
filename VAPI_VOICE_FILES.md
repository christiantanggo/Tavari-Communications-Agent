# VAPI Voice Control Files

## Core Voice Files (Essential)

### 1. **`services/vapi.js`** ⭐ PRIMARY
   - VAPI API client
   - Creates assistants
   - Provisions phone numbers
   - Links assistants to numbers
   - Manages VAPI credentials
   - **This is the main file that talks to VAPI**

### 2. **`routes/vapi.js`** ⭐ PRIMARY
   - Webhook handler: `/api/vapi/webhook`
   - Handles call events: `call-start`, `call-end`, `transfer-started`, etc.
   - Creates call sessions in database
   - Checks minutes available
   - Sends notifications
   - **This receives events from VAPI when calls happen**

### 3. **`templates/vapi-assistant-template.js`** ⭐ PRIMARY
   - Generates the system prompt for the AI assistant
   - Defines assistant personality and behavior
   - **This controls what the AI says and how it acts**

### 4. **`server.js`**
   - Mounts VAPI routes at `/api/vapi`
   - Sets up webhook endpoint
   - **Entry point - routes requests to VAPI handler**

## Database Models (Data Storage)

### 5. **`models/CallSession.js`**
   - Stores call session data
   - Tracks `vapi_call_id`, `transfer_attempted`
   - **Database operations for calls**

### 6. **`models/Business.js`**
   - Stores `vapi_assistant_id`, `vapi_phone_number`
   - Links businesses to VAPI assistants
   - **Database operations for businesses**

### 7. **`models/UsageMinutes.js`**
   - Tracks billing cycles
   - Records call usage
   - **Database operations for usage tracking**

## Configuration Files

### 8. **`config/database.js`**
   - Supabase client initialization
   - **Database connection**

### 9. **`.env`** (Environment Variables)
   - `VAPI_API_KEY` - VAPI API key
   - `VAPI_BASE_URL` - VAPI API base URL (default: https://api.vapi.ai)
   - `VAPI_WEBHOOK_SECRET` - Optional webhook secret
   - `SUPABASE_URL` - Database URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Database key
   - **Required credentials**

## Database Schema

### 10. **`RUN_THIS_MIGRATION.sql`**
   - Adds VAPI columns to database tables
   - Creates indexes
   - **Must be run for VAPI to work**

## Supporting Files (Utilities)

### 11. **`utils/phoneFormatter.js`**
   - Formats phone numbers
   - Validates phone numbers
   - **Phone number utilities**

### 12. **`services/usage.js`**
   - Checks if minutes are available
   - Records call usage
   - **Usage tracking logic**

### 13. **`services/notifications.js`**
   - Sends call summary emails
   - Sends SMS notifications
   - **Notification logic**

## How It Works (Flow)

1. **Setup**: `services/vapi.js` creates assistant and provisions phone number
2. **Incoming Call**: Telnyx routes call → VAPI → VAPI sends webhook to `routes/vapi.js`
3. **Webhook Handler**: `routes/vapi.js` receives event, creates call session, checks minutes
4. **AI Response**: VAPI uses assistant (configured by `templates/vapi-assistant-template.js`) to answer
5. **Call End**: VAPI sends `call-end` event → `routes/vapi.js` records usage, sends notifications

## Key Endpoints

- `POST /api/vapi/webhook` - VAPI webhook endpoint (receives call events)
- `GET /api/vapi/webhook` - Test endpoint (verifies webhook is accessible)
- `POST /webhook` - Telnyx webhook endpoint (simple acknowledgment)

## Current Issue

Phone number is configured in VAPI but calls are not being answered. Possible causes:
- Telnyx number not properly linked to VAPI
- VAPI assistant webhook URL not set correctly
- Telnyx routing configuration interfering with VAPI
- Voice feature disabled in Telnyx (though user says it's enabled)

## Files to Debug Priority

1. **`services/vapi.js`** - Check phone provisioning and assistant linking
2. **`routes/vapi.js`** - Check webhook handler is receiving events
3. **`templates/vapi-assistant-template.js`** - Check assistant configuration
4. **`server.js`** - Verify webhook route is mounted correctly

