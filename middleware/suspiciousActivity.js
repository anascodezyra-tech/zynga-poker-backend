import User from "../models/User.js";
import logger from "../utils/logger.js";

/**
 * Track suspicious activity for a user
 * This helps prevent unnecessary bans by tracking patterns
 */
export const trackSuspiciousActivity = async (userId, activityType, details = {}) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Increment suspicious activity count
    user.suspiciousActivityCount = (user.suspiciousActivityCount || 0) + 1;
    user.lastSuspiciousActivity = new Date();

    // Add activity flag if not already present
    if (!user.suspiciousActivityFlags.includes(activityType)) {
      user.suspiciousActivityFlags.push(activityType);
    }

    await user.save();

    logger.warn(
      `Suspicious activity detected for user ${user.email}: ${activityType}`,
      details
    );

    // Auto-ban threshold (configurable, default: 10 suspicious activities)
    const BAN_THRESHOLD = parseInt(process.env.SUSPICIOUS_ACTIVITY_BAN_THRESHOLD || "10", 10);
    
    if (user.suspiciousActivityCount >= BAN_THRESHOLD && !user.isBanned) {
      logger.error(
        `User ${user.email} reached suspicious activity threshold (${BAN_THRESHOLD}). Consider manual review for ban.`
      );
      // Note: We don't auto-ban here. Admin should review and ban manually.
    }
  } catch (error) {
    logger.error("Error tracking suspicious activity:", error);
  }
};

/**
 * Middleware to detect suspicious transfer patterns
 */
export const detectSuspiciousTransfer = async (req, res, next) => {
  try {
    // Only check for Player role
    if (req.user?.role !== "Player") {
      return next();
    }

    const { amount, toUserId } = req.body;

    if (amount && toUserId) {
      const amountNum = Number(amount);
      
      // Check for suspicious patterns:
      // 1. Very large transfers
      const LARGE_TRANSFER_THRESHOLD = 1000000000; // 1 billion
      if (amountNum > LARGE_TRANSFER_THRESHOLD) {
        await trackSuspiciousActivity(
          req.user._id,
          "large_transfer",
          { amount: amountNum, toUserId }
        );
      }

      // 2. Rapid successive transfers (check via Redis or DB)
      // This would require additional tracking - simplified for now
    }

    next();
  } catch (error) {
    logger.error("Suspicious transfer detection error:", error);
    next(); // Continue even if detection fails
  }
};

/**
 * Reset suspicious activity count (admin action)
 */
export const resetSuspiciousActivity = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return false;

    user.suspiciousActivityCount = 0;
    user.suspiciousActivityFlags = [];
    user.lastSuspiciousActivity = null;

    await user.save();
    logger.info(`Suspicious activity reset for user: ${user.email}`);
    return true;
  } catch (error) {
    logger.error("Error resetting suspicious activity:", error);
    return false;
  }
};

