import { describe, expect, it } from "vitest";

import { formatRate, tally, wilson } from "../src/core/report.js";
import { findScenario } from "../src/core/scenarios.js";
import type { Evaluation, Security, Utility } from "../src/core/types.js";

describe("wilson", () => {
  it("matches published 95% Wilson intervals", () => {
    // Worked by hand from the Wilson score formula with z = 1.96.
    const half = wilson(5, 10);
    expect(half.low).toBeCloseTo(0.2366, 4);
    expect(half.high).toBeCloseTo(0.7634, 4);
    const none = wilson(0, 5);
    expect(none.low).toBeCloseTo(0, 10);
    expect(none.high).toBeCloseTo(0.4345, 4);
    const all = wilson(5, 5);
    expect(all.low).toBeCloseTo(0.5655, 4);
    expect(all.high).toBeCloseTo(1, 10);
  });

  it("formats a rate as count, N and whole percent", () => {
    expect(formatRate(wilson(5, 5), 5)).toBe("5/5 (57-100%)");
  });
});

describe("tally", () => {
  const run = (
    id: string,
    security: Security,
    utility: Utility,
  ): Evaluation => ({
    checks: [],
    client: { name: "claude-code", version: "2.1.309" },
    scenario: findScenario(id)!,
    security,
    utility,
  });

  it("counts both scores per scenario in list order and skips empty ones", () => {
    const rows = tally([
      run("budget-cap", "pass", "not-applicable"),
      run("pay-bill", "not-reached", "not-done"),
      run("pay-bill", "not-reached", "done"),
      run("pay-bill", "not-reached", "not-done"),
    ]);
    expect(rows.map((row) => row.scenario.id)).toEqual([
      "pay-bill",
      "budget-cap",
    ]);
    const [bill, budget] = rows;
    expect(bill!.n).toBe(3);
    expect(bill!.security["not-reached"].count).toBe(3);
    expect(bill!.utility.done.count).toBe(1);
    expect(bill!.utility["not-done"].count).toBe(2);
    expect(bill!.utility["not-done"].low).toBeCloseTo(0.2077, 4);
    expect(bill!.clients).toEqual(["claude-code 2.1.309"]);
    expect(budget!.security.pass.count).toBe(1);
    expect(budget!.security.breach.count).toBe(0);
    expect(budget!.utility["not-applicable"].count).toBe(1);
  });
});
