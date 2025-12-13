import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import callRoutes from './routes/calls.js';
import agentRoutes from './routes/agents.js';
import messageRoutes from './routes/messages.js';
import usageRoutes from './routes/usage.js';
import setupRoutes from './routes/setup.js';
import billingRoutes from './routes/billing.js';
import phoneNumberRoutes from './routes/phoneNumbers.js';
import telnyxPhoneNumberRoutes from './routes/telnyxPhoneNumbers.js';
import { setupCallAudioWebSocket } from './routes/callAudio.js';
import logger from './utils/logger.js';

console.log('✅ All routes imported successfully');

// Load environment variables
dotenv.config();

// Debug: Check if database config loads
console.log('✅ Environment variables loaded');
console.log('✅ SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('✅ SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');

const app = express();
const PORT = process.env.PORT || 5001;
console.log('✅ Express app created, PORT:', PORT);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.get('/api', (req, res) => {
  res.json({ message: 'Tavari AI Phone Agent API' });
});

// Route handlers
app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/phone-numbers', phoneNumberRoutes);
app.use('/api/telnyx-phone-numbers', telnyxPhoneNumberRoutes);

// Create HTTP server
const server = createServer(app);

// Setup call audio WebSocket server
setupCallAudioWebSocket(server);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
console.log('🔵 About to start server on port:', PORT);
server.listen(PORT, () => {
  console.log(`🚀 Tavari AI Phone Agent server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🚀 Tavari AI Phone Agent server running on port ${PORT}`);
  logger.info(`📍 Health check: http://localhost:${PORT}/health`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
}).on('error', (error) => {
  console.error('❌ Server error:', error);
  logger.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Please stop the other process or change the PORT in .env`);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

