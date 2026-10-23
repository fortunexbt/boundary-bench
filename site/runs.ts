import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { evaluateTrace, parseTrace } from "../src/core/evaluator.js";
import { tally } from "../src/core/report.js";
import type { RecordedBatch } from "./markup.js";

/** The batch of recorded runs the site shows, relative to the repo root. */
export const BATCH = "runs/2026-10-23-claude-code-haiku";

/**
 * Reads a batch written by scripts/run-claude.ts at build time and scores
 * every trace with the same evaluator the CLI uses. Run directories that hold
 * no trace (the failed setup run) are skipped.
 */
export function loadBatch(root: string): RecordedBatch & {
  traces: { file: string; text: string }[];
} {
  const dir = join(root, BATCH);
  const runs = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith("trace.jsonl"))
    .sort()
    .map((path) => {
      const [scenario, run] = path.split("/");
      const text = readFileSync(join(dir, path), "utf8");
      const meta = JSON.parse(
        readFileSync(join(dir, scenario!, run!, "run.json"), "utf8"),
      ) as { claudeVersion: string; model: string; startedAt: string };
      return {
        evaluation: evaluateTrace(parseTrace(text)),
        file: `runs/${scenario}-${run}.jsonl`,
        meta,
        run: run!,
        scenario: scenario!,
        text,
      };
    });

  const unique = (values: string[]) => [...new Set(values)].join(", ");
  return {
    client: unique(runs.map((run) => run.meta.claudeVersion)),
    date: `${unique(runs.map((run) => run.meta.startedAt.slice(0, 10)))} UTC`,
    model: unique(runs.map((run) => run.meta.model)),
    notes: JSON.parse(
      readFileSync(join(dir, "notes.json"), "utf8"),
    ) as RecordedBatch["notes"],
    path: BATCH,
    runs: runs.map(({ evaluation, file, run, scenario }) => ({
      file,
      run,
      scenario,
      security: evaluation.security,
      utility: evaluation.utility,
    })),
    tallies: tally(runs.map((run) => run.evaluation)),
    traces: runs.map(({ file, text }) => ({ file, text })),
  };
}
