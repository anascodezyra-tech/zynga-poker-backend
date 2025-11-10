import csv from "csv-parser";
import fs from "fs";
import { createObjectCsvWriter } from "csv-writer";
import mongoose from "mongoose";

export const parseBulkTransferCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row, index) => {
        try {
          const fromUserId = row.fromUserId || null;
          const toUserId = row.toUserId || null;
          const amount = parseFloat(row.amount);

          if (!toUserId) {
            errors.push({ row: index + 2, error: "toUserId is required" });
            return;
          }

          if (!amount || isNaN(amount) || amount <= 0) {
            errors.push({ row: index + 2, error: "Invalid amount" });
            return;
          }

          if (!mongoose.Types.ObjectId.isValid(toUserId)) {
            errors.push({ row: index + 2, error: "Invalid toUserId format" });
            return;
          }

          if (fromUserId && !mongoose.Types.ObjectId.isValid(fromUserId)) {
            errors.push({ row: index + 2, error: "Invalid fromUserId format" });
            return;
          }

          results.push({
            fromUserId: fromUserId || null,
            toUserId,
            amount: mongoose.Types.Decimal128.fromString(String(amount)),
            reason: row.reason || "",
          });
        } catch (err) {
          errors.push({ row: index + 2, error: err.message });
        }
      })
      .on("end", () => {
        resolve({ transfers: results, errors });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
};

export const exportTransactionsToCSV = async (transactions, filePath) => {
  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "id", title: "Transaction ID" },
      { id: "fromUserId", title: "From User ID" },
      { id: "toUserId", title: "To User ID" },
      { id: "amount", title: "Amount" },
      { id: "type", title: "Type" },
      { id: "status", title: "Status" },
      { id: "reason", title: "Reason" },
      { id: "adminId", title: "Admin ID" },
      { id: "createdAt", title: "Created At" },
    ],
  });

  const records = transactions.map((tx) => ({
    id: tx._id.toString(),
    fromUserId: tx.fromUserId ? tx.fromUserId.toString() : "",
    toUserId: tx.toUserId ? tx.toUserId.toString() : "",
    amount: tx.amount ? tx.amount.toString() : "0",
    type: tx.type,
    status: tx.status,
    reason: tx.reason || "",
    adminId: tx.adminId ? tx.adminId.toString() : "",
    createdAt: tx.createdAt ? tx.createdAt.toISOString() : "",
  }));

  await csvWriter.writeRecords(records);
  return filePath;
};

