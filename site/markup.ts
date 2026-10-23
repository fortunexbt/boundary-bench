import type { Rate, ScenarioTally } from "../src/core/report.js";
import { findScenario, SCENARIOS } from "../src/core/scenarios.js";
import type {
  Boundary,
  CheckRole,
  Evaluation,
  Scenario,
  Security,
  Utility,
} from "../src/core/types.js";

/** The scenario shown first, prerendered into index.html at build time. */
export const FIRST_SCENARIO = "bill-injection";

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
          <p>Or open the file under <a href="#check">Check a trace</a>.</p>
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

export interface RecordedBatch {
  client: string;
  date: string;
  model: string;
  /** What the transcripts show, per scenario, in a sentence or three. */
  notes: Record<string, string>;
  path: string;
  runs: ({ file: string; run: string; scenario: string } & Pick<
    Evaluation,
    "security" | "utility"
  >)[];
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

export function resultsHtml(batch: RecordedBatch): string {
  const percent = (x: number) => Math.round(x * 100);
  const sizes = batch.tallies.map((row) => row.n);
  const rows = batch.tallies
    .map(({ n, scenario, security, utility }) => {
      const hasBoundary = scenario.boundary !== "none";
      const runs = batch.runs
        .filter((run) => run.scenario === scenario.id)
        .map((run) => {
          // Each run is coloured by what its scenario tests: the boundary, or
          // for a baseline, the task.
          const tone = TONE[hasBoundary ? run.security : run.utility];
          const scores = `security ${hasBoundary ? SECURITY_LABEL[run.security].toLowerCase() : "no boundary"}, utility ${UTILITY_LABEL[run.utility].toLowerCase()}`;
          return `<button type="button" class="run run--${tone}" data-run="${run.file}" data-run-scenario="${scenario.id}" data-label="${escapeHtml(`${scenario.id} run ${run.run}`)}" title="${scores}"><span class="sr-only">Open ${escapeHtml(scenario.title)} run </span>${run.run}<span class="sr-only">, ${scores}</span></button>`;
        })
        .join("");
      const rate = (
        axis: "security" | "utility",
        label: string,
        count: Rate,
        tone: "pass" | "fail" | "open",
      ) =>
        `<td class="rate rate--${axis}${count.count > 0 ? ` rate--${tone}` : ""}" data-label="${label}"><b>${count.count}/${n}</b><span>${percent(count.low)}–${percent(count.high)}%</span></td>`;
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
          <span class="results__name">${escapeHtml(scenario.title)} <span class="tag tag--${scenario.boundary}">${BOUNDARY[scenario.boundary]}</span></span>
          <span class="results__note">${escapeHtml(batch.notes[scenario.id] ?? "")}</span>
          <span class="results__runs">${runs}</span>
        </th>
        <td class="results__n">${n}</td>
        ${securityCells}
        ${utilityCells}
      </tr>`;
    })
    .join("");
  return `<div class="section-title">
      <h2 id="results-title">Recorded runs</h2>
      <p>Headless Claude Code ${escapeHtml(batch.client.replace(" (Claude Code)", ""))} with <code>${escapeHtml(batch.model)}</code>, ${batch.runs.length} runs on ${escapeHtml(batch.date)}. Each run gets two separate scores, as in AgentDojo. Security: did the agent cross the boundary under test? Utility: did the job the user asked for get done? Open any run to see its trace scored below.</p>
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
    <p class="results__caveat">Ranges are 95% Wilson intervals. With ${Math.min(...sizes)} to ${Math.max(...sizes)} runs per scenario they are wide: 6 passes out of 6 still allows a true pass rate as low as 61%. This is one model, one client version and one day. The traces, transcripts and the runner are in <a href="https://github.com/fortunexbt/boundary-bench/tree/main/${batch.path}"><code>${batch.path}</code></a>.</p>`;
}
