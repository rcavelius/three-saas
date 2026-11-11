/**
 * Headless end-to-end checks against a production server on port 3102:
 *
 *   npx next build
 *   APP_URL=http://localhost:3102 DATABASE_URL=pglite:./.data/e2e DEV_MAIL_DIR=./.data/e2e-mail \
 *     SESSION_SECRET=<32+ chars> npx next start --port 3102
 *   npx playwright test -c e2e/playwright.config.ts
 *
 * Always headless Microsoft Edge (installed browser, no download).
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3102",
    channel: "msedge",
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
    // Password-protected staging: E2E_HTTP_PASSWORD (any username). Never committed; read from the environment.
    ...(process.env.E2E_HTTP_PASSWORD
      ? { httpCredentials: { username: "e2e", password: process.env.E2E_HTTP_PASSWORD, send: "always" as const } }
      : {}),
  },
});
