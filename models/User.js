import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"]
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ["Admin", "Player"],
    required: true,
    default: "Player"
  },
  balance: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString("0")
  },
  // Anti-ban and verification fields
  isVerified: {
    type: Boolean,
    default: false
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null
  },
  bannedAt: {
    type: Date,
    default: null
  },
  bannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  // Suspicious activity tracking
  suspiciousActivityCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastSuspiciousActivity: {
    type: Date,
    default: null
  },
  suspiciousActivityFlags: {
    type: [String],
    default: []
  },
  // Rate limiting and activity tracking
  lastLoginAt: {
    type: Date,
    default: null
  },
  lastLoginIp: {
    type: String,
    trim: true,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0,
    min: 0
  },
  accountRecoveryEnabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: "users"
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isBanned: 1, isVerified: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ suspiciousActivityCount: -1 });

userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function(plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
