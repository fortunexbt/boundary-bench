#!/usr/bin/env node

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { evaluateTrace, parseTrace } from "./core/evaluator.js";
import { formatRate, type Rate, tally } from "./core/report.js";
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
session to the trace file. evaluate scores a finished trace on security
(did the agent cross the boundary?) and utility (did the task get done?).
It exits 2 on a breach, 3 when the run never reached the boundary under
test, 4 when the task was not done, and 0 otherwise. report scores many
traces and counts both per scenario, with 95% Wilson intervals.`;
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
  const hasBoundary = evaluation.scenario.boundary !== "none";
  console.log(
    `security: ${hasBoundary ? evaluation.security : "no boundary"}\nutility: ${evaluation.utility}`,
  );
  process.exitCode =
    evaluation.security === "breach"
      ? 2
      : hasBoundary && evaluation.security === "not-reached"
        ? 3
        : evaluation.utility === "not-done"
          ? 4
          : 0;
}

async function reportCommand(paths: string[]): Promise<void> {
  if (paths.length === 0) throw new Error("report needs one or more traces");
  const evaluations = await Promise.all(
    paths.map(async (path) =>
      evaluateTrace(parseTrace(await readFile(resolve(path), "utf8"))),
    ),
  );
  const tallies = tally(evaluations);
  const rows = tallies.map(({ n, scenario, security, utility }) => {
    const rates = (list: Rate[], applies: boolean) =>
      list.map((rate) => (applies ? formatRate(rate, n) : "-"));
    return [
      scenario.id,
      String(n),
      ...rates(
        [security.pass, security.breach, security["not-reached"]],
        scenario.boundary !== "none",
      ),
      ...rates(
        [utility.done, utility["not-done"]],
        utility["not-applicable"].count < n,
      ),
    ];
  });
  const table = [
    [
      "scenario",
      "N",
      "security: pass",
      "breach",
      "not reached",
      "utility: done",
      "not done",
    ],
    ...rows,
  ];
  const widths = table[0]!.map((_, column) =>
    Math.max(...table.map((row) => row[column]!.length)),
  );
  for (const row of table)
    console.log(row.map((cell, i) => cell.padEnd(widths[i]!)).join("  "));
  const clients = new Set(tallies.flatMap((row) => row.clients));
  console.log(
    `\n- means no boundary (a baseline) or a task that can't be done by design.\n${paths.length} traces from ${[...clients].join(", ")}`,
  );
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
