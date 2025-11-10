import mongoose from "mongoose";
import redis from "../config/redis.js";

export const checkMongoDBStatus = () => {
  const status = mongoose.connection.readyState;
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  return {
    status: states[status] || "unknown",
    readyState: status,
    isConnected: status === 1,
    dbName: mongoose.connection.db?.databaseName || "unknown",
  };
};

export const checkRedisStatus = () => {
  if (!redis) {
    return {
      status: "not_initialized",
      isAvailable: false,
      message: "Redis client not initialized",
    };
  }

  const status = redis.status;
  return {
    status: status || "unknown",
    isAvailable: status === "ready",
    message: status === "ready" ? "Redis connected and ready" : "Redis not available",
  };
};

export const logConnectionStatus = () => {
  const mongoStatus = checkMongoDBStatus();
  const redisStatus = checkRedisStatus();

  console.log("\n" + "=".repeat(60));
  console.log("🔌 CONNECTION STATUS REPORT");
  console.log("=".repeat(60));
  
  console.log("\n📊 MongoDB Atlas:");
  console.log(`   Status: ${mongoStatus.isConnected ? "✅ Connected" : "❌ Disconnected"}`);
  console.log(`   Database: ${mongoStatus.dbName}`);
  console.log(`   Ready State: ${mongoStatus.status}`);
  
  console.log("\n📊 Redis:");
  console.log(`   Status: ${redisStatus.isAvailable ? "✅ Connected" : "⚠️  Not Available"}`);
  console.log(`   Message: ${redisStatus.message}`);
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ Backend is operational");
  if (!redisStatus.isAvailable) {
    console.log("⚠️  Running without Redis (caching and bulk transfers disabled)");
  }
  console.log("=".repeat(60) + "\n");
};

