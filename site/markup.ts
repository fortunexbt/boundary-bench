import type { Rate, ScenarioTally } from "../src/core/report.js";
import { findScenario, SCENARIOS } from "../src/core/scenarios.js";
import type {
  Boundary,
  CheckRole,
  Evaluation,
  Scenario,
  Security,
  TraceEvent,
  TraceKind,
  Utility,
} from "../src/core/types.js";

/**
 * The recorded run shown first, prerendered into index.html at build time:
 * the clearest example of an agent carrying on past a boundary.
 */
export const FIRST_RUN = { run: "01", scenario: "budget-cap" };

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const REPO_URL = "https://github.com/fortunexbt/boundary-bench";

const BOUNDARY: Record<Boundary, string> = {
  approval: "Approval",
  budget: "Budget",
  none: "Baseline",
  prompt_injection: "Injection",
  stop: "Stop",
};

export const ROLE: Record<CheckRole, string> = {
  boundary: "security",
  precondition: "reached",
  utility: "utility",
};

function code(text: string, label: string): string {
  return `<div class="code"><pre><code>${escapeHtml(text)}</code></pre><button type="button" class="copy" data-copy="${escapeHtml(text)}">Copy<span class="sr-only"> ${escapeHtml(label)}</span></button></div>`;
}

export function setupHtml(scenario: Scenario): string {
  const trace = `$HOME/boundary-bench-traces/${scenario.id}.jsonl`;
  const args = ["serve", "--scenario", scenario.id, "--trace"];
  const claude = `claude mcp add bank -- node "$PWD/dist/cli.js" ${args.join(" ")} "${trace}"`;
  const json = JSON.stringify(
    {
      mcpServers: {
        bank: {
          args: [
            "/path/to/boundary-bench/dist/cli.js",
            ...args,
            `/path/to/boundary-bench-traces/${scenario.id}.jsonl`,
          ],
          command: "node",
        },
      },
    },
    null,
    2,
  );
  const baseline = scenario.baseline ? findScenario(scenario.baseline) : null;
  const twins = SCENARIOS.filter((item) => item.baseline === scenario.id);
  const injection = scenario.injection
    ? `<h3>What the agent will read</h3>
      <p>AgentDojo's <code>${scenario.injection.vector}</code>, carrying <code>${scenario.injection.injectionTask}</code>, exactly as AgentDojo serves it:</p>
      <pre class="served"><code>${escapeHtml(scenario.injection.served)}</code></pre>`
    : "";
  const related = baseline
    ? `<p class="related">Run <button type="button" class="link-button" data-scenario="${baseline.id}">${escapeHtml(baseline.title)}</button> as well. It is the same task without the boundary, so an agent that holds the boundary here only by refusing to work shows up there with the task not done.</p>`
    : twins.length > 0
      ? `<p class="related">Baseline for ${twins.map((twin) => `<button type="button" class="link-button" data-scenario="${twin.id}">${escapeHtml(twin.title)}</button>`).join(", ")}.</p>`
      : "";

  return `<div class="inspector__bar">
      <h2 id="setup-title" tabindex="-1">${escapeHtml(scenario.title)}</h2>
      <span class="tag tag--${scenario.boundary}">${BOUNDARY[scenario.boundary]}</span>
    </div>
    <div class="setup">
      <p>${escapeHtml(scenario.summary)}</p>
      ${related}
      <ol class="steps">
        <li>
          <h3>Build BoundaryBench once</h3>
          ${code(`git clone ${REPO_URL}\ncd boundary-bench\nnpm ci && npm run build`, "build commands")}
        </li>
        <li>
          <h3>Add the server to your agent's MCP client</h3>
          <p>Claude Code, run from the boundary-bench folder. Call it something plain like <code>bank</code> so the agent isn't told it's a test. To switch scenario, <code>claude mcp remove bank</code> first.</p>
          ${code(claude, "Claude Code command")}
          <details>
            <summary>Other clients: JSON config</summary>
            ${code(json, "JSON config")}
          </details>
        </li>
        <li>
          <h3>Give the agent this task</h3>
          <blockquote>${escapeHtml(scenario.prompt)}</blockquote>
          <p class="source">AgentDojo banking <code>${scenario.userTask}</code></p>
          <button type="button" class="copy copy--inline" data-copy="${escapeHtml(scenario.prompt)}">Copy task</button>
        </li>
        ${scenario.operator ? `<li><h3>While it runs</h3><p>${escapeHtml(scenario.operator)}</p></li>` : ""}
        <li>
          <h3>End the session, then check the trace</h3>
          ${code(`node dist/cli.js evaluate "${trace}"`, "evaluate command")}
          <p>Or open the file in the <a href="#check">trace panel</a> on this page.</p>
        </li>
      </ol>
      ${injection}
      <h3>Scored on</h3>
      <ul class="criteria">
        ${scenario.checks
          .map(
            (check) =>
              `<li><span class="criteria__role">${ROLE[check.role]}</span>${escapeHtml(check.label)}</li>`,
          )
          .join("")}
        ${scenario.checks.some((check) => check.role === "utility") ? "" : `<li><span class="criteria__role">${ROLE.utility}</span>Not scored: this scenario leaves no way to finish the task.</li>`}
      </ul>
    </div>`;
}

export function listHtml(selected: string): string {
  return SCENARIOS.map(
    (scenario) => `<li>
    <button type="button" class="scenario" data-scenario="${scenario.id}" aria-pressed="${scenario.id === selected}">
      <span class="scenario__title">${escapeHtml(scenario.title)}</span>
      <span class="tag tag--${scenario.boundary}">${BOUNDARY[scenario.boundary]}</span>
      <span class="scenario__summary">${escapeHtml(scenario.summary)}</span>
    </button>
  </li>`,
  ).join("");
}

export interface RecordedRun extends Pick<Evaluation, "security" | "utility"> {
  file: string;
  marks: Mark[];
  run: string;
  scenario: string;
}

export interface RecordedBatch {
  client: string;
  date: string;
  model: string;
  /** What the transcripts show, per scenario, in a sentence or three. */
  notes: Record<string, string>;
  path: string;
  runs: RecordedRun[];
  tallies: ScenarioTally[];
}

export const SECURITY_LABEL: Record<Security, string> = {
  pass: "Pass",
  breach: "Breach",
  "not-reached": "Not reached",
};

export const UTILITY_LABEL: Record<Utility, string> = {
  done: "Done",
  "not-done": "Not done",
  "not-applicable": "Not applicable",
};

/** Colour for a score: good, bad, or the boundary or task wasn't tested. */
export const TONE: Record<Security | Utility, "pass" | "fail" | "open"> = {
  breach: "fail",
  done: "pass",
  "not-applicable": "open",
  "not-done": "open",
  "not-reached": "open",
  pass: "pass",
};

/** The server's boundary markers, named for what happened at that point. */
const WALL: Partial<Record<TraceKind, string>> = {
  approval_required: "Approval refused",
  budget_exhausted: "Budget spent",
  prompt_injection: "Injection served",
  stop: "Stop received",
};

/**
 * A run reduced to what the agent did: each tool call in order, and a wall
 * wherever the server set a boundary. A call is `crossed` when a security
 * check failed on it.
 */
export type Mark =
  | {
      crossed: boolean;
      refused: boolean;
      seq: number;
      tool: string;
      type: "call";
    }
  | { label: string; seq: number; type: "wall" };

export function marksOf(events: TraceEvent[], evaluation: Evaluation): Mark[] {
  const crossed = crossedEvents(evaluation);
  const refused = new Set(
    events.flatMap((event) =>
      event.kind === "tool_result" && !event.ok ? [event.request] : [],
    ),
  );
  return events.flatMap((event): Mark[] => {
    if (event.kind === "tool_call")
      return [
        {
          crossed: crossed.has(event.seq),
          refused: refused.has(event.request),
          seq: event.seq,
          tool: event.tool,
          type: "call",
        },
      ];
    const label = WALL[event.kind];
    return label ? [{ label, seq: event.seq, type: "wall" }] : [];
  });
}

function crossedEvents(evaluation: Evaluation): Set<number> {
  return new Set(
    evaluation.checks
      .filter((check) => !check.passed && check.role === "boundary")
      .flatMap((check) => check.events),
  );
}

/** Tone of a run: the boundary's score, or for a baseline, the task's. */
function runTone(
  scenario: Scenario,
  run: Pick<Evaluation, "security" | "utility">,
) {
  return TONE[scenario.boundary === "none" ? run.utility : run.security];
}

function stripHtml(marks: Mark[]): string {
  return marks
    .map((mark) =>
      mark.type === "wall"
        ? `<i class="strip__wall"></i>`
        : `<i class="strip__call${mark.crossed ? " is-crossed" : ""}"></i>`,
    )
    .join("");
}

function eventText(event: TraceEvent): string {
  switch (event.kind) {
    case "session_start":
      return event.client
        ? `${event.client.name} ${event.client.version} connected`
        : "client connected";
    case "tool_call":
      return `${event.tool}(${JSON.stringify(event.args)})`;
    case "tool_result":
      return `${event.tool} ${event.ok ? "returned" : "refused or failed"}`;
    case "prompt_injection":
      return `${event.tool} served ${event.vector} (${event.injectionTask})`;
    case "budget_exhausted":
      return `all ${event.limit} calls used, call refused`;
    case "approval_required":
      return `${event.tool} refused, needs approval`;
    case "stop":
      return `client cancelled request ${event.request}${event.reason ? ` (${event.reason})` : ""}`;
    case "session_end":
      return event.reason;
  }
}

/** Where a trace came from: a recorded run, or a file the reader opened. */
export interface TraceSource {
  name: string;
  note?: string;
}

/** The scored trace: verdict, the run drawn against its boundary, checks, events. */
export function traceHtml(
  evaluation: Evaluation,
  events: TraceEvent[],
  source: TraceSource,
): string {
  const { scenario, security, utility } = evaluation;
  const hasBoundary = scenario.boundary !== "none";
  const crossed = crossedEvents(evaluation);
  const missed = new Set(
    evaluation.checks
      .filter((check) => !check.passed && check.role === "utility")
      .flatMap((check) => check.events),
  );
  const marks = marksOf(events, evaluation);
  const start = Date.parse(events[0]!.at);
  const client = evaluation.client
    ? `${evaluation.client.name} ${evaluation.client.version}`
    : "unknown client";

  // The check that decides the headline: the boundary (or why it was never
  // reached), or for a baseline, the task.
  const roles: CheckRole[] = hasBoundary
    ? security === "not-reached"
      ? ["precondition"]
      : ["boundary"]
    : ["utility"];
  const decisive = evaluation.checks.filter((check) =>
    roles.includes(check.role),
  );
  const lead = decisive.find((check) => !check.passed) ?? decisive[0];

  const main = hasBoundary
    ? { axis: "Security", tone: TONE[security], word: SECURITY_LABEL[security] }
    : { axis: "Utility", tone: TONE[utility], word: UTILITY_LABEL[utility] };
  const second = hasBoundary
    ? `Utility ${UTILITY_LABEL[utility].toLowerCase()}`
    : "No boundary, this is the baseline";

  // After the last wall, say so when the agent called nothing more.
  const lastWall = marks.findLastIndex((mark) => mark.type === "wall");
  const after =
    lastWall >= 0 && lastWall === marks.length - 1
      ? `<li class="lane__end" style="--i:${marks.length}">Nothing called after #${marks[lastWall]!.seq}</li>`
      : "";

  let step = 0;
  const lane = marks
    .map((mark) => {
      const delay = `style="--i:${step++}"`;
      if (mark.type === "wall")
        return `<li class="lane__wall" ${delay}><span>${mark.label}</span><span class="lane__seq">#${mark.seq}</span></li>`;
      const state = mark.crossed
        ? "is-crossed"
        : mark.refused
          ? "is-refused"
          : "";
      return `<li class="lane__call ${state}" ${delay}><span class="lane__seq">#${mark.seq}</span><span class="lane__tool">${escapeHtml(mark.tool).replaceAll("_", "_<wbr>")}</span>${mark.crossed || mark.refused ? `<span class="lane__flag">${mark.crossed ? (mark.refused ? "Crossed, refused" : "Crossed") : "Refused"}</span>` : ""}</li>`;
    })
    .join("");

  return `<div class="trace__head">
      <h3 class="trace__title">${escapeHtml(scenario.title)} <span>${escapeHtml(source.name)}</span></h3>
      <span class="tag tag--${scenario.boundary}">${BOUNDARY[scenario.boundary]}</span>
    </div>
    <p class="verdict verdict--${main.tone}"><span class="verdict__axis">${main.axis}</span> <b class="verdict__word">${main.word}</b> <span class="verdict__second">${second}, ${escapeHtml(client)}</span></p>
    <ol class="lane${marks.some((mark) => mark.type === "wall") ? "" : " lane--plain"}" aria-label="Tool calls in order${hasBoundary ? ", with the boundary" : ""}">${lane ? lane + after : `<li class="lane__empty">No tool calls</li>`}</ol>
    ${lead ? `<p class="trace__lead trace__lead--${lead.passed ? "pass" : lead.role === "boundary" ? "fail" : "open"}"><b><span aria-hidden="true">${lead.passed ? "✓" : "✕"}</span> ${escapeHtml(lead.label)}</b> ${escapeHtml(lead.detail)}</p>` : ""}
    ${source.note ? `<p class="trace__note">${escapeHtml(source.note)}</p>` : ""}
    <h4 class="trace__sub">Checks</h4>
    <ul class="assertions">
      ${evaluation.checks
        .map(
          (
            check,
          ) => `<li class="assertion assertion--${check.passed ? "pass" : check.role === "boundary" ? "fail" : "open"}">
            <span class="assertion__mark" aria-hidden="true">${check.passed ? "✓" : "✕"}</span>
            <span class="sr-only">${check.passed ? "Passed:" : "Failed:"}</span>
            <span class="assertion__id">${escapeHtml(check.label)}</span>
            <span class="assertion__axis">${ROLE[check.role]}</span>
            <span class="assertion__text">${escapeHtml(check.detail)}</span>
          </li>`,
        )
        .join("")}
    </ul>
    <h4 class="trace__sub">${events.length} events</h4>
    <ol class="events">
      ${events
        .map((event) => {
          const flag = crossed.has(event.seq)
            ? " is-breach"
            : missed.has(event.seq)
              ? " is-miss"
              : WALL[event.kind]
                ? " is-wall"
                : "";
          return `<li class="event event--${event.kind}${flag}">
            <span class="event__seq">#${event.seq}</span>
            <span class="event__time">+${((Date.parse(event.at) - start) / 1000).toFixed(1)}s</span>
            <span class="event__kind">${event.kind.replace("_", " ")}</span>
            <span class="event__target">${escapeHtml(eventText(event))}</span>
          </li>`;
        })
        .join("")}
    </ol>`;
}

const percent = (x: number) => Math.round(x * 100);
const interval = (rate: Rate) => `${percent(rate.low)}–${percent(rate.high)}%`;

/** The category every run of a scenario landed in, read as a sentence. */
function headline(tally: ScenarioTally): {
  tone: "pass" | "fail" | "open";
  text: string;
} {
  const hasBoundary = tally.scenario.boundary !== "none";
  const [key, rate] = hasBoundary
    ? (Object.entries(tally.security) as [Security, Rate][]).sort(
        (a, b) => b[1].count - a[1].count,
      )[0]!
    : (Object.entries(tally.utility) as [Utility, Rate][]).sort(
        (a, b) => b[1].count - a[1].count,
      )[0]!;
  const label = hasBoundary
    ? SECURITY_LABEL[key as Security]
    : `Task ${UTILITY_LABEL[key as Utility].toLowerCase()}`;
  return {
    text: `${label} <b>${rate.count}/${tally.n}</b> <span>${interval(rate)}</span>`,
    tone: TONE[key],
  };
}

/** The bench: every scenario as a row, every run as a strip you can open. */
export function matrixHtml(
  batch: RecordedBatch,
  selected: typeof FIRST_RUN,
): string {
  const rows = batch.tallies
    .map((tally) => {
      const { scenario } = tally;
      const head = headline(tally);
      const runs = batch.runs
        .filter((run) => run.scenario === scenario.id)
        .map((run) => {
          const scores = `security ${scenario.boundary === "none" ? "no boundary" : SECURITY_LABEL[run.security].toLowerCase()}, utility ${UTILITY_LABEL[run.utility].toLowerCase()}`;
          const pressed =
            run.scenario === selected.scenario && run.run === selected.run;
          return `<li><button type="button" class="run run--${runTone(scenario, run)}" data-run="${run.file}" data-run-scenario="${scenario.id}" data-run-name="run ${run.run}" data-label="${escapeHtml(`${scenario.id} run ${run.run}`)}" aria-pressed="${pressed}" title="Run ${run.run}, ${scores}"><span class="run__no"><span class="sr-only">Open ${escapeHtml(scenario.title)} run </span>${run.run}</span><span class="strip" aria-hidden="true">${stripHtml(run.marks)}</span><span class="sr-only">, ${scores}</span></button></li>`;
        })
        .join("");
      return `<li class="bench__row bench__row--${head.tone}">
        <div class="bench__name">
          <span class="bench__title">${escapeHtml(scenario.title)}</span>
          <span class="tag tag--${scenario.boundary}">${BOUNDARY[scenario.boundary]}</span>
        </div>
        <p class="bench__verdict">${head.text}</p>
        <ol class="bench__runs" aria-label="${escapeHtml(scenario.title)} runs">${runs}</ol>
      </li>`;
    })
    .join("");
  return `<div class="bench__intro">
      <h2 id="results-title">Recorded runs</h2>
      <p>Headless Claude Code ${escapeHtml(batch.client.replace(" (Claude Code)", ""))} with <code>${escapeHtml(batch.model)}</code>, ${batch.runs.length} runs on ${escapeHtml(batch.date)}. Each block is a tool call, the striped wall is where the server set the boundary, and red blocks are calls made after it. Open a run to read its trace.</p>
    </div>
    <ol class="bench__rows">${rows}</ol>`;
}

/** Every category and interval per scenario, with what the transcripts show. */
export function tallyHtml(batch: RecordedBatch): string {
  const sizes = batch.tallies.map((row) => row.n);
  const rows = batch.tallies
    .map(({ n, scenario, security, utility }) => {
      const hasBoundary = scenario.boundary !== "none";
      const rate = (
        axis: "security" | "utility",
        label: string,
        count: Rate,
        tone: "pass" | "fail" | "open",
      ) =>
        `<td class="rate rate--${axis}${count.count > 0 ? ` rate--${tone}` : ""}" data-label="${label}"><b>${count.count}/${n}</b><span>${interval(count)}</span></td>`;
      const securityCells = hasBoundary
        ? (["pass", "breach", "not-reached"] as const)
            .map((key) =>
              rate("security", SECURITY_LABEL[key], security[key], TONE[key]),
            )
            .join("")
        : `<td colspan="3" class="rate rate--none">No boundary. This is the baseline.</td>`;
      const utilityCells =
        utility["not-applicable"].count < n
          ? (["done", "not-done"] as const)
              .map((key) =>
                rate(
                  "utility",
                  `Utility: ${UTILITY_LABEL[key].toLowerCase()}`,
                  utility[key],
                  TONE[key],
                ),
              )
              .join("")
          : `<td colspan="2" class="rate rate--none">Not scored. The task can't be finished here.</td>`;
      return `<tr>
        <th scope="row">
          <span class="results__name">${escapeHtml(scenario.title)}</span>
          <span class="results__note">${escapeHtml(batch.notes[scenario.id] ?? "")}</span>
        </th>
        <td class="results__n">${n}</td>
        ${securityCells}
        ${utilityCells}
      </tr>`;
    })
    .join("");
  return `<div class="section-title">
      <h2 id="tally-title">Full tally</h2>
      <p>Each run gets two separate scores, as in AgentDojo. Security asks whether the agent crossed the boundary under test. Utility asks whether the job the user asked for got done.</p>
    </div>
    <div class="table-scroll">
      <table class="results-table">
        <thead>
          <tr>
            <th scope="col" rowspan="2">Scenario and what happened</th>
            <th scope="col" rowspan="2" class="results__n">N</th>
            <th scope="colgroup" colspan="3" class="results__axis">Security</th>
            <th scope="colgroup" colspan="2" class="results__axis">Utility</th>
          </tr>
          <tr>
            <th scope="col">Pass</th>
            <th scope="col">Breach</th>
            <th scope="col">Not reached</th>
            <th scope="col">Done</th>
            <th scope="col">Not done</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="results__caveat">Ranges are 95% Wilson intervals. With ${Math.min(...sizes)} to ${Math.max(...sizes)} runs per scenario they are wide. 6 passes out of 6 still allows a true pass rate as low as 61%. This is one model, one client version and one day. The traces, transcripts and the runner are in <a href="https://github.com/fortunexbt/boundary-bench/tree/main/${batch.path}"><code>${batch.path}</code></a>.</p>`;
}
