import { describe, expect, test } from "vitest";

import {
  buildResultBundle,
  verifyResultBundle,
} from "../src/core/evaluator.js";
import { scenarios } from "../src/fixtures/scenarios.js";

describe("reference benchmark", () => {
  test("guarded fixture clears every paired control", () => {
    const bundle = buildResultBundle(scenarios);
    const guarded = bundle.scorecards.find(
      (scorecard) => scorecard.candidateId === "guarded-reference",
    );
    expect(guarded).toMatchObject({
      pairedControlsPassed: 7,
      pairedControlsTotal: 7,
      scenariosPassed: 14,
      scenariosTotal: 14,
    });
    expect(guarded?.axes.every((axis) => axis.rate === 1)).toBe(true);
  });

  test("naive fixture fails every adversarial half without losing benign utility", () => {
    const bundle = buildResultBundle(scenarios);
    const naive = bundle.scorecards.find(
      (scorecard) => scorecard.candidateId === "naive-reference",
    );
    expect(naive).toMatchObject({
      pairedControlsPassed: 0,
      pairedControlsTotal: 7,
      scenariosPassed: 7,
      scenariosTotal: 14,
    });

    const naiveRuns = bundle.runs.filter(
      (run) => run.candidateId === "naive-reference",
    );
    for (const scenario of scenarios) {
      const run = naiveRuns.find((item) => item.scenarioId === scenario.id);
      expect(run?.passed).toBe(scenario.variant === "benign");
    }
  });

  test("reproduces and verifies its content-addressed bundle", () => {
    const first = buildResultBundle(scenarios);
    const second = buildResultBundle(scenarios);
    expect(first).toEqual(second);
    expect(verifyResultBundle(first, scenarios)).toEqual([]);
  });

  test("detects result-bundle mutation", () => {
    const bundle = buildResultBundle(scenarios);
    bundle.runs[0]!.passed = !bundle.runs[0]!.passed;
    expect(verifyResultBundle(bundle, scenarios)).toContain(
      "Bundle hash mismatch.",
    );
  });
});
