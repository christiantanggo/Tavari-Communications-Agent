# AI Takeout Build Plan - Phase 1

## Overview
Implement a feature where the AI can call the business employee to deliver customer messages, and then connect the employee with the customer if the employee requests it. This uses VAPI's outbound call API to initiate calls and transfer functionality to connect parties.

## Architecture Flow

```
Customer Call → AI Takes Message → Store Message
                                    ↓
                            Check if call-back enabled
                                    ↓
                            AI Calls Employee (outbound)
                                    ↓
                            AI Delivers Message
                                    ↓
                            Ask: "Connect you with customer?"
                                    ↓
                    ┌───────────────┴───────────────┐
                    │                               │
                  Yes                              No
                    │                               │
            Initiate Call to Customer         End Call
                    │
            Transfer Employee Call to Customer
                    │
            Employee & Customer Connected
```

## Implementation Components

### 1. Database Schema Updates

**File: `migrations/add_outbound_callback_settings.sql`**
- Add `enable_outbound_callback` boolean field to `businesses` table (default false)
- Add `callback_notification_phone` VARCHAR(50) field to `businesses` table (phone number to call for notifications)
- Add `callback_retry_attempts` INTEGER field (default 0, max retries if no answer)
- Add `callback_retry_delay_minutes` INTEGER field (default 5, minutes between retries)

**New Table: `outbound_callback_attempts`**
- Track callback attempts to prevent spam
- Fields: `id`, `business_id`, `message_id`, `customer_phone`, `employee_phone`, `status` (pending/answered/failed), `vapi_call_id`, `attempt_number`, `created_at`, `answered_at`, `connected_to_customer_at`

### 2. VAPI Service Updates

**File: `services/vapi.js`**

Add new functions:
- `createOutboundCall(assistantId, phoneNumberId, customerPhone, metadata)` - Creates outbound call using VAPI POST /call endpoint
- `connectCallToCustomer(employeeCallId, customerPhone)` - Initiates call to customer and transfers employee call to connect them

### 3. Outbound Call Handler Service

**File: `services/outboundCallback.js` (NEW)**

Create service to handle outbound callback logic:
- `initiateCallbackToEmployee(businessId, messageId)` - Main function to trigger callback
  - Gets message details from database
  - Checks if callback is enabled for business
  - Gets callback phone number (callback_notification_phone or public_phone_number)
  - Creates specialized assistant for outbound callbacks
  - Initiates outbound call to employee using VAPI
  - Returns call ID for tracking

- `handleCallbackConnection(employeeCallId, customerPhone)` - When employee confirms connection
  - Creates new outbound call to customer
  - Transfers employee call to customer number
  - Tracks connection in database

- `checkCallbackRetry(businessId, messageId)` - Check if retry is needed
  - Queries `outbound_callback_attempts` table
  - Checks attempt count vs max retries
  - Returns whether to retry and when

### 4. Specialized Outbound Callback Assistant

**File: `templates/outbound-callback-assistant-template.js` (NEW)**

Create a specialized assistant prompt for outbound callbacks:
- Greeting: "Hello, this is your AI assistant from [Business Name]"
- Delivers message details (customer name, phone, message content)
- Asks: "Would you like me to connect you with the customer now?"
- Handles yes/no responses
- If yes, triggers function call to connect customer
- If no, thanks them and ends call

### 5. VAPI Webhook Handler Updates

**File: `routes/vapi.js`**

Add handlers for outbound callback events:
- `handleOutboundCallbackStart(event)` - Track when callback call starts
- `handleOutboundCallbackAnswer(event)` - Track when employee answers
- `handleOutboundCallbackConnection(event)` - Track when customer is connected
- `handleOutboundCallbackEnd(event)` - Update attempt status, check for retries

Add function call handler for `connect_to_customer` function:
- Receives employee confirmation and customer phone number
- Calls `connectCallToCustomer()` service function
- Updates database records

### 6. Message Handler Integration

**File: `routes/vapi.js` (handleCallEnd function)**

After message is created, check if outbound callback should be triggered:
- Check `business.enable_outbound_callback`
- Check message type/urgency (could add urgency field later)
- Call `initiateCallbackToEmployee()` if conditions met
- Fall back to email/SMS if callback fails

### 7. Configuration UI

**File: `frontend/app/dashboard/settings/page.jsx`**

Add outbound callback settings section:
- Toggle: "Enable AI Call-Back for Messages"
- Input: "Call-Back Phone Number" (defaults to business phone)
- Input: "Max Retry Attempts" (0-3)
- Input: "Minutes Between Retries"
- Info text explaining the feature

### 8. Business Model Updates

**File: `models/Business.js`**

Add methods to get callback settings and update callback phone number.

### 9. API Routes

**File: `routes/business.js`**

Add PUT endpoint to update outbound callback settings.

### 10. Admin Settings (Optional)

**File: `routes/admin.js`**

Add endpoint to view callback attempts and statistics for admin monitoring.

## Implementation Details

### Outbound Call Creation

VAPI API structure (based on research):
```javascript
POST https://api.vapi.ai/call
{
  "phoneNumberId": "<vapi_phone_number_id>",
  "customer": {
    "number": "+15551234567" // Employee phone
  },
  "assistant": {
    "id": "<assistant_id>" // Use special callback assistant
  },
  "metadata": {
    "businessId": "...",
    "messageId": "...",
    "callbackType": "employee_notification",
    "customerPhone": "+15559876543"
  }
}
```

### Call Connection Flow

When employee confirms:
1. AI triggers `connect_to_customer` function with customer phone number
2. Backend receives function call via webhook
3. Create new outbound call to customer (or use transfer if supported)
4. Transfer employee's call to customer number
5. Both parties are connected

### Error Handling

- If employee doesn't answer: Log attempt, retry if enabled, fall back to email/SMS
- If customer doesn't answer: End employee call, notify employee
- If connection fails: Notify employee, log error, fall back to email/SMS

### Cost Considerations

- Each outbound call incurs VAPI/Telnyx charges
- Consider adding per-business limits or billing tier restrictions
- Track call costs in `outbound_callback_attempts` table for reporting

## Testing Strategy

1. Unit tests for callback service functions
2. Integration tests for VAPI API calls (mock VAPI responses)
3. End-to-end test: Create message → trigger callback → verify call created
4. Test retry logic and failure scenarios
5. Test connection flow (employee confirms → customer connected)

## Migration Path

1. Add database fields (backward compatible, defaults to disabled)
2. Deploy backend code (no breaking changes)
3. Add UI settings (feature hidden until enabled)
4. Test with one business
5. Enable for all businesses (via admin or per-business settings)

## Future Enhancements

- Smart retry timing based on business hours
- Priority levels (urgent messages get immediate call-back)
- Multiple notification phone numbers (try manager first, then main line)
- Call-back analytics and reporting
- Integration with business calendar to avoid calling during meetings

