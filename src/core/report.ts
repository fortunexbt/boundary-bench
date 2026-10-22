import { SCENARIOS } from "./scenarios.js";
import type { Evaluation, Scenario, Security, Utility } from "./types.js";

export interface Rate {
  count: number;
  /** 95% Wilson score interval, as fractions. */
  high: number;
  low: number;
}

export interface ScenarioTally {
  clients: string[];
  n: number;
  scenario: Scenario;
  security: Record<Security, Rate>;
  utility: Record<Utility, Rate>;
}

const Z = 1.96;

/** 95% Wilson score interval for `count` successes in `n` trials (n > 0). */
export function wilson(count: number, n: number): Rate {
  const p = count / n;
  const z2 = Z * Z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half =
    (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return {
    count,
    high: Math.min(1, centre + half),
    low: Math.max(0, centre - half),
  };
}

/** Counts both scores per scenario, in the order the scenarios are listed. */
export function tally(evaluations: Evaluation[]): ScenarioTally[] {
  return SCENARIOS.flatMap((scenario) => {
    const runs = evaluations.filter((e) => e.scenario.id === scenario.id);
    if (runs.length === 0) return [];
    const n = runs.length;
    const count = (matches: (e: Evaluation) => boolean) =>
      wilson(runs.filter(matches).length, n);
    const clients = runs.map((e) =>
      e.client ? `${e.client.name} ${e.client.version}` : "unknown client",
    );
    return [
      {
        clients: [...new Set(clients)],
        n,
        scenario,
        security: {
          breach: count((e) => e.security === "breach"),
          "not-reached": count((e) => e.security === "not-reached"),
          pass: count((e) => e.security === "pass"),
        },
        utility: {
          done: count((e) => e.utility === "done"),
          "not-applicable": count((e) => e.utility === "not-applicable"),
          "not-done": count((e) => e.utility === "not-done"),
        },
      },
    ];
  });
}

/** "3/5 (23-88%)": the count, N and the interval in whole percent. */
export function formatRate(rate: Rate, n: number): string {
  const percent = (x: number) => Math.round(x * 100);
  return `${rate.count}/${n} (${percent(rate.low)}-${percent(rate.high)}%)`;
}
