import Redis from "ioredis";

let redis = null;
let redisConnected = false;
let redisWarningShown = false;

const createRedisConnection = () => {
  if (redis) return redis;

  redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      if (times > 3) {
        if (!redisWarningShown) {
          console.log("⚠️  Redis not available - server will continue without caching. Install Redis for optimal performance.");
          redisWarningShown = true;
        }
        return null;
      }
      return null;
    },
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 2000,
    enableReadyCheck: false,
  });

  redis.on("connect", () => {
    redisConnected = true;
    redisWarningShown = false;
    console.log("✅ Redis connected");
  });

  redis.on("error", () => {
    if (!redisConnected && !redisWarningShown) {
      console.log("⚠️  Redis not available - server will continue without caching. Install Redis for optimal performance.");
      redisWarningShown = true;
    }
    redisConnected = false;
  });

  redis.on("close", () => {
    redisConnected = false;
  });

  redis.connect().catch(() => {
    redisConnected = false;
  });

  return redis;
};

createRedisConnection();

export default redis;

