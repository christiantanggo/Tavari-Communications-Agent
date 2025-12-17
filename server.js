// server.js
// Tavari Voice Agent - VAPI Integration

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

// Load environment variables FIRST
dotenv.config();

// Initialize Sentry (if configured) - must be before other imports
import { initSentry } from "./config/sentry.js";
initSentry();

const PORT = Number(process.env.PORT || 5001);

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoints
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    version: "VAPI_VERSION",
    server: "Tavari VAPI Server",
    timestamp: new Date().toISOString(),
    webhook: "/api/vapi/webhook",
    message: "This is the VAPI version - NOT the Telnyx legacy version"
  });
});

app.get("/ready", async (_req, res) => {
  try {
    // Check database connection
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

// Handle Telnyx webhooks (VAPI uses Telnyx as provider, these webhooks are handled by VAPI)
// Just return 200 OK - VAPI handles the actual call logic
app.post("/webhook", (req, res) => {
  // VAPI uses Telnyx as the phone provider, so Telnyx sends webhooks here
  // But VAPI handles all the call logic, so we just acknowledge receipt
  res.status(200).json({ received: true });
});

// Rate limiting
import { apiLimiter, authLimiter, adminLimiter, webhookLimiter } from "./middleware/rateLimiter.js";

// Apply general rate limiting to all API routes
app.use("/api", apiLimiter);

// API Routes - import all at once
import authRoutes from "./routes/auth.js";
import billingRoutes from "./routes/billing.js";
import setupRoutes from "./routes/setup.js";
import messagesRoutes from "./routes/messages.js";
import usageRoutes from "./routes/usage.js";
import agentsRoutes from "./routes/agents.js";
import vapiRoutes from "./routes/vapi.js";
import adminRoutes from "./routes/admin.js";
import supportRoutes from "./routes/support.js";
import invoicesRoutes from "./routes/invoices.js";
import accountRoutes from "./routes/account.js";
import businessRoutes from "./routes/business.js";

// Apply specific rate limiters BEFORE routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/admin", adminLimiter);
app.use("/api/vapi/webhook", webhookLimiter);

// Mount all routes
app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/setup", setupRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/api/vapi", vapiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/business", businessRoutes);

// Error handling middleware (must be last)
import { errorHandler } from "./middleware/errorHandler.js";
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 TAVARI SERVER - VAPI VERSION');
  console.log('='.repeat(60));
  console.log(`✅ Tavari server running on port ${PORT} [VAPI VERSION]`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Readiness check: http://localhost:${PORT}/ready`);
  console.log(`   VAPI Webhook: http://localhost:${PORT}/api/vapi/webhook`);
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

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

export default app;
