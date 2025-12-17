# Audio Streaming Architecture - Complete Flow

## 🎯 **THE PROBLEM**
AI speaks once, then never hears follow-up audio because inbound audio is not being re-attached after the first TTS response.

## 📁 **KEY FILES THAT CONTROL THE FLOW**

### **1. `routes/calls.js`** - Webhook Handler (Entry Point)
**Path:** `routes/calls.js`  
**Purpose:** Receives Telnyx webhooks, orchestrates call flow

**Critical Flow:**
```
call.initiated → Answer call + Create session (NO AI/STREAM)
call.answered → Start media stream (triggers WebSocket connection)
```

**Key Functions:**
- Line 56-115: `call.initiated` handler - ONLY answers call, creates session
- Line 116-190: `call.answered` handler - Starts media stream via `TelnyxService.startMediaStream()`

**⚠️ CRITICAL:** Must NOT start AI/stream on `call.initiated` - only on `call.answered`

---

### **2. `services/telnyx.js`** - Telnyx API Service
**Path:** `services/telnyx.js`  
**Purpose:** Handles all Telnyx API calls, starts media streaming

**Critical Functions:**
- Line 557-585: `handleCallStart()` - Creates call session (NO AI)
- Line 588-618: `startMediaStream()` - Starts bidirectional media stream
- Line 621-680: `startMediaStreamWithSessionId()` - **THE CRITICAL FUNCTION**

**Line 644-647 (CRITICAL):**
```javascript
const streamPayload = {
  stream_url: streamUrl,
  stream_track: 'both', // MUST be 'both' for bidirectional audio
};
```

**⚠️ CRITICAL:** `stream_track` must be `'both'` (not `'both_tracks'`) for bidirectional audio

---

### **3. `routes/callAudio.js`** - WebSocket Server (Audio Bridge)
**Path:** `routes/callAudio.js`  
**Purpose:** Receives audio from Telnyx, forwards to CallHandler

**Critical Flow:**
```
Telnyx WebSocket connects → Extract callSessionId → Create/Get CallHandler → Initialize
```

**Key Functions:**
- Line 11-607: `setupCallAudioWebSocket()` - Sets up WebSocket server
- Line 27-51: HTTP Upgrade handler - Converts HTTP to WebSocket
- Line 53-607: `wss.on('connection')` - Handles each Telnyx WebSocket connection
- Line 195-218: `ws.on('message')` - Receives audio chunks from Telnyx
- Line 186-194: **Keepalive interval** - Sends ping every 8 seconds

**⚠️ CRITICAL:** 
- Line 195-218: Audio message handler - MUST stay open continuously
- Line 186-194: Keepalive prevents Telnyx timeout
- WebSocket must NEVER close after AI responses

---

### **4. `services/callHandler.js`** - Call Orchestrator (The Bridge)
**Path:** `services/callHandler.js`  
**Purpose:** Bridges Telnyx audio ↔ OpenAI audio

**Critical Flow:**
```
Initialize → Connect to OpenAI → Set up audio WebSocket → Process audio bidirectionally
```

**Key Functions:**
- Line 21-165: `initialize()` - Sets up the entire call handler
- Line 250-280: `handleIncomingAudio()` - **CRITICAL:** Processes audio from Telnyx → OpenAI
- Line 280-305: `handleAudioOutput()` - Processes audio from OpenAI → Telnyx

**Line 250-280 (CRITICAL):**
```javascript
handleIncomingAudio(audioData) {
  // Converts Telnyx PCMU 8kHz → OpenAI PCM16 24kHz
  // Sends to OpenAI continuously
  this.aiService.sendAudio(audioData);
}
```

**⚠️ CRITICAL:** This function must be called continuously for every audio chunk

---

### **5. `services/aiRealtime.js`** - OpenAI Realtime API Client
**Path:** `services/aiRealtime.js`  
**Purpose:** Manages OpenAI Realtime WebSocket, handles AI responses

**Critical Flow:**
```
Connect → Wait for session.created → Send session.update → Configure semantic_vad → Listen continuously
```

**Key Functions:**
- Line 22-355: `connect()` - Establishes OpenAI WebSocket connection
- Line 90-110: Session configuration with `semantic_vad` and `input_audio_transcription`
- Line 213-287: Main message handler - Processes all OpenAI messages
- Line 427-437: `response.done` handler - **CRITICAL:** Must NOT stop listening

**Line 99-105 (CRITICAL - VAD Configuration):**
```javascript
turn_detection: {
  type: 'semantic_vad', // Automatically detects speech
  eagerness: 0.7,
},
input_audio_transcription: {
  model: 'whisper-1', // Helps with speech detection
},
```

**⚠️ CRITICAL:**
- Line 374-398: After `speech_stopped`, we MUST explicitly send `response.create` (semantic_vad does NOT auto-respond)
- Line 427-437: After `response.done`, session continues listening automatically
- WebSocket must NEVER close after responses
- `semantic_vad` detects speech boundaries but requires explicit `response.create` to generate responses

---

## 🔄 **COMPLETE AUDIO FLOW**

### **Inbound Audio (Caller → AI):**
```
1. Caller speaks
   ↓
2. Telnyx captures audio (PCMU 8kHz)
   ↓
3. Telnyx sends to WebSocket: wss://api.tavarios.com/api/calls/{sessionId}/audio
   ↓
4. routes/callAudio.js receives audio chunk
   ↓
5. routes/callAudio.js → services/callHandler.js.handleIncomingAudio()
   ↓
6. services/callHandler.js converts: PCMU 8kHz → PCM16 24kHz
   ↓
7. services/callHandler.js → services/aiRealtime.js.sendAudio()
   ↓
8. services/aiRealtime.js sends to OpenAI Realtime API
   ↓
9. OpenAI processes with semantic_vad (detects speech automatically)
   ↓
10. OpenAI generates response
```

### **Outbound Audio (AI → Caller):**
```
1. OpenAI generates audio (PCM16 24kHz)
   ↓
2. services/aiRealtime.js receives audio chunk
   ↓
3. services/aiRealtime.js → services/callHandler.js.handleAudioOutput()
   ↓
4. services/callHandler.js converts: PCM16 24kHz → PCMU 8kHz
   ↓
5. services/callHandler.js sends to Telnyx WebSocket
   ↓
6. Telnyx WebSocket forwards to caller
   ↓
7. Caller hears AI response
   ↓
8. **LOOP BACK TO STEP 1** (semantic_vad detects next speech automatically)
```

---

## 🐛 **KNOWN ISSUES & FIXES**

### **Issue 1: stream_track Value**
- **File:** `services/telnyx.js` line 646
- **Problem:** Was `'both_tracks'`, should be `'both'`
- **Status:** ✅ FIXED - Changed to `'both'`

### **Issue 2: Starting AI Too Early**
- **File:** `routes/calls.js` line 56-115
- **Problem:** Starting AI on `call.initiated` prevents Telnyx from streaming mic audio
- **Status:** ✅ FIXED - AI only starts on `call.answered`

### **Issue 3: WebSocket Closing After TTS**
- **File:** `routes/callAudio.js` line 195-218
- **Problem:** WebSocket might close or stop listening after AI response
- **Status:** ✅ VERIFIED - WebSocket stays open, added explicit logging

### **Issue 4: Missing Keepalive**
- **File:** `routes/callAudio.js` line 186-194
- **Problem:** Telnyx timeout stops audio stream
- **Status:** ✅ FIXED - Added keepalive every 8 seconds

### **Issue 5: VAD Not Working**
- **File:** `services/aiRealtime.js` line 99-105
- **Problem:** Need VAD to detect when caller speaks again
- **Status:** ✅ CONFIGURED - `semantic_vad` is configured and should work automatically

### **Issue 6: Missing response.create After Speech Stops (CRITICAL)**
- **File:** `services/aiRealtime.js` line 374-378
- **Problem:** Semantic VAD detects speech boundaries but does NOT automatically create responses. We were relying on auto-response which doesn't work reliably.
- **Status:** ✅ FIXED - Now explicitly sends `input_audio_buffer.commit` and `response.create` after `speech_stopped`

---

## 🔍 **DEBUGGING CHECKLIST**

When testing, check these logs in order:

1. **`routes/calls.js`** - Webhook received?
   - Look for: `🔔 WEBHOOK RECEIVED`
   - Check: `call.initiated` → Answer call
   - Check: `call.answered` → Start media stream

2. **`services/telnyx.js`** - Stream started?
   - Look for: `✅ Telnyx streaming_start API call successful`
   - Check: `stream_track: 'both'` in payload

3. **`routes/callAudio.js`** - WebSocket connected?
   - Look for: `=== WS_CONN [connectionId] ===`
   - Look for: `🎧 AUDIO RECEIVED #1, #2, #3...`
   - Check: Keepalive logs every 8 seconds

4. **`services/callHandler.js`** - Handler initialized?
   - Look for: `✅ CallHandler initialized successfully`
   - Check: `🎧 PROCESSING AUDIO #1, #2, #3...`

5. **`services/aiRealtime.js`** - OpenAI connected?
   - Look for: `✅✅✅ OPENAI WEBSOCKET CONNECTED ✅✅✅`
   - Look for: `✅ OPENAI SESSION.updated RECEIVED`
   - Check: `🔵 SENDING AUDIO TO OPENAI #1, #2, #3...`
   - Check: `🔵 OPENAI: Speech started detected`
   - Check: `✅✅✅ SESSION CONTINUES LISTENING` after responses

---

## 🎯 **THE CRITICAL LOOP**

The system must maintain this loop **FOREVER**:

```
Listen (semantic_vad detects speech)
  ↓
Transcribe (whisper-1)
  ↓
Respond (OpenAI generates)
  ↓
Speak (audio output)
  ↓
Listen again (semantic_vad detects next speech)
  ↓
REPEAT
```

**This loop is controlled by:**
- `services/aiRealtime.js` - `semantic_vad` configuration (automatic)
- `routes/callAudio.js` - Continuous WebSocket message handler
- `services/callHandler.js` - Continuous audio processing

**If the loop breaks, check:**
1. Is WebSocket still open? (`ws.readyState === 1`)
2. Is OpenAI session configured? (`sessionConfigured === true`)
3. Is audio still being received? (`🎧 AUDIO RECEIVED` logs)
4. Is audio still being processed? (`🎧 PROCESSING AUDIO` logs)
5. Is keepalive working? (`💓 Keepalive sent` logs)

---

## 📝 **FOR ANOTHER AI TO REVIEW**

**Start here:**
1. Read `routes/calls.js` lines 56-190 (webhook handlers)
2. Read `services/telnyx.js` lines 621-680 (streaming_start)
3. Read `routes/callAudio.js` lines 53-607 (WebSocket handler)
4. Read `services/callHandler.js` lines 250-305 (audio processing)
5. Read `services/aiRealtime.js` lines 90-110 (session config) and 427-437 (response.done)

**Key questions to answer:**
- Why does audio stop after first AI response?
- Is `semantic_vad` actually detecting follow-up speech?
- Is the WebSocket staying open?
- Is audio conversion working correctly?
- Is there a race condition between events?

**Most likely issues:**
1. ~~OpenAI session configuration error (unknown parameter)~~ ✅ FIXED
2. ~~`semantic_vad` not triggering responses~~ ✅ FIXED - Now explicitly sending `response.create`
3. Audio format conversion issue
4. WebSocket lifecycle bug
5. Race condition in initialization

**✅ CRITICAL FIX APPLIED:**
- `input_audio_buffer.speech_stopped` now explicitly triggers `response.create`
- This was the root cause: semantic_vad detects speech but doesn't auto-respond
