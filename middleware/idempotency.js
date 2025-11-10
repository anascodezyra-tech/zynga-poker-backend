import { checkIdempotency, setIdempotency } from "../utils/cache.js";
import Transaction from "../models/Transaction.js";

export const idempotencyCheck = async (req, res, next) => {
  const idempotencyKey = req.headers["idempotency-key"] || req.body.idempotencyKey;

  if (!idempotencyKey) {
    return next();
  }

  try {
    const existsInCache = await checkIdempotency(idempotencyKey);
    if (existsInCache) {
      return res.status(409).json({
        message: "Request already processed",
        idempotencyKey,
      });
    }

    const existingTx = await Transaction.findOne({ idempotencyKey });
    if (existingTx) {
      await setIdempotency(idempotencyKey);
      return res.status(200).json({
        message: "Transaction already exists",
        transaction: {
          ...existingTx.toObject(),
          amount: existingTx.amount.toString(),
        },
      });
    }

    req.idempotencyKey = idempotencyKey;
    next();
  } catch (err) {
    console.error("Idempotency check error:", err);
    next();
  }
};

