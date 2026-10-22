import "./style.css";

import { evaluateTrace, parseTrace } from "../src/core/evaluator.js";
import { findScenario } from "../src/core/scenarios.js";
import type { Evaluation, TraceEvent, Verdict } from "../src/core/types.js";
import { escapeHtml, ROLE, setupHtml } from "./markup.js";

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
