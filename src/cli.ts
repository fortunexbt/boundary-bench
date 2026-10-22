#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { evaluateTrace, parseTrace } from "./core/evaluator.js";
import { formatRate, tally } from "./core/report.js";
import { findScenario, SCENARIOS } from "./core/scenarios.js";
import { serveScenario, VERSION } from "./server.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function usage(): string {
  return `BoundaryBench ${VERSION}

Usage:
  boundary-bench list
  boundary-bench serve --scenario <id> --trace <path.jsonl>
  boundary-bench evaluate <path.jsonl>
  boundary-bench report <path.jsonl>...

serve runs a stdio MCP server for your agent's MCP client and records the
session to the trace file. evaluate checks a finished trace and exits 0 on
pass, 2 on fail and 3 when the run never reached the boundary under test.
report evaluates many traces and counts verdicts per scenario, with 95%
Wilson intervals.`;
}

function listCommand(): void {
  for (const scenario of SCENARIOS) {
    console.log(`${scenario.id}\t${scenario.title}`);
    console.log(`\tprompt: ${scenario.prompt}`);
    if (scenario.operator) console.log(`\tyou: ${scenario.operator}`);
  }
}

async function serveCommand(args: string[]): Promise<void> {
  const id = valueAfter(args, "--scenario");
  const tracePath = valueAfter(args, "--trace");
  const scenario = id ? findScenario(id) : undefined;
  if (!scenario)
    throw new Error(
      `serve needs --scenario, one of: ${SCENARIOS.map((s) => s.id).join(", ")}`,
    );
  if (!tracePath) throw new Error("serve needs --trace <path.jsonl>");

  const path = resolve(tracePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
  const session = await serveScenario(
    scenario,
    new StdioServerTransport(),
    (line) => appendFileSync(path, line),
  );
  console.error(`boundary-bench: serving ${scenario.id}, recording to ${path}`);

  process.stdin.once("end", () => void session.close());
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      session.end(`received ${signal}`);
      process.exit(0);
    });
}

async function evaluateCommand(path: string | undefined): Promise<void> {
  if (!path) throw new Error("evaluate needs a trace path");
  const evaluation = evaluateTrace(
    parseTrace(await readFile(resolve(path), "utf8")),
  );
  const client = evaluation.client
    ? `${evaluation.client.name} ${evaluation.client.version}`
    : "unknown client";
  console.log(`${evaluation.scenario.id} (${client})`);
  for (const check of evaluation.checks)
    console.log(
      `  ${check.passed ? "ok  " : "FAIL"} ${check.label}\n       ${check.detail}`,
    );
  console.log(evaluation.verdict.toUpperCase());
  process.exitCode = { fail: 2, inconclusive: 3, pass: 0 }[evaluation.verdict];
}

async function reportCommand(paths: string[]): Promise<void> {
  if (paths.length === 0) throw new Error("report needs one or more traces");
  const evaluations = await Promise.all(
    paths.map(async (path) =>
      evaluateTrace(parseTrace(await readFile(resolve(path), "utf8"))),
    ),
  );
  const tallies = tally(evaluations);
  const rows = tallies.map((row) => [
    row.scenario.id,
    String(row.n),
    formatRate(row.rates.pass, row.n),
    formatRate(row.rates.fail, row.n),
    formatRate(row.rates.inconclusive, row.n),
  ]);
  const table = [["scenario", "N", "pass", "fail", "inconclusive"], ...rows];
  const widths = table[0]!.map((_, column) =>
    Math.max(...table.map((row) => row[column]!.length)),
  );
  for (const row of table)
    console.log(row.map((cell, i) => cell.padEnd(widths[i]!)).join("  "));
  const clients = new Set(tallies.flatMap((row) => row.clients));
  console.log(`\n${paths.length} traces from ${[...clients].join(", ")}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "list":
      return listCommand();
    case "serve":
      return serveCommand(args);
    case "evaluate":
      return evaluateCommand(args[0]);
    case "report":
      return reportCommand(args);
    case undefined:
    case "--help":
    case "-h":
      return console.log(usage());
    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
