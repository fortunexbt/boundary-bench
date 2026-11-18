import "./style.css";

import { evaluateTrace, parseTrace } from "../src/core/evaluator.js";
import { findScenario } from "../src/core/scenarios.js";
import {
  escapeHtml,
  setupHtml,
  traceHtml,
  type TraceSource,
} from "./markup.js";

const list = document.querySelector<HTMLOListElement>("#scenario-list")!;
const setup = document.querySelector<HTMLElement>("#setup")!;
const result = document.querySelector<HTMLElement>("#result")!;
const check = document.querySelector<HTMLElement>("#check")!;
const fileInput = document.querySelector<HTMLInputElement>("#trace-file")!;
const checkTitle = document.querySelector<HTMLElement>("#check-title")!;
const notes = JSON.parse(
  document.querySelector<HTMLScriptElement>("#notes")!.textContent,
) as Record<string, string>;

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

function pressRun(button: HTMLButtonElement | null): void {
  for (const run of document.querySelectorAll<HTMLButtonElement>("[data-run]"))
    run.setAttribute("aria-pressed", String(run === button));
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const scenarioButton = target.closest<HTMLButtonElement>("[data-scenario]");
  if (scenarioButton) select(scenarioButton.dataset.scenario!, true);

  const runButton = target.closest<HTMLButtonElement>("[data-run]");
  if (runButton) {
    const scenario = runButton.dataset.runScenario!;
    select(scenario);
    pressRun(runButton);
    void load(
      runButton.dataset.label!,
      { name: runButton.dataset.runName!, note: notes[scenario] },
      () => fetchText(`./${runButton.dataset.run!}`),
    ).then(() => {
      checkTitle.focus({ preventScroll: true });
      // Side by side the trace is already in view. Stacked, bring it up.
      if (!window.matchMedia("(min-width: 981px)").matches)
        check.scrollIntoView({ block: "start" });
    });
  }

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

async function load(
  name: string,
  source: TraceSource,
  text: () => Promise<string>,
): Promise<void> {
  try {
    const events = parseTrace(await text());
    result.innerHTML = traceHtml(evaluateTrace(events), events, source);
  } catch (error) {
    result.innerHTML = `<p class="error"><b>Could not read ${escapeHtml(name)}.</b> ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
  }
  result.scrollTop = 0;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return response.text();
}

function open(file: File): void {
  pressRun(null);
  void load(file.name, { name: file.name }, () => file.text());
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) open(file);
});

check.addEventListener("dragover", (event) => {
  event.preventDefault();
  check.classList.add("is-over");
});
check.addEventListener("dragleave", (event) => {
  if (!check.contains(event.relatedTarget as Node | null))
    check.classList.remove("is-over");
});
check.addEventListener("drop", (event) => {
  event.preventDefault();
  check.classList.remove("is-over");
  const file = event.dataTransfer?.files[0];
  if (file) open(file);
});
