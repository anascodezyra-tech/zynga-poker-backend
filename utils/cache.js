import redis from "../config/redis.js";

const CACHE_TTL = 300;

const isRedisAvailable = () => {
  return redis && redis.status === "ready";
};

export const getCachedBalance = async (userId) => {
  if (!isRedisAvailable()) return null;
  try {
    const cached = await redis.get(`balance:${userId}`);
    return cached ? cached : null;
  } catch (err) {
    return null;
  }
};

export const setCachedBalance = async (userId, balance) => {
  if (!isRedisAvailable()) return;
  try {
    await redis.setex(`balance:${userId}`, CACHE_TTL, balance);
  } catch (err) {
    // Silently fail if Redis is unavailable
  }
};

export const invalidateBalanceCache = async (userIds) => {
  if (!isRedisAvailable()) return;
  try {
    const pipeline = redis.pipeline();
    userIds.forEach((userId) => {
      pipeline.del(`balance:${userId}`);
    });
    await pipeline.exec();
  } catch (err) {
    // Silently fail if Redis is unavailable
  }
};

export const checkIdempotency = async (key) => {
  if (!isRedisAvailable()) return false;
  try {
    const exists = await redis.exists(`idempotency:${key}`);
    return exists === 1;
  } catch (err) {
    return false;
  }
};

export const setIdempotency = async (key, ttl = 86400) => {
  if (!isRedisAvailable()) return;
  try {
    await redis.setex(`idempotency:${key}`, ttl, "1");
  } catch (err) {
    // Silently fail if Redis is unavailable
  }
};

