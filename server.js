// server.js
// Tavari Voice Agent - VAPI Integration
// BULLETPROOF VERSION - Won't crash on startup

import express from "express";
import dotenv from "dotenv";

// Load environment variables FIRST
dotenv.config();

const PORT = Number(process.env.PORT || 5001);
const app = express();

// Basic middleware - these should never fail
try {
  const cors = (await import("cors")).default;
  const helmet = (await import("helmet")).default;
  
  app.use(helmet());
  app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  }));
} catch (error) {
  console.error("⚠️ Middleware import error (non-fatal):", error.message);
}

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check - ALWAYS works
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    version: "VAPI_VERSION",
    server: "Tavari VAPI Server",
    timestamp: new Date().toISOString(),
    webhook: "/api/vapi/webhook",
  });
});

// Ready check - checks database but doesn't crash if it fails
app.get("/ready", async (_req, res) => {
  try {
    const { supabaseClient } = await import("./config/database.js");
    const { error } = await supabaseClient.from("businesses").select("id").limit(1);
    
    if (error) {
      return res.status(503).json({
        status: "not ready",
        error: "Database connection failed",
      });
    }
    
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not ready",
      error: error.message,
    });
  }
});

// Telnyx webhook handler - simple, always works
app.post("/webhook", (req, res) => {
  res.status(200).json({ received: true });
});

// Initialize Sentry (optional - won't crash if missing)
try {
  const { initSentry } = await import("./config/sentry.js");
  initSentry();
} catch (error) {
  console.log("[Sentry] Not available:", error.message);
}

// Rate limiting - optional, won't crash if missing
let apiLimiter, authLimiter, adminLimiter, webhookLimiter;
try {
  const limiter = await import("./middleware/rateLimiter.js");
  apiLimiter = limiter.apiLimiter;
  authLimiter = limiter.authLimiter;
  adminLimiter = limiter.adminLimiter;
  webhookLimiter = limiter.webhookLimiter;
  
  app.use("/api", apiLimiter);
} catch (error) {
  console.warn("⚠️ Rate limiter not available:", error.message);
}

// Load routes - each one is optional, won't crash if one fails
const routes = [
  { path: "/api/auth", file: "./routes/auth.js" },
  { path: "/api/billing", file: "./routes/billing.js" },
  { path: "/api/setup", file: "./routes/setup.js" },
  { path: "/api/messages", file: "./routes/messages.js" },
  { path: "/api/usage", file: "./routes/usage.js" },
  { path: "/api/agents", file: "./routes/agents.js" },
  { path: "/api/vapi", file: "./routes/vapi.js" },
  { path: "/api/admin", file: "./routes/admin.js" },
  { path: "/api/support", file: "./routes/support.js" },
  { path: "/api/invoices", file: "./routes/invoices.js" },
  { path: "/api/account", file: "./routes/account.js" },
  { path: "/api/business", file: "./routes/business.js" },
];

for (const route of routes) {
  try {
    const routeModule = await import(route.file);
    const router = routeModule.default;
    
    // Apply rate limiters if available
    if (route.path === "/api/auth" && authLimiter) {
      app.use("/api/auth/login", authLimiter);
      app.use("/api/auth/signup", authLimiter);
    }
    if (route.path === "/api/admin" && adminLimiter) {
      app.use("/api/admin", adminLimiter);
    }
    if (route.path === "/api/vapi" && webhookLimiter) {
      app.use("/api/vapi/webhook", webhookLimiter);
    }
    
    app.use(route.path, router);
    console.log(`✅ Loaded route: ${route.path}`);
  } catch (error) {
    console.error(`❌ Failed to load route ${route.path}:`, error.message);
    // Continue - don't crash
  }
}

// Error handler - must be last
try {
  const { errorHandler } = await import("./middleware/errorHandler.js");
  app.use(errorHandler);
} catch (error) {
  console.warn("⚠️ Error handler not available:", error.message);
  // Basic error handler
  app.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  });
}

// Start server - THIS IS THE ONLY PLACE WE SHOULD CRASH
const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 TAVARI SERVER - VAPI VERSION');
  console.log('='.repeat(60));
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Ready: http://localhost:${PORT}/ready`);
  console.log(`   Webhook: http://localhost:${PORT}/api/vapi/webhook`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Handle uncaught errors - log but don't crash immediately
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  console.error("Stack:", error.stack);
  // Don't exit - let the server keep running
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection:", reason);
  // Don't exit - let the server keep running
});

export default app;
