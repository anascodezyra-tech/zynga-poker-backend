import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import { invalidateBalanceCache } from "../utils/cache.js";
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

/**
 * Recover chips from a banned user to a verified account
 * This is the core chip-switching functionality
 */
export const recoverChips = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bannedUserId, verifiedUserId, reason } = req.body;
    const { adminIp, adminUserAgent } = req.auditInfo || {};
    const idempotencyKey = req.idempotencyKey;

    if (!bannedUserId || !verifiedUserId) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "Banned user ID and verified user ID are required" 
      });
    }

    if (bannedUserId.toString() === verifiedUserId.toString()) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "Cannot recover chips to the same account" 
      });
    }

    // Fetch both users
    const bannedUser = await User.findById(bannedUserId).session(session);
    const verifiedUser = await User.findById(verifiedUserId).session(session);

    if (!bannedUser || !verifiedUser) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    // Verify banned user is actually banned
    if (!bannedUser.isBanned) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "Source user is not banned. Chip recovery only works for banned accounts." 
      });
    }

    // Verify target user is verified
    if (!verifiedUser.isVerified) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "Target user must be verified to receive recovered chips" 
      });
    }

    // Check if banned user has any balance
    const bannedBalance = bannedUser.balance || mongoose.Types.Decimal128.fromString("0");
    const balanceNumber = Number(bannedBalance.toString());

    if (balanceNumber <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "Banned user has no chips to recover" 
      });
    }

    // Transfer all chips from banned user to verified user
    const verifiedBalance = verifiedUser.balance || mongoose.Types.Decimal128.fromString("0");
    
    bannedUser.balance = mongoose.Types.Decimal128.fromString("0");
    verifiedUser.balance = mongoose.Types.Decimal128.fromString(
      String(Number(verifiedBalance.toString()) + balanceNumber)
    );

    await bannedUser.save({ session });
    await verifiedUser.save({ session });

    // Create recovery transaction
    const recoveryTx = await Transaction.create(
      [
        {
          fromUserId: bannedUserId,
          toUserId: verifiedUserId,
          amount: bannedBalance,
          type: "chip-recovery",
          status: "approved",
          idempotencyKey,
          reason: reason || `Chip recovery from banned account`,
          recoveryFromUserId: bannedUserId,
          recoveryReason: reason || `Recovered chips from banned account: ${bannedUser.email}`,
          adminId: req.user._id,
          adminIp,
          adminUserAgent,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    await invalidateBalanceCache([
      bannedUserId.toString(),
      verifiedUserId.toString(),
    ]);

    const io = req.app.get("io");
    if (io) {
      io.emit("balanceUpdated", {
        userIds: [bannedUserId.toString(), verifiedUserId.toString()],
      });
      io.emit("transactionCreated", { transactionId: recoveryTx[0]._id.toString() });
      io.emit("chipRecoveryCompleted", {
        bannedUserId: bannedUserId.toString(),
        verifiedUserId: verifiedUserId.toString(),
        amount: balanceNumber,
      });
    }

    logger.info(
      `Chip recovery completed: ${balanceNumber} chips from ${bannedUser.email} (banned) to ${verifiedUser.email} (verified) by admin ${req.user.email}`
    );

    res.json({
      message: "Chips recovered successfully",
      transaction: {
        ...recoveryTx[0].toObject(),
        amount: recoveryTx[0].amount.toString(),
      },
      recoveredAmount: balanceNumber,
      bannedUser: {
        id: bannedUser._id,
        email: bannedUser.email,
        previousBalance: balanceNumber,
        newBalance: 0,
      },
      verifiedUser: {
        id: verifiedUser._id,
        email: verifiedUser.email,
        previousBalance: Number(verifiedBalance.toString()),
        newBalance: Number(verifiedUser.balance.toString()),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Chip recovery error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * Get list of banned users with recoverable chips
 */
export const getBannedUsersWithChips = async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {
      isBanned: true,
      accountRecoveryEnabled: true,
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    const [bannedUsers, total] = await Promise.all([
      User.find(query)
        .select("name email balance isBanned banReason bannedAt bannedBy suspiciousActivityCount")
        .sort({ bannedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    // Filter users with balance > 0 and format response
    const usersWithChips = bannedUsers
      .filter((user) => {
        const balance = user.balance ? Number(user.balance.toString()) : 0;
        return balance > 0;
      })
      .map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        balance: user.balance ? user.balance.toString() : "0",
        banReason: user.banReason,
        bannedAt: user.bannedAt,
        suspiciousActivityCount: user.suspiciousActivityCount || 0,
      }));

    res.json({
      users: usersWithChips,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error("Get banned users error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get list of verified users (eligible to receive recovered chips)
 */
export const getVerifiedUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {
      isVerified: true,
      isBanned: false,
      role: "Player",
    };

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    const [verifiedUsers, total] = await Promise.all([
      User.find(query)
        .select("name email balance isVerified verifiedAt")
        .sort({ verifiedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    const formattedUsers = verifiedUsers.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      balance: user.balance ? user.balance.toString() : "0",
      verifiedAt: user.verifiedAt,
    }));

    res.json({
      users: formattedUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error("Get verified users error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Verify a user account (admin only)
 */
export const verifyUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.body;
    const { adminIp, adminUserAgent } = req.auditInfo || {};

    if (!userId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      await session.abortTransaction();
      return res.status(400).json({ message: "User is already verified" });
    }

    user.isVerified = true;
    user.verifiedAt = new Date();
    user.verifiedBy = req.user._id;

    await user.save({ session });
    await session.commitTransaction();

    logger.info(`User verified: ${user.email} by admin ${req.user.email}`);

    res.json({
      message: "User verified successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isVerified: user.isVerified,
        verifiedAt: user.verifiedAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Verify user error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * Ban a user account (admin only)
 */
export const banUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, reason } = req.body;
    const { adminIp, adminUserAgent } = req.auditInfo || {};

    if (!userId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!reason || reason.trim().length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Ban reason is required" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "Admin") {
      await session.abortTransaction();
      return res.status(403).json({ message: "Cannot ban admin users" });
    }

    if (user.isBanned) {
      await session.abortTransaction();
      return res.status(400).json({ message: "User is already banned" });
    }

    user.isBanned = true;
    user.banReason = reason.trim();
    user.bannedAt = new Date();
    user.bannedBy = req.user._id;

    await user.save({ session });
    await session.commitTransaction();

    logger.warn(`User banned: ${user.email} by admin ${req.user.email}. Reason: ${reason}`);

    res.json({
      message: "User banned successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isBanned: user.isBanned,
        banReason: user.banReason,
        bannedAt: user.bannedAt,
        balance: user.balance ? user.balance.toString() : "0",
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Ban user error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * Unban a user account (admin only)
 */
export const unbanUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.body;
    const { adminIp, adminUserAgent } = req.auditInfo || {};

    if (!userId) {
      await session.abortTransaction();
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isBanned) {
      await session.abortTransaction();
      return res.status(400).json({ message: "User is not banned" });
    }

    user.isBanned = false;
    user.banReason = null;
    user.bannedAt = null;
    user.bannedBy = null;

    await user.save({ session });
    await session.commitTransaction();

    logger.info(`User unbanned: ${user.email} by admin ${req.user.email}`);

    res.json({
      message: "User unbanned successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        isBanned: user.isBanned,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Unban user error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

