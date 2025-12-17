# VAPI-Style Media Streaming Setup Guide

This guide walks you through the 4 critical steps to make the new Media Streaming architecture ready for production.

---

## Step 1: Set Environment Variable for Media Streaming WebSocket URL

The Media Streaming WebSocket endpoint requires a public domain with `https://` prefix.

### For Railway (Production):

1. **Go to Railway Dashboard**
   - Navigate to your service: https://railway.app/dashboard
   - Click on your `tavari-ai-phone-agent` service

2. **Add Environment Variable**
   - Click on the **"Variables"** tab
   - Click **"+ New Variable"**
   - **Name:** `RAILWAY_PUBLIC_DOMAIN`
   - **Value:** Your Railway public domain with `https://` prefix
     - Example: `https://api.tavarios.com` (if you have a custom domain)
     - OR: `https://your-service-name.up.railway.app` (Railway's default domain)
   - Click **"Add"**

3. **Verify the Variable**
   - Make sure `RAILWAY_PUBLIC_DOMAIN` is set (not `SERVER_URL` or `WEBHOOK_BASE_URL`)
   - The value MUST start with `https://` (required for `wss://` WebSocket)

### For Local Development:

1. **Add to your `.env` file:**
   ```env
   RAILWAY_PUBLIC_DOMAIN=https://api.tavarios.com
   # OR if using ngrok for testing:
   # RAILWAY_PUBLIC_DOMAIN=https://your-ngrok-url.ngrok.io
   ```

2. **If using ngrok for local testing:**
   ```bash
   # Start ngrok
   ngrok http 5001
   
   # Copy the https:// URL and add to .env
   RAILWAY_PUBLIC_DOMAIN=https://abc123.ngrok.io
   ```

### Verify It's Working:

After setting the variable, restart your server and check the logs. When a call is answered, you should see:
```
🔵 Media Streaming WebSocket URL: wss://api.tavarios.com/media-stream-ws?call_id=...
```

**✅ Step 1 Complete when:** The log shows the correct `wss://` URL with your domain.

---

## Step 2: Test Telnyx Media Streaming API Call

The code has been configured with the correct parameters based on your specifications. The parameters are:

```json
{
  "stream_url": "wss://...",
  "stream_track": "both_tracks",
  "stream_bidirectional_mode": "rtp",
  "stream_bidirectional_codec": "L16",
  "stream_bidirectional_sampling_rate": 24000,
  "stream_bidirectional_target_legs": "opposite"
}
```

### Test the API Call:

1. **Make a test call** to your Telnyx number
2. **Check Railway logs** for the API request:
   ```
   🔵 Making Telnyx Media Streaming API request
   🔵 Endpoint: /calls/{id}/actions/streaming_start
   🔵 Payload: { ... }
   ```

3. **If the API call succeeds:**
   - You'll see: `✅ Telnyx Media Streaming started successfully`
   - Proceed to Step 4

4. **If you see an error:**
   - The enhanced error handling will show exactly which parameter is invalid
   - Look for: `❌ Invalid parameter: {parameter_name}`
   - The error will include the exact field name Telnyx expects
   - Update `services/telnyx.js` line 639-645 with the correct parameter names

**✅ Step 2 Complete when:** The API call succeeds (you see `✅ Telnyx Media Streaming started successfully` in logs).

---

## Step 3: Remove Old WebSocket Endpoint (Optional but Recommended)

The old `/api/calls/{id}/audio` endpoint is no longer used. You can remove it to avoid confusion.

### Option A: Delete the File (Recommended)

```bash
# Delete the old endpoint file
rm routes/callAudio.js
```

### Option B: Keep It (If You Want to Keep It for Reference)

The old endpoint won't interfere since `server.js` now uses `setupMediaStreamWebSocket()` instead of `setupCallAudioWebSocket()`. You can leave it for now.

**✅ Step 3 Complete when:** You've either deleted `routes/callAudio.js` or decided to keep it for reference.

---

## Step 4: Test the Complete Flow

Test the entire Media Streaming flow to ensure everything works.

### 4.1: Verify Server Starts Correctly

```bash
# Start the server
npm start

# Check logs for:
✅ Media Streaming WebSocket server created
🚀 Tavari AI Phone Agent server running on port 5001
```

### 4.2: Make a Test Call

1. **Call your Telnyx phone number**
2. **Watch Railway logs** for this sequence:

   **Expected Log Sequence:**
   ```
   🔵 [requestId] CALL.INITIATED EVENT
   ✅ [requestId] Call answered successfully
   🔵 [requestId] Starting Media Streaming...
   ✅ [requestId] Media Streaming started - Telnyx will connect to /media-stream-ws
   🔵 [connectionId] Media Streaming WebSocket connected - call_id: {callId}
   ✅ [connectionId] Session initialized
   ✅ [connectionId] Telnyx WebSocket set on session
   🎧 Audio frame #1 received from Telnyx
   📤 Audio frame #1 sent to OpenAI
   🔊 Audio frame #1 received from OpenAI
   📤 Audio frame #1 sent to Telnyx
   ```

### 4.3: Verify Audio Flow

**What to Check:**

1. **Telnyx Connects:**
   - Look for: `🔵 Media Streaming WebSocket connected`
   - If missing: Check `RAILWAY_PUBLIC_DOMAIN` is set correctly

2. **Audio Received from Telnyx:**
   - Look for: `🎧 Audio frame #1 received from Telnyx`
   - If missing: Check Telnyx Media Streaming API call succeeded

3. **Audio Sent to OpenAI:**
   - Look for: `📤 Audio frame #1 sent to OpenAI`
   - If missing: Check OpenAI API key and Realtime API access

4. **Audio Received from OpenAI:**
   - Look for: `🔊 Audio frame #1 received from OpenAI`
   - If missing: Check OpenAI session configuration

5. **Audio Sent Back to Telnyx:**
   - Look for: `📤 Audio frame #1 sent to Telnyx`
   - If missing: Check WebSocket is still open

### 4.4: Test Interruptions

1. **While AI is speaking, start talking**
2. **AI should stop immediately** (no dead air)
3. **AI should respond to your interruption**

### 4.5: Common Issues & Fixes

**Issue: "RAILWAY_PUBLIC_DOMAIN or SERVER_URL must be set"**
- **Fix:** Set `RAILWAY_PUBLIC_DOMAIN` in Railway dashboard (Step 1)

**Issue: "Failed to start media streaming: Invalid parameter"**
- **Fix:** Update parameters in `services/telnyx.js` (Step 2)

**Issue: "Media Streaming WebSocket connected" but no audio frames**
- **Fix:** Check Telnyx Media Streaming API parameters are correct (Step 2)

**Issue: "OpenAI WebSocket error" or "Connection timeout"**
- **Fix:** Verify `OPENAI_API_KEY` is set and has Realtime API access

**Issue: Audio frames received but caller hears nothing**
- **Fix:** Check audio conversion - verify `convertOpenAIToTelnyx()` is working

### 4.6: Success Criteria

**✅ Step 4 Complete when ALL of these are true:**

- [ ] Call rings and is answered
- [ ] AI speaks without dead air (no long pauses)
- [ ] Caller can interrupt the AI mid-sentence
- [ ] AI responds immediately to interruptions
- [ ] No `/actions/speak` API calls appear in logs
- [ ] Audio frames flow continuously: Telnyx → OpenAI → Telnyx
- [ ] Call ends cleanly and session is cleaned up

---

## Quick Verification Checklist

Before going live, verify:

- [ ] `RAILWAY_PUBLIC_DOMAIN` is set in Railway dashboard
- [ ] Telnyx Media Streaming API parameters are correct
- [ ] Test call shows audio frames flowing bidirectionally
- [ ] No errors in logs during a test call
- [ ] Interruptions work (AI stops when caller speaks)
- [ ] Old endpoint removed (optional)

---

## Next Steps After Setup

Once all 4 steps are complete:

1. **Monitor logs** during first few real calls
2. **Check audio quality** - adjust if needed
3. **Verify usage tracking** - check `usage_minutes` table updates
4. **Test with multiple concurrent calls** if needed

---

## Need Help?

If you encounter issues:

1. **Check Railway logs** - Look for error messages
2. **Verify environment variables** - All required vars are set
3. **Test Telnyx API directly** - Use Postman/curl to test `streaming_start`
4. **Check OpenAI API access** - Verify Realtime API is enabled on your account

