import User from "../models/User.js";
import logger from "../utils/logger.js";

/**
 * Middleware to check if user is banned
 * Prevents banned users from performing actions
 */
export const checkBanStatus = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isBanned) {
      logger.warn(`Banned user attempted action: ${user.email} - ${req.method} ${req.path}`);
      return res.status(403).json({
        message: "Account is banned",
        banReason: user.banReason,
        bannedAt: user.bannedAt,
      });
    }

    next();
  } catch (error) {
    logger.error("Ban check error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Middleware to check if user is verified (for certain sensitive operations)
 */
export const checkVerification = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isVerified && user.role === "Player") {
      return res.status(403).json({
        message: "Account verification required",
        isVerified: false,
      });
    }

    next();
  } catch (error) {
    logger.error("Verification check error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

