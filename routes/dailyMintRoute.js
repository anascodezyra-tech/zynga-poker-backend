import express from "express";
import { dailyMint } from "../controllers/dailyMintController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { dailyMintValidation } from "../middleware/validation.js";
import { captureAuditInfo } from "../middleware/audit.js";

const router = express.Router();

router.post(
  "/daily-mint",
  apiLimiter,
  protect,
  authorize("Admin"),
  captureAuditInfo,
  dailyMintValidation,
  dailyMint
);

export default router;
