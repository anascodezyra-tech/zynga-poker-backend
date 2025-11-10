import express from "express";
import {
  recoverChips,
  getBannedUsersWithChips,
  getVerifiedUsers,
  verifyUser,
  banUser,
  unbanUser,
} from "../controllers/recoveryController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { captureAuditInfo } from "../middleware/audit.js";
import { idempotencyCheck } from "../middleware/idempotency.js";

const router = express.Router();

// All recovery routes require admin authentication
router.use(protect);
router.use(authorize("Admin"));

// Chip recovery endpoint
router.post(
  "/recovery/chips",
  apiLimiter,
  idempotencyCheck,
  captureAuditInfo,
  recoverChips
);

// Get banned users with recoverable chips
router.get(
  "/recovery/banned-users",
  apiLimiter,
  getBannedUsersWithChips
);

// Get verified users (eligible to receive chips)
router.get(
  "/recovery/verified-users",
  apiLimiter,
  getVerifiedUsers
);

// Verify a user account
router.post(
  "/recovery/verify",
  apiLimiter,
  captureAuditInfo,
  verifyUser
);

// Ban a user account
router.post(
  "/recovery/ban",
  apiLimiter,
  captureAuditInfo,
  banUser
);

// Unban a user account
router.post(
  "/recovery/unban",
  apiLimiter,
  captureAuditInfo,
  unbanUser
);

export default router;

