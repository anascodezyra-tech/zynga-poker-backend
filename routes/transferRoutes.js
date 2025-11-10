import express from "express";
import multer from "multer";
import { transfer, reverseTransaction, approveRequest, rejectRequest } from "../controllers/transferController.js";
import { bulkTransfer } from "../controllers/bulkTransferController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { transferLimiter, apiLimiter } from "../middleware/rateLimiter.js";
import { transferValidation, reverseValidation } from "../middleware/validation.js";
import { idempotencyCheck } from "../middleware/idempotency.js";
import { captureAuditInfo } from "../middleware/audit.js";
import { checkBanStatus } from "../middleware/banCheck.js";
import { detectSuspiciousTransfer } from "../middleware/suspiciousActivity.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post(
  "/transfer",
  apiLimiter,
  transferLimiter,
  protect,
  checkBanStatus,
  detectSuspiciousTransfer,
  idempotencyCheck,
  captureAuditInfo,
  transferValidation,
  transfer
);

router.post(
  "/transfer/approve",
  apiLimiter,
  protect,
  authorize("Admin"),
  captureAuditInfo,
  approveRequest
);

router.post(
  "/transfer/reject",
  apiLimiter,
  protect,
  authorize("Admin"),
  captureAuditInfo,
  rejectRequest
);

router.post(
  "/transfer/reverse",
  apiLimiter,
  protect,
  authorize("Admin"),
  captureAuditInfo,
  reverseValidation,
  reverseTransaction
);

router.post(
  "/transfer/bulk",
  apiLimiter,
  protect,
  authorize("Admin"),
  upload.single("csv"),
  captureAuditInfo,
  bulkTransfer
);

export default router;
