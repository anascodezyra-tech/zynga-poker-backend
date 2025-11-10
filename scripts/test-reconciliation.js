import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import redis from "../config/redis.js";

dotenv.config();

const testReconciliation = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const users = await User.find();
    console.log(`Checking ${users.length} users...`);

    let mismatches = 0;
    let matches = 0;
    let notCached = 0;

    for (const user of users) {
      const dbBalance = user.balance ? user.balance.toString() : "0";
      const cached = await redis.get(`balance:${user._id}`);

      if (cached) {
        const cachedData = JSON.parse(cached);
        if (cachedData.balance !== dbBalance) {
          console.log(
            `❌ Mismatch for user ${user.email} (${user._id}): DB=${dbBalance}, Cache=${cachedData.balance}`
          );
          mismatches++;
        } else {
          matches++;
        }
      } else {
        notCached++;
      }
    }

    console.log("\n=== Reconciliation Results ===");
    console.log(`Total users: ${users.length}`);
    console.log(`✅ Matches: ${matches}`);
    console.log(`❌ Mismatches: ${mismatches}`);
    console.log(`ℹ️  Not cached: ${notCached}`);

    if (mismatches === 0) {
      console.log("\n✅ Reconciliation passed - All cached balances match database");
    } else {
      console.log(`\n⚠️  Reconciliation failed - ${mismatches} mismatches found`);
    }

    process.exit(mismatches > 0 ? 1 : 0);
  } catch (error) {
    console.error("Reconciliation test error:", error);
    process.exit(1);
  }
};

testReconciliation();

