import express from "express";
import { login } from "../controllers/authController.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { loginValidation } from "../middleware/validation.js";

const router = express.Router();

router.post("/login", authLimiter, loginValidation, login);

export default router;
