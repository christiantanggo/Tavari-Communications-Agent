// server.js
// Tavari Voice Agent - VAPI Integration
// BULLETPROOF VERSION - Won't crash on startup

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

// Load environment variables FIRST
dotenv.config();

const PORT = Number(process.env.PORT || 5001);
const app = express();

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
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
import { initSentry } from "./config/sentry.js";
initSentry();

// Rate limiting - load synchronously
import { apiLimiter, authLimiter, adminLimiter, webhookLimiter } from "./middleware/rateLimiter.js";
app.use("/api", apiLimiter);

// Load routes synchronously - they're all ES modules
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
import callsRoutes from "./routes/calls.js";

// Apply specific rate limiters
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
app.use("/api/calls", callsRoutes);

// Error handler
import { errorHandler } from "./middleware/errorHandler.js";
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 TAVARI SERVER - VAPI VERSION');
  console.log('='.repeat(60));
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Ready: http://localhost:${PORT}/ready`);
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
