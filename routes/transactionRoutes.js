import express from "express";
import { getTransactions, exportTransactions } from "../controllers/transactionController.js";
import { protect } from "../middleware/authMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { transactionQueryValidation } from "../middleware/validation.js";

const router = express.Router();

router.get("/transactions", apiLimiter, protect, transactionQueryValidation, getTransactions);

router.get("/transactions/export", apiLimiter, protect, transactionQueryValidation, exportTransactions);

export default router;
