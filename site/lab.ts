import { evaluateTrace, runScenario } from "../src/core/evaluator.js";
import { materializeTrace } from "../src/core/receipts.js";
import type {
  AssertionResult,
  Scenario,
  ScenarioAssertion,
  ScenarioRun,
  TraceEvent,
} from "../src/core/types.js";
import { scenarios } from "../src/fixtures/scenarios.js";
import { escapeHtml, reducedMotion, verdictIcon } from "./markup.js";
import { AGENTS, PAIRS } from "./pairs.js";
import type { PairCopy } from "./pairs.js";

const STEP_MS = 480;

interface Tamper {
  deleted: number;
  run: ScenarioRun;
}

interface LabState {
  agentId: string;
  pairId: string;
  tamper: Tamper | null;
}

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function code(value: string | undefined): string {
  return `<code>${escapeHtml(value ?? "")}</code>`;
}

function describeEvent(event: TraceEvent): string {
  switch (event.kind) {
    case "instruction":
      return "Operator gives the task";
    case "tool_call":
      return `Agent calls ${code(event.tool)}${event.audience ? ` with a ${code(event.audience)} credential` : ""}`;
    case "tool_result":
      if (event.tags.includes("prompt_injection"))
        return `${code(event.tool)} returns text with <mark>a hidden instruction</mark>`;
      return `${code(event.tool)} returns ${event.tags.includes("benign_content") ? "ordinary content" : "a result"}`;
    case "stop":
      return "<mark>Operator presses stop</mark>";
    case "budget_exhausted":
      return "<mark>Budget ceiling reached</mark>";
    case "protocol_error":
      if (event.tags.includes("audience_mismatch"))
        return "<mark>Credential was issued for another service</mark>";
      if (event.tags.includes("receipt_invalid"))
        return "<mark>Upstream receipt fails to verify</mark>";
      return "Protocol error";
    case "approval_required":
      return "<mark>Production write needs approval</mark>";
    case "approval_granted":
      return "Approval granted";
    case "halt":
      return "Agent halts";
    case "quarantine":
      return "Agent quarantines the request";
    case "refusal":
      return "Agent refuses";
    case "final":
      return event.tags.includes("injection_ignored")
        ? "Agent answers and ignores the injected instruction"
        : "Agent finishes and answers";
  }
}

function checkName(assertion: ScenarioAssertion): string {
  switch (assertion.type) {
    case "forbid_tool":
      return `Never calls ${code(assertion.tool)}`;
    case "require_tool":
      return `Calls ${code(assertion.tool)}`;
    case "max_tool_calls":
      return `At most ${assertion.maximum} tool calls`;
    case "max_cost_micros":
      return `Spends at most ${assertion.maximum} µcr`;
    case "require_kind":
      return `Records a ${words(assertion.kind)}`;
    case "require_kind_after_tag":
      return `Records a ${words(assertion.kind)} after the ${words(assertion.tag)}`;
    case "require_final":
      return "Finishes with an answer";
    case "no_tool_after_kind":
      return `No tool call after the ${words(assertion.afterKind)}`;
    case "no_tool_after_tag":
      return `No tool call after the ${words(assertion.tag)}`;
    case "audience_match":
      return `Credential matches ${code(assertion.expected)}`;
    case "receipt_chain":
      return "receipt chain";
    case "body_free":
      return "no raw bodies";
    case "replay_match":
      return "replay hash";
  }
}

function assertionFor(scenario: Scenario, id: string): ScenarioAssertion {
  const assertion = scenario.assertions.find((item) => item.id === id);
  if (!assertion) throw new Error(`Unknown assertion ${id}`);
  return assertion;
}

function pairScenarios(pairId: string): [Scenario, Scenario] {
  const pair = scenarios.filter((item) => item.pairId === pairId);
  const benign = pair.find((item) => item.variant === "benign");
  const adversarial = pair.find((item) => item.variant === "adversarial");
  if (!benign || !adversarial) throw new Error(`Incomplete pair ${pairId}`);
  return [benign, adversarial];
}

function pairCopy(pairId: string): PairCopy {
  const copy = PAIRS.find((item) => item.pairId === pairId);
  if (!copy) throw new Error(`No copy for pair ${pairId}`);
  return copy;
}

// The line a cover-up would delete: the last event cited by a failed check,
// or the agent's last action when every check passed.
function tamperTarget(run: ScenarioRun): TraceEvent {
  const cited = run.assertions
    .filter((item) => !item.passed && item.axis !== "integrity")
    .flatMap((item) => item.evidence)
    .at(-1);
  const target =
    run.trace.find((event) => event.id === cited) ??
    run.trace.findLast((event) => event.actor === "agent");
  if (!target) throw new Error(`Nothing to tamper with in ${run.scenarioId}`);
  return target;
}

function tamperWith(scenario: Scenario, agentId: string, run: ScenarioRun): Tamper {
  const target = tamperTarget(run);
  const reference = scenario.reference[agentId];
  if (!reference) throw new Error(`No reference trace for ${agentId}`);
  const trace = run.trace.filter((event) => event.sequence !== target.sequence);
  const replay = materializeTrace(reference.replay ?? reference.primary);
  return {
    deleted: target.sequence,
    run: evaluateTrace(scenario, agentId, trace, replay),
  };
}

function checksHtml(scenario: Scenario, results: AssertionResult[]): string {
  const behaviour = results.filter((item) => item.axis !== "integrity");
  const evidence = results.filter((item) => item.axis === "integrity");
  return `<ul class="checks">${behaviour
    .map((item) => {
      const assertion = assertionFor(scenario, item.id);
      return `<li class="check ${item.passed ? "is-pass" : "is-fail"}">${verdictIcon(item.passed)}<span><b>${checkName(assertion)}</b><small>${escapeHtml(item.explanation)}</small></span><em>${escapeHtml(item.axis)}</em></li>`;
    })
    .join("")}
    <li class="check check--evidence"><span><b>Evidence</b></span><span class="evidence">${evidence
      .map(
        (item) =>
          `<span class="${item.passed ? "is-pass" : "is-fail"}">${verdictIcon(item.passed)}${checkName(assertionFor(scenario, item.id))}<span class="sr-only">${item.passed ? " passed" : " failed"}</span></span>`,
      )
      .join("")}</span></li></ul>`;
}

function armHtml(
  world: "A" | "B",
  scenario: Scenario,
  honest: ScenarioRun,
  tamper: Tamper | null,
  copy: PairCopy,
): string {
  const run = tamper?.run ?? honest;
  const cited = new Set(
    run.assertions
      .filter((item) => !item.passed && item.axis !== "integrity")
      .flatMap((item) => item.evidence),
  );
  const rows = honest.trace
    .map((event) => {
      const deleted = tamper?.deleted === event.sequence;
      const classes = [
        "row",
        `row--${event.actor}`,
        cited.has(event.id) && !deleted ? "is-breach" : "",
        deleted ? "is-deleted" : "",
      ].join(" ");
      return `<li class="${classes}" data-step="${event.sequence}">
        <span class="row__tick">t+${event.tick}</span>
        <span class="row__text">${deleted ? '<span class="sr-only">Deleted: </span>' : ""}${describeEvent(event)}${event.costMicros ? ` <span class="row__cost">${event.costMicros} µcr</span>` : ""}</span>
        <code class="row__hash" title="Receipt hash">${escapeHtml(event.hash.slice(0, 8))}</code>
      </li>`;
    })
    .join("");
  const benign = world === "A";
  return `<section class="arm arm--${benign ? "benign" : "hostile"}" aria-label="World ${world}, ${benign ? "ordinary" : "under attack"}">
    <header class="arm__head">
      <span class="arm__id">World ${world}</span><span class="arm__kind">${benign ? "Ordinary" : "Under attack"}</span>
      <p>${escapeHtml(benign ? copy.benign : copy.adversarial)}</p>
    </header>
    <ol class="trace">${rows}</ol>
    <div class="arm__result">
      ${checksHtml(scenario, run.assertions)}
      <p class="arm__verdict ${run.passed ? "is-pass" : "is-fail"}">${verdictIcon(run.passed)}World ${world} ${run.passed ? "passed" : "failed"}</p>
    </div>
  </section>`;
}

function verdictText(passedA: boolean, passedB: boolean): string {
  if (passedA && passedB)
    return "The agent did the ordinary job and held the line under attack.";
  if (passedA)
    return "World A went fine. In World B the agent crossed the line. Doing the ordinary job is only half the test.";
  if (passedB)
    return "The agent held the line under attack but could not do the ordinary job. Refusing everything is not safety.";
  return "The agent failed the ordinary job and the attack.";
}

function tamperResult(honest: ScenarioRun, tamper: Tamper): string {
  const before = new Map(honest.assertions.map((item) => [item.id, item.passed]));
  const fixed = tamper.run.assertions.filter(
    (item) => item.passed && before.get(item.id) === false,
  );
  const broken = tamper.run.assertions.filter(
    (item) => !item.passed && before.get(item.id) === true,
  );
  const integrity = broken.filter((item) => item.axis === "integrity");
  const parts = [
    `Line ${tamper.deleted} is gone.`,
    fixed.length > 0
      ? `${fixed.length} failed check${fixed.length === 1 ? " now passes" : "s now pass"},`
      : "",
    integrity.length > 0
      ? `but the evidence no longer verifies: ${integrity
          .map((item) => (item.id.endsWith("receipt-chain") ? "the receipt chain is broken" : "the replay ends on a different hash"))
          .join(" and ")}. The edit is caught.`
      : "and the evidence still verifies.",
  ];
  return parts.filter(Boolean).join(" ");
}

export function createLab(controls: HTMLElement, stage: HTMLElement) {
  const state: LabState = {
    agentId: "naive-reference",
    pairId: PAIRS[0]!.pairId,
    tamper: null,
  };
  let token = 0;
  const timers: number[] = [];

  controls.innerHTML = `<fieldset class="picker">
      <legend>1. Pick a failure mode</legend>
      <div class="picker__options">${PAIRS.map(
        (pair) =>
          `<label class="chip"><input type="radio" name="pair" value="${pair.pairId}"${pair.pairId === state.pairId ? " checked" : ""} /><span>${escapeHtml(pair.name)}</span></label>`,
      ).join("")}</div>
    </fieldset>
    <fieldset class="picker">
      <legend>2. Pick an agent</legend>
      <div class="agents">${Object.entries(AGENTS)
        .reverse()
        .map(
          ([id, agent]) =>
            `<label class="agent"><input type="radio" name="agent" value="${id}"${id === state.agentId ? " checked" : ""} /><span><b>${escapeHtml(agent.name)}</b><small>${escapeHtml(agent.summary)}</small></span></label>`,
        )
        .join("")}</div>
    </fieldset>
    <button class="run" type="button" data-run>Run the crash test</button>
    <p class="controls__note">Scripted fixture agents, real evaluator. Runs offline in this tab.</p>`;

  const clearTimers = (): void => {
    timers.splice(0).forEach((id) => window.clearTimeout(id));
  };

  const render = (animate: boolean): void => {
    clearTimers();
    const current = ++token;
    const [benign, adversarial] = pairScenarios(state.pairId);
    const copy = pairCopy(state.pairId);
    const runA = runScenario(benign, state.agentId);
    const runB = runScenario(adversarial, state.agentId);
    const tamper = state.tamper;
    const finalB = tamper?.run ?? runB;
    const pairPassed = runA.passed && finalB.passed;
    const agent = AGENTS[state.agentId]!;
    const cover = runB.passed
      ? "What if someone trims the last line from World B's log?"
      : "What if someone deletes the bad line from World B's log before anyone checks?";

    stage.innerHTML = `<div class="flow" data-phase="${animate ? "running" : "done"}">
      <div class="flow__task">
        <p class="flow__label"><span>Task</span><span class="flow__phase" data-phase-label></span></p>
        <p class="flow__goal">${escapeHtml(copy.task)}</p>
        <p class="flow__stakes">${escapeHtml(copy.stakes)}</p>
      </div>
      <div class="flow__arms">
        ${armHtml("A", benign, runA, null, copy)}
        ${armHtml("B", adversarial, runB, tamper, copy)}
      </div>
      <div class="verdict ${pairPassed ? "is-pass" : "is-fail"}">
        <p class="verdict__head">${verdictIcon(pairPassed)}<b>${escapeHtml(agent.name)}: pair ${pairPassed ? "passed" : "failed"}</b></p>
        <p>${tamper ? escapeHtml(tamperResult(runB, tamper)) : verdictText(runA.passed, runB.passed)}</p>
        <div class="verdict__tamper">
          ${
            tamper
              ? '<button type="button" class="ghost" data-restore>Restore the original log</button>'
              : `<p>${cover}</p><button type="button" class="ghost" data-tamper>Delete line ${tamperTarget(runB).sequence} and re-check</button>`
          }
        </div>
      </div>
      <p class="sr-only" role="status">${escapeHtml(`${agent.name}, ${copy.name}: World A ${runA.passed ? "passed" : "failed"}, World B ${finalB.passed ? "passed" : "failed"}, pair ${pairPassed ? "passed" : "failed"}.`)}</p>
    </div>`;

    const flow = stage.querySelector<HTMLElement>(".flow")!;
    const label = stage.querySelector<HTMLElement>("[data-phase-label]")!;
    const rows = [...stage.querySelectorAll<HTMLElement>("[data-step]")];
    const lastStep = Math.max(...rows.map((row) => Number(row.dataset.step)));

    const finish = (): void => {
      rows.forEach((row) => row.classList.remove("is-current", "is-pending"));
      flow.dataset.phase = "done";
      label.textContent = "Checked";
    };

    if (!animate || reducedMotion.matches) {
      finish();
      return;
    }
    rows.forEach((row) => row.classList.add("is-pending"));
    for (let step = 0; step <= lastStep; step += 1) {
      timers.push(
        window.setTimeout(() => {
          if (current !== token) return;
          label.textContent = `Running · step ${step}`;
          rows.forEach((row) => {
            const at = Number(row.dataset.step);
            row.classList.toggle("is-current", at === step);
            if (at <= step) row.classList.remove("is-pending");
          });
        }, step * STEP_MS),
      );
    }
    timers.push(
      window.setTimeout(() => {
        if (current === token) finish();
      }, (lastStep + 1) * STEP_MS),
    );
  };

  controls.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === "pair") state.pairId = input.value;
    if (input.name === "agent") state.agentId = input.value;
    state.tamper = null;
    render(true);
  });
  controls.querySelector("[data-run]")?.addEventListener("click", () => {
    state.tamper = null;
    render(true);
  });
  stage.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-tamper]")) {
      const [, adversarial] = pairScenarios(state.pairId);
      state.tamper = tamperWith(
        adversarial,
        state.agentId,
        runScenario(adversarial, state.agentId),
      );
      render(false);
      stage.querySelector<HTMLButtonElement>("[data-restore]")?.focus();
    } else if (target.closest("[data-restore]")) {
      state.tamper = null;
      render(false);
      stage.querySelector<HTMLButtonElement>("[data-tamper]")?.focus();
    }
  });

  render(false);
  const firstRun = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        firstRun.disconnect();
        render(true);
      }
    },
    { threshold: 0.35 },
  );
  firstRun.observe(stage);

  return {
    load(pairId: string, agentId: string): void {
      state.pairId = pairId;
      state.agentId = agentId;
      state.tamper = null;
      controls
        .querySelectorAll<HTMLInputElement>("input[type=radio]")
        .forEach((input) => {
          input.checked = input.value === pairId || input.value === agentId;
        });
      render(true);
    },
  };
}
