// Shared CORS allowlist + helpers (used by server.js and errorHandler.js)
import { getDevFrontendPort } from "../config/load-dev-ports.js";

const __DEV_FE__ = getDevFrontendPort();
const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => String(o).trim())
  .filter(Boolean);

const allowedOrigins = [
  "https://www.tavarios.com",
  "https://tavarios.com",
  `http://localhost:${__DEV_FE__}`,
  `http://127.0.0.1:${__DEV_FE__}`,
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL,
  ...extraOrigins,
].filter(Boolean);

/** Normalize Origin to scheme + host (+ port if non-default) for comparisons. */
export function canonicalOrigin(originRaw) {
  const s = originRaw == null ? "" : String(originRaw).trim();
  if (!s) return "";
  try {
    return new URL(s).origin;
  } catch {
    return s;
  }
}

export function readRequestOrigin(req) {
  const raw = req.headers.origin;
  if (raw == null) return "";
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s).trim();
}

function parsedOriginOrigin(originStr) {
  try {
    return new URL(originStr).origin;
  } catch {
    return null;
  }
}

function isTavariosHost(hostname) {
  const h = String(hostname || "")
    .replace(/\.$/, "")
    .toLowerCase();
  return h === "tavarios.com" || h.endsWith(".tavarios.com");
}

function isTavariosProductionOrigin(originStr) {
  try {
    const u = new URL(originStr);
    return isTavariosHost(u.hostname);
  } catch {
    return false;
  }
}

export function isOriginAllowed(originRaw) {
  const origin = canonicalOrigin(originRaw);
  if (!origin) return true;
  if (process.env.FRONTEND_URL === "*") return true;
  if (process.env.NODE_ENV !== "production") return true;

  if (allowedOrigins.some((a) => canonicalOrigin(a) === origin)) return true;

  const reqOrigin = parsedOriginOrigin(origin);
  if (reqOrigin && allowedOrigins.some((a) => parsedOriginOrigin(a) === reqOrigin)) return true;

  if (isTavariosProductionOrigin(origin)) {
    try {
      const u = new URL(origin);
      if (process.env.NODE_ENV === "production" && u.protocol !== "https:") return false;
      return true;
    } catch {
      return false;
    }
  }

  if (
    origin.endsWith(".vercel.app") &&
    (origin.startsWith("https://") || origin.startsWith("http://"))
  ) {
    return true;
  }
  return false;
}

/** Reflect CORS on a response when Origin is allowed (e.g. error responses that skip normal middleware chain). */
export function applyCorsToResponse(req, res) {
  const raw = readRequestOrigin(req);
  if (!raw || !isOriginAllowed(raw)) return;
  res.setHeader("Access-Control-Allow-Origin", canonicalOrigin(raw));
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
}

export function applyCorsPreflightHeaders(req, res) {
  const origin = readRequestOrigin(req);
  if (!origin || !isOriginAllowed(origin)) {
    if (process.env.CORS_DEBUG_LOG === "1" && origin) {
      console.warn("[CORS] preflight denied for Origin:", JSON.stringify(origin));
    }
    return false;
  }
  const reflected = canonicalOrigin(origin);
  res.setHeader("Access-Control-Allow-Origin", reflected);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD");
  const requested = req.headers["access-control-request-headers"];
  if (requested) {
    res.setHeader("Access-Control-Allow-Headers", requested);
  } else {
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, X-Active-Business-Id, Accept, Cookie"
    );
  }
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
  return true;
}
