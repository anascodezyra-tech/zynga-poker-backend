import jwt from "jsonwebtoken";
import User from "../models/User.js";
import logger from "../utils/logger.js";
import { trackSuspiciousActivity } from "../middleware/suspiciousActivity.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      logger.error("JWT_SECRET is not configured");
      return res.status(500).json({ message: "Server configuration error" });
    }

    // Normalize email to lowercase to match database storage
    const normalizedEmail = email?.toLowerCase().trim();

    if (!normalizedEmail || !password) {
      logger.warn(`Login attempt with missing email or password`);
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      logger.warn(`Login attempt with invalid email: ${normalizedEmail}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if user is banned
    if (user.isBanned) {
      logger.warn(`Banned user attempted login: ${normalizedEmail}`);
      return res.status(403).json({
        message: "Account is banned",
        banReason: user.banReason,
        bannedAt: user.bannedAt,
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      // Track failed login attempt
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      
      // Track suspicious activity after multiple failed attempts
      if (user.loginAttempts >= 5) {
        await trackSuspiciousActivity(
          user._id,
          "multiple_failed_logins",
          { attempts: user.loginAttempts, ip: req.ip }
        );
      }
      
      await user.save();
      logger.warn(`Login attempt with invalid password for: ${normalizedEmail}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Successful login - reset login attempts and update tracking
    user.loginAttempts = 0;
    user.lastLoginAt = new Date();
    user.lastLoginIp = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "1d" }
    );

    logger.info(`User logged in: ${user.email} (${user.role})`);

    res.json({
      token,
      role: user.role,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: user.balance ? user.balance.toString() : "0",
      },
    });
  } catch (error) {
    logger.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

