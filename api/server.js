// ============================================================================
// VERCEL SERVERLESS FUNCTION ENTRY POINT
// ============================================================================
// This file is the entry point for Vercel serverless functions.
// It imports the Express app from the root server.js and exports it.
// Vercel routes all requests to this file based on vercel.json configuration.
// ============================================================================

// Import the Express app from the root server.js
// The root server.js contains all the Express setup, routes, and middleware
import app from "../server.js";

// Export the app as default for Vercel
// Vercel's @vercel/node builder will use this as the serverless function handler
export default app;

