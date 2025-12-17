# Telnyx WebSocket Connection Troubleshooting

## Problem
Telnyx sends `streaming.started` webhook, but **never connects to our WebSocket server**. No `=== WS_CONN [conn_...] ===` logs appear.

## Current Status
- ✅ WebSocket server is set up correctly (`routes/callAudio.js`)
- ✅ Server is listening on Railway (`api.tavarios.com`)
- ✅ Telnyx `streaming_start` API call succeeds
- ✅ Telnyx sends `streaming.started` webhook
- ❌ **Telnyx never connects to our WebSocket URL**

## WebSocket URL Being Sent
```
wss://api.tavarios.com/api/calls/{callSessionId}/audio
```

## Possible Causes

### 1. Railway WebSocket Support
Railway should support WebSockets, but verify:
- Check Railway logs for any WebSocket-related errors
- Verify Railway isn't blocking WebSocket upgrade requests
- Check if Railway requires special configuration for WebSockets

### 2. SSL/TLS Certificate Issues
- Telnyx might be rejecting the SSL certificate
- Check if `api.tavarios.com` has a valid SSL certificate
- Verify the certificate chain is complete

### 3. WebSocket Path/Format Issues
- Telnyx might expect a different WebSocket URL format
- Check Telnyx documentation for exact WebSocket URL requirements
- Verify the path `/api/calls/{id}/audio` is correct

### 4. Network/Firewall Issues
- Railway might be blocking incoming WebSocket connections
- Telnyx might not be able to reach Railway's infrastructure
- Check Railway firewall/security settings

### 5. Telnyx Configuration
- Verify Telnyx Voice API Application settings
- Check if there are any restrictions on WebSocket connections
- Verify the `stream_url` format matches Telnyx requirements

## Diagnostic Steps

### Step 1: Test WebSocket Server Accessibility
Try connecting to the WebSocket server manually:
```bash
# Using wscat (install: npm install -g wscat)
wscat -c wss://api.tavarios.com/api/calls/test-connection/audio
```

If this works, the WebSocket server is accessible. If not, there's a Railway/network issue.

### Step 2: Check Railway Logs
Look for:
- WebSocket upgrade requests
- Any errors related to WebSocket connections
- Network connection attempts

### Step 3: Verify Telnyx WebSocket Requirements
Check Telnyx documentation for:
- Required WebSocket URL format
- Required headers
- Authentication requirements
- Any special configuration needed

### Step 4: Check Telnyx Dashboard
In Telnyx dashboard:
- Look for any errors in the call logs
- Check if there are WebSocket connection errors
- Verify the `stream_url` is being sent correctly

### Step 5: Test with ngrok (Local Testing)
If possible, test locally with ngrok to see if the issue is Railway-specific:
```bash
ngrok http 5001
# Use ngrok URL in Telnyx stream_url
```

## Next Steps

1. **Verify WebSocket server is accessible** - Test with `wscat` or similar tool
2. **Check Railway configuration** - Ensure WebSockets are enabled
3. **Review Telnyx logs** - Check Telnyx dashboard for connection errors
4. **Test with alternative WebSocket library** - Verify our WebSocket server implementation
5. **Contact Telnyx support** - If all else fails, ask Telnyx why they're not connecting

## Related Files
- `routes/callAudio.js` - WebSocket server setup
- `services/telnyx.js` - Telnyx API integration and stream URL generation
- `server.js` - HTTP server and WebSocket server initialization

