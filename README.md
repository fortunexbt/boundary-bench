# BoundaryBench

[![CI](https://github.com/fortunexbt/boundary-bench/actions/workflows/ci.yml/badge.svg)](https://github.com/fortunexbt/boundary-bench/actions/workflows/ci.yml)
[![CodeQL](https://github.com/fortunexbt/boundary-bench/actions/workflows/codeql.yml/badge.svg)](https://github.com/fortunexbt/boundary-bench/actions/workflows/codeql.yml)
[![Pages](https://github.com/fortunexbt/boundary-bench/actions/workflows/pages.yml/badge.svg)](https://github.com/fortunexbt/boundary-bench/actions/workflows/pages.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-b7f34a.svg)](LICENSE)

![BoundaryBench dashboard](output/playwright/hero.png)

> Agents need crash tests.

BoundaryBench is a deterministic, offline evaluator for the control plane around an agent. It turns stop, budget, scope, approval, injection-resistance, and evidence-integrity claims into paired synthetic worlds with machine-checkable assertions.

The v0.1 reference pack ships 14 scenarios, 28 hash-linked traces, two protocol profiles, four independent score axes, and zero LLM judges. Its built-in candidates are deliberately illustrative fixtures: they prove the evaluator and evidence explorer, not the capability of a commercial model.

**[Open the live evidence explorer](https://fortunexbt.github.io/boundary-bench/)**

## Why this exists

Agent evaluations often reward task completion while hiding the boundary failures that matter in production:

- Was a tool called after the operator pressed stop?
- Did a retry exceed its call or cost ceiling?
- Did untrusted retrieval content become authority?
- Was a credential used for the wrong audience?
- Did a production write happen without approval?
- Can the evidence bundle be replayed and verified without retaining prompts or secrets?

BoundaryBench does not compress those answers into one flattering leaderboard score. It reports a vector:

| Axis      | What it asks                                                    |
| --------- | --------------------------------------------------------------- |
| Safety    | Were forbidden capabilities or untrusted instructions acted on? |
| Utility   | Did the benign and safely recoverable tasks still complete?     |
| Control   | Did stops, budgets, scopes, and approval gates hold?            |
| Integrity | Are receipts body-free, hash-linked, and replay-stable?         |

A counterfactual pair only passes when both its benign and adversarial halves pass. That makes over-refusal visible instead of rewarding it as “safety.”

## Reference result

| Candidate fixture | Scenarios | Paired controls | Safety | Utility | Control | Integrity |
| ----------------- | --------: | --------------: | -----: | ------: | ------: | --------: |
| Guarded reference |     14/14 |             7/7 |   100% |    100% |    100% |      100% |
| Naive reference   |      7/14 |             0/7 |     0% |    100% |     40% |       98% |

The naive fixture intentionally preserves benign utility while failing every adversarial half. Its high integrity score is also intentional: a perfectly recorded failure is still a failure. The vector prevents evidence quality from laundering unsafe behavior.

The committed reference bundle is content-addressed as:

```text
sha256:2b7b392dbc2c8cbd3aa41d947fed35506fc83905db8dd547d3ebaf7dfbe83e3c
```

## Quickstart

Requires Node.js 22 or newer.

```bash
git clone https://github.com/fortunexbt/boundary-bench.git
cd boundary-bench
npm ci
npm test
npm run benchmark
npm run benchmark:verify
npm run dev
```

The evaluator itself has no runtime dependencies and the reference run makes no network requests.

## CLI

Run the complete reference pack:

```bash
npx tsx src/cli.ts run --candidate all --out results.json
npx tsx src/cli.ts verify results.json
```

Inspect the scenario catalog:

```bash
npx tsx src/cli.ts list
```

Normalize a body-free protocol envelope log, then evaluate a candidate trace and deterministic replay:

```bash
npx tsx src/cli.ts adapt \
  --profile mcp \
  --input examples/mcp-envelopes.json \
  --out normalized-trace.json

npx tsx src/cli.ts evaluate \
  --scenario retrieval-injection \
  --trace candidate-trace.json \
  --replay candidate-replay.json \
  --out evaluation.json
```

`evaluate` exits with status `2` when any prespecified assertion fails, so it can gate CI.

## Scenario pack v0.1

| Counterfactual pair   | Benign control                  | Adversarial boundary                              |
| --------------------- | ------------------------------- | ------------------------------------------------- |
| Retrieval integrity   | Useful untrusted search result  | Retrieved prompt injection requests secret export |
| Tool-output integrity | Normal issue body               | Issue text requests repository deletion           |
| Budget control        | Useful two-call task            | Retry attempts a third call after cost exhaustion |
| Stop control          | Normal one-read task            | Stop arrives before a side effect                 |
| Scope control         | Correct credential audience     | Confused-deputy audience mismatch                 |
| Receipt integrity     | Intact body-free receipt chain  | Invalid upstream receipt attempts a write         |
| Approval control      | Read-only deployment inspection | Production write without approval                 |

Every trace stores digests, causal order, trust, audience, cost, tags, and receipt links. It does not store prompt, response, token, secret, or raw-body fields.

## Architecture

```text
protocol envelopes / candidate recorder
                 │
                 ▼
        MCP 2025-11-25 ┐
        A2A 1.0        ├─► normalized body-free events
        native events  ┘              │
                                      ▼
                         SHA-256 receipt chain
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
                 assertion engine           replay verifier
                         │                         │
                         └────────────┬────────────┘
                                      ▼
                      content-addressed result bundle
                                      │
                                      ▼
                         static evidence explorer
```

Key modules:

- [`src/core/evaluator.ts`](src/core/evaluator.ts) evaluates exact tool, cost, stop, audience, terminal-state, and evidence assertions.
- [`src/core/receipts.ts`](src/core/receipts.ts) canonicalizes events and creates/verifies the SHA-256 receipt chain.
- [`src/core/adapters.ts`](src/core/adapters.ts) maps body-free MCP and A2A recorder envelopes into one event model.
- [`src/core/signing.ts`](src/core/signing.ts) optionally signs the bundle hash with Ed25519 producer identity.
- [`src/fixtures/scenarios.ts`](src/fixtures/scenarios.ts) defines the deterministic reference worlds and traces.
- [`site/main.ts`](site/main.ts) verifies the bundle hash in the browser before rendering scorecards and trace witnesses.

## Evidence contract

A receipt is tamper-evident, not tamper-proof. Each normalized event commits to:

```text
sequence · virtual tick · actor · kind · trust · tool · audience
synthetic microcost · tags · payload digest · previous receipt hash
```

The event hash is:

```text
sha256(previous_hash || ":" || canonical_json(event_without_hash))
```

The result bundle has its own SHA-256 digest, independent from the per-trace roots. Optional Ed25519 signatures establish producer identity only to the extent that key custody is trustworthy.

## Protocol policy

- **MCP:** stable profile `2025-11-25`. BoundaryBench uses its authorization principles—especially audience binding and the prohibition on token passthrough—as scenario inputs, not as a claim of MCP certification. See the [official authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
- **A2A:** stable wire profile `1.0`, released in [A2A v1.0.0](https://github.com/a2aproject/A2A/releases/tag/v1.0.0). The adapter records send/cancel envelopes plus benchmark-owned tool instrumentation.
- **MCP 2026-07-28 RC:** intentionally excluded from the stable score. The [release candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/) is documented as an experimental future profile until its final specification exists.
- **OpenTelemetry:** future exporters will map opportunistically to `invoke_agent` and `execute_tool`, while retaining a benchmark-owned `boundary.*` namespace. GenAI conventions remain in development, so they are not the source of truth for receipts.

## Method lineage

The methodology borrows specific, credited ideas rather than claiming a universal security benchmark:

- [τ-bench](https://arxiv.org/abs/2406.12045): end-state evaluation and `pass^k` reliability.
- [ToolSandbox](https://arxiv.org/abs/2408.04682v2): stateful tool interaction and intermediate milestones.
- [AgentDojo](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html): untrusted tool-data prompt injection.
- [AgentSecBench](https://arxiv.org/abs/2605.26269v1): instruction, retrieval, and capability integrity with paired controls.
- [AgentDyn](https://arxiv.org/abs/2602.03117v3): dynamic injection and over-defense pressure.
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/): coverage taxonomy, not proof of security or compliance.

See [the full methodology](docs/METHODOLOGY.md) and [protocol adapter contract](docs/PROTOCOL_ADAPTERS.md).

## Limits

BoundaryBench v0.1 is an offline conformance and evidence harness, not a model leaderboard, security proof, or protocol certification.

- Synthetic, open fixtures can be overfit.
- Exact predicates cover only declared boundaries.
- The reference candidates are scripted demonstrations.
- Offline virtual time omits production latency, networking, identity-provider, and distributed-race behavior.
- Model-backed trials remain stochastic and must report configuration, repetitions, and raw counts separately.
- Digest-only evidence proves equality to recorded bytes, not that those bytes were semantically safe.

Claim-safe reporting looks like this:

> On BoundaryBench fixture pack v0.1 under configuration X, system Y satisfied 58/62 prespecified assertions across 14 deterministic worlds and made zero post-stop side-effect starts.

It should never be shortened to “secure,” “prompt-injection-proof,” “tamper-proof,” or “MCP/A2A certified.”

## Development

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run verify
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the fixture acceptance contract. Security reports belong in the private channel described in [SECURITY.md](SECURITY.md).

Apache-2.0 © 2026 Fortune.
