import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Each lifecycle test replays several webhooks through an in-process PGlite database; on a busy CI runner one
    // took 5.08 s and failed the 5 s default (CI run 45266582458) although it passes. 30 s keeps real hangs visible.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
