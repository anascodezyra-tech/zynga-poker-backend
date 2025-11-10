import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { setIdempotency, invalidateBalanceCache } from "../utils/cache.js";
import logger from "../utils/logger.js";

const toDecimal = (value) => {
  const numValue = Number(value);
  if (isNaN(numValue) || numValue <= 0) {
    throw new Error("Invalid amount");
  }
  return mongoose.Types.Decimal128.fromString(String(numValue));
};

const compareDecimal = (a, b) => {
  return Number(a.toString()) - Number(b.toString());
};

export const transfer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { toUserId, fromUserId, amount, reason, type } = req.body;
    const idempotencyKey = req.idempotencyKey;
    const { adminIp, adminUserAgent } = req.auditInfo || {};

    if (req.user.role === "Player" && type !== "request") {
      await session.abortTransaction();
      return res.status(403).json({ message: "Players can only submit requests" });
    }

    if (req.user.role === "Admin" && type !== "manual") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Admin must use type 'manual'" });
    }

    if (type === "request" && req.user.role === "Player") {
      const receiver = await User.findById(toUserId).session(session);
      if (!receiver) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Receiver not found" });
      }

      if (req.user._id.toString() === toUserId.toString()) {
        await session.abortTransaction();
        return res.status(400).json({ message: "Cannot request transfer to yourself" });
      }

      const amtDec = toDecimal(amount);
      const tx = await Transaction.create(
        [
          {
            fromUserId: req.user._id,
            toUserId,
            amount: amtDec,
            type: "request",
            status: "pending",
            idempotencyKey,
            reason,
            adminIp,
            adminUserAgent,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      await setIdempotency(idempotencyKey);

      logger.info(`Transfer request created: ${tx[0]._id} by ${req.user.email}`);

      res.json({
        message: "Request submitted",
        transaction: {
          ...tx[0].toObject(),
          amount: tx[0].amount.toString(),
        },
      });
      return;
    }

    if (type === "manual" && req.user.role === "Admin") {
      const senderId = fromUserId || null;
      const receiver = await User.findById(toUserId).session(session);
      if (!receiver) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Receiver not found" });
      }

      if (senderId) {
        const sender = await User.findById(senderId).session(session);
        if (!sender) {
          await session.abortTransaction();
          return res.status(404).json({ message: "Sender not found" });
        }

        if (senderId.toString() === toUserId.toString()) {
          await session.abortTransaction();
          return res.status(400).json({ message: "Cannot transfer to the same user" });
        }

        const amtDec = toDecimal(amount);
        const senderBalance = sender.balance || mongoose.Types.Decimal128.fromString("0");

        if (compareDecimal(senderBalance, amtDec) < 0) {
          await session.abortTransaction();
          return res.status(400).json({ message: "Insufficient balance" });
        }

        sender.balance = mongoose.Types.Decimal128.fromString(
          String(Number(senderBalance.toString()) - Number(amount))
        );
        receiver.balance = mongoose.Types.Decimal128.fromString(
          String(
            Number((receiver.balance || mongoose.Types.Decimal128.fromString("0")).toString()) +
              Number(amount)
          )
        );

        await sender.save({ session });
        await receiver.save({ session });

        const tx = await Transaction.create(
          [
            {
              fromUserId: senderId,
              toUserId,
              amount: amtDec,
              type: "manual",
              status: "approved",
              idempotencyKey,
              reason,
              adminId: req.user._id,
              adminIp,
              adminUserAgent,
            },
          ],
          { session }
        );

        await session.commitTransaction();
        await setIdempotency(idempotencyKey);
        await invalidateBalanceCache([senderId.toString(), toUserId.toString()]);

        const io = req.app.get("io");
        if (io) {
          io.emit("balanceUpdated", { userIds: [senderId.toString(), toUserId.toString()] });
          io.emit("transactionCreated", { transactionId: tx[0]._id.toString() });
        }

        logger.info(`Transfer completed: ${tx[0]._id} by admin ${req.user.email}`);

        res.json({
          message: "Transfer completed",
          transaction: {
            ...tx[0].toObject(),
            amount: tx[0].amount.toString(),
          },
        });
        return;
      } else {
        const amtDec = toDecimal(amount);
        receiver.balance = mongoose.Types.Decimal128.fromString(
          String(
            Number((receiver.balance || mongoose.Types.Decimal128.fromString("0")).toString()) +
              Number(amount)
          )
        );

        await receiver.save({ session });

        const tx = await Transaction.create(
          [
            {
              fromUserId: null,
              toUserId,
              amount: amtDec,
              type: "manual",
              status: "approved",
              idempotencyKey,
              reason,
              adminId: req.user._id,
              adminIp,
              adminUserAgent,
            },
          ],
          { session }
        );

        await session.commitTransaction();
        await setIdempotency(idempotencyKey);
        await invalidateBalanceCache([toUserId.toString()]);

        const io = req.app.get("io");
        if (io) {
          io.emit("balanceUpdated", { userIds: [toUserId.toString()] });
          io.emit("transactionCreated", { transactionId: tx[0]._id.toString() });
        }

        logger.info(`Credit transfer completed: ${tx[0]._id} by admin ${req.user.email}`);

        res.json({
          message: "Transfer completed",
          transaction: {
            ...tx[0].toObject(),
            amount: tx[0].amount.toString(),
          },
        });
        return;
      }
    }

    await session.abortTransaction();
    res.status(400).json({ message: "Invalid transfer type" });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Transfer error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

export const approveRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.body;
    const { adminIp, adminUserAgent } = req.auditInfo || {};

    const requestTx = await Transaction.findById(transactionId).session(session);
    if (!requestTx) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (requestTx.type !== "request") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Can only approve request transactions" });
    }

    if (requestTx.status !== "pending") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Request is not pending" });
    }

    if (!requestTx.fromUserId || !requestTx.toUserId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid request transaction" });
    }

    const sender = await User.findById(requestTx.fromUserId).session(session);
    const receiver = await User.findById(requestTx.toUserId).session(session);

    if (!sender || !receiver) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    const amount = requestTx.amount;
    const senderBalance = sender.balance || mongoose.Types.Decimal128.fromString("0");

    if (compareDecimal(senderBalance, amount) < 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Sender has insufficient balance" });
    }

    // Deduct from sender
    sender.balance = mongoose.Types.Decimal128.fromString(
      String(Number(senderBalance.toString()) - Number(amount.toString()))
    );
    
    // Add to receiver
    const receiverBalance = receiver.balance || mongoose.Types.Decimal128.fromString("0");
    receiver.balance = mongoose.Types.Decimal128.fromString(
      String(Number(receiverBalance.toString()) + Number(amount.toString()))
    );

    await sender.save({ session });
    await receiver.save({ session });

    // Update transaction status
    requestTx.status = "approved";
    requestTx.adminId = req.user._id;
    requestTx.adminIp = adminIp;
    requestTx.adminUserAgent = adminUserAgent;
    await requestTx.save({ session });

    await session.commitTransaction();
    await invalidateBalanceCache([
      requestTx.fromUserId.toString(),
      requestTx.toUserId.toString(),
    ]);

    const io = req.app.get("io");
    if (io) {
      io.emit("balanceUpdated", {
        userIds: [requestTx.fromUserId.toString(), requestTx.toUserId.toString()],
      });
      io.emit("transactionCreated", { transactionId: requestTx._id.toString() });
    }

    logger.info(`Request approved: ${transactionId} by admin ${req.user.email}`);

    res.json({
      message: "Request approved successfully",
      transaction: {
        ...requestTx.toObject(),
        amount: requestTx.amount.toString(),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Approve request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

export const rejectRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId, reason } = req.body;
    const { adminIp, adminUserAgent } = req.auditInfo || {};

    const requestTx = await Transaction.findById(transactionId).session(session);
    if (!requestTx) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (requestTx.type !== "request") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Can only reject request transactions" });
    }

    if (requestTx.status !== "pending") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Request is not pending" });
    }

    // Update transaction status to failed
    requestTx.status = "failed";
    requestTx.adminId = req.user._id;
    requestTx.adminIp = adminIp;
    requestTx.adminUserAgent = adminUserAgent;
    if (reason) {
      requestTx.reason = (requestTx.reason ? requestTx.reason + " | " : "") + `Rejected: ${reason}`;
    }
    await requestTx.save({ session });

    await session.commitTransaction();

    const io = req.app.get("io");
    if (io) {
      io.emit("transactionCreated", { transactionId: requestTx._id.toString() });
    }

    logger.info(`Request rejected: ${transactionId} by admin ${req.user.email}`);

    res.json({
      message: "Request rejected successfully",
      transaction: {
        ...requestTx.toObject(),
        amount: requestTx.amount.toString(),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Reject request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

export const reverseTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId, reason } = req.body;
    const { adminIp, adminUserAgent } = req.auditInfo || {};

    const originalTx = await Transaction.findById(transactionId).session(session);
    if (!originalTx) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (originalTx.status === "reversed") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Transaction already reversed" });
    }

    if (originalTx.type === "reversal") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot reverse a reversal transaction" });
    }

    if (originalTx.status !== "approved") {
      await session.abortTransaction();
      return res.status(400).json({ message: "Can only reverse approved transactions" });
    }

    if (!originalTx.fromUserId || !originalTx.toUserId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cannot reverse transaction without sender/receiver" });
    }

    const sender = await User.findById(originalTx.toUserId).session(session);
    const receiver = await User.findById(originalTx.fromUserId).session(session);

    if (!sender || !receiver) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    const amount = originalTx.amount;
    const senderBalance = sender.balance || mongoose.Types.Decimal128.fromString("0");
    const receiverBalance = receiver.balance || mongoose.Types.Decimal128.fromString("0");

    if (compareDecimal(senderBalance, amount) < 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Insufficient balance for reversal" });
    }

    sender.balance = mongoose.Types.Decimal128.fromString(
      String(Number(senderBalance.toString()) - Number(amount.toString()))
    );
    receiver.balance = mongoose.Types.Decimal128.fromString(
      String(Number(receiverBalance.toString()) + Number(amount.toString()))
    );

    await sender.save({ session });
    await receiver.save({ session });

    originalTx.status = "reversed";
    await originalTx.save({ session });

    const reversalTx = await Transaction.create(
      [
        {
          fromUserId: originalTx.toUserId,
          toUserId: originalTx.fromUserId,
          amount,
          type: "reversal",
          status: "approved",
          isReversal: true,
          reversedTransactionId: originalTx._id,
          reason,
          adminId: req.user._id,
          adminIp,
          adminUserAgent,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    await invalidateBalanceCache([
      originalTx.fromUserId.toString(),
      originalTx.toUserId.toString(),
    ]);

    const io = req.app.get("io");
    if (io) {
      io.emit("balanceUpdated", {
        userIds: [originalTx.fromUserId.toString(), originalTx.toUserId.toString()],
      });
      io.emit("transactionCreated", { transactionId: reversalTx[0]._id.toString() });
    }

    logger.info(`Transaction reversed: ${transactionId} by admin ${req.user.email}`);

    res.json({
      message: "Transaction reversed successfully",
      originalTransaction: {
        ...originalTx.toObject(),
        amount: originalTx.amount.toString(),
      },
      reversalTransaction: {
        ...reversalTx[0].toObject(),
        amount: reversalTx[0].amount.toString(),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Reverse transaction error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

