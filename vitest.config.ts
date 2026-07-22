import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/core/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    include: ["tests/**/*.test.ts"],
    root: ".",
  },
});
