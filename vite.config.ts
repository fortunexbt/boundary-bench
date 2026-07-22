import { defineConfig } from "vite";

export default defineConfig({
  root: "site",
  base: "./",
  build: {
    outDir: "../dist-site",
    emptyOutDir: true,
  },
});
