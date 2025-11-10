import express from "express";
import { getBalance, getUsers } from "../controllers/balanceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.get("/balance", apiLimiter, protect, getBalance);
router.get("/users", apiLimiter, protect, getUsers);

export default router;
