import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { invalidateBalanceCache } from "../utils/cache.js";
import logger from "../utils/logger.js";

export const dailyMint = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const FIXED_DAILY_MINT_AMOUNT = 10000;
    const { amountPerUser } = req.body;
    const mintAmount = amountPerUser !== undefined ? Number(amountPerUser) : FIXED_DAILY_MINT_AMOUNT;

    if (isNaN(mintAmount) || mintAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "amountPerUser must be a positive number" });
    }

    const users = await User.find({}).session(session);
    if (users.length === 0) {
      await session.abortTransaction();
      return res.status(404).json({ message: "No users found" });
    }

    const amtDec = mongoose.Types.Decimal128.fromString(String(mintAmount));
    const { adminIp, adminUserAgent } = req.auditInfo || {};
    const batchId = `daily-mint-${Date.now()}`;

    const txs = [];
    const userIds = [];

    for (const user of users) {
      const currentBalance = user.balance || mongoose.Types.Decimal128.fromString("0");
      const newBalance = mongoose.Types.Decimal128.fromString(
        String(Number(currentBalance.toString()) + mintAmount)
      );
      user.balance = newBalance;
      await user.save({ session });

      txs.push({
        fromUserId: null,
        toUserId: user._id,
        amount: amtDec,
        type: "daily-mint",
        status: "approved",
        batchId,
        adminId: req.user._id,
        adminIp,
        adminUserAgent,
      });

      userIds.push(user._id.toString());
    }

    await Transaction.insertMany(txs, { session });
    await session.commitTransaction();

    await invalidateBalanceCache(userIds);

    const io = req.app.get("io");
    if (io) {
      io.emit("balanceUpdated", { userIds });
      io.emit("dailyMintCompleted", { batchId, count: users.length });
    }

    logger.info(`Daily mint completed: ${batchId} by admin ${req.user.email}, ${users.length} users`);

    res.json({
      message: "Daily mint applied successfully",
      count: users.length,
      amountPerUser: mintAmount.toString(),
      batchId,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Daily mint error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

