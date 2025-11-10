import { body, query, validationResult } from "express-validator";

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export const loginValidation = [
  body("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail()
    .customSanitizer((value) => value?.toLowerCase().trim()),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  validate,
];

export const transferValidation = [
  body("toUserId").isMongoId().withMessage("Invalid toUserId"),
  body("fromUserId").optional().isMongoId().withMessage("Invalid fromUserId"),
  body("amount")
    .isFloat({ min: 0.01, max: 20000000000000 })
    .withMessage("Amount must be between 0.01 and 20 trillion"),
  body("reason").optional().isString().trim().isLength({ max: 500 }),
  body("type").isIn(["manual", "request"]).withMessage("Invalid type"),
  validate,
];

export const reverseValidation = [
  body("transactionId").isMongoId().withMessage("Invalid transactionId"),
  body("reason").isString().trim().isLength({ min: 1, max: 500 }),
  validate,
];

export const transactionQueryValidation = [
  query("fromDate").optional().isISO8601(),
  query("toDate").optional().isISO8601(),
  query("status").optional().isIn(["pending", "approved", "reversed", "failed"]),
  query("type").optional().isIn(["manual", "daily-mint", "request", "reversal"]),
  query("userId").optional().isMongoId(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 1000 }),
  validate,
];

export const dailyMintValidation = [
  body("amountPerUser")
    .optional()
    .isFloat({ min: 0.01, max: 20000000000000 })
    .withMessage("Amount must be between 0.01 and 20 trillion"),
  validate,
];

