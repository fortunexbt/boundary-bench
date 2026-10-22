import { defineConfig } from "vite";

import { FIRST_SCENARIO, listHtml, setupHtml } from "./site/markup.js";
import { findScenario } from "./src/core/scenarios.js";

export default defineConfig({
  root: "site",
  base: "./",
  build: {
    outDir: "../dist-site",
    emptyOutDir: true,
  },
  plugins: [
    {
      name: "prerender-scenarios",
      transformIndexHtml: (html) =>
        html
          .replace("<!--scenario-list-->", listHtml(FIRST_SCENARIO))
          .replace("<!--setup-->", setupHtml(findScenario(FIRST_SCENARIO)!)),
    },
  ],
});
