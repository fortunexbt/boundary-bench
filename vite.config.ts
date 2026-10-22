import { defineConfig } from "vite";

import {
  FIRST_SCENARIO,
  listHtml,
  resultsHtml,
  setupHtml,
} from "./site/markup.js";
import { loadBatch } from "./site/runs.js";
import { findScenario } from "./src/core/scenarios.js";

const batch = loadBatch(import.meta.dirname);

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
          .replace("<!--results-->", resultsHtml(batch))
          .replace("<!--scenario-list-->", listHtml(FIRST_SCENARIO))
          .replace("<!--setup-->", setupHtml(findScenario(FIRST_SCENARIO)!)),
    },
    {
      name: "recorded-traces",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const trace = batch.traces.find(
            ({ file }) => request.url === `/${file}`,
          );
          if (!trace) return next();
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(trace.text);
        });
      },
      generateBundle() {
        for (const { file, text } of batch.traces)
          this.emitFile({ fileName: file, source: text, type: "asset" });
      },
    },
  ],
});
