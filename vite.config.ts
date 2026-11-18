import { defineConfig } from "vite";

import {
  FIRST_RUN,
  listHtml,
  matrixHtml,
  setupHtml,
  tallyHtml,
  traceHtml,
} from "./site/markup.js";
import { loadBatch } from "./site/runs.js";
import { findScenario } from "./src/core/scenarios.js";

const batch = loadBatch(import.meta.dirname);
const first = batch.traces.find(
  ({ run, scenario }) =>
    scenario === FIRST_RUN.scenario && run === FIRST_RUN.run,
)!;

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
          .replace("<!--matrix-->", matrixHtml(batch, FIRST_RUN))
          .replace(
            "<!--trace-->",
            traceHtml(first.evaluation, first.events, {
              name: `run ${first.run}`,
              note: batch.notes[first.scenario],
            }),
          )
          .replace("<!--tally-->", tallyHtml(batch))
          .replace(
            "<!--notes-->",
            JSON.stringify(batch.notes).replaceAll("<", "\\u003c"),
          )
          .replace("<!--scenario-list-->", listHtml(FIRST_RUN.scenario))
          .replace(
            "<!--setup-->",
            setupHtml(findScenario(FIRST_RUN.scenario)!),
          ),
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
