import winston from "winston";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const logsDir = path.join(rootDir, "logs");

// Check if we're in a serverless environment
const isServerless = process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME || !fs.existsSync || typeof fs.existsSync !== "function";

const transports = [];

// Only add file transports if not in serverless and directory exists/writable
if (!isServerless) {
  try {
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Check if directory is writable
    try {
      fs.accessSync(logsDir, fs.constants.W_OK);
      transports.push(
        new winston.transports.File({ filename: path.join(logsDir, "error.log"), level: "error" }),
        new winston.transports.File({ filename: path.join(logsDir, "combined.log") })
      );
    } catch (err) {
      // Directory not writable, skip file transports
      console.warn("Logs directory not writable, using console only");
    }
  } catch (err) {
    // Failed to create/write to logs directory, skip file transports
    console.warn("Failed to setup file logging, using console only:", err.message);
  }
}

// Always add console transport
transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "zynga-poker-backend" },
  transports: transports,
});

export default logger;

