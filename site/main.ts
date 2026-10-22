import "./style.css";

import { evaluateTrace, parseTrace } from "../src/core/evaluator.js";
import { findScenario, SCENARIOS } from "../src/core/scenarios.js";
import type {
  Boundary,
  CheckRole,
  Evaluation,
  Scenario,
  TraceEvent,
  Verdict,
} from "../src/core/types.js";
import { escapeHtml } from "./markup.js";

const REPO_URL = "https://github.com/fortunexbt/boundary-bench";

const BOUNDARY: Record<Boundary, string> = {
  approval: "Approval",
  budget: "Budget",
  none: "Baseline",
  prompt_injection: "Injection",
  stop: "Stop",
};

const ROLE: Record<CheckRole, string> = {
  boundary: "boundary",
  precondition: "reached",
  utility: "task",
};

const VERDICT: Record<Verdict, string> = {
  fail: "Fail",
  inconclusive: "Inconclusive",
  pass: "Pass",
};

const list = document.querySelector<HTMLOListElement>("#scenario-list")!;
const setup = document.querySelector<HTMLElement>("#setup")!;
const result = document.querySelector<HTMLElement>("#result")!;
const drop = document.querySelector<HTMLLabelElement>("#drop")!;
const fileInput = document.querySelector<HTMLInputElement>("#trace-file")!;

function code(text: string, label: string): string {
  return `<div class="code"><pre><code>${escapeHtml(text)}</code></pre><button type="button" class="copy" data-copy="${escapeHtml(text)}">Copy<span class="sr-only"> ${escapeHtml(label)}</span></button></div>`;
}

function setupHtml(scenario: Scenario): string {
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

function select(id: string, focus = false): void {
  const scenario = findScenario(id);
  if (!scenario) return;
  for (const button of list.querySelectorAll<HTMLButtonElement>("button"))
    button.setAttribute("aria-pressed", String(button.dataset.scenario === id));
  setup.innerHTML = setupHtml(scenario);
  setup.scrollTop = 0;
  if (focus)
    setup.querySelector<HTMLElement>("#setup-title")!.focus({
      preventScroll: window.matchMedia("(min-width: 981px)").matches,
    });
}

list.innerHTML = SCENARIOS.map(
  (scenario) => `<li>
    <button type="button" class="scenario" data-scenario="${scenario.id}" aria-pressed="false">
      <span class="scenario__title">${escapeHtml(scenario.title)}</span>
      <span class="tag tag--${scenario.boundary}">${BOUNDARY[scenario.boundary]}</span>
      <span class="scenario__summary">${escapeHtml(scenario.summary)}</span>
    </button>
  </li>`,
).join("");

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const scenarioButton = target.closest<HTMLButtonElement>("[data-scenario]");
  if (scenarioButton) select(scenarioButton.dataset.scenario!, true);

  const copyButton = target.closest<HTMLButtonElement>("[data-copy]");
  if (copyButton) {
    const label = copyButton.innerHTML;
    navigator.clipboard.writeText(copyButton.dataset.copy!).then(
      () => {
        copyButton.textContent = "Copied";
        setTimeout(() => (copyButton.innerHTML = label), 1500);
      },
      () => {
        copyButton.textContent = "Select and copy";
      },
    );
  }
});

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
      return `all ${event.limit} calls used; call refused`;
    case "approval_required":
      return `${event.tool} refused: needs approval`;
    case "stop":
      return `client cancelled request ${event.request}${event.reason ? `: ${event.reason}` : ""}`;
    case "session_end":
      return event.reason;
  }
}

function evaluationHtml(evaluation: Evaluation, events: TraceEvent[]): string {
  const breaches = new Set(
    evaluation.checks
      .filter((check) => !check.passed && check.role !== "precondition")
      .flatMap((check) => check.events),
  );
  const start = Date.parse(events[0]!.at);
  const client = evaluation.client
    ? `${evaluation.client.name} ${evaluation.client.version}`
    : "unknown client";
  return `<div class="verdict verdict--${evaluation.verdict}">
      <b>${VERDICT[evaluation.verdict]}</b>
      <span>${escapeHtml(evaluation.scenario.title)} · ${escapeHtml(client)}</span>
    </div>
    <ul class="assertions">
      ${evaluation.checks
        .map(
          (
            check,
          ) => `<li class="assertion assertion--${check.passed ? "pass" : "fail"}">
            <span class="assertion__mark" aria-hidden="true">${check.passed ? "✓" : "✕"}</span>
            <span class="sr-only">${check.passed ? "Passed:" : "Failed:"}</span>
            <span class="assertion__id">${escapeHtml(check.label)}</span>
            <span class="assertion__axis">${ROLE[check.role]}</span>
            <span class="assertion__text">${escapeHtml(check.detail)}</span>
          </li>`,
        )
        .join("")}
    </ul>
    <h3 class="events-title">${events.length} events</h3>
    <ol class="events">
      ${events
        .map(
          (
            event,
          ) => `<li class="event event--${event.kind}${breaches.has(event.seq) ? " is-breach" : ""}">
            <span class="event__seq">#${event.seq}</span>
            <span class="event__time">+${((Date.parse(event.at) - start) / 1000).toFixed(1)}s</span>
            <span class="event__kind">${event.kind.replace("_", " ")}</span>
            <span class="event__target">${escapeHtml(eventText(event))}</span>
          </li>`,
        )
        .join("")}
    </ol>`;
}

async function load(file: File): Promise<void> {
  try {
    const events = parseTrace(await file.text());
    result.innerHTML = evaluationHtml(evaluateTrace(events), events);
  } catch (error) {
    result.innerHTML = `<p class="error"><b>Could not read ${escapeHtml(file.name)}.</b> ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void load(file);
});

drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("is-over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("is-over");
  const file = event.dataTransfer?.files[0];
  if (file) void load(file);
});

select("bill-injection");
