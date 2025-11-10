import User from "../models/User.js";
import { getCachedBalance, setCachedBalance } from "../utils/cache.js";
import logger from "../utils/logger.js";

export const getBalance = async (req, res) => {
  try {
    if (req.user.role === "Admin") {
      const users = await User.find().select("name email balance role createdAt");
      const formattedUsers = users.map((user) => ({
        ...user.toObject(),
        balance: user.balance ? user.balance.toString() : "0",
      }));
      return res.json(formattedUsers);
    } else {
      const cached = await getCachedBalance(req.user._id.toString());
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const user = await User.findById(req.user._id).select("name email balance createdAt");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const formattedUser = {
        ...user.toObject(),
        balance: user.balance ? user.balance.toString() : "0",
      };

      await setCachedBalance(req.user._id.toString(), JSON.stringify(formattedUser));
      res.json(formattedUser);
    }
  } catch (error) {
    logger.error("Get balance error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getUsers = async (req, res) => {
  try {
    // For players, return all users except themselves
    // For admins, return all users
    const query = req.user.role === "Admin" 
      ? {} 
      : { _id: { $ne: req.user._id } };
    
    const users = await User.find(query)
      .select("name email balance role createdAt")
      .sort({ name: 1 });
    
    const formattedUsers = users.map((user) => ({
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance ? user.balance.toString() : "0",
    }));
    
    res.json(formattedUsers);
  } catch (error) {
    logger.error("Get users error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

