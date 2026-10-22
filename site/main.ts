import "./style.css";

type Axis = "safety" | "utility" | "control" | "integrity";

interface AxisScore {
  axis: Axis;
  passed: number;
  rate: number;
  total: number;
}

interface Candidate {
  description: string;
  id: string;
  kind: string;
  name: string;
}

interface Scorecard {
  axes: AxisScore[];
  candidateId: string;
  pairedControlsPassed: number;
  pairedControlsTotal: number;
  scenariosPassed: number;
  scenariosTotal: number;
}

interface AssertionResult {
  axis: Axis;
  evidence: string[];
  explanation: string;
  id: string;
  passed: boolean;
}

interface TraceEvent {
  actor: string;
  audience?: string;
  costMicros?: number;
  hash: string;
  id: string;
  kind: string;
  payloadDigest: string;
  previousHash: string | null;
  sequence: number;
  tags: string[];
  tick: number;
  tool?: string;
  trust: string;
}

interface Run {
  assertions: AssertionResult[];
  candidateId: string;
  passed: boolean;
  scenarioId: string;
  trace: TraceEvent[];
  traceRoot: string;
}

interface Scenario {
  category: string;
  description: string;
  id: string;
  pairId: string;
  protocol: string;
  title: string;
  variant: "benign" | "adversarial";
}

interface Bundle {
  benchmarkVersion: string;
  bundleHash: string;
  candidates: Candidate[];
  protocolProfiles: Array<{ label: string; status: string; version: string }>;
  runs: Run[];
  scenarios: Scenario[];
  schema: string;
  scorecards: Scorecard[];
}

const AXES: Array<{ axis: Axis; label: string; question: string }> = [
  {
    axis: "safety",
    label: "Safety",
    question: "Were forbidden capabilities or untrusted instructions acted on?",
  },
  {
    axis: "utility",
    label: "Utility",
    question: "Did the benign and safely recoverable tasks still complete?",
  },
  {
    axis: "control",
    label: "Control",
    question: "Did stops, budgets, scopes and approval gates hold?",
  },
  {
    axis: "integrity",
    label: "Integrity",
    question: "Are receipts body-free, hash-linked and replay-stable?",
  },
];

const REPO_URL = "https://github.com/fortunexbt/boundary-bench";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortHash(hash: string, length = 12): string {
  return hash.slice(0, length);
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

async function verifyBundleHash(bundle: Bundle): Promise<boolean> {
  const { bundleHash, ...payload } = bundle;
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const computed = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return computed === bundleHash;
}

function findRun(
  bundle: Bundle,
  candidateId: string,
  scenarioId: string,
): Run | undefined {
  return bundle.runs.find(
    (run) => run.candidateId === candidateId && run.scenarioId === scenarioId,
  );
}

function failedCount(run: Run): number {
  return run.assertions.filter((assertion) => !assertion.passed).length;
}

function intro(bundle: Bundle, hashVerified: boolean): string {
  return `<header class="intro">
      <div class="intro__title">
        <h1>BoundaryBench</h1>
        <nav aria-label="Page"><a href="#results">Results</a><a href="#trace">Trace</a><a href="#method">Method</a><a href="${REPO_URL}">Source</a></nav>
      </div>
      <p class="intro__lede">A deterministic crash-test benchmark for AI agent control planes. Its ${bundle.scenarios.length} scenarios run in benign and adversarial pairs and check that stops, budgets, audience scopes, approvals and receipt integrity block forbidden actions while permitted work continues.</p>
      <dl class="facts">
        <div><dt>Version</dt><dd>${escapeHtml(bundle.benchmarkVersion)}</dd></div>
        <div><dt>Scenarios</dt><dd>${bundle.scenarios.length}</dd></div>
        <div><dt>Traces</dt><dd>${bundle.runs.length}</dd></div>
        <div><dt>Bundle SHA-256</dt><dd><code title="${escapeHtml(bundle.bundleHash)}">${escapeHtml(shortHash(bundle.bundleHash, 16))}</code> <span class="${hashVerified ? "status status--pass" : "status status--fail"}">${hashVerified ? "verified in this browser" : "hash mismatch"}</span></dd></div>
      </dl>
    </header>`;
}

function axisCell(score: AxisScore | undefined): string {
  if (!score) return "<td>n/a</td>";
  return `<td class="num axis-cell">
      <span class="axis-cell__value">${percentage(score.rate)}</span>
      <span class="axis-cell__count">${score.passed}/${score.total}</span>
      <span class="meter" style="--rate:${score.rate}" aria-hidden="true"></span>
    </td>`;
}

function scoreTable(bundle: Bundle): string {
  return `<div class="table-scroll"><table class="scores">
      <thead><tr>
        <th scope="col">Candidate</th>
        <th scope="col" class="num">Scenarios</th>
        <th scope="col" class="num">Pairs</th>
        ${AXES.map((axis) => `<th scope="col" class="num" title="${escapeHtml(axis.question)}">${axis.label}</th>`).join("")}
      </tr></thead>
      <tbody>${bundle.candidates
        .map((candidate) => {
          const card = bundle.scorecards.find(
            (item) => item.candidateId === candidate.id,
          );
          if (!card) return "";
          return `<tr>
            <th scope="row" title="${escapeHtml(candidate.description)}">${escapeHtml(candidate.name)}</th>
            <td class="num"><span class="axis-cell__value">${card.scenariosPassed}/${card.scenariosTotal}</span></td>
            <td class="num"><span class="axis-cell__value">${card.pairedControlsPassed}/${card.pairedControlsTotal}</span></td>
            ${AXES.map(({ axis }) => axisCell(card.axes.find((item) => item.axis === axis))).join("")}
          </tr>`;
        })
        .join("")}</tbody>
    </table></div>`;
}

function resultCell(
  run: Run,
  scenario: Scenario,
  candidate: Candidate,
): string {
  const failed = failedCount(run);
  const label = `${candidate.name}, ${scenario.title}, ${run.passed ? "pass" : `fail, ${failed} of ${run.assertions.length} assertions failed`}`;
  return `<button class="cell ${run.passed ? "cell--pass" : "cell--fail"}" data-run="${escapeHtml(run.candidateId)}::${escapeHtml(run.scenarioId)}" aria-pressed="false" aria-label="${escapeHtml(label)}">
      <span class="cell__verdict">${run.passed ? "Pass" : "Fail"}</span>
      <span class="cell__detail">${run.passed ? `<code title="Trace root">${shortHash(run.traceRoot, 7)}</code>` : `${failed} failed`}</span>
    </button>`;
}

function scenarioMatrix(bundle: Bundle): string {
  const pairs = new Map<string, Scenario[]>();
  for (const scenario of bundle.scenarios) {
    pairs.set(scenario.pairId, [
      ...(pairs.get(scenario.pairId) ?? []),
      scenario,
    ]);
  }
  const rows = [...pairs.values()]
    .map(
      (scenarios) =>
        `<tbody>${scenarios
          .map(
            (scenario) => `<tr data-row="${escapeHtml(scenario.id)}">
            <th scope="row"><button class="scenario" data-scenario="${escapeHtml(scenario.id)}"><span class="scenario__title">${escapeHtml(scenario.title)}</span><span class="scenario__variant">${escapeHtml(scenario.variant)}</span></button></th>
            <td class="variant">${escapeHtml(scenario.variant)}</td>
            ${bundle.candidates
              .map((candidate) => {
                const run = findRun(bundle, candidate.id, scenario.id);
                return `<td class="result">${run ? resultCell(run, scenario, candidate) : "n/a"}</td>`;
              })
              .join("")}
          </tr>`,
          )
          .join("")}</tbody>`,
    )
    .join("");
  return `<div class="table-scroll"><table class="matrix">
      <thead><tr><th scope="col">Scenario</th><th scope="col" class="variant">Variant</th>${bundle.candidates.map((candidate) => `<th scope="col" class="result">${escapeHtml(candidate.name)}</th>`).join("")}</tr></thead>
      ${rows}
    </table></div>`;
}

function eventRow(event: TraceEvent, failures: AssertionResult[]): string {
  const failing = failures.filter((assertion) =>
    assertion.evidence.includes(event.id),
  );
  const target = event.tool ?? event.id;
  const details: Array<[string, string]> = [
    ["Event", `<code>${escapeHtml(event.id)}</code>`],
    ["Trust", escapeHtml(event.trust)],
    ...(event.audience
      ? ([["Audience", `<code>${escapeHtml(event.audience)}</code>`]] as Array<
          [string, string]
        >)
      : []),
    ...(failing.length > 0
      ? ([
          [
            "Fails",
            failing
              .map((assertion) => `<code>${escapeHtml(assertion.id)}</code>`)
              .join(" "),
          ],
        ] as Array<[string, string]>)
      : []),
    ["Payload", `<code>${escapeHtml(event.payloadDigest)}</code>`],
    [
      "Previous",
      event.previousHash
        ? `<code>${escapeHtml(event.previousHash)}</code>`
        : "none, chain start",
    ],
    ["Receipt", `<code>${escapeHtml(event.hash)}</code>`],
  ];
  return `<li class="event${failing.length > 0 ? " event--evidence" : ""}" id="event-${escapeHtml(event.id)}">
      <details>
        <summary>
          <span class="event__seq">${event.sequence}</span>
          <span class="event__actor">${escapeHtml(event.actor)}</span>
          <span class="event__kind">${escapeHtml(event.kind)}</span>
          <span class="event__target"><code>${escapeHtml(target)}</code>${event.trust === "untrusted" ? '<span class="tag">untrusted</span>' : ""}${event.tags
            .filter((tag) => tag !== "untrusted_content")
            .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
            .join("")}</span>
          <span class="event__cost">${event.costMicros ?? ""}</span>
          <code class="event__hash">${shortHash(event.hash, 8)}</code>
        </summary>
        <dl class="event__details">${details.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("")}</dl>
      </details>
    </li>`;
}

function tracePanel(
  bundle: Bundle,
  candidateId: string,
  scenarioId: string,
): string {
  const scenario = bundle.scenarios.find((item) => item.id === scenarioId);
  const run = findRun(bundle, candidateId, scenarioId);
  if (!scenario || !run) return "";
  const failures = run.assertions.filter((assertion) => !assertion.passed);
  const counterpart = bundle.scenarios.find(
    (item) => item.pairId === scenario.pairId && item.id !== scenario.id,
  );
  const passedCount = run.assertions.length - failures.length;
  const sequenceOf = new Map(
    run.trace.map((event) => [event.id, event.sequence]),
  );

  return `<div class="trace-head">
      <div class="trace-head__title">
        <h3 tabindex="-1">${escapeHtml(scenario.title)}</h3>
        <span class="${run.passed ? "status status--pass" : "status status--fail"}">${run.passed ? "Pass" : "Fail"}</span>
      </div>
      <p>${escapeHtml(scenario.description)}</p>
      <dl class="facts facts--compact">
        <div><dt>Variant</dt><dd>${escapeHtml(scenario.variant)}</dd></div>
        <div><dt>Protocol</dt><dd><code>${escapeHtml(scenario.protocol)}</code></dd></div>
        <div><dt>Trace root</dt><dd><code title="${escapeHtml(run.traceRoot)}">${shortHash(run.traceRoot)}</code></dd></div>
        ${counterpart ? `<div><dt>Paired with</dt><dd><button class="link-button" data-scenario="${escapeHtml(counterpart.id)}">${escapeHtml(counterpart.title)}</button></dd></div>` : ""}
      </dl>
    </div>
    <h4 class="trace-subhead">Assertions <span>${passedCount} of ${run.assertions.length} passed</span></h4>
    <ul class="assertions">${run.assertions
      .map(
        (
          assertion,
        ) => `<li class="assertion ${assertion.passed ? "assertion--pass" : "assertion--fail"}">
          <span class="assertion__mark" aria-label="${assertion.passed ? "Passed" : "Failed"}">${assertion.passed ? "✓" : "✕"}</span>
          <code class="assertion__id">${escapeHtml(assertion.id)}</code>
          <span class="assertion__text" title="${escapeHtml(assertion.explanation)}">${escapeHtml(assertion.explanation)}${
            !assertion.passed && assertion.evidence.length > 0
              ? ` <span class="assertion__evidence">${assertion.evidence.map((id) => `<button class="link-button" data-event="${escapeHtml(id)}" aria-label="Show event ${escapeHtml(id)}">#${sequenceOf.get(id) ?? escapeHtml(id)}</button>`).join(" ")}</span>`
              : ""
          }</span>
          <span class="assertion__axis">${escapeHtml(assertion.axis)}</span>
        </li>`,
      )
      .join("")}</ul>
    <h4 class="trace-subhead">Events <span>${run.trace.length} receipts, hash-linked</span></h4>
    <div class="events-head" aria-hidden="true"><span>#</span><span>Actor</span><span>Kind</span><span>Tool or event</span><span>Cost</span><span>Receipt</span></div>
    <ol class="events">${run.trace.map((event) => eventRow(event, failures)).join("")}</ol>
    <p class="trace-note">Costs are in µ-credits. Select an event for its payload digest and chain hashes.</p>`;
}

function method(bundle: Bundle): string {
  const protocols = bundle.protocolProfiles
    .map(
      (profile) =>
        `${escapeHtml(profile.label)} ${escapeHtml(profile.version)} (${escapeHtml(profile.status)})`,
    )
    .join(" and ");
  return `<section class="method" id="method" aria-labelledby="method-title">
      <h2 id="method-title">Method</h2>
      <div class="method__body">
        <dl class="definitions">
          <div><dt>Paired worlds</dt><dd>Each scenario has a benign half and an adversarial half. A pair counts only when both pass, so blanket refusal shows up as a utility failure.</dd></div>
          <div><dt>Assertions</dt><dd>Assertions check what happened in the world, meaning tool calls, audiences, costs, stop order and terminal events. They don't read the agent's account of its intent.</dd></div>
          <div><dt>Receipts</dt><dd>Events keep content digests, causal order, trust, scope, cost and tags. The recorder rejects raw prompts, tokens and responses.</dd></div>
          <div><dt>Replay</dt><dd>Canonical JSON and a SHA-256 receipt chain make replay divergence and post-run edits detectable. This page recomputes the bundle hash in your browser on load.</dd></div>
        </dl>
        <h3>Score axes</h3>
        <dl class="definitions">${AXES.map((axis) => `<div><dt>${axis.label}</dt><dd>${escapeHtml(axis.question)}</dd></div>`).join("")}</dl>
        <h3>Protocol profiles</h3>
        <p>Adapters normalise recorder envelopes from ${protocols} into one body-free event model. Scenarios tagged <code>native</code> record those events directly.</p>
        <h3>Known limits</h3>
        <p>Passing this synthetic fixture pack is neither a security proof nor a protocol certification. The predicates cover declared boundaries only. Production timing, authentication, networking and stochastic model behaviour need separate trials.</p>
        <p>Run it yourself with <code>npm ci</code> and <code>npm run benchmark</code>. The <a href="${REPO_URL}#quickstart">quickstart</a> covers the CLI and bundle verification.</p>
      </div>
    </section>`;
}

function render(bundle: Bundle, hashVerified: boolean): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;
  let selectedCandidate = "naive-reference";
  let selectedScenario = "retrieval-injection";

  app.innerHTML = `<div class="page">
      <main>
        <div class="workspace">
          <div class="primary">
            ${intro(bundle, hashVerified)}
            <section class="results" id="results" aria-labelledby="results-title">
              <div class="section-title"><h2 id="results-title">Scores</h2><p>Both candidates are illustrative fixtures that exercise the evaluator. A pair passes only when its benign and adversarial halves both pass.</p></div>
              ${scoreTable(bundle)}
              <div class="section-title section-title--matrix"><h2>Scenario matrix</h2><p>Select a result to open its trace.</p></div>
              ${scenarioMatrix(bundle)}
            </section>
          </div>
        <section class="inspector" id="trace" aria-labelledby="trace-title">
          <div class="inspector__bar">
            <h2 id="trace-title">Trace</h2>
            <div class="segmented" role="group" aria-label="Candidate">${bundle.candidates
              .map(
                (candidate) =>
                  `<button data-candidate="${escapeHtml(candidate.id)}" aria-pressed="false">${escapeHtml(candidate.name)}</button>`,
              )
              .join("")}</div>
          </div>
          <div id="trace-panel" aria-live="polite"></div>
        </section>
        </div>
        ${method(bundle)}
      </main>
      <footer class="footer"><span>BoundaryBench ${escapeHtml(bundle.benchmarkVersion)}, Apache-2.0</span><span>Schema <code>${escapeHtml(bundle.schema)}</code></span><a href="${REPO_URL}">github.com/fortunexbt/boundary-bench</a></footer>
    </div>`;

  const panel = app.querySelector<HTMLDivElement>("#trace-panel");
  const inspector = app.querySelector<HTMLElement>("#trace");

  const update = (): void => {
    if (panel)
      panel.innerHTML = tracePanel(bundle, selectedCandidate, selectedScenario);
    app
      .querySelectorAll<HTMLButtonElement>("[data-candidate]")
      .forEach((button) => {
        const id = button.dataset.candidate ?? "";
        const run = findRun(bundle, id, selectedScenario);
        button.setAttribute("aria-pressed", String(id === selectedCandidate));
        button.classList.toggle("is-fail", run?.passed === false);
      });
    app.querySelectorAll<HTMLButtonElement>("[data-run]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(
          button.dataset.run === `${selectedCandidate}::${selectedScenario}`,
        ),
      );
    });
    app.querySelectorAll<HTMLElement>("[data-row]").forEach((row) => {
      row.classList.toggle("is-selected", row.dataset.row === selectedScenario);
    });
  };

  const revealInspector = (): void => {
    if (!inspector) return;
    const top = inspector.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      inspector.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const cell = target.closest<HTMLButtonElement>("[data-run]");
    if (cell) {
      const [candidate, scenario] = (cell.dataset.run ?? "").split("::");
      if (candidate && scenario) {
        selectedCandidate = candidate;
        selectedScenario = scenario;
        update();
        revealInspector();
      }
      return;
    }

    const candidate = target.closest<HTMLButtonElement>("[data-candidate]");
    if (candidate) {
      selectedCandidate = candidate.dataset.candidate ?? selectedCandidate;
      update();
      return;
    }

    const scenario = target.closest<HTMLButtonElement>("[data-scenario]");
    if (scenario) {
      const insidePanel = panel?.contains(scenario) ?? false;
      selectedScenario = scenario.dataset.scenario ?? selectedScenario;
      update();
      if (insidePanel)
        panel?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
      else revealInspector();
      return;
    }

    const evidence = target.closest<HTMLButtonElement>("[data-event]");
    if (evidence) {
      const row = document.getElementById(`event-${evidence.dataset.event}`);
      const details = row?.querySelector("details");
      if (details) {
        details.open = true;
        details.querySelector("summary")?.focus({ preventScroll: true });
        row?.scrollIntoView({ block: "nearest" });
      }
    }
  });

  update();
}

async function boot(): Promise<void> {
  const response = await fetch("./results/latest.json");
  if (!response.ok)
    throw new Error(`Result bundle unavailable (${response.status})`);
  const bundle = (await response.json()) as Bundle;
  render(bundle, await verifyBundleHash(bundle));
}

boot().catch((error: unknown) => {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (app)
    app.innerHTML = `<div class="fatal" role="alert"><h1>Results didn't load</h1><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p><p>Run <code>npm run benchmark</code> to regenerate <code>site/public/results/latest.json</code>, then reload.</p></div>`;
});
