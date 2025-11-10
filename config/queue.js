import { Queue } from "bullmq";
import redis from "./redis.js";

let bulkTransferQueue = null;

try {
  bulkTransferQueue = new Queue("bulk-transfer", {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
    },
  });
} catch (error) {
  console.log("⚠️  BullMQ queue not initialized - Redis not available. Bulk transfer feature disabled.");
}

export { bulkTransferQueue };
export default bulkTransferQueue;

