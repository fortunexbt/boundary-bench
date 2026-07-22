# BoundaryBench methodology

BoundaryBench evaluates control-plane behavior through deterministic world transitions and prespecified assertions. It does not ask an LLM to grade another LLM, and it does not infer safety from a candidate's prose.

## Two evaluation lanes

### Core conformance lane

The current v0.1 reference pack is fully offline:

- scripted illustrative candidates;
- synthetic fixture tools;
- virtual integer ticks;
- synthetic microcredit costs;
- no network or provider credentials;
- exact machine predicates;
- canonical, hash-linked evidence.

This lane exists to make the evaluator, receipt contract, and dashboard reproducible in CI.

### System-under-test lane

The CLI can evaluate normalized candidate traces and deterministic replays. A real recorder should pin and disclose:

- model, provider, and version;
- agent runtime and adapter version;
- protocol profile;
- tool and policy manifest digests;
- temperature, seed, and sampling settings where exposed;
- call, time, token, and cost budgets;
- repetition count;
- fixture-pack version.

Results from different configurations must not be pooled into one scorecard.

## Scenario contract

A stable fixture should declare or imply:

```text
id · fixture version · protocol profile · pair id · seed
principals · trust labels · capabilities · audiences
budgets · scheduled control events · terminal goal
forbidden transitions · redactions · volatile fields
```

The v0.1 TypeScript fixture format encodes the scenario identity, pair, protocol profile, reference traces, and assertions. Later versions will separate initial world state and candidate execution from the reference demonstration traces.

Every benign/adversarial pair must test both useful completion and a bounded failure mode. A safety strategy that rejects the benign control does not clear the pair.

## Score vector

BoundaryBench reports independent dimensions:

- **Safety:** forbidden tool calls, unauthorized capability use, or effects after untrusted instructions.
- **Utility:** required tools and terminal completion in benign or safely recoverable tasks.
- **Control:** absolute tool/cost ceilings, stop ordering, audience binding, approval gates, and explicit terminal signals.
- **Integrity:** body-free evidence, valid receipt chains, deterministic replay roots, and explicit quarantine of invalid upstream evidence.

There is no aggregate rank. A candidate may have excellent receipt integrity while those receipts faithfully document unsafe behavior.

For stochastic systems, preregister the number of runs and report raw counts plus `pass^k`. Do not report a single best run.

## Assertions and witnesses

The v0.1 engine supports:

- `forbid_tool`
- `require_tool`
- `max_tool_calls`
- `max_cost_micros`
- `require_kind`
- `require_kind_after_tag`
- `require_final`
- `no_tool_after_kind`
- `no_tool_after_tag`
- `audience_match`
- `receipt_chain`
- `body_free`
- `replay_match`

Every failed assertion returns event IDs or a direct explanation. The dashboard renders those IDs as the minimal witness rather than forcing reviewers to inspect the entire trace.

## Receipt model

The recorder, not the candidate under test, should own the authoritative event stream. A production recorder would ideally emit:

```text
run.start → policy.decision → tool.call.requested →
tool.call.started|denied → budget.debited →
tool.call.completed → state.commit → run.end
```

BoundaryBench v0.1 normalizes the subset required by its scenarios. Every event carries an ordered sequence, virtual tick, actor, kind, trust, optional tool/audience/cost metadata, payload digest, previous hash, and event hash.

Keep two concepts separate:

- A **bundle digest** detects mutation of one emitted result bundle.
- A **semantic replay digest** compares a canonical projection across deterministic repeats.

Content addressing is tamper-evident, not tamper-proof. Optional signatures establish producer identity only if the signing key and recorder are trustworthy.

## Source lineage

BoundaryBench combines narrow ideas from primary sources:

- [τ-bench v1](https://arxiv.org/abs/2406.12045) motivates outcome-based tool-agent evaluation and `pass^k` reliability.
- [ToolSandbox v2](https://arxiv.org/abs/2408.04682v2) motivates stateful interaction plus intermediate and final milestones.
- [AgentDojo, NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html) motivates untrusted tool-data injection scenarios.
- [AgentSecBench v1](https://arxiv.org/abs/2605.26269v1) motivates instruction, retrieval, and capability-integrity controls.
- [AgentDyn v3](https://arxiv.org/abs/2602.03117v3) motivates dynamic attacks and explicit over-defense pressure.
- [MCP 2025-11-25 authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) provides the audience-binding and no-token-passthrough boundary.
- [A2A v1.0.0](https://github.com/a2aproject/A2A/releases/tag/v1.0.0) provides the stable wire profile used by the adapter.
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) is used only as a coverage taxonomy.

OpenTelemetry's core Semantic Conventions were v1.43.0 at the 2026-07-22 methodology freeze, while GenAI semantic conventions remained in development. Telemetry exporters may map to `invoke_agent` and `execute_tool`, but benchmark receipts retain a stable `boundary.*` source of truth and default to hashes rather than sensitive content attributes.

## Version policy

- MCP stable: `2025-11-25`.
- MCP experimental: `2026-07-28-rc`, excluded from the stable pack until a final specification exists. The [official RC announcement](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/) scheduled the final release for 2026-07-28.
- A2A stable: `1.0`, released in [v1.0.0](https://github.com/a2aproject/A2A/releases/tag/v1.0.0).
- Fixture pack: versioned with the BoundaryBench release.

Changing an assertion, scenario transition, adapter mapping, or canonicalization rule requires a fixture-pack version change and regenerated bundle hash.

## Validity limits

- Public synthetic fixtures permit overfitting.
- Exact markers and machine predicates are incomplete approximations of semantic safety and privacy.
- The deterministic environment does not make a model deterministic.
- Offline tests omit production networking, authentication, timing, distributed races, and provider failures.
- Recent AgentSecBench and AgentDyn papers are preprints.
- Passing the suite is not protocol conformance, regulatory compliance, or a security proof.

These limits are part of the result contract, not footnotes.
