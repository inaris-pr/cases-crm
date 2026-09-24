/**
 * HTTP-level security setup shared by src/index.ts and the test app
 * (test/helpers/app.ts), so the two cannot drift.
 */
import type { Express } from "express";
import cors from "cors";
import { config } from "./config.js";

/**
 * CORS: same-origin only by default — no CORS headers are sent, so browsers
 * refuse cross-origin reads. The Vite dev server proxies /api, which makes
 * the app same-origin in development. Specific extra origins can be allowed
 * with CORS_ALLOWED_ORIGINS (credentials included).
 */
export function applyCorsPolicy(app: Express) {
  if (config.corsAllowedOrigins.length === 0) return;
  app.use(cors({ origin: config.corsAllowedOrigins, credentials: true }));
}
