# API Documentation

Base URL: `https://api.your-domain.com/api`

All endpoints require authentication unless specified otherwise. Authentication is done via JWT token in the `Authorization` header: `Bearer <token>`

## Authentication

### POST /auth/signup
Create a new account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "business_name": "My Business",
  "phone": "+1234567890",
  "address": "123 Main St",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{
  "token": "jwt_token",
  "user": { ... },
  "business": { ... }
}
```

### POST /auth/login
Login to an existing account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt_token",
  "user": { ... },
  "business": { ... }
}
```

### GET /auth/me
Get current user information.

**Response:**
```json
{
  "user": { ... },
  "business": { ... },
  "agent": { ... }
}
```

## Business Management

### PUT /business/settings
Update business settings.

**Request Body:**
```json
{
  "name": "Updated Business Name",
  "phone": "+1234567890",
  "address": "123 Main St",
  "timezone": "America/New_York",
  "email_ai_answered": true,
  "sms_enabled": false
}
```

### POST /business/phone-numbers/provision
Provision a phone number.

**Request Body:**
```json
{
  "area_code": "519"
}
```

## AI Agent Configuration

### GET /agents
Get AI agent configuration.

**Response:**
```json
{
  "business_hours": { ... },
  "holiday_hours": [ ... ],
  "faqs": [ ... ],
  "opening_greeting": "...",
  "ending_greeting": "...",
  "personality": "professional",
  "voice_settings": { ... }
}
```

### PUT /agents
Update AI agent configuration.

**Request Body:**
```json
{
  "business_hours": { ... },
  "holiday_hours": [ ... ],
  "faqs": [ ... ],
  "opening_greeting": "...",
  "ending_greeting": "...",
  "personality": "professional",
  "voice_settings": { ... }
}
```

### POST /agents/rebuild
Manually rebuild the VAPI assistant.

## Calls

### GET /calls
List call sessions.

**Query Parameters:**
- `limit` (number): Number of results (default: 20)
- `offset` (number): Pagination offset (default: 0)

**Response:**
```json
{
  "calls": [ ... ],
  "total": 100
}
```

### GET /calls/:callId
Get call details.

**Response:**
```json
{
  "call": {
    "id": "...",
    "caller_number": "+1234567890",
    "duration_seconds": 120,
    "transcript": "...",
    "summary": "...",
    "intent": "callback",
    "message_taken": true,
    "started_at": "...",
    "ended_at": "..."
  }
}
```

## Messages

### GET /messages
List messages.

**Query Parameters:**
- `limit` (number): Number of results (default: 20)
- `offset` (number): Pagination offset (default: 0)
- `status` (string): Filter by status (new, read)

**Response:**
```json
{
  "messages": [ ... ],
  "total": 50
}
```

### PATCH /messages/:id/read
Mark message as read.

## Usage

### GET /usage/status
Get current usage status.

**Response:**
```json
{
  "minutes_used": 150,
  "minutes_total": 250,
  "minutes_remaining": 100,
  "usage_percent": 60,
  "billing_cycle_start": "2025-12-01",
  "billing_cycle_end": "2025-12-31"
}
```

## Billing

### GET /billing/status
Get billing status.

**Response:**
```json
{
  "plan_tier": "starter",
  "usage_limit_minutes": 250,
  "subscription": {
    "status": "active",
    "current_period_end": 1735689600,
    "cancel_at_period_end": false
  }
}
```

### POST /billing/checkout
Create Stripe checkout session.

**Request Body:**
```json
{
  "priceId": "price_xxx"
}
```

**Response:**
```json
{
  "sessionId": "cs_xxx",
  "url": "https://checkout.stripe.com/..."
}
```

### GET /billing/portal
Get Stripe billing portal URL.

**Response:**
```json
{
  "url": "https://billing.stripe.com/..."
}
```

## Analytics

### GET /analytics/calls
Get call analytics.

**Query Parameters:**
- `startDate` (string): Start date (ISO format)
- `endDate` (string): End date (ISO format)
- `groupBy` (string): Group by day/hour (default: day)

**Response:**
```json
{
  "analytics": {
    "totalCalls": 100,
    "totalDuration": 7200,
    "averageDuration": 72,
    "callsByDay": { ... },
    "callsByHour": { ... },
    "callsByIntent": { ... },
    "messagesTaken": 25
  }
}
```

### GET /analytics/usage/trends
Get usage trends.

**Query Parameters:**
- `months` (number): Number of months (default: 6)

**Response:**
```json
{
  "trends": [
    {
      "year": 2025,
      "month": 12,
      "monthName": "December",
      "minutes": 150
    },
    ...
  ]
}
```

### GET /analytics/export
Export data as CSV.

**Query Parameters:**
- `type` (string): Export type (calls, messages)

**Response:** CSV file download

## Invoices

### GET /invoices
List invoices.

**Response:**
```json
{
  "invoices": [ ... ]
}
```

### GET /invoices/:id
Get invoice details.

### GET /invoices/:id/pdf
Download invoice PDF.

## Admin Endpoints

All admin endpoints require admin authentication.

### GET /admin/stats
Get dashboard statistics.

**Response:**
```json
{
  "stats": {
    "total_accounts": 100,
    "active_accounts": 80,
    "inactive_accounts": 20,
    "by_tier": {
      "starter": 50,
      "core": 30,
      "pro": 20
    }
  }
}
```

### GET /admin/accounts
List all businesses.

**Query Parameters:**
- `search` (string): Search by name/email
- `plan_tier` (string): Filter by plan tier
- `status` (string): Filter by status (active, inactive)

### GET /admin/accounts/:id
Get business details.

### POST /admin/accounts/:id/minutes
Add bonus minutes.

**Request Body:**
```json
{
  "minutes": 100
}
```

## Webhooks

### POST /vapi/webhook
VAPI webhook handler (no authentication required, uses webhook secret).

### POST /billing/webhook
Stripe webhook handler (no authentication required, uses webhook signature).

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "details": [ ... ] // Optional, for validation errors
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error
- `429` - Too Many Requests (rate limited)

## Rate Limiting

- General API: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes
- Admin endpoints: 50 requests per 15 minutes
- Webhooks: 100 requests per minute

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time (Unix timestamp)

