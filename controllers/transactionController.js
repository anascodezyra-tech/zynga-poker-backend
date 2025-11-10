import Transaction from "../models/Transaction.js";
import logger from "../utils/logger.js";
import { exportTransactionsToCSV } from "../utils/csvHandler.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getTransactions = async (req, res) => {
  try {
    const { fromDate, toDate, status, type, userId, page = 1, limit = 100 } = req.query;
    const filter = {};

    if (req.user.role === "Player") {
      filter.$or = [{ fromUserId: req.user._id }, { toUserId: req.user._id }];
    } else if (userId) {
      filter.$or = [{ fromUserId: userId }, { toUserId: userId }];
    }

    if (type) filter.type = type;
    if (status) filter.status = status;

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transactions = await Transaction.find(filter)
      .populate("fromUserId toUserId adminId verifiedBy", "name email role")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Transaction.countDocuments(filter);

    const formattedTxs = transactions.map((tx) => ({
      ...tx.toObject(),
      amount: tx.amount ? tx.amount.toString() : "0",
    }));

    res.json({
      transactions: formattedTxs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error("Get transactions error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const exportTransactions = async (req, res) => {
  try {
    const { fromDate, toDate, status, type, userId } = req.query;
    const filter = {};

    if (req.user.role === "Player") {
      filter.$or = [{ fromUserId: req.user._id }, { toUserId: req.user._id }];
    } else if (userId) {
      filter.$or = [{ fromUserId: userId }, { toUserId: userId }];
    }

    if (type) filter.type = type;
    if (status) filter.status = status;

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    const transactions = await Transaction.find(filter)
      .populate("fromUserId toUserId adminId", "name email")
      .sort({ createdAt: -1 })
      .limit(100000);

    const fileName = `transactions_${Date.now()}.csv`;
    const filePath = path.join(__dirname, "../exports", fileName);

    await exportTransactionsToCSV(transactions, filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        logger.error("Export download error:", err);
      }
    });
  } catch (error) {
    logger.error("Export transactions error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

