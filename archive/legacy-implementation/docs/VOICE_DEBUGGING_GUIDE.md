# Voice Debugging Guide

## Overview
This guide helps you debug why voice isn't working in the call system. The logging has been optimized to focus on critical audio flow points.

## Audio Flow Path

```
Telnyx → WebSocket → handleIncomingAudio → aiService.sendAudio → OpenAI
                                                                    ↓
Telnyx ← WebSocket ← sendAudioToVoximplant ← onAudioOutput ← OpenAI
```

## Key Log Markers

### 1. WebSocket Connection
- `🔵 WebSocket connection from Telnyx` - Telnyx connected
- `✅ Telnyx connected for call: {callSessionId}` - Connection established

### 2. OpenAI Connection
- `✅ [OPENAI] WebSocket connected to OpenAI Realtime API` - OpenAI connected
- `🔵 [OPENAI] Waiting for session.created...` - Waiting for session
- `✅ [OPENAI] Session configured successfully` - Session ready

### 3. Audio Input (Telnyx → OpenAI)
- `🎧 [AUDIO IN] Chunk #X from Telnyx (X bytes)` - Audio received from Telnyx
- `🔵 [OPENAI IN] First audio conversion: X bytes (PCMU 8kHz) → PCM16 24kHz` - First conversion
- `❌ [OPENAI IN] WARNING: Audio appears to be silence` - Audio is silent (problem!)

### 4. OpenAI Processing
- `🔵 [OPENAI] Response created - AI will start speaking` - AI is responding
- `🔊 [OPENAI] Audio delta #X received` - Audio coming from OpenAI
- `🔊 [OPENAI OUT] Audio chunk #X from OpenAI (X bytes)` - Audio ready to send

### 5. Audio Output (OpenAI → Telnyx)
- `📤 [AUDIO OUT] Attempt #X - WebSocket: OPEN (1), ready: true` - Ready to send
- `🔄 [AUDIO OUT] First conversion: X bytes (PCM16 24kHz) → X bytes (PCMU 8kHz)` - Conversion
- `✅ [AUDIO OUT] Sent to Telnyx #X (X bytes)` - Successfully sent

## Common Issues & Solutions

### Issue 1: No Audio from Telnyx
**Symptoms:**
- No `🎧 [AUDIO IN]` logs
- OpenAI WebSocket shows `Session not configured yet`

**Solutions:**
1. Check if Telnyx WebSocket is connected
2. Verify Telnyx streaming is started
3. Check if `handleIncomingAudio` is being called

### Issue 2: OpenAI Not Receiving Audio
**Symptoms:**
- `🎧 [AUDIO IN]` logs appear but no OpenAI processing
- `⚠️ [OPENAI IN] Session not configured yet` persists

**Solutions:**
1. Check OpenAI WebSocket connection status
2. Verify session configuration completed
3. Check for silence warnings: `❌ [OPENAI IN] WARNING: Audio appears to be silence`

### Issue 3: OpenAI Not Responding
**Symptoms:**
- Audio going to OpenAI but no `🔵 [OPENAI] Response created` logs
- No `🔊 [OPENAI] Audio delta` logs

**Solutions:**
1. Check if greeting was sent: `🔵 [OPENAI] Sending initial greeting`
2. Verify semantic_vad is enabled in session config
3. Check if `response.create` is being triggered after speech stops

### Issue 4: Audio Not Reaching Telnyx
**Symptoms:**
- `🔊 [OPENAI OUT]` logs appear but no `✅ [AUDIO OUT] Sent to Telnyx` logs
- `❌ [AUDIO OUT] WebSocket not ready` errors

**Solutions:**
1. Check WebSocket state: Should be `OPEN (1)`
2. Verify `audioWebSocket` is set on CallHandler
3. Check for conversion errors

### Issue 5: onAudioOutput Callback Not Set
**Symptoms:**
- `❌ [OPENAI OUT] onAudioOutput callback NOT SET! Audio will be lost`

**Solutions:**
1. Verify `this.aiService.onAudioOutput` is set in CallHandler.initialize()
2. Check if CallHandler initialization completed successfully
3. Look for `✅ [CALL HANDLER] Audio output callback registered` log

## Debugging Steps

1. **Check Connection Status**
   ```
   Look for:
   - ✅ Telnyx connected
   - ✅ OpenAI connected
   - ✅ Session configured
   ```

2. **Check Audio Flow**
   ```
   Look for sequence:
   - 🎧 [AUDIO IN] (Telnyx → OpenAI)
   - 🔵 [OPENAI] Response created
   - 🔊 [OPENAI OUT] (OpenAI → Callback)
   - ✅ [AUDIO OUT] (Callback → Telnyx)
   ```

3. **Check for Errors**
   ```
   Look for:
   - ❌ [OPENAI IN] errors
   - ❌ [AUDIO OUT] errors
   - ❌ [OPENAI] Session errors
   ```

4. **Check WebSocket States**
   ```
   OpenAI WebSocket: Should be OPEN (1)
   Telnyx WebSocket: Should be OPEN (1)
   ```

## Log Format

All logs now use consistent prefixes:
- `[AUDIO IN]` - Audio coming from Telnyx
- `[OPENAI IN]` - Audio/data going to OpenAI
- `[OPENAI]` - OpenAI processing/events
- `[OPENAI OUT]` - Audio coming from OpenAI
- `[AUDIO OUT]` - Audio going to Telnyx
- `[CALL HANDLER]` - CallHandler operations
- `[TRANSCRIPT]` - Transcript events

## Quick Health Check

Run through this checklist when debugging:

- [ ] Telnyx WebSocket connected
- [ ] OpenAI WebSocket connected
- [ ] Session configured
- [ ] Audio chunks received from Telnyx
- [ ] Audio chunks sent to OpenAI
- [ ] OpenAI responding (response.created)
- [ ] Audio chunks received from OpenAI
- [ ] onAudioOutput callback set
- [ ] Audio chunks sent to Telnyx
- [ ] WebSocket states are OPEN (1)

If any step fails, check the corresponding log section above.






