import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // tsconfig keeps "jsx": "preserve" for Next; tests need JSX compiled.
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    // Node by default; component tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    testTimeout: 30_000,
  },
});
