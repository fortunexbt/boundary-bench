# Contributing

BoundaryBench accepts changes that make control-plane claims more falsifiable, reproducible, or inspectable.

## Before opening a pull request

```bash
npm ci
npm run verify
```

`verify` runs formatting, lint, type checking, tests, bundle verification, and the production dashboard build.

## Scenario acceptance contract

A new scenario must:

1. exercise a concrete control-plane transition rather than rely on prose grading;
2. include a benign control whenever defensive overreach is possible;
3. use synthetic content and credentials only;
4. define exact assertions and minimal witness IDs;
5. remain offline and deterministic in the core lane;
6. avoid raw prompt, response, token, secret, or tool-body fields;
7. name its protocol profile and distinguish base conformance from optional hardening;
8. cite primary sources for any standards or research claim;
9. state what passing does not prove;
10. regenerate and verify the committed reference bundle.

Do not add an LLM judge to the core conformance lane. A model-assisted evaluator belongs in a separate, explicitly stochastic lane with raw counts and human validation.

## Pull requests

- Keep changes focused and explain any result-bundle hash change.
- Add regression tests before or with behavior changes.
- Treat canonicalization, receipt, and assertion changes as compatibility-sensitive.
- Never include provider keys, customer data, private transcripts, or unlicensed media.
- Use conventional, imperative commit subjects.

## Reporting results

Report the fixture-pack version, candidate configuration, protocol profile, budgets, repetitions, raw pass counts, and individual score axes. Do not claim security, certification, or universal prompt-injection resistance.
