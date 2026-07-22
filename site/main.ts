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

const AXES: Axis[] = ["safety", "utility", "control", "integrity"];

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

function radar(scorecard: Scorecard): string {
  const center = 82;
  const radius = 64;
  const points = AXES.map((axis, index) => {
    const score = scorecard.axes.find((item) => item.axis === axis)?.rate ?? 0;
    const angle = -Math.PI / 2 + index * (Math.PI / 2);
    return `${center + Math.cos(angle) * radius * score},${center + Math.sin(angle) * radius * score}`;
  }).join(" ");
  return `<svg class="radar" viewBox="0 0 164 164" role="img" aria-label="Four-axis score shape">
    <polygon class="radar-grid radar-grid--outer" points="82,18 146,82 82,146 18,82" />
    <polygon class="radar-grid" points="82,50 114,82 82,114 50,82" />
    <line x1="82" y1="18" x2="82" y2="146" /><line x1="18" y1="82" x2="146" y2="82" />
    <polygon class="radar-score" points="${points}" />
    <circle cx="82" cy="82" r="3" />
  </svg>`;
}

function candidatePanel(
  candidate: Candidate,
  scorecard: Scorecard,
  selected: boolean,
): string {
  return `<button class="candidate ${selected ? "candidate--selected" : ""}" data-candidate="${escapeHtml(candidate.id)}" aria-pressed="${selected}">
    <span class="candidate__topline"><span>${escapeHtml(candidate.kind)}</span><span>${scorecard.scenariosPassed}/${scorecard.scenariosTotal}</span></span>
    <span class="candidate__name">${escapeHtml(candidate.name)}</span>
    <span class="candidate__body">
      ${radar(scorecard)}
      <span class="axis-list">
        ${scorecard.axes
          .map(
            (axis) =>
              `<span class="axis-row"><span>${escapeHtml(axis.axis)}</span><span class="axis-track"><i style="width:${Math.round(axis.rate * 100)}%"></i></span><b>${percentage(axis.rate)}</b></span>`,
          )
          .join("")}
      </span>
    </span>
    <span class="candidate__pair">paired controls <b>${scorecard.pairedControlsPassed}/${scorecard.pairedControlsTotal}</b></span>
    <span class="candidate__description">${escapeHtml(candidate.description)}</span>
  </button>`;
}

function resultCell(run: Run): string {
  const failed = run.assertions.filter((assertion) => !assertion.passed).length;
  return `<button class="result-cell ${run.passed ? "result-cell--pass" : "result-cell--fail"}" data-run="${escapeHtml(run.candidateId)}::${escapeHtml(run.scenarioId)}" aria-label="${run.passed ? "Pass" : `${failed} failed assertions`}">
    <span>${run.passed ? "PASS" : "FAIL"}</span><small>${run.passed ? shortHash(run.traceRoot, 7) : `${failed} breach${failed === 1 ? "" : "es"}`}</small>
  </button>`;
}

function scenarioMatrix(bundle: Bundle): string {
  return `<div class="matrix-wrap"><table class="matrix">
    <thead><tr><th>scenario / counterfactual</th>${bundle.candidates.map((candidate) => `<th>${escapeHtml(candidate.name)}</th>`).join("")}</tr></thead>
    <tbody>${bundle.scenarios
      .map((scenario, index) => {
        const runs = bundle.candidates.map((candidate) =>
          bundle.runs.find(
            (run) =>
              run.candidateId === candidate.id &&
              run.scenarioId === scenario.id,
          ),
        );
        return `<tr>
          <td><button class="scenario-link" data-scenario="${escapeHtml(scenario.id)}"><span class="scenario-index">${String(index + 1).padStart(2, "0")}</span><span><b>${escapeHtml(scenario.title)}</b><small>${escapeHtml(scenario.protocol)} · ${escapeHtml(scenario.variant)} · ${escapeHtml(scenario.pairId)}</small></span></button></td>
          ${runs.map((run) => (run ? `<td>${resultCell(run)}</td>` : "<td>—</td>")).join("")}
        </tr>`;
      })
      .join("")}</tbody>
  </table></div>`;
}

function tracePanel(
  bundle: Bundle,
  candidateId: string,
  scenarioId: string,
): string {
  const scenario = bundle.scenarios.find((item) => item.id === scenarioId);
  const run = bundle.runs.find(
    (item) =>
      item.candidateId === candidateId && item.scenarioId === scenarioId,
  );
  if (!scenario || !run) return "";
  const failures = run.assertions.filter((assertion) => !assertion.passed);

  return `<div class="trace-head">
      <div><span class="eyebrow">TRACE INSPECTOR / ${escapeHtml(candidateId)}</span><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.description)}</p></div>
      <div class="trace-verdict ${run.passed ? "trace-verdict--pass" : "trace-verdict--fail"}"><span>${run.passed ? "BOUNDARY HELD" : "BOUNDARY BREACHED"}</span><code>${shortHash(run.traceRoot)}</code></div>
    </div>
    <div class="assertions">
      ${run.assertions
        .map(
          (assertion) =>
            `<div class="assertion ${assertion.passed ? "assertion--pass" : "assertion--fail"}"><span>${assertion.passed ? "✓" : "×"}</span><div><b>${escapeHtml(assertion.id)}</b><small>${escapeHtml(assertion.explanation)}</small></div><em>${escapeHtml(assertion.axis)}</em></div>`,
        )
        .join("")}
    </div>
    <div class="trace-rail" aria-label="Hash-linked event trace">
      ${run.trace
        .map(
          (
            event,
            index,
          ) => `<article class="event event--${escapeHtml(event.actor)}">
            <div class="event__node">${String(index).padStart(2, "0")}</div>
            <div class="event__card">
              <header><span>${escapeHtml(event.actor)} / ${escapeHtml(event.kind)}</span><code>t+${event.tick}</code></header>
              <h4>${escapeHtml(event.tool ?? event.id)}</h4>
              <div class="event__meta"><span>trust ${escapeHtml(event.trust)}</span>${event.audience ? `<span>aud ${escapeHtml(event.audience)}</span>` : ""}${event.costMicros !== undefined ? `<span>${event.costMicros} µcr</span>` : ""}</div>
              ${event.tags.length > 0 ? `<div class="event__tags">${event.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
              <footer><span>payload</span><code>${shortHash(event.payloadDigest, 16)}</code><span>receipt</span><code>${shortHash(event.hash, 16)}</code></footer>
            </div>
          </article>`,
        )
        .join("")}
    </div>
    ${failures.length > 0 ? `<p class="witness"><b>MINIMAL WITNESS</b> ${failures.map((item) => escapeHtml(item.evidence.join(", ") || item.id)).join(" · ")}</p>` : ""}`;
}

function render(bundle: Bundle, hashVerified: boolean): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;
  let selectedCandidate = "guarded-reference";
  let selectedScenario = "retrieval-injection";

  const drawTrace = (): void => {
    const container = document.querySelector<HTMLDivElement>("#trace-panel");
    if (container)
      container.innerHTML = tracePanel(
        bundle,
        selectedCandidate,
        selectedScenario,
      );
  };

  app.innerHTML = `<header class="masthead">
      <a class="wordmark" href="#top" aria-label="BoundaryBench home"><span>BB</span><b>BOUNDARY//BENCH</b></a>
      <nav aria-label="Primary"><a href="#benchmark">matrix</a><a href="#trace">receipts</a><a href="#method">method</a><a href="https://github.com/fortunexbt/boundary-bench">source ↗</a></nav>
    </header>
    <main id="top">
      <section class="hero">
        <div class="hero__copy">
          <div class="status-line"><span class="pulse"></span> OFFLINE / DETERMINISTIC / BODY-FREE</div>
          <h1>Agents need<br/><em>crash tests.</em></h1>
          <p class="hero__lede">BoundaryBench turns invisible control-plane promises into replayable evidence: paired worlds, hard stop and budget boundaries, audience checks, approval gates, and hash-linked receipts.</p>
          <div class="hero__actions"><a class="button button--solid" href="#benchmark">Inspect the evidence</a><a class="button" href="https://github.com/fortunexbt/boundary-bench#quickstart">Run locally ↗</a></div>
        </div>
        <div class="hero__scope" aria-label="Benchmark scope overview">
          <div class="scope-corners"></div>
          <span class="eyebrow">EVIDENCE BUNDLE / V${escapeHtml(bundle.benchmarkVersion)}</span>
          <div class="scope-number">${bundle.scenarios.length}<small>deterministic worlds</small></div>
          <div class="scope-grid">
            <span><b>${bundle.runs.length}</b> traces</span><span><b>${AXES.length}</b> score axes</span><span><b>${new Set(bundle.scenarios.map((item) => item.pairId)).size}</b> paired controls</span><span><b>0</b> LLM judges</span>
          </div>
          <div class="hash-stamp ${hashVerified ? "hash-stamp--verified" : "hash-stamp--failed"}"><span>${hashVerified ? "✓ CLIENT-VERIFIED SHA-256" : "× HASH VERIFICATION FAILED"}</span><code>${escapeHtml(shortHash(bundle.bundleHash, 24))}</code></div>
        </div>
      </section>
      <section class="ticker" aria-label="Protocol profiles">${bundle.protocolProfiles.map((profile) => `<span><i>${escapeHtml(profile.status)}</i>${escapeHtml(profile.label)} ${escapeHtml(profile.version)}</span>`).join("")}<span><i>method</i>paired benign / adversarial controls</span><span><i>privacy</i>digests, not bodies</span></section>
      <section class="benchmark" id="benchmark">
        <div class="section-head"><div><span class="eyebrow">01 / VECTOR SCORECARDS</span><h2>No single number<br/>to hide behind.</h2></div><p>Safety without utility is over-refusal. Utility without hard controls is exposure. BoundaryBench keeps each dimension visible and only credits a pair when both its benign and adversarial worlds pass.</p></div>
        <div class="candidate-grid" id="candidate-grid">${bundle.candidates
          .map((candidate) =>
            candidatePanel(
              candidate,
              bundle.scorecards.find(
                (item) => item.candidateId === candidate.id,
              )!,
              candidate.id === selectedCandidate,
            ),
          )
          .join("")}</div>
        <div class="section-head section-head--matrix"><div><span class="eyebrow">02 / SCENARIO MATRIX</span><h2>Every green cell<br/>has a receipt.</h2></div><p>These two built-in candidates are deliberately illustrative fixtures. They prove the evaluator and dashboard—not the capability of a commercial model.</p></div>
        ${scenarioMatrix(bundle)}
      </section>
      <section class="trace-section" id="trace"><div id="trace-panel"></div></section>
      <section class="method" id="method">
        <div class="section-head"><div><span class="eyebrow">03 / METHOD CONTRACT</span><h2>Falsifiable by<br/>construction.</h2></div><p>Each fixture declares trust labels, capabilities, budgets, protocol profile, scheduled control events, and machine-checkable assertions before execution.</p></div>
        <div class="method-grid">
          <article><span>01</span><h3>Counterfactual pairs</h3><p>Benign and adversarial variants test useful completion and resistance together, exposing both unsafe compliance and defensive paralysis.</p></article>
          <article><span>02</span><h3>World transitions</h3><p>Assertions inspect tool calls, audiences, costs, stop order, and terminal events—not an agent’s self-reported intent.</p></article>
          <article><span>03</span><h3>Body-free receipts</h3><p>Events retain only content digests, causal order, trust, scope, cost, and tags. Raw prompts, tokens, and responses are rejected.</p></article>
          <article><span>04</span><h3>Replay equality</h3><p>Canonical JSON and a SHA-256 receipt chain make deterministic divergence and post-run mutation immediately visible.</p></article>
        </div>
        <aside class="limits"><b>BOUNDARY, NOT CERTIFICATE.</b><span>Passing this synthetic fixture pack is neither a security proof nor protocol certification. Exact predicates cover declared boundaries; production timing, authentication, networking, and stochastic model behavior require separate trials.</span></aside>
      </section>
    </main>
    <footer><span>BOUNDARY//BENCH ${escapeHtml(bundle.benchmarkVersion)}</span><span>Apache-2.0 · deterministic reference bundle · ${escapeHtml(shortHash(bundle.bundleHash, 16))}</span></footer>`;

  document
    .querySelectorAll<HTMLButtonElement>("[data-candidate]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        selectedCandidate = button.dataset.candidate ?? selectedCandidate;
        document
          .querySelectorAll<HTMLButtonElement>("[data-candidate]")
          .forEach((item) => {
            const selected = item.dataset.candidate === selectedCandidate;
            item.classList.toggle("candidate--selected", selected);
            item.setAttribute("aria-pressed", String(selected));
          });
        drawTrace();
        document
          .querySelector("#trace")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-run]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const [candidate, scenario] = (button.dataset.run ?? "").split("::");
        if (candidate && scenario) {
          selectedCandidate = candidate;
          selectedScenario = scenario;
          drawTrace();
          document
            .querySelector("#trace")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>("[data-scenario]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        selectedScenario = button.dataset.scenario ?? selectedScenario;
        drawTrace();
        document
          .querySelector("#trace")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

  drawTrace();
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
    app.innerHTML = `<div class="fatal"><b>EVIDENCE LOAD FAILED</b><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p></div>`;
});
