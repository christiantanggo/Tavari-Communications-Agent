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

      case "call.speak.started":
        // Track when TTS starts playing - mute OpenAI input during this time
        const sessionTtsStart = sessions.get(callId);
        if (sessionTtsStart) {
          sessionTtsStart.isTtsPlaying = true;
        }
        break;

      case "call.speak.ended":
        // TTS finished - re-enable OpenAI input
        const sessionTtsEnd = sessions.get(callId);
        if (sessionTtsEnd) {
          sessionTtsEnd.isTtsPlaying = false;
        }
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


  // Create/update session
  sessions.set(callId, {
    callControlId,
    openaiWs: null,
    telnyxWs: null,
    streamId: null,
    ready: false,
    isResponding: false, // Track if AI is currently generating a response
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
      isResponding: false, // Track if AI is currently generating a response
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
  const s = sessions.get(callId);
  if (!s) return;

  try {
    if (s.telnyxWs && s.telnyxWs.readyState === WebSocket.OPEN) s.telnyxWs.close();
  } catch {}
  try {
    if (s.openaiWs && s.openaiWs.readyState === WebSocket.OPEN) s.openaiWs.close();
  } catch {}

  sessions.delete(callId);
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
  } catch (err) {
    console.error(`❌ Failed to answer call ${callControlId}:`, err?.response?.status, err?.response?.data || err?.message);
    throw err;
  }
}

function telnyxHeaders() {
  // Sanitize API key - remove any whitespace, newlines, control characters, or invalid characters
  // Remove all non-printable ASCII characters except space (but we'll trim anyway)
  let apiKey = (TELNYX_API_KEY || "").trim();
  // Remove all control characters (including \r, \n, \t, etc.)
  apiKey = apiKey.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  // Remove any remaining whitespace (including tabs, spaces at start/end)
  apiKey = apiKey.trim().replace(/\s/g, "");
  
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

  const ws = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
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
    isResponding: false, // Track if AI is currently generating a response
    audioFrameCount: 0,
    audioOutFrameCount: 0,
    transcriptLogCount: 0,
    messageCount: 0,
    transcriptText: "",
    lastTtsText: "",
    lastResponseTime: 0, // Track when last response was created (VAPI-style)
    speechStopTime: 0, // Track when speech stopped (VAPI-style)
    speechStartedAfterStop: false, // Track if caller started speaking again (VAPI-style)
    isTtsPlaying: false, // Track if Telnyx TTS is currently playing (prevents feedback loop)
  };
  s.openaiWs = ws;
  sessions.set(callId, s);

  ws.on("open", () => {
    console.log(`✅ [${callId}] OpenAI WebSocket connected`);

    // Configure session - keep both modalities but we'll extract text for Telnyx TTS
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"], // Keep both - we need audio for input, text for output extraction
          instructions:
            "You are Tavari's phone receptionist. CRITICAL LANGUAGE RULE: You MUST speak ONLY in English (US). Never respond in any other language. Never use Spanish, French, or any other language. Always respond in English only. When a call starts, immediately greet the caller by saying: 'Hello! Thanks for calling Tavari. How can I help you today?' Be concise, friendly, and ask one question at a time. After you finish speaking, you MUST IMMEDIATELY STOP and wait for the caller to respond. Do not continue talking. Do not repeat yourself. Only speak when the caller has finished speaking. If the caller interrupts you, stop speaking immediately.",
          voice: "alloy",
          input_audio_format: "g711_ulaw", // We still receive audio from Telnyx
          output_audio_format: "g711_ulaw", // Set to match Telnyx (but we'll use Telnyx TTS instead)
          input_audio_transcription: { model: "whisper-1" }, // Transcribe input audio
          // VAPI-style turn detection: less aggressive, wait longer before responding
          turn_detection: {
            type: "semantic_vad",
            eagerness: "low", // Lower eagerness = less aggressive (VAPI-style)
            // Note: semantic_vad doesn't use silence_duration_ms, but we'll add delay in code
          },
          temperature: 0.7,
          max_response_output_tokens: 800,
        },
      })
    );
    console.log(`📤 [${callId}] Sent session.update`);

    s.ready = true;
    s.isResponding = false; // Track if AI is currently generating a response
    sessions.set(callId, s);

    // Trigger initial greeting by creating a response after a short delay
    // This ensures the session is fully configured first
    setTimeout(() => {
      const session = sessions.get(callId);
      if (session?.openaiWs && session.openaiWs.readyState === WebSocket.OPEN && !session.isResponding) {
        console.log(`👋 [${callId}] Triggering initial greeting...`);
        session.isResponding = true;
        session.openaiWs.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text"],
              instructions: "Respond in English (US) only. Be brief and concise.",
            },
          })
        );
        console.log(`📤 [${callId}] Sent response.create for greeting`);
      } else {
        console.log(`⚠️ [${callId}] Cannot trigger greeting - ws state: ${session?.openaiWs?.readyState}, isResponding: ${session?.isResponding}`);
      }
    }, 500); // Small delay to ensure session is ready
    
  });

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Minimal logging - only errors and critical events

    // NOTE: We're NOT sending OpenAI audio to Telnyx - we use Telnyx TTS instead
    // OpenAI audio is ignored since we extract text and send to Telnyx /actions/speak
    if (msg.type === "response.audio.delta" && msg.delta) {
      // Log that we're ignoring OpenAI audio (using Telnyx TTS instead)
      if (!s.audioOutFrameCount) s.audioOutFrameCount = 0;
      s.audioOutFrameCount++;
      if (s.audioOutFrameCount === 1) {
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
        }
      }
    }
    
    // Handle user input transcription completion - this is when we should create a response
    // VAPI-style: Wait before responding to ensure caller is done speaking
    if (msg.type === "conversation.item.input_audio_transcription.completed") {
      const session = sessions.get(callId);
      if (session && msg.item && msg.item.role === "user") {
        const userText = msg.item.transcript || msg.item.text || "";
        
        // VAPI-style: Only create a response if we're not already responding
        // CRITICAL: Don't respond while TTS is playing (prevents feedback loop)
        if (!session.isResponding && !session.isTtsPlaying && session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
          const now = Date.now();
          const timeSinceLastResponse = now - (session.lastResponseTime || 0);
          
          // Prevent rapid consecutive responses (minimum 1 second between responses)
          if (timeSinceLastResponse < 1000) {
            if (timeSinceLastResponse < 1000) {
              return;
            }
          
          // Don't respond if TTS is currently playing
          if (session.isTtsPlaying) {
            return;
          }
          
          // VAPI-style delay: Wait before responding to ensure caller is done
          session.speechStopTime = now;
          session.speechStartedAfterStop = false;
          
          setTimeout(() => {
            // Check if caller started speaking again during the delay
            if (session.speechStartedAfterStop) {
              return;
            }
            
            // Double-check we're still not responding (safety check)
            if (session.isResponding) {
              return;
            }
            
            session.isResponding = true;
            session.lastResponseTime = Date.now();
            session.speechStopTime = 0;
            
            session.openaiWs.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  modalities: ["text"],
                  instructions: "Respond in English (US) only. Be brief and concise. If the caller interrupts you, stop speaking immediately.",
                },
              })
            );
          }, 1500); // 1.5 second delay for better turn-taking
        }
      }
    }
    
    // VAPI-style: Track if caller starts speaking again after speech_stopped
    // CRITICAL: Ignore speech detection if TTS is playing (prevents feedback loop)
    if (msg.type === "input_audio_buffer.speech_started") {
      const session = sessions.get(callId);
      if (session) {
        // If TTS is playing, this is likely TTS echo - ignore it
        if (session.isTtsPlaying) {
          return; // Don't process this event
        }
        
        // Normal speech detection handling
        if (session.speechStopTime > 0 && !session.isResponding) {
          session.speechStartedAfterStop = true;
        }
      }
    }
    
    // Check for text in conversation items - multiple event types
    if (msg.type === "conversation.item.created" || 
        msg.type === "conversation.item.output_item.created" ||
        msg.type === "conversation.item.output_item.completed") {
      const session = sessions.get(callId);
      if (session && msg.item) {
        console.log(`📋 [${callId}] Conversation item event: ${msg.type}`);
        
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
        
        console.log(`📝 [${callId}] Extracted text from item (role: ${role}): "${itemText}"`);
        
        // If this is an assistant message, send to TTS (only if we haven't sent this text already)
        if (itemText && (role === "assistant" || msg.type.includes("output"))) {
          // Prevent duplicate TTS requests
          if (itemText.trim() && itemText.trim() !== session.lastTtsText?.trim()) {
            if (session?.callControlId) {
              console.log(`🔊 [${callId}] Sending to TTS: "${itemText.trim()}"`);
              session.lastTtsText = itemText.trim();
              axios.post(
                `https://api.telnyx.com/v2/calls/${session.callControlId}/actions/speak`,
                {
                  payload: itemText.trim(),
                  voice: "Polly.Joanna",
                  language: "en-US",
                  premium: true,
                  interruption_settings: {
                    enabled: true, // Allow caller to interrupt
                  },
                },
                { headers: telnyxHeaders() }
              ).then(() => {
                console.log(`✅ [${callId}] TTS started successfully`);
              }).catch((error) => {
                console.error(`❌ [${callId}] TTS error:`, error?.response?.data || error?.message);
                if (session.lastTtsText === itemText.trim()) {
                  session.lastTtsText = "";
                }
              });
            } else {
              console.log(`⚠️ [${callId}] No callControlId, cannot send TTS`);
            }
          } else {
            console.log(`⏭️ [${callId}] Skipping duplicate TTS: "${itemText.trim()}"`);
          }
        } else if (itemText && role === "user") {
          // Only create a response if we're not already responding
          const session = sessions.get(callId);
          if (session && !session.isResponding && session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
            session.isResponding = true;
            session.openaiWs.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  modalities: ["text"],
                  instructions: "Respond in English (US) only. Be brief and concise.",
                },
              })
            );
          }
        }
      }
    }
    
    // Handle response text completion events
    if (msg.type === "response.audio_transcript.done" || msg.type === "response.text.done") {
      console.log(`📝 [${callId}] Response text done event: ${msg.type}`);
      const session = sessions.get(callId);
      const transcript = (msg.transcript || msg.text || session?.transcriptText || "").trim();
      console.log(`📝 [${callId}] Extracted transcript: "${transcript}"`);
      
      if (transcript) {
        
        // Use Telnyx /actions/speak for audio output (only if we haven't sent this already)
        if (transcript && session?.callControlId && transcript !== session.lastTtsText?.trim()) {
          console.log(`🔊 [${callId}] Sending to TTS from response.text.done: "${transcript}"`);
          session.lastTtsText = transcript;
          axios.post(
            `https://api.telnyx.com/v2/calls/${session.callControlId}/actions/speak`,
            {
              payload: transcript,
              voice: "Polly.Joanna",
              language: "en-US",
              premium: true,
              interruption_settings: {
                enabled: true, // Allow caller to interrupt
              },
            },
            { headers: telnyxHeaders() }
          ).then(() => {
            console.log(`✅ [${callId}] TTS started from response.text.done`);
          }).catch((error) => {
            console.error(`❌ [${callId}] TTS error:`, error?.response?.data || error?.message);
            if (session.lastTtsText === transcript) {
              session.lastTtsText = "";
            }
          });
        }
      }
      
      // Clear transcript for next response
      if (session) session.transcriptText = "";
    }
    
    // Log response creation/start events
    if (msg.type === "response.created") {
      // Initialize transcript text and mark as responding
      const session = sessions.get(callId);
      if (session) {
        session.transcriptText = "";
        session.isResponding = true; // Mark that we're generating a response
      }
    }
    
    if (msg.type === "response.audio_started") {
    }
    
    if (msg.type === "response.done") {
      console.log(`✅ [${callId}] Response done event`);
      // Mark that we're no longer responding - wait for user input
      const session = sessions.get(callId);
      if (session) {
        session.isResponding = false; // Response complete, wait for user input
        session.speechStopTime = 0; // Reset speech tracking (VAPI-style)
        session.speechStartedAfterStop = false; // Reset flag (VAPI-style)
      }
      
      // Check if response has text content we can use
      if (session && msg.response) {
        console.log(`📋 [${callId}] Response object:`, JSON.stringify(msg.response, null, 2));
        
        // Try to extract text from response - check multiple possible locations
        const text = msg.response?.output?.[0]?.text || 
                     msg.response?.text || 
                     msg.response?.transcript ||
                     msg.response?.content?.[0]?.text ||
                     (msg.response?.output && Array.isArray(msg.response.output) && msg.response.output.length > 0 ? msg.response.output[0] : null);
        
        const textValue = typeof text === "string" ? text.trim() : (text?.text || "").trim();
        console.log(`📝 [${callId}] Extracted text from response.done: "${textValue}"`);
        if (textValue && textValue !== session.lastTtsText?.trim() && session?.callControlId) {
          // Use this text for Telnyx TTS (only if not already sent)
          console.log(`🔊 [${callId}] Sending to TTS from response.done: "${textValue}"`);
            session.lastTtsText = textValue;
            axios.post(
              `https://api.telnyx.com/v2/calls/${session.callControlId}/actions/speak`,
              {
                payload: textValue,
                voice: "Polly.Joanna",
                language: "en-US",
                premium: true,
                interruption_settings: {
                  enabled: true, // Allow caller to interrupt
                },
              },
              { headers: telnyxHeaders() }
            ).then(() => {
              console.log(`✅ [${callId}] TTS started from response.done`);
            }).catch((error) => {
              console.error(`❌ [${callId}] TTS error:`, error?.response?.data || error?.message);
              if (session.lastTtsText === textValue) {
                session.lastTtsText = "";
              }
            });
          } else if (!textValue) {
            console.log(`⚠️ [${callId}] No text found in response.done`);
          }
        }
      }
    }
    
    // Log any errors or unexpected types
    if (msg.type === "error") {
      console.error(`❌ [${callId}] OpenAI error:`, JSON.stringify(msg, null, 2));
    }
    
    // Log session update confirmation
    if (msg.type === "session.updated") {
      console.log(`✅ [${callId}] Session updated successfully`);
    }
    
    // Log response creation
    if (msg.type === "response.created") {
      console.log(`✅ [${callId}] Response created`);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`🔌 [${callId}] OpenAI WebSocket closed - code: ${code}, reason: ${reason?.toString() || 'none'}`);
  });

  ws.on("error", (e) => {
    console.error(`❌ [${callId}] OpenAI WebSocket error:`, e?.message || e);
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

  const url = new URL(req.url, "http://localhost");
  const callId = url.searchParams.get("call_id");


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
    isResponding: false, // Track if AI is currently generating a response
    audioFrameCount: 0,
    audioOutFrameCount: 0,
    transcriptLogCount: 0,
    messageCount: 0,
    transcriptText: "",
    lastTtsText: "",
  };
  s.telnyxWs = socket;
  sessions.set(callId, s);


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
