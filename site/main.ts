import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./style.css";

import {
  buildResultBundle,
  verifyResultBundle,
} from "../src/core/evaluator.js";
import type { ResultBundle, ScenarioRun } from "../src/core/types.js";
import { SCORE_AXES } from "../src/core/types.js";
import { scenarios } from "../src/fixtures/scenarios.js";
import { createLab } from "./lab.js";
import { escapeHtml, verdictIcon } from "./markup.js";
import { AGENTS, PAIRS } from "./pairs.js";

function runFor(
  bundle: ResultBundle,
  agentId: string,
  pairId: string,
  variant: "benign" | "adversarial",
): ScenarioRun {
  const scenario = bundle.scenarios.find(
    (item) => item.pairId === pairId && item.variant === variant,
  );
  const run = bundle.runs.find(
    (item) => item.candidateId === agentId && item.scenarioId === scenario?.id,
  );
  if (!run) throw new Error(`No ${variant} run for ${agentId} on ${pairId}`);
  return run;
}

function world(run: ScenarioRun, label: "A" | "B"): string {
  return `<span class="${run.passed ? "is-pass" : "is-fail"}">${label}${verdictIcon(run.passed)}<span class="sr-only"> ${run.passed ? "passed" : "failed"},</span></span>`;
}

function matrixHtml(bundle: ResultBundle): string {
  const agentIds = Object.keys(AGENTS).reverse();
  const head = agentIds
    .map((id) => `<th scope="col">${escapeHtml(AGENTS[id]!.name)}</th>`)
    .join("");
  const rows = PAIRS.map((pair) => {
    const cells = agentIds
      .map((agentId) => {
        const a = runFor(bundle, agentId, pair.pairId, "benign");
        const b = runFor(bundle, agentId, pair.pairId, "adversarial");
        const passed = a.passed && b.passed;
        return `<td><span class="worlds">${world(a, "A")}${world(b, "B")}</span><button type="button" class="pair-btn ${passed ? "is-pass" : "is-fail"}" data-pair="${pair.pairId}" data-agent="${agentId}">${passed ? "Pass" : "Fail"}<span class="sr-only">: open ${escapeHtml(pair.name)} with the ${escapeHtml(AGENTS[agentId]!.name)} in the crash test</span></button></td>`;
      })
      .join("");
    return `<tr><th scope="row">${escapeHtml(pair.name)}</th>${cells}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="matrix">
      <caption>Each pair, World A and World B. Open any result in the crash test.</caption>
      <thead><tr><td></td>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function axesHtml(bundle: ResultBundle): string {
  const rows = bundle.scorecards
    .map((card) => {
      const name = AGENTS[card.candidateId]?.name ?? card.candidateId;
      const axes = SCORE_AXES.map((axis) => {
        const score = card.axes.find((item) => item.axis === axis)!;
        return `<td>${score.passed}<span class="of">/${score.total}</span></td>`;
      }).join("");
      return `<tr><th scope="row">${escapeHtml(name)}</th><td><b>${card.pairedControlsPassed}</b><span class="of">/${card.pairedControlsTotal}</span></td>${axes}</tr>`;
    })
    .reverse()
    .join("");
  return `<div class="table-wrap"><table class="axes">
      <caption>Checks passed, by what they protect</caption>
      <thead><tr><td></td><th scope="col">Pairs</th>${SCORE_AXES.map((axis) => `<th scope="col">${axis}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

async function proofHtml(bundle: ResultBundle, ms: number): Promise<string> {
  const response = await fetch("./results/latest.json");
  if (!response.ok)
    return `<p class="proof is-fail">Recomputed ${bundle.runs.length} runs in ${ms} ms, but the published results could not be loaded (HTTP ${response.status}).</p>`;
  const published = (await response.json()) as ResultBundle;
  const errors = verifyResultBundle(published, scenarios);
  const matches =
    errors.length === 0 && published.bundleHash === bundle.bundleHash;
  const hash = `<code title="${bundle.bundleHash}">${bundle.bundleHash.slice(0, 16)}…</code>`;
  return matches
    ? `<p class="proof is-pass">${verdictIcon(true)}<span>Recomputed ${bundle.runs.length} runs in ${ms} ms. Bundle hash ${hash} matches the <a href="./results/latest.json">published results</a>.</span></p>`
    : `<p class="proof is-fail">${verdictIcon(false)}<span>Recomputed bundle ${hash} does not match the <a href="./results/latest.json">published results</a>: ${escapeHtml(errors[0] ?? "different bundle hash")}</span></p>`;
}

const lab = createLab(
  document.querySelector<HTMLElement>("#lab-controls")!,
  document.querySelector<HTMLElement>("#lab-stage")!,
  document.querySelector<HTMLElement>("#lab-status")!,
);

const benchBody = document.querySelector<HTMLElement>("#bench-body")!;
const started = performance.now();
const bundle = buildResultBundle(scenarios);
const elapsed = Math.max(1, Math.round(performance.now() - started));
benchBody.innerHTML = `<div class="proof-slot"><p class="proof">Checking against the published results…</p></div><div class="bench-grid">${matrixHtml(bundle)}${axesHtml(bundle)}</div>`;
const proofSlot = benchBody.querySelector<HTMLElement>(".proof-slot")!;
proofHtml(bundle, elapsed)
  .then((html) => {
    proofSlot.innerHTML = html;
  })
  .catch((error: unknown) => {
    proofSlot.innerHTML = `<p class="proof is-fail">${verdictIcon(false)}<span>Could not check against the published results: ${escapeHtml(error instanceof Error ? error.message : String(error))}</span></p>`;
  });

benchBody.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-pair]",
  );
  if (!button) return;
  lab.load(button.dataset.pair!, button.dataset.agent!);
  document.querySelector("#lab")!.scrollIntoView({ block: "start" });
  document
    .querySelector<HTMLElement>("#lab-stage")!
    .focus({ preventScroll: true });
});
