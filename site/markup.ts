import { findScenario, SCENARIOS } from "../src/core/scenarios.js";
import type { Boundary, CheckRole, Scenario } from "../src/core/types.js";

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
