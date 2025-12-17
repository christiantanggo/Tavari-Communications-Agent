# Voximplant Call Routing Setup

## Current Issue
Your phone number is routing to an old/default scenario instead of your Tavari application. The message you heard ("this staff member is not available...") suggests the number was previously used by another service.

## Solution: Configure Webhook in Voximplant Dashboard

Since the API approach has limitations, you need to configure the webhook in the Voximplant dashboard:

### Step 1: Set Webhook URL in Voximplant Dashboard

1. Log into [Voximplant Dashboard](https://manage.voximplant.com)
2. Go to **Applications** → Select your application (`tavari-voice.christiantanggo.voximplant.com`)
3. Go to **Settings** → **HTTP API Callbacks**
4. Set **Incoming Call Notification URL** to:
   - **For local testing (using ngrok):** `https://your-ngrok-url.ngrok.io/api/calls/webhook`
   - **For production:** `https://your-domain.com/api/calls/webhook`

### Step 2: For Local Testing - Use ngrok

Since your backend is on `localhost:5001`, Voximplant can't reach it directly. You need a tunnel:

```bash
# Install ngrok if you haven't: https://ngrok.com/download
ngrok http 5001
```

Then use the ngrok URL (e.g., `https://abc123.ngrok.io/api/calls/webhook`) in Step 1.

### Step 3: Alternative - Use VoxEngine Scenario

If webhook doesn't work, you can use a VoxEngine scenario:

1. In Voximplant Dashboard → **Scenarios**
2. Create a new scenario or edit existing one
3. Use this code:

```javascript
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
  const call = e.call;
  call.answer();
  
  // Make HTTP request to your webhook
  Net.httpRequest('http://your-ngrok-url.ngrok.io/api/calls/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    postData: JSON.stringify({
      event: 'InboundCall',
      call_session_id: call.callId(),
      caller_id: call.callerId(),
      called_did: call.number(),
      call_type: 'inbound'
    })
  }, (err, data) => {
    if (err) {
      Logger.write('Error calling webhook: ' + err);
      call.hangup();
    } else {
      // Parse scenario XML from response and execute it
      // Or handle the call directly here
    }
  });
});
```

### Step 4: Verify Configuration

1. Make sure your backend is running on port 5001
2. Set up ngrok tunnel (for local testing)
3. Configure webhook URL in Voximplant dashboard
4. Call your number: `+1 (201) 484-0333`
5. Check backend logs - you should see the webhook being called

## Current Status

✅ Phone number `+12014840333` is purchased and active  
✅ Phone number is bound to application `11044442`  
✅ Rule "Tavari Voice Agent" exists  
❌ Webhook URL not configured (needs to be set in dashboard)  
❌ Application not routing calls to your backend  

## Next Steps

1. **Set up ngrok** (for local testing) or deploy your backend
2. **Configure webhook URL** in Voximplant dashboard
3. **Test the call flow** - call your number and check backend logs
4. **Verify webhook receives calls** - you should see logs in your backend terminal

## Troubleshooting

- **If calls still go to old message:** The number might have a cached scenario. Wait a few minutes or contact Voximplant support.
- **If webhook not receiving calls:** Check ngrok is running, webhook URL is correct, and backend is accessible.
- **If 404 errors:** Make sure the route `/api/calls/webhook` exists and is accessible.

