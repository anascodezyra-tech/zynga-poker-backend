import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

const uploadsDir = path.join(__dirname, "uploads");
const exportsDir = path.join(__dirname, "exports");
const logsDir = path.join(__dirname, "logs");

[uploadsDir, exportsDir, logsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    logger.info("✅ MongoDB Connected Successfully");

    const dbName = mongoose.connection.db.databaseName;
    if (dbName !== "zynga_poker") {
      logger.warn(`⚠️  Database name is "${dbName}" but expected "zynga_poker"`);
    } else {
      logger.info(`✅ Connected to database: ${dbName}`);
    }

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
  })
  .catch((err) => {
    logger.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  });

// Create HTTP server (required for socket.io)
const server = http.createServer(app);

// Setup Socket.io for real-time updates
const io = new Server(server, {
  cors: { origin: "*" }
});

// Make socket.io available inside routes
app.set("io", io);

io.on("connection", (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  socket.on("disconnect", () => logger.info(`Socket disconnected: ${socket.id}`));
});

app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// Routes (API endpoints)
app.use("/api", authRoutes);
app.use("/api", balanceRoutes);
app.use("/api", transferRoutes);
app.use("/api", transactionRoutes);
app.use("/api", dailyMintRoutes);
app.use("/api", recoveryRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Zynga Poker Backend is running...");
});

const PORT = process.env.PORT || 5000;
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
