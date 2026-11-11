import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One file at a time: every file creates and drops its own database on the shared server.
    fileParallelism: false,
  },
});
