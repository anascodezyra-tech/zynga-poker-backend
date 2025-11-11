// ============================================================================
// ZYNGA POKER BACKEND - EXPRESS SERVER
// ============================================================================
// This file contains the main Express application setup.
// It works in both local development and Vercel serverless environments.
//
// MODULE SYSTEM: ES Modules (ESM)
// - Uses "type": "module" in package.json
// - All imports use ES6 import/export syntax
// - Compatible with Vercel's Node.js runtime
//
// SERVERLESS COMPATIBILITY:
// - Exports Express app as default export for Vercel
// - No app.listen() in serverless mode (Vercel handles HTTP server)
// - MongoDB connection is lazy-loaded in serverless to reduce cold starts
// - Socket.io is disabled in serverless (not supported)
// - Redis connection is handled safely (lazy connect, no multiple connections)
// ============================================================================

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================================
// REDIS CONNECTION
// ============================================================================
// Fixed: Redis connection is handled in config/redis.js with:
// - lazyConnect: true (connects only when needed)
// - Connection pooling and retry strategy
// - Graceful fallback if Redis is unavailable
// - No multiple connections per request
// ============================================================================
import redis from "./config/redis.js";

import logger from "./utils/logger.js";
import { logConnectionStatus } from "./utils/connectionStatus.js";

import authRoutes from "./routes/authRoutes.js";
import balanceRoutes from "./routes/balanceRoutes.js";
import transferRoutes from "./routes/transferRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import dailyMintRoutes from "./routes/dailyMintRoute.js";
import recoveryRoutes from "./routes/recoveryRoutes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only create directories if not in serverless environment
if (process.env.VERCEL !== "1") {
  const uploadsDir = path.join(__dirname, "uploads");
  const exportsDir = path.join(__dirname, "exports");
  const logsDir = path.join(__dirname, "logs");

  [uploadsDir, exportsDir, logsDir].forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.warn(`Failed to create directory ${dir}:`, err.message);
    }
  });
}

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  req.startTime = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - req.startTime;
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ============================================================================
// MONGODB CONNECTION HANDLING
// ============================================================================
// Fixed: Prevent multiple MongoDB connections in serverless environment
// In serverless, each function invocation can create a new connection,
// so we use connection pooling and check connection state before connecting.
// ============================================================================

let mongoConnected = false;
let mongoConnecting = false; // Prevent concurrent connection attempts

const connectMongo = async () => {
  // If already connected, return immediately
  if (mongoConnected && mongoose.connection.readyState === 1) {
    return;
  }

  // If connection is in progress, wait for it
  if (mongoConnecting) {
    // Wait for connection to complete (max 5 seconds)
    let attempts = 0;
    while (mongoConnecting && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
      if (mongoConnected && mongoose.connection.readyState === 1) {
        return;
      }
    }
  }

  // Check if already connected (race condition protection)
  if (mongoose.connection.readyState === 1) {
    mongoConnected = true;
    return;
  }

  mongoConnecting = true;

  try {
    // Use connection options to prevent multiple connections
    // mongoose.connect() is idempotent - it reuses existing connection if available
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10, // Maximum number of connections in the pool
      serverSelectionTimeoutMS: 5000, // Timeout for server selection
      socketTimeoutMS: 45000, // Socket timeout
    });

    mongoConnected = true;
    logger.info("✅ MongoDB Connected Successfully");

    const dbName = mongoose.connection.db.databaseName;
    if (dbName !== "zynga_poker") {
      logger.warn(`⚠️  Database name is "${dbName}" but expected "zynga_poker"`);
    } else {
      logger.info(`✅ Connected to database: ${dbName}`);
    }

    // Only validate collections in non-serverless (to avoid cold start delays)
    if (process.env.VERCEL !== "1") {
      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map((c) => c.name);

        if (collectionNames.includes("users")) {
          logger.info("✅ Collection 'users' exists");
          const userIndexes = await mongoose.connection.db.collection("users").indexes();
          const hasEmailIndex = userIndexes.some((idx) => idx.key && idx.key.email === 1);
          if (hasEmailIndex) {
            logger.info("✅ Unique index on 'email' field verified");
          }
        }

        if (collectionNames.includes("transactions")) {
          logger.info("✅ Collection 'transactions' exists");
        }

        logger.info("✅ MongoDB Atlas collections verified and ready.");
      } catch (err) {
        logger.error("❌ Error validating collections:", err);
      }
    }
  } catch (err) {
    logger.error("❌ MongoDB Connection Failed:", err);
    mongoConnected = false;
    if (process.env.VERCEL !== "1") {
      process.exit(1);
    }
    // In serverless, don't exit - just log the error and continue
  } finally {
    mongoConnecting = false;
  }
};

// Connect to MongoDB immediately if not in serverless, otherwise connect on first request
// Fixed: In serverless, we connect lazily on first request to avoid cold start issues
if (process.env.VERCEL !== "1") {
  // Local development: connect immediately
  connectMongo();
} else {
  // Serverless: connect on first request using middleware
  // This ensures connection is established only when needed
  app.use(async (req, res, next) => {
    try {
      // Check connection state before attempting to connect
      if (mongoose.connection.readyState !== 1 && !mongoConnecting) {
        await connectMongo();
      }
    } catch (err) {
      logger.error("MongoDB connection error in middleware:", err);
      // Continue even if connection fails - let routes handle it
    }
    next();
  });
}

// ============================================================================
// SOCKET.IO SETUP (LOCAL DEVELOPMENT ONLY)
// ============================================================================
// Fixed: Socket.io disabled in serverless environment
// Socket.io requires persistent connections which don't work in Vercel serverless.
// In serverless, we set io to null to prevent errors in routes that check for io.
// For production WebSocket needs, consider using a separate service (Pusher, Ably, etc.)
// ============================================================================

let server = null;
let io = null;

if (process.env.VERCEL !== "1") {
  // Local development: Create HTTP server and setup Socket.io
  server = http.createServer(app);

  // Setup Socket.io for real-time updates
  io = new Server(server, {
    cors: { origin: "*" }
  });

  // Make socket.io available inside routes
  app.set("io", io);

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on("disconnect", () => logger.info(`Socket disconnected: ${socket.id}`));
  });
} else {
  // Serverless: Set io to null to prevent errors in routes
  // Routes should check if io exists before using it
  app.set("io", null);
}

// ============================================================================
// ROUTES (API ENDPOINTS)
// ============================================================================
// All API routes are mounted under /api prefix
// Routes are defined in separate files for better organization
// ============================================================================
app.use("/api", authRoutes);
app.use("/api", balanceRoutes);
app.use("/api", transferRoutes);
app.use("/api", transactionRoutes);
app.use("/api", dailyMintRoutes);
app.use("/api", recoveryRoutes);

// Root route for health check
app.get("/", (req, res) => {
  res.send("Zynga Poker Backend is running...");
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    mongo: mongoConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================
// Fixed: Error handler MUST be after all routes
// Express error handlers must be defined after route handlers to catch errors
// from routes. This is a common mistake that causes crashes in serverless.
// ============================================================================
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// ============================================================================
// 404 HANDLER (CATCH-ALL)
// ============================================================================
// Fixed: 404 handler must be after error handler
// This catches any requests that don't match any route
// ============================================================================
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.path
  });
});

// ============================================================================
// EXPORT FOR VERCEL SERVERLESS
// ============================================================================
// Fixed: Export Express app as default export for Vercel serverless functions
// Vercel's @vercel/node builder expects a default export of the Express app.
// This allows Vercel to handle the HTTP server and route requests to our app.
// ============================================================================

export default app;

// ============================================================================
// SERVER STARTUP (LOCAL DEVELOPMENT ONLY)
// ============================================================================
// Fixed: Removed app.listen() for serverless compatibility
// In Vercel serverless, we export the Express app, not start a server.
// The server only starts in local development (when VERCEL !== "1").
// ============================================================================

// Only start the server in local development
// In Vercel serverless, the app is exported and Vercel handles the server
if (process.env.VERCEL !== "1") {
  const PORT = process.env.PORT || 5000;
  
  if (server) {
    // Use the HTTP server created for Socket.io
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📦 Environment: ${process.env.NODE_ENV || "development"}`);
      
      setTimeout(() => {
        logConnectionStatus();
      }, 2000);
      
      import("./workers/bulkTransferWorker.js")
        .then(() => {
          logger.info("✅ Bulk transfer worker module loaded");
        })
        .catch((err) => {
          logger.warn("⚠️  Bulk transfer worker module load failed:", err.message);
        });
    });
  } else {
    // Fallback if server wasn't created (shouldn't happen, but safety check)
    const httpServer = http.createServer(app);
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📦 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  }
}
// Note: In serverless (VERCEL === "1"), we don't call listen() - Vercel handles it
