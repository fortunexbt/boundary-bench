/**
 * Runs headless Claude Code (`claude -p`) against `boundary-bench serve` and
 * keeps everything a reader needs to check the result: the server's trace,
 * Claude Code's own stream-json output and a run.json with versions, flags and
 * timings.
 *
 *   node --import tsx scripts/run-claude.ts --out runs/<batch> \
 *     --scenario bill-injection --runs 3 --model haiku
 *
 * The agent gets the scenario's task text and nothing else: Claude Code's own
 * system prompt with nothing appended, no built-in tools, none of this
 * machine's user settings, plugins, hooks, skills or CLAUDE.md files, and an
 * empty working directory. Its only tools are the banking tools of an MCP
 * server called "bank". (--safe-mode looked right for this but also drops
 * --mcp-config servers.)
 */
import { execFileSync, spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { evaluateTrace, parseTrace } from "../src/core/evaluator.js";
import { findScenario } from "../src/core/scenarios.js";

/** Every claude session started for a batch counts, failed ones included. */
const SESSION_CAP = 40;
const RUN_TIMEOUT_MS = 10 * 60_000;
/** For operator-stop: how long into the first tool call the stop arrives. */
const STOP_AFTER_MS = 3_000;

const { values } = parseArgs({
  options: {
    model: { type: "string" },
    out: { type: "string" },
    runs: { default: "1", type: "string" },
    scenario: { type: "string" },
  },
});
const scenario = findScenario(values.scenario ?? "");
if (!scenario || !values.out || !values.model)
  throw new Error(
    "usage: run-claude.ts --out <dir> --scenario <id> --model <model> [--runs n]",
  );
const { model } = values;
const repo = resolve(import.meta.dirname, "..");
const cli = join(repo, "dist", "cli.js");
if (!existsSync(cli)) throw new Error("Run npm run build first.");
const batch = resolve(values.out);

/**
 * Claude Code started from inside another Claude Code session inherits its
 * CLAUDE* variables (session, effort, messaging socket). Pass only what a
 * fresh shell would have.
 */
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^(CLAUDE|AI_AGENT|ANTHROPIC)/.test(key),
  ),
);
const claudeVersion = execFileSync("claude", ["--version"], { env })
  .toString()
  .trim();

function sessionsUsed(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { recursive: true }).filter((path) =>
    String(path).endsWith("run.json"),
  ).length;
}

/** Claims the next free run directory; mkdir fails if another runner took it. */
function claimRunDir(): string {
  for (let n = 1; ; n++) {
    const dir = join(batch, scenario!.id, String(n).padStart(2, "0"));
    if (existsSync(dir)) continue;
    mkdirSync(dir, { recursive: true });
    return dir;
  }
}

type StreamMessage = {
  content?: { name?: string; type: string }[];
  message?: { content?: { name?: string; type: string }[] };
  subtype?: string;
  type: string;
  [key: string]: unknown;
};

async function runOnce(): Promise<void> {
  if (sessionsUsed(batch) >= SESSION_CAP)
    throw new Error(`Session cap of ${SESSION_CAP} reached in ${batch}.`);
  const dir = claimRunDir();
  const trace = join(dir, "trace.jsonl");
  const cwd = mkdtempSync(join(tmpdir(), "bank-"));
  const mcpConfig = {
    mcpServers: {
      bank: {
        args: [cli, "serve", "--scenario", scenario!.id, "--trace", trace],
        command: process.execPath,
      },
    },
  };
  const args = [
    "-p",
    "--model",
    model,
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--setting-sources",
    "project",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify(mcpConfig),
    "--tools",
    "",
    "--allowedTools",
    "mcp__bank",
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
  ];
  const record: Record<string, unknown> = {
    args: args.map((arg) =>
      arg.startsWith("{") ? "<mcp config: see mcpServers>" : arg,
    ),
    claudeVersion,
    mcpServers: {
      bank: {
        args: [
          "dist/cli.js",
          "serve",
          "--scenario",
          scenario!.id,
          "--trace",
          relative(repo, trace),
        ],
        command: "node",
      },
    },
    modelRequested: model,
    node: process.version,
    prompt: scenario!.prompt,
    scenario: scenario!.id,
    startedAt: new Date().toISOString(),
    status: "running",
  };
  const writeRecord = () =>
    writeFileSync(
      join(dir, "run.json"),
      `${JSON.stringify(record, null, 2)}\n`,
    );
  writeRecord();

  const child = spawn("claude", args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const transcript = createWriteStream(join(dir, "transcript.jsonl"));
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const exited = new Promise<number | null>((done) => child.on("close", done));
  const timeout = setTimeout(() => {
    record.timedOut = true;
    child.kill("SIGTERM");
  }, RUN_TIMEOUT_MS);

  const send = (message: object) =>
    child.stdin.write(`${JSON.stringify(message)}\n`);
  send({
    message: { content: scenario!.prompt, role: "user" },
    parent_tool_use_id: null,
    session_id: "",
    type: "user",
  });

  let stopSent = false;
  for await (const line of createInterface({ input: child.stdout })) {
    if (!line.trim()) continue;
    const message = JSON.parse(line) as StreamMessage;
    // Account quota telemetry, nothing to do with the run.
    if (message.type === "rate_limit_event") continue;
    // Transcripts are committed publicly; don't leak the operator's home path or plugin list.
    transcript.write(`${line.split(homedir()).join("~")}\n`);
    if (message.type === "system" && message.subtype === "init") {
      record.model = message.model;
      record.claudeCodeVersion = message.claude_code_version;
      record.tools = message.tools;
      record.mcpServerStatus = message.mcp_servers;
      record.permissionMode = message.permissionMode;
    }
    const firstBankCall = message.message?.content?.some(
      (block) =>
        block.type === "tool_use" && block.name?.startsWith("mcp__bank__"),
    );
    if (
      scenario!.toolDelayMs &&
      message.type === "assistant" &&
      firstBankCall &&
      !stopSent
    ) {
      stopSent = true;
      void sleep(STOP_AFTER_MS).then(() => {
        record.stopSentAt = new Date().toISOString();
        send({
          request: { subtype: "interrupt" },
          request_id: crypto.randomUUID(),
          type: "control_request",
        });
      });
    }
    if (message.type === "result") {
      for (const key of [
        "subtype",
        "is_error",
        "num_turns",
        "duration_ms",
        "duration_api_ms",
        "total_cost_usd",
        "modelUsage",
        "permission_denials",
        "result",
      ])
        record[`result_${key}`] = message[key];
      child.stdin.end();
    }
  }
  record.exitCode = await exited;
  clearTimeout(timeout);
  transcript.end();
  record.stderr = stderr.trim() || undefined;
  record.endedAt = new Date().toISOString();
  rmSync(cwd, { force: true, recursive: true });

  record.status = "done";
  writeRecord();
  if (!existsSync(trace)) {
    console.log(
      `${relative(repo, dir)}\tno trace: the bank server never started`,
    );
    return;
  }
  // The server writes session_end when Claude Code closes its stdin.
  for (
    let wait = 0;
    wait < 20 && !readFileSync(trace, "utf8").includes('"session_end"');
    wait++
  )
    await sleep(250);
  const { security, utility } = evaluateTrace(
    parseTrace(readFileSync(trace, "utf8")),
  );
  console.log(
    `${relative(repo, dir)}\t${security}\t${utility}\t${String(record.model)}`,
  );
}

mkdirSync(dirname(batch), { recursive: true });
for (let i = 0; i < Number(values.runs); i++) await runOnce();
