import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  toUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    validate: {
      validator: function(value) {
        const numValue = Number(value.toString());
        return numValue > 0 && numValue <= 20000000000000;
      },
      message: "Amount must be between 0 and 20 trillion"
    }
  },
  type: {
    type: String,
    enum: ["manual", "daily-mint", "request", "reversal", "chip-recovery"],
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "approved", "reversed", "failed"],
    required: true,
    default: "pending"
  },
  idempotencyKey: {
    type: String,
    trim: true,
    // Remove `sparse` from field and handle in index only
  },
  isReversal: {
    type: Boolean,
    default: false
  },
  reversedTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction",
    default: null
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  adminIp: {
    type: String,
    trim: true
  },
  adminUserAgent: {
    type: String,
    trim: true,
    maxlength: 500
  },
  batchId: {
    type: String,
    trim: true
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  // Chip recovery specific fields
  recoveryFromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  recoveryReason: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true,
  collection: "transactions"
});

// Indexes
transactionSchema.index({ fromUserId: 1, createdAt: -1 });
transactionSchema.index({ toUserId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true }); // unique + sparse handled here only
transactionSchema.index({ batchId: 1, createdAt: -1 });
transactionSchema.index({ adminId: 1, createdAt: -1 });
transactionSchema.index({ reversedTransactionId: 1 });
transactionSchema.index({ createdAt: -1 });

// Make transactions immutable
transactionSchema.pre([
  "updateOne",
  "findOneAndUpdate",
  "updateMany",
  "findByIdAndUpdate"
], function() {
  throw new Error("Transactions are immutable and cannot be updated");
});

transactionSchema.pre([
  "deleteOne",
  "findOneAndDelete",
  "deleteMany",
  "findByIdAndDelete"
], function() {
  throw new Error("Transactions are immutable and cannot be deleted");
});

const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
