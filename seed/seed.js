import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB Atlas");
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

const seedDatabase = async () => {
  try {
    await connectDB();

    const userCount = await User.countDocuments();
    const transactionCount = await Transaction.countDocuments();

    if (userCount > 0 || transactionCount > 0) {
      console.log(`⚠️  Collections are not empty. Users: ${userCount}, Transactions: ${transactionCount}`);
      console.log("Skipping seed to prevent overwriting existing data.");
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log("🌱 Starting seed process...");

    const admin = await User.create({
      name: "Admin Master",
      email: "admin@example.com",
      password: "Admin@123",
      role: "Admin",
      balance: mongoose.Types.Decimal128.fromString("20000000000000"),
    });

    console.log(`✅ Created Admin: ${admin.email} (${admin._id})`);

    const player1 = await User.create({
      name: "Player One",
      email: "player1@example.com",
      password: "Player@123",
      role: "Player",
      balance: mongoose.Types.Decimal128.fromString("5000000000"),
    });

    console.log(`✅ Created Player 1: ${player1.email} (${player1._id})`);

    const player2 = await User.create({
      name: "Player Two",
      email: "player2@example.com",
      password: "Player@123",
      role: "Player",
      balance: mongoose.Types.Decimal128.fromString("10000000000"),
    });

    console.log(`✅ Created Player 2: ${player2.email} (${player2._id})`);

    const transaction1 = await Transaction.create({
      fromUserId: admin._id,
      toUserId: player1._id,
      amount: mongoose.Types.Decimal128.fromString("2000000000"),
      status: "approved",
      type: "manual",
      idempotencyKey: "seed-001",
      isReversal: false,
      reason: "Initial transfer",
      adminId: admin._id,
      adminIp: "127.0.0.1",
      adminUserAgent: "seed-script",
    });

    console.log(`✅ Created Transaction 1: ${transaction1._id}`);

    const transaction2 = await Transaction.create({
      fromUserId: player1._id,
      toUserId: player2._id,
      amount: mongoose.Types.Decimal128.fromString("1000000000"),
      status: "approved",
      type: "manual",
      idempotencyKey: "seed-002",
      isReversal: false,
      reason: "Demo trade",
      adminId: admin._id,
      adminIp: "127.0.0.1",
      adminUserAgent: "seed-script",
    });

    console.log(`✅ Created Transaction 2: ${transaction2._id}`);

    const finalUserCount = await User.countDocuments();
    const finalTransactionCount = await Transaction.countDocuments();

    console.log("\n📊 Seed Summary:");
    console.log(`   Users inserted: ${finalUserCount}`);
    console.log(`   Transactions inserted: ${finalTransactionCount}`);

    console.log("\n✅ Seed data inserted successfully!");
    console.log("\n🔐 Login Credentials:");
    console.log("   Admin: admin@example.com / Admin@123");
    console.log("   Player 1: player1@example.com / Player@123");
    console.log("   Player 2: player2@example.com / Player@123");

    await mongoose.connection.close();
    console.log("\n✅ Database connection closed.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seedDatabase();
