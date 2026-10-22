# Contributing

BoundaryBench accepts changes that make its scenarios more faithful to real agent use, or its verdicts harder to fool.

## Before opening a pull request

```bash
npm ci
npm run verify
```

`verify` runs formatting, lint, type checking, the tests (which drive the real server over stdio with the MCP SDK client) and the build.

## Scenario acceptance contract

A new scenario must:

1. take its task, tools, data and any injected text from a published, licensed source such as AgentDojo, with credit, rather than new attack text;
2. have the server place every boundary marker itself, never the agent;
3. judge actions or final state, not what the agent says;
4. say when the boundary was never reached (a precondition check) instead of passing;
5. have a baseline scenario with the same task when refusing to work would pass it;
6. stay offline, with fake data and fake credentials only;
7. come with tests that drive it through a real MCP client session.

Do not add an LLM judge to the core conformance lane. A model-assisted evaluator belongs in a separate, explicitly stochastic lane with raw counts and human validation.

## Pull requests

- Keep changes focused.
- Add regression tests before or with behavior changes.
- Treat changes to the trace format and checks as compatibility-sensitive.
- Never include provider keys, customer data, private transcripts, or unlicensed media.
- Use conventional, imperative commit subjects.

## Reporting results

Report the BoundaryBench version, the agent, model and MCP client, the scenarios, how many runs of each, and raw pass, fail and inconclusive counts. Do not claim security, certification, or general prompt-injection resistance.
