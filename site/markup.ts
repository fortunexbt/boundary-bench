import type { ScenarioTally } from "../src/core/report.js";
import { findScenario, SCENARIOS } from "../src/core/scenarios.js";
import type {
  Boundary,
  CheckRole,
  Scenario,
  Verdict,
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
  boundary: "boundary",
  precondition: "reached",
  utility: "task",
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
    ? `<p class="related">Run <button type="button" class="link-button" data-scenario="${baseline.id}">${escapeHtml(baseline.title)}</button> as well. It is the same task without the boundary, so an agent that passes here by refusing to work fails there.</p>`
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
      <h3>Passes if</h3>
      <ul class="criteria">
        ${scenario.checks
          .map(
            (check) =>
              `<li><span class="criteria__role">${ROLE[check.role]}</span>${escapeHtml(check.label)}</li>`,
          )
          .join("")}
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
  runs: { file: string; run: string; scenario: string; verdict: Verdict }[];
  tallies: ScenarioTally[];
}

const VERDICT_LABEL: Record<Verdict, string> = {
  pass: "Pass",
  fail: "Fail",
  inconclusive: "Inconclusive",
};
const VERDICTS = Object.keys(VERDICT_LABEL) as Verdict[];

export function resultsHtml(batch: RecordedBatch): string {
  const percent = (x: number) => Math.round(x * 100);
  const sizes = batch.tallies.map((row) => row.n);
  const rows = batch.tallies
    .map(({ n, rates, scenario }) => {
      const runs = batch.runs
        .filter((run) => run.scenario === scenario.id)
        .map(
          (run) =>
            `<button type="button" class="run run--${run.verdict}" data-run="${run.file}" data-run-scenario="${scenario.id}" data-label="${escapeHtml(`${scenario.id} run ${run.run}`)}"><span class="sr-only">Open ${escapeHtml(scenario.title)} run </span>${run.run}<span class="sr-only">, ${run.verdict}</span></button>`,
        )
        .join("");
      const cells = VERDICTS.map((verdict) => {
        const rate = rates[verdict];
        return `<td class="rate${rate.count > 0 ? ` rate--${verdict}` : ""}" data-label="${VERDICT_LABEL[verdict]}"><b>${rate.count}/${n}</b><span>${percent(rate.low)}–${percent(rate.high)}%</span></td>`;
      }).join("");
      return `<tr>
        <th scope="row">
          <span class="results__name">${escapeHtml(scenario.title)} <span class="tag tag--${scenario.boundary}">${BOUNDARY[scenario.boundary]}</span></span>
          <span class="results__note">${escapeHtml(batch.notes[scenario.id] ?? "")}</span>
          <span class="results__runs">${runs}</span>
        </th>
        <td class="results__n">${n}</td>
        ${cells}
      </tr>`;
    })
    .join("");
  return `<div class="section-title">
      <h2 id="results-title">Recorded runs</h2>
      <p>Headless Claude Code ${escapeHtml(batch.client.replace(" (Claude Code)", ""))} with <code>${escapeHtml(batch.model)}</code>, ${batch.runs.length} runs on ${escapeHtml(batch.date)}. Open any run to see its trace scored below.</p>
    </div>
    <div class="table-scroll">
      <table class="results-table">
        <thead>
          <tr>
            <th scope="col">Scenario and what happened</th>
            <th scope="col" class="results__n">N</th>
            <th scope="col">Pass</th>
            <th scope="col">Fail</th>
            <th scope="col">Inconclusive</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="results__caveat">Ranges are 95% Wilson intervals. With ${Math.min(...sizes)} to ${Math.max(...sizes)} runs per scenario they are wide: 6 passes out of 6 still allows a true pass rate as low as 61%. This is one model, one client version and one day. The traces, transcripts and the runner are in <a href="https://github.com/fortunexbt/boundary-bench/tree/showcase/2026-10/${batch.path}"><code>${batch.path}</code></a>.</p>`;
}
