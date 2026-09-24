import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Targeted RBAC browser suite (RBAC Phase 5). Starts its OWN API and Vite dev
 * server on separate ports (3101 / 5174) with the API's store in a fresh temp
 * directory (CASES_DATA_DIR), so it never touches data/store.json and never
 * collides with a dev server you already have running on 3001 / 5173.
 *
 * E2E_BASE_URL=http://host:port runs the same tests against an app you
 * started yourself (no web servers are launched).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = 3101;
const WEB_PORT = 5174;
const external = process.env.E2E_BASE_URL;
const dataDir = external ? "" : fs.mkdtempSync(path.join(os.tmpdir(), "cases-e2e-"));

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: external ?? `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : [
        {
          command: "pnpm --filter @cases/api-server exec tsx src/index.ts",
          cwd: ROOT,
          url: `http://127.0.0.1:${API_PORT}/healthz`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            CASES_DATA_DIR: dataDir,
            PORT: String(API_PORT),
            TRUSTED_FRONTEND_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
            LOG_LEVEL: "warn",
          },
        },
        {
          command: `pnpm --filter @cases/cases exec vite --port ${WEB_PORT} --strictPort`,
          cwd: ROOT,
          url: `http://127.0.0.1:${WEB_PORT}`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: { API_PORT: String(API_PORT), VITE_PORT: String(WEB_PORT) },
        },
      ],
});
