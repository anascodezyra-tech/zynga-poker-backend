import dotenv from "dotenv";
import mongoose from "mongoose";
import redis from "../config/redis.js";
import http from "http";

dotenv.config();

const API_BASE_URL = process.env.API_URL || "http://localhost:5000";
const API_PORT = process.env.PORT || 5000;

const checkMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const dbName = mongoose.connection.db.databaseName;
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    console.log("✅ MongoDB Atlas:");
    console.log(`   Status: Connected`);
    console.log(`   Database: ${dbName}`);
    console.log(`   Collections: ${collections.length} found`);
    collections.forEach((col) => {
      console.log(`     - ${col.name}`);
    });
    
    await mongoose.connection.close();
    return true;
  } catch (error) {
    console.log("❌ MongoDB Atlas:");
    console.log(`   Status: Connection Failed`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
};

const checkRedis = () => {
  try {
    if (!redis) {
      console.log("⚠️  Redis:");
      console.log(`   Status: Not Initialized`);
      return false;
    }
    
    const status = redis.status;
    if (status === "ready") {
      console.log("✅ Redis:");
      console.log(`   Status: Connected`);
      console.log(`   Host: ${process.env.REDIS_HOST || "localhost"}`);
      console.log(`   Port: ${process.env.REDIS_PORT || 6379}`);
      return true;
    } else {
      console.log("⚠️  Redis:");
      console.log(`   Status: Not Available (${status || "disconnected"})`);
      console.log(`   Note: Backend will work without Redis`);
      return false;
    }
  } catch (error) {
    console.log("⚠️  Redis:");
    console.log(`   Status: Error`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
};

const checkBackendAPI = () => {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${API_PORT}/`, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200 && data.includes("running")) {
          console.log("✅ Backend API:");
          console.log(`   Status: Running`);
          console.log(`   URL: http://localhost:${API_PORT}`);
          console.log(`   Response: ${data.trim()}`);
          resolve(true);
        } else {
          console.log("❌ Backend API:");
          console.log(`   Status: Not Responding Correctly`);
          console.log(`   Status Code: ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on("error", (error) => {
      console.log("❌ Backend API:");
      console.log(`   Status: Connection Failed`);
      console.log(`   Error: ${error.message}`);
      console.log(`   Note: Make sure backend is running (npm run dev)`);
      resolve(false);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      console.log("❌ Backend API:");
      console.log(`   Status: Connection Timeout`);
      console.log(`   Note: Make sure backend is running (npm run dev)`);
      resolve(false);
    });
  });
};

const checkFrontendConnection = () => {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${API_PORT}/api/balance`, (res) => {
      if (res.statusCode === 401) {
        console.log("✅ Frontend → Backend:");
        console.log(`   Status: Connected (Authentication required - expected)`);
        console.log(`   Endpoint: http://localhost:${API_PORT}/api/balance`);
        resolve(true);
      } else {
        console.log("⚠️  Frontend → Backend:");
        console.log(`   Status: Unexpected Response`);
        console.log(`   Status Code: ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on("error", (error) => {
      console.log("❌ Frontend → Backend:");
      console.log(`   Status: Connection Failed`);
      console.log(`   Error: ${error.message}`);
      resolve(false);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      console.log("❌ Frontend → Backend:");
      console.log(`   Status: Connection Timeout`);
      resolve(false);
    });
  });
};

const main = async () => {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 ZYNGA POKER - CONNECTION VERIFICATION REPORT");
  console.log("=".repeat(70) + "\n");

  const results = {
    mongodb: await checkMongoDB(),
    redis: checkRedis(),
    backend: await checkBackendAPI(),
    frontend: await checkFrontendConnection(),
  };

  console.log("\n" + "=".repeat(70));
  console.log("📊 SUMMARY");
  console.log("=".repeat(70));
  console.log(`MongoDB:     ${results.mongodb ? "✅ Connected" : "❌ Failed"}`);
  console.log(`Redis:       ${results.redis ? "✅ Connected" : "⚠️  Optional (Not Required)"}`);
  console.log(`Backend API: ${results.backend ? "✅ Running" : "❌ Not Running"}`);
  console.log(`Frontend:    ${results.frontend ? "✅ Can Connect" : "❌ Cannot Connect"}`);
  console.log("=".repeat(70) + "\n");

  if (results.mongodb && results.backend) {
    console.log("✅ Core system is operational!");
    if (!results.redis) {
      console.log("⚠️  Redis is optional - core features work without it");
    }
  } else {
    console.log("❌ Core system has issues - please check errors above");
    process.exit(1);
  }

  process.exit(0);
};

main();

