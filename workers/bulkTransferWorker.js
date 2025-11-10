import { Worker } from "bullmq";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { invalidateBalanceCache, setIdempotency } from "../utils/cache.js";
import logger from "../utils/logger.js";
import redis from "../config/redis.js";

const compareDecimal = (a, b) => {
  return Number(a.toString()) - Number(b.toString());
};

let worker = null;

const initializeWorker = () => {
  if (worker) return worker;

  try {
    if (!redis || redis.status !== "ready") {
      logger.warn("Bulk transfer worker not initialized - Redis not available");
      return null;
    }

    worker = new Worker(
      "bulk-transfer",
      async (job) => {
        const { transfers, adminId, adminIp, adminUserAgent, batchId } = job.data;
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          const results = [];
          const errors = [];

          for (const transfer of transfers) {
            try {
              const { fromUserId, toUserId, amount, reason } = transfer;

              if (fromUserId) {
                const sender = await User.findById(fromUserId).session(session);
                const receiver = await User.findById(toUserId).session(session);

                if (!sender || !receiver) {
                  errors.push({ transfer, error: "User not found" });
                  continue;
                }

                const senderBalance = sender.balance || mongoose.Types.Decimal128.fromString("0");
                if (compareDecimal(senderBalance, amount) < 0) {
                  errors.push({ transfer, error: "Insufficient balance" });
                  continue;
                }

                sender.balance = mongoose.Types.Decimal128.fromString(
                  String(Number(senderBalance.toString()) - Number(amount.toString()))
                );
                receiver.balance = mongoose.Types.Decimal128.fromString(
                  String(
                    Number((receiver.balance || mongoose.Types.Decimal128.fromString("0")).toString()) +
                      Number(amount.toString())
                  )
                );

                await sender.save({ session });
                await receiver.save({ session });

                const tx = await Transaction.create(
                  [
                    {
                      fromUserId,
                      toUserId,
                      amount,
                      type: "manual",
                      status: "approved",
                      reason,
                      batchId,
                      adminId,
                      adminIp,
                      adminUserAgent,
                    },
                  ],
                  { session }
                );

                results.push(tx[0]._id.toString());
              } else {
                const receiver = await User.findById(toUserId).session(session);
                if (!receiver) {
                  errors.push({ transfer, error: "Receiver not found" });
                  continue;
                }

                receiver.balance = mongoose.Types.Decimal128.fromString(
                  String(
                    Number((receiver.balance || mongoose.Types.Decimal128.fromString("0")).toString()) +
                      Number(amount.toString())
                  )
                );

                await receiver.save({ session });

                const tx = await Transaction.create(
                  [
                    {
                      fromUserId: null,
                      toUserId,
                      amount,
                      type: "manual",
                      status: "approved",
                      reason,
                      batchId,
                      adminId,
                      adminIp,
                      adminUserAgent,
                    },
                  ],
                  { session }
                );

                results.push(tx[0]._id.toString());
              }
            } catch (err) {
              errors.push({ transfer, error: err.message });
            }
          }

          await session.commitTransaction();

          const userIds = [...new Set(transfers.map((t) => t.toUserId?.toString()).filter(Boolean))];
          await invalidateBalanceCache(userIds);

          logger.info(`Bulk transfer completed: batch ${batchId}, ${results.length} successful, ${errors.length} failed`);

          return { success: results.length, failed: errors.length, errors };
        } catch (error) {
          await session.abortTransaction();
          logger.error("Bulk transfer worker error:", error);
          throw error;
        } finally {
          session.endSession();
        }
      },
      {
        connection: {
          host: process.env.REDIS_HOST || "localhost",
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
        },
        concurrency: 1,
      }
    );

    worker.on("completed", (job) => {
      logger.info(`Bulk transfer job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
      logger.error(`Bulk transfer job ${job?.id} failed:`, err);
    });

    logger.info("Bulk transfer worker initialized");
    return worker;
  } catch (error) {
    logger.warn("Bulk transfer worker initialization failed:", error.message);
    return null;
  }
};

setTimeout(() => {
  initializeWorker();
}, 2000);

export default worker;
