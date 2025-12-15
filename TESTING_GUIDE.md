# Testing Guide - Step by Step

## ✅ Phase 1: Basic Call Flow (COMPLETE)
**Status:** ✅ WORKING - You heard the test greeting!

**What it proved:**
- ✅ Webhooks work
- ✅ Call answering works
- ✅ Telnyx `speak` action works
- ✅ Audio output works

**How to test:**
1. Set `SIMPLE_TEST_MODE=true` in Railway
2. Make a call
3. You should hear: "Hello! This is a test. Can you hear me?..."

---

## 🧪 Phase 2: Audio Streaming Test (NEXT)
**Goal:** Prove we can receive audio from caller (no AI processing)

**What it will prove:**
- ✅ Media stream starts
- ✅ WebSocket connection works
- ✅ Audio chunks are received
- ❌ If this fails, problem is in streaming/WebSocket setup

**How to test:**
1. Set `STREAMING_TEST_MODE=true` in Railway (remove `SIMPLE_TEST_MODE` or set to `false`)
2. Make a call
3. **Speak into the phone** - say "Hello, can you hear me?"
4. Check logs for: `🎧 AUDIO RECEIVED #1, #2, #3...`
5. **If you see audio chunks** → Streaming works! Move to Phase 3
6. **If you don't see chunks** → Problem is in streaming/WebSocket

**Expected logs:**
```
🧪 STREAMING TEST: Audio chunk #1 received (160 bytes)
🧪 STREAMING TEST: Audio chunk #2 received (160 bytes)
🧪 STREAMING TEST: Audio chunk #3 received (160 bytes)
...
```

---

## Phase 3: OpenAI Connection Test (After Phase 2 works)
**Goal:** Connect to OpenAI and get a text response (no audio)

**How to test:**
- Create standalone test script
- Connect to OpenAI WebSocket
- Send text message
- Get text response
- If this works → OpenAI connection is fine

---

## Phase 4: Audio → OpenAI (One Direction)
**Goal:** Send audio to OpenAI, get transcript back

**How to test:**
- Start streaming
- Receive audio
- Convert format
- Send to OpenAI
- Get transcript
- If this works → Audio processing works

---

## Phase 5: Full Bidirectional Flow
**Goal:** Complete conversation with AI

**How to test:**
- All previous phases working
- Enable full AI mode
- Test complete conversation

---

## Current Status

✅ **Phase 1: COMPLETE** - Basic call flow works
🧪 **Phase 2: READY TO TEST** - Set `STREAMING_TEST_MODE=true`

**Next Step:** Test Phase 2 to see if streaming works
