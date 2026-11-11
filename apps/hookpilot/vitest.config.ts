import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig says jsx: "preserve" (Next compiles JSX itself); tests need it compiled.
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "pglite:memory",
      APP_URL: "http://localhost:3003",
      CRON_SECRET: "test-cron-secret-0123456789abcdef",
      SESSION_SECRET: "test-session-secret-0123456789-0123456789-abcdef",
      // Client IPs come only from Fly-Client-IP in tests, so spoofed X-Forwarded-For is ignored.
      TRUSTED_PROXY: "fly",
      STRIPE_SECRET_KEY: "",
    },
  },
});
