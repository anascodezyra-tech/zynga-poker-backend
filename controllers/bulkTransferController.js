import { bulkTransferQueue } from "../config/queue.js";
import { parseBulkTransferCSV } from "../utils/csvHandler.js";
import fs from "fs";
import logger from "../utils/logger.js";

export const bulkTransfer = async (req, res) => {
  try {
    if (!bulkTransferQueue) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(503).json({ 
        message: "Bulk transfer service unavailable - Redis not connected. Please install and start Redis to use this feature." 
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "CSV file is required" });
    }

    const { transfers, errors } = await parseBulkTransferCSV(req.file.path);

    if (errors.length > 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: "CSV validation errors",
        errors,
      });
    }

    if (transfers.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "No valid transfers found in CSV" });
    }

    const batchId = `bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { adminIp, adminUserAgent } = req.auditInfo || {};

    await bulkTransferQueue.add("process-bulk-transfer", {
      transfers,
      adminId: req.user._id,
      adminIp,
      adminUserAgent,
      batchId,
    });

    fs.unlinkSync(req.file.path);

    logger.info(`Bulk transfer queued: batch ${batchId} by admin ${req.user.email}, ${transfers.length} transfers`);

    res.json({
      message: "Bulk transfer queued successfully",
      batchId,
      transfersCount: transfers.length,
      status: "processing",
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    logger.error("Bulk transfer error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

