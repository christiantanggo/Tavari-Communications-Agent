// server.js
// Tavari Voice Agent - Telnyx Media Streaming (bidirectional) + OpenAI Realtime (g711_ulaw)

import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { URL } from "url";

dotenv.config();

const PORT = Number(process.env.PORT || 5001);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const TELNYX_API_KEY = (process.env.TELNYX_API_KEY || "").trim();

// IMPORTANT: set this in Railway as either:
//   tavari-voice-agent-server-production.up.railway.app
// or
//   https://tavari-voice-agent-server-production.up.railway.app
const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;

if (!OPENAI_API_KEY || !TELNYX_API_KEY) {
  console.error("❌ Missing required env vars: OPENAI_API_KEY, TELNYX_API_KEY");
  console.error(`   OPENAI_API_KEY: ${OPENAI_API_KEY ? "SET" : "NOT SET"}`);
  console.error(`   TELNYX_API_KEY: ${TELNYX_API_KEY ? "SET" : "NOT SET"}`);
  process.exit(1);
}

function normalizeHttpsBase(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function httpsToWss(url) {
  return url.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
}

const PUBLIC_HTTPS_BASE = normalizeHttpsBase(RAILWAY_PUBLIC_DOMAIN) || `http://localhost:${PORT}`;
const PUBLIC_WSS_BASE = httpsToWss(PUBLIC_HTTPS_BASE);

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "tavari-voice-agent",
  });
});

// callId -> session
// session: { callControlId, openaiWs, telnyxWs, streamId, ready }
const sessions = new Map();

/**
 * TELNYX WEBHOOK
 */
app.post("/webhook", async (req, res) => {
  try {
    // Telnyx sends { data: { event_type, payload } } (common format)
    const data = req.body?.data;
    const eventType = data?.event_type;
    const payload = data?.payload || data?.data?.payload || data?.payload;

    const callControlId = payload?.call_control_id;
    const callSessionId = payload?.call_session_id;
    const callId = callControlId || callSessionId;

    console.log(`📞 Telnyx event: ${eventType} for call ${callId}`);

    // Always 200 to Telnyx
    res.status(200).send("OK");

    if (!callId) return;

    switch (eventType) {
      case "call.initiated":
        await handleCallInitiated(payload, callId);
        break;

      case "call.answered":
        await handleCallAnswered(payload, callId);
        break;

      case "call.hangup":
      case "call.bridged":
      case "call.ended":
        await handleCallHangup(callId);
        break;

      default:
        break;
    }
  } catch (err) {
    console.error("❌ Error handling webhook:", err?.response?.data || err);
    // still respond 200 already attempted; nothing else to do
  }
});

async function handleCallInitiated(payload, callId) {
  const callControlId = payload?.call_control_id;
  if (!callControlId) return;

  console.log(`📞 Call initiated: ${callControlId}`);

  // Create/update session
  sessions.set(callId, {
    callControlId,
    openaiWs: null,
    telnyxWs: null,
    streamId: null,
    ready: false,
    audioFrameCount: 0,
    audioOutFrameCount: 0,
    transcriptLogCount: 0,
    messageCount: 0,
    transcriptText: "", // For collecting transcript for Telnyx TTS
    lastTtsText: "", // Track last TTS to prevent duplicates
  });

  // Answer immediately
  await telnyxAnswer(callControlId);

  // Start OpenAI session now
  await startOpenAIRealtime(callId);
}

async function handleCallAnswered(payload, callId) {
  const callControlId = payload?.call_control_id;
  if (!callControlId) return;

  console.log(`✅ Call answered: ${callControlId}`);

  // Ensure session exists
  if (!sessions.has(callId)) {
    sessions.set(callId, {
      callControlId,
      openaiWs: null,
      telnyxWs: null,
      streamId: null,
      ready: false,
      audioFrameCount: 0,
      audioOutFrameCount: 0,
      transcriptLogCount: 0,
      messageCount: 0,
      transcriptText: "",
      lastTtsText: "", // Track last TTS to prevent duplicates
    });
  }

  // Start media stream (bidirectional) once OpenAI is connected (or start now; Telnyx will connect anyway)
  await startTelnyxBidirectionalMediaStream(callId, callControlId);
}

async function handleCallHangup(callId) {
  console.log(`📴 Call hangup: ${callId}`);
  const s = sessions.get(callId);
  if (!s) return;

  try {
    if (s.telnyxWs && s.telnyxWs.readyState === WebSocket.OPEN) s.telnyxWs.close();
  } catch {}
  try {
    if (s.openaiWs && s.openaiWs.readyState === WebSocket.OPEN) s.openaiWs.close();
  } catch {}

  sessions.delete(callId);
  console.log(`🗑️  Removed session for ${callId}`);
}

/**
 * TELNYX API HELPERS
 */
async function telnyxAnswer(callControlId) {
  try {
    await axios.post(
      `https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`,
      {},
      { headers: telnyxHeaders() }
    );
    console.log(`✅ Call answered: ${callControlId}`);
  } catch (err) {
    console.error(`❌ Failed to answer call ${callControlId}:`, err?.response?.status, err?.response?.data || err?.message);
    throw err;
  }
}

function telnyxHeaders() {
  // Sanitize API key - remove any whitespace, newlines, or invalid characters
  const apiKey = (TELNYX_API_KEY || "").trim().replace(/[\r\n]/g, "");
  
  if (!apiKey) {
    throw new Error("TELNYX_API_KEY is not set or is empty");
  }
  
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function startTelnyxBidirectionalMediaStream(callId, callControlId) {
  // Telnyx will open a WebSocket to THIS URL:
  const streamUrl = `${PUBLIC_WSS_BASE}/media-stream-ws?call_id=${encodeURIComponent(callId)}`;

  console.log(`🚀 Starting Telnyx media streaming (bidirectional)`);
  console.log(`🚀 Using media stream URL: ${streamUrl}`);

  try {
    await axios.post(
      `https://api.telnyx.com/v2/calls/${callControlId}/actions/streaming_start`,
      {
        stream_url: streamUrl,
        stream_track: "both_tracks",
        // Bidirectional RTP (per Telnyx docs)
        stream_bidirectional_mode: "rtp",
        // Use PCMU (G.711 ulaw) to match OpenAI g711_ulaw
        stream_bidirectional_codec: "PCMU",
      },
      { headers: telnyxHeaders() }
    );

    console.log(`🎵 Media streaming started: ${callControlId}`);
  } catch (err) {
    console.error(
      "❌ Telnyx streaming_start error:",
      err?.response?.status,
      err?.response?.data || err?.message
    );
  }
}

/**
 * OPENAI REALTIME (WebSocket) — g711_ulaw in/out
 */
async function startOpenAIRealtime(callId) {
  console.log(`🤖 Starting OpenAI Realtime session for ${callId}...`);

  const ws = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  const s = sessions.get(callId) || {
    callControlId: null,
    openaiWs: null,
    telnyxWs: null,
    streamId: null,
    ready: false,
    audioFrameCount: 0,
    audioOutFrameCount: 0,
    transcriptLogCount: 0,
    messageCount: 0,
    transcriptText: "",
    lastTtsText: "",
  };
  s.openaiWs = ws;
  sessions.set(callId, s);

  ws.on("open", () => {
    console.log(`✅ OpenAI Realtime WebSocket connected for ${callId}`);

    // Configure session - keep both modalities but we'll extract text for Telnyx TTS
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"], // Keep both - we need audio for input, text for output extraction
          instructions:
            "You are Tavari's phone receptionist. When a call starts, immediately greet the caller by saying: 'Hello! Thanks for calling Tavari. How can I help you today?' Be concise, friendly, and ask one question at a time.",
          voice: "alloy",
          input_audio_format: "g711_ulaw", // We still receive audio from Telnyx
          output_audio_format: "g711_ulaw", // Set to match Telnyx (but we'll use Telnyx TTS instead)
          input_audio_transcription: { model: "whisper-1" }, // Transcribe input audio
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          temperature: 0.7,
          max_response_output_tokens: 800,
        },
      })
    );

    s.ready = true;
    sessions.set(callId, s);

    // Trigger initial greeting by creating a response after a short delay
    // This ensures the session is fully configured first
    setTimeout(() => {
      const session = sessions.get(callId);
      if (session?.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
        console.log(`👋 [${callId}] Triggering initial greeting...`);
        session.openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text"], // Only generate text for Telnyx TTS
            },
          })
        );
      }
    }, 500); // Small delay to ensure session is ready
    
    console.log(`✅ OpenAI session ready for ${callId}`);
  });

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Log first few messages to see what we're getting
    if (!s.messageCount) s.messageCount = 0;
    s.messageCount++;
    if (s.messageCount <= 20) {
      console.log(`📨 [${callId}] OpenAI message #${s.messageCount}: type=${msg.type}`);
      // Log full message for first 10 messages to see structure
      if (s.messageCount <= 10) {
        console.log(`📋 [${callId}] Full message:`, JSON.stringify(msg, null, 2));
      }
    }
    
    // Always log audio-related messages
    if (msg.type && msg.type.includes("audio")) {
      console.log(`🔊 [${callId}] Audio event: ${msg.type}`, msg.delta ? `(${msg.delta.length} bytes)` : "");
    }

    // NOTE: We're NOT sending OpenAI audio to Telnyx - we use Telnyx TTS instead
    // OpenAI audio is ignored since we extract text and send to Telnyx /actions/speak
    if (msg.type === "response.audio.delta" && msg.delta) {
      // Log that we're ignoring OpenAI audio (using Telnyx TTS instead)
      if (!s.audioOutFrameCount) s.audioOutFrameCount = 0;
      s.audioOutFrameCount++;
      if (s.audioOutFrameCount === 1) {
        console.log(`🔇 [${callId}] Ignoring OpenAI audio (using Telnyx TTS instead)`);
      }
      return;
    }
    
    // Collect transcript text for Telnyx TTS - try multiple event types
    if ((msg.type === "response.audio_transcript.delta" || msg.type === "response.text.delta") && msg.delta) {
      const session = sessions.get(callId);
      if (session) {
        if (!session.transcriptText) session.transcriptText = "";
        session.transcriptText += msg.delta;
        // Log first transcript chunk
        if (!s.transcriptLogCount) s.transcriptLogCount = 0;
        s.transcriptLogCount++;
        if (s.transcriptLogCount <= 1) {
          console.log(`💬 [${callId}] Transcript delta: ${msg.delta}`);
        }
      }
    }
    
    // Check for text in conversation items - multiple event types
    if (msg.type === "conversation.item.created" || 
        msg.type === "conversation.item.input_audio_transcription.completed" ||
        msg.type === "conversation.item.output_item.created" ||
        msg.type === "conversation.item.output_item.completed") {
      const session = sessions.get(callId);
      if (session && msg.item) {
        // Log the full item structure to debug
        console.log(`📋 [${callId}] Conversation item event: ${msg.type}`);
        console.log(`📋 [${callId}] Item structure:`, JSON.stringify(msg.item, null, 2));
        
        // Check multiple possible locations for assistant text
        const role = msg.item?.role;
        const contents = msg.item?.content || msg.item?.output_item?.content || [];
        
        // Look for text in content array
        let itemText = null;
        for (const content of contents) {
          if (content.type === "text" && content.text) {
            itemText = content.text;
            break;
          } else if (content.type === "input_text" && content.text) {
            // This is user input, skip
            continue;
          } else if (content.text) {
            itemText = content.text;
            break;
          }
        }
        
        // Also check top-level fields
        if (!itemText) {
          itemText = msg.item?.text || msg.item?.transcript || msg.item?.output_item?.text;
        }
        
        // If this is an assistant message, send to TTS (only if we haven't sent this text already)
        if (itemText && (role === "assistant" || msg.type.includes("output"))) {
          // Prevent duplicate TTS requests
          if (itemText.trim() && itemText.trim() !== session.lastTtsText?.trim()) {
            console.log(`💬 [${callId}] Found assistant text in conversation item: "${itemText}"`);
            if (session?.callControlId) {
              session.lastTtsText = itemText.trim();
              console.log(`🔊 [${callId}] Sending assistant text to Telnyx TTS: "${itemText}"`);
              axios.post(
                `https://api.telnyx.com/v2/calls/${session.callControlId}/actions/speak`,
                {
                  payload: itemText.trim(),
                  voice: "Polly.Joanna",
                  language: "en-US",
                  premium: true,
                },
                { headers: telnyxHeaders() }
              ).then(() => {
                console.log(`✅ [${callId}] Telnyx TTS started from conversation item`);
              }).catch((error) => {
                console.error(`❌ [${callId}] Error sending to Telnyx TTS:`, error?.response?.data || error?.message);
                // Reset on error so we can retry
                if (session.lastTtsText === itemText.trim()) {
                  session.lastTtsText = "";
                }
              });
            }
          }
        } else if (itemText && role === "user") {
          console.log(`👤 [${callId}] User input detected: "${itemText}"`);
        }
      }
    }
    
    // Handle response text completion events
    if (msg.type === "response.audio_transcript.done" || msg.type === "response.text.done") {
      const session = sessions.get(callId);
      const transcript = (msg.transcript || msg.text || session?.transcriptText || "").trim();
      
      if (transcript) {
        console.log(`✅ [${callId}] Response text/transcript complete: "${transcript}"`);
        
        // Use Telnyx /actions/speak for audio output (only if we haven't sent this already)
        if (transcript && session?.callControlId && transcript !== session.lastTtsText?.trim()) {
          session.lastTtsText = transcript;
          console.log(`🔊 [${callId}] Sending text to Telnyx TTS: "${transcript}"`);
          axios.post(
            `https://api.telnyx.com/v2/calls/${session.callControlId}/actions/speak`,
            {
              payload: transcript,
              voice: "Polly.Joanna", // You can make this configurable
              language: "en-US",
              premium: true,
            },
            { headers: telnyxHeaders() }
          ).then(() => {
            console.log(`✅ [${callId}] Telnyx TTS started`);
          }).catch((error) => {
            console.error(`❌ [${callId}] Error sending to Telnyx TTS:`, error?.response?.data || error?.message);
            // Reset on error so we can retry
            if (session.lastTtsText === transcript) {
              session.lastTtsText = "";
            }
          });
        } else if (transcript === session?.lastTtsText?.trim()) {
          console.log(`⏭️ [${callId}] Skipping duplicate TTS for: "${transcript}"`);
        }
      }
      
      // Clear transcript for next response
      if (session) session.transcriptText = "";
    }
    
    // Log response creation/start events
    if (msg.type === "response.created") {
      console.log(`🎬 [${callId}] OpenAI response created`);
      // Initialize transcript text
      const session = sessions.get(callId);
      if (session) session.transcriptText = "";
    }
    
    if (msg.type === "response.audio_started") {
      console.log(`🔊 [${callId}] OpenAI audio started (but we'll use Telnyx TTS instead)`);
    }
    
    if (msg.type === "response.done") {
      console.log(`✅ [${callId}] OpenAI response done`);
      // Check if response has text content we can use
      const session = sessions.get(callId);
      if (session && msg.response) {
        // Log the full response object to see what's available
        console.log(`📋 [${callId}] Response object:`, JSON.stringify(msg.response, null, 2));
        
        // Try to extract text from response - check multiple possible locations
        const text = msg.response?.output?.[0]?.text || 
                     msg.response?.text || 
                     msg.response?.transcript ||
                     msg.response?.content?.[0]?.text ||
                     (msg.response?.output && Array.isArray(msg.response.output) && msg.response.output.length > 0 ? msg.response.output[0] : null);
        
        const textValue = typeof text === "string" ? text.trim() : (text?.text || "").trim();
        if (textValue && textValue !== session.lastTtsText?.trim()) {
          console.log(`💬 [${callId}] Found text in response.done: "${textValue}"`);
          // Use this text for Telnyx TTS (only if not already sent)
          if (session?.callControlId) {
            session.lastTtsText = textValue;
            console.log(`🔊 [${callId}] Sending text to Telnyx TTS from response.done: "${textValue}"`);
            axios.post(
              `https://api.telnyx.com/v2/calls/${session.callControlId}/actions/speak`,
              {
                payload: textValue,
                voice: "Polly.Joanna",
                language: "en-US",
                premium: true,
              },
              { headers: telnyxHeaders() }
            ).then(() => {
              console.log(`✅ [${callId}] Telnyx TTS started from response.done`);
            }).catch((error) => {
              console.error(`❌ [${callId}] Error sending to Telnyx TTS:`, error?.response?.data || error?.message);
              // Reset on error so we can retry
              if (session.lastTtsText === textValue) {
                session.lastTtsText = "";
              }
            });
          }
        } else if (textValue && textValue === session?.lastTtsText?.trim()) {
          console.log(`⏭️ [${callId}] Skipping duplicate TTS from response.done`);
        } else {
          console.log(`⚠️ [${callId}] No text found in response.done`);
        }
      }
    }
    
    // Log any errors or unexpected types
    if (msg.type === "error") {
      console.error(`❌ [${callId}] OpenAI error:`, JSON.stringify(msg, null, 2));
    }
  });

  ws.on("close", () => {
    console.log(`🔌 OpenAI WebSocket closed for ${callId}`);
  });

  ws.on("error", (e) => {
    console.error(`❌ OpenAI WebSocket error for ${callId}:`, e?.message || e);
  });
}

/**
 * TELNYX MEDIA STREAM WEBSOCKET ENDPOINT
 * Telnyx connects to wss://YOUR_DOMAIN/media-stream-ws?call_id=...
 * We receive JSON:
 *  - { event: "connected" }
 *  - { event: "start", start: {...}, stream_id: "...", ... }
 *  - { event: "media", media: { payload: "base64 RTP payload" } }
 *  - { event: "stop" }
 */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/media-stream-ws" });

wss.on("connection", (socket, req) => {
  console.log("🔌 Telnyx WebSocket connection established");
  console.log(`🔍 WebSocket URL: ${req.url}`);

  const url = new URL(req.url, "http://localhost");
  const callId = url.searchParams.get("call_id");

  console.log(`🔍 Extracted call_id from URL: ${callId}`);

  if (!callId) {
    console.error("❌ Missing call_id in WebSocket URL, closing");
    socket.close();
    return;
  }

  // Attach ws to session
  const s = sessions.get(callId) || {
    callControlId: null,
    openaiWs: null,
    telnyxWs: null,
    streamId: null,
    ready: false,
    audioFrameCount: 0,
    audioOutFrameCount: 0,
    transcriptLogCount: 0,
    messageCount: 0,
    transcriptText: "",
    lastTtsText: "",
  };
  s.telnyxWs = socket;
  sessions.set(callId, s);

  console.log(`🎵 Telnyx media stream WebSocket connected (call: ${callId})`);

  socket.on("message", (data) => {
    // Telnyx sends JSON text frames (not binary) for media streaming
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const event = msg.event;

    if (event === "start") {
      s.streamId = msg.stream_id;
      sessions.set(callId, s);
      return;
    }

    if (event === "media" && msg.media?.payload) {
      // Forward inbound audio to OpenAI
      const session = sessions.get(callId);
      const openaiWs = session?.openaiWs;

      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        // Log first few audio frames for debugging
        if (!s.audioFrameCount) s.audioFrameCount = 0;
        s.audioFrameCount++;
        if (s.audioFrameCount <= 3) {
          console.log(`📥 [${callId}] Received audio frame #${s.audioFrameCount} from Telnyx (${msg.media.payload.length} bytes)`);
        }
        
        openaiWs.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: msg.media.payload, // already base64
          })
        );
      } else {
        if (s.audioFrameCount === 0 || s.audioFrameCount === undefined) {
          console.log(`⚠️ [${callId}] Received audio from Telnyx but OpenAI WS not ready (state: ${openaiWs?.readyState})`);
        }
      }
      return;
    }

    if (event === "stop") {
      console.log(`🛑 Telnyx stop event for ${callId}`);
    }
  });

  socket.on("close", () => {
    console.log(`🔌 Telnyx WebSocket closed (call: ${callId})`);
    const session = sessions.get(callId);
    if (session && session.telnyxWs === socket) session.telnyxWs = null;
  });

  socket.on("error", (e) => {
    console.error(`❌ Telnyx WebSocket error (call: ${callId}):`, e?.message || e);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Tavari Voice Agent server running on port ${PORT}`);
  console.log(`🔧 Environment: RAILWAY_PUBLIC_DOMAIN=${RAILWAY_PUBLIC_DOMAIN || "(not set)"}`);
  console.log(`📞 Webhook: POST ${PUBLIC_HTTPS_BASE}/webhook`);
  console.log(`🎵 Media stream WebSocket: ${PUBLIC_WSS_BASE}/media-stream-ws`);
  console.log(`❤️  Health check: GET ${PUBLIC_HTTPS_BASE}/health`);
  console.log("\n✅ Ready to receive calls!");
});

// Graceful shutdown
function shutdown() {
  console.log("🛑 Shutting down...");
  sessions.forEach((s) => {
    try {
      if (s.telnyxWs && s.telnyxWs.readyState === WebSocket.OPEN) s.telnyxWs.close();
    } catch {}
    try {
      if (s.openaiWs && s.openaiWs.readyState === WebSocket.OPEN) s.openaiWs.close();
    } catch {}
  });
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
