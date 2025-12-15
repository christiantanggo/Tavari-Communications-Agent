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
  };
  s.openaiWs = ws;
  sessions.set(callId, s);

  ws.on("open", () => {
    console.log(`✅ OpenAI Realtime WebSocket connected for ${callId}`);

    // Configure session for ulaw
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          instructions:
            "You are Tavari's phone receptionist. Be concise, friendly, and ask one question at a time.",
          voice: "alloy",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          input_audio_transcription: { model: "whisper-1" },
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

    // Make the AI speak FIRST (audio)
    ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: "Hello! Thanks for calling Tavari. How can I help you today?",
        },
      })
    );

    console.log(`🎤 Sent greeting for ${callId}`);
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Log first few messages to see what we're getting
    if (!s.messageCount) s.messageCount = 0;
    s.messageCount++;
    if (s.messageCount <= 10) {
      console.log(`📨 [${callId}] OpenAI message #${s.messageCount}: type=${msg.type}`);
    }

    // Audio from OpenAI -> send to Telnyx WS
    if (msg.type === "response.audio.delta" && msg.delta) {
      const session = sessions.get(callId);
      const telnyxWs = session?.telnyxWs;

      if (telnyxWs && telnyxWs.readyState === WebSocket.OPEN) {
        // Log first few audio frames for debugging
        if (!session.audioOutFrameCount) session.audioOutFrameCount = 0;
        session.audioOutFrameCount++;
        if (session.audioOutFrameCount <= 3) {
          console.log(`📤 [${callId}] Sending audio frame #${session.audioOutFrameCount} to Telnyx (${msg.delta.length} bytes)`);
        }
        
        telnyxWs.send(
          JSON.stringify({
            event: "media",
            media: { payload: msg.delta },
          })
        );
      } else {
        if (!session.audioOutFrameCount || session.audioOutFrameCount === 0) {
          console.log(`⚠️ [${callId}] OpenAI sent audio but Telnyx WS not ready (state: ${telnyxWs?.readyState})`);
        }
      }
      return;
    }
    
    // Log other important OpenAI events
    if (msg.type === "response.audio_transcript.delta") {
      // Transcript updates - log first few
      if (!s.transcriptLogCount) s.transcriptLogCount = 0;
      s.transcriptLogCount++;
      if (s.transcriptLogCount <= 1 && msg.delta) {
        console.log(`💬 [${callId}] Transcript: ${msg.delta}`);
      }
    }
    
    if (msg.type === "response.audio_transcript.done") {
      console.log(`✅ [${callId}] Response complete: ${msg.transcript || "(no transcript)"}`);
    }
    
    // Log response creation/start events
    if (msg.type === "response.created") {
      console.log(`🎬 [${callId}] OpenAI response created`);
    }
    
    if (msg.type === "response.audio_started") {
      console.log(`🔊 [${callId}] OpenAI audio started`);
    }
    
    if (msg.type === "response.done") {
      console.log(`✅ [${callId}] OpenAI response done`);
    }
    
    // Log any errors or unexpected types
    if (msg.type === "error") {
      console.error(`❌ [${callId}] OpenAI error:`, JSON.stringify(msg));
    }

    if (msg.type === "error") {
      console.error(`❌ OpenAI error for ${callId}:`, msg);
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
