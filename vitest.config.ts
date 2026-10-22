import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    root: ".",
    testTimeout: 20_000,
  },
});
