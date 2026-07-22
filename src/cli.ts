#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { adaptA2a1_0, adaptMcp2025_11_25 } from "./core/adapters.js";
import {
  buildResultBundle,
  evaluateTrace,
  REFERENCE_CANDIDATES,
  verifyResultBundle,
} from "./core/evaluator.js";
import { materializeTrace } from "./core/receipts.js";
import type { ProtocolEnvelope } from "./core/adapters.js";
import type { ResultBundle, TraceEvent } from "./core/types.js";
import { scenarios } from "./fixtures/scenarios.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function usage(): string {
  return `BoundaryBench v0.1.0

Usage:
  boundary-bench run [--candidate all|guarded-reference|naive-reference] [--out path]
  boundary-bench verify <bundle.json>
  boundary-bench adapt --profile mcp|a2a --input envelopes.json --out trace.json
  boundary-bench evaluate --scenario id --trace trace.json --replay replay.json [--out run.json]
  boundary-bench list

The built-in candidates are illustrative deterministic fixtures, not model rankings.`;
}

async function runCommand(args: string[]): Promise<void> {
  const candidateId = valueAfter(args, "--candidate") ?? "all";
  const outputPath = resolve(
    valueAfter(args, "--out") ?? "boundary-bench-results.json",
  );
  const candidates =
    candidateId === "all"
      ? REFERENCE_CANDIDATES
      : REFERENCE_CANDIDATES.filter(
          (candidate) => candidate.id === candidateId,
        );

  if (candidates.length === 0)
    throw new Error(`Unknown candidate: ${candidateId}`);

  const bundle = buildResultBundle(scenarios, candidates);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  for (const scorecard of bundle.scorecards) {
    console.log(
      `${scorecard.candidateId}: ${scorecard.scenariosPassed}/${scorecard.scenariosTotal} scenarios; ` +
        `${scorecard.pairedControlsPassed}/${scorecard.pairedControlsTotal} paired controls`,
    );
  }
  console.log(`bundle sha256:${bundle.bundleHash}`);
  console.log(`wrote ${outputPath}`);
}

async function verifyCommand(path: string | undefined): Promise<void> {
  if (!path) throw new Error("verify requires a result bundle path");
  const bundle = JSON.parse(
    await readFile(resolve(path), "utf8"),
  ) as ResultBundle;
  const errors = verifyResultBundle(bundle, scenarios);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(`verified sha256:${bundle.bundleHash}`);
  console.log(
    `${bundle.runs.length} trace(s), ${bundle.scenarios.length} scenario(s), zero verification errors`,
  );
}

async function adaptCommand(args: string[]): Promise<void> {
  const profile = valueAfter(args, "--profile");
  const inputPath = valueAfter(args, "--input");
  const outputPath = resolve(
    valueAfter(args, "--out") ?? "normalized-trace.json",
  );
  if (!inputPath) throw new Error("adapt requires --input");
  if (profile !== "mcp" && profile !== "a2a")
    throw new Error("adapt --profile must be mcp or a2a");

  const envelopes = JSON.parse(
    await readFile(resolve(inputPath), "utf8"),
  ) as ProtocolEnvelope[];
  if (!Array.isArray(envelopes))
    throw new Error("adapter input must be a JSON array");
  const seeds =
    profile === "mcp" ? adaptMcp2025_11_25(envelopes) : adaptA2a1_0(envelopes);
  const trace = materializeTrace(seeds);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  console.log(`adapted ${trace.length} event(s) with ${profile} profile`);
  console.log(`wrote ${outputPath}`);
}

async function evaluateCommand(args: string[]): Promise<void> {
  const scenarioId = valueAfter(args, "--scenario");
  const tracePath = valueAfter(args, "--trace");
  const replayPath = valueAfter(args, "--replay");
  const outputPath = valueAfter(args, "--out");
  if (!scenarioId || !tracePath || !replayPath) {
    throw new Error("evaluate requires --scenario, --trace, and --replay");
  }

  const scenario = scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  const trace = JSON.parse(
    await readFile(resolve(tracePath), "utf8"),
  ) as TraceEvent[];
  const replay = JSON.parse(
    await readFile(resolve(replayPath), "utf8"),
  ) as TraceEvent[];
  if (!Array.isArray(trace) || !Array.isArray(replay))
    throw new Error("trace and replay must be JSON arrays");

  const run = evaluateTrace(scenario, "external-trace", trace, replay);
  const serialized = `${JSON.stringify(run, null, 2)}\n`;
  if (outputPath) {
    const resolvedOutput = resolve(outputPath);
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, serialized, "utf8");
    console.log(`wrote ${resolvedOutput}`);
  } else {
    process.stdout.write(serialized);
  }
  console.log(
    `${run.passed ? "PASS" : "FAIL"} ${scenario.id} sha256:${run.traceRoot}`,
  );
  if (!run.passed) process.exitCode = 2;
}

function listCommand(): void {
  for (const scenario of scenarios) {
    console.log(
      `${scenario.id}\t${scenario.variant}\t${scenario.protocol}\t${scenario.title}`,
    );
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  switch (command) {
    case "run":
      await runCommand(args);
      break;
    case "verify":
      await verifyCommand(args[0]);
      break;
    case "adapt":
      await adaptCommand(args);
      break;
    case "evaluate":
      await evaluateCommand(args);
      break;
    case "list":
      listCommand();
      break;
    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
