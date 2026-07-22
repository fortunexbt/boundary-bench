import { describe, expect, test } from "vitest";

import { canonicalJson } from "../src/core/canonical.js";
import {
  containsRawBody,
  materializeTrace,
  traceRoot,
  verifyReceiptChain,
} from "../src/core/receipts.js";
import type { TraceEventSeed } from "../src/core/types.js";

const seeds: TraceEventSeed[] = [
  {
    actor: "user",
    id: "start",
    kind: "instruction",
    payloadLabel: "synthetic:start",
    tick: 0,
    trust: "trusted",
  },
  {
    actor: "agent",
    costMicros: 10,
    id: "call",
    kind: "tool_call",
    payloadLabel: "synthetic:call",
    tick: 1,
    tool: "read",
    trust: "trusted",
  },
];

describe("canonical evidence", () => {
  test("sorts object keys recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}',
    );
  });

  test("builds deterministic hash-linked receipts", () => {
    const first = materializeTrace(seeds);
    const second = materializeTrace(seeds);
    expect(first).toEqual(second);
    expect(traceRoot(first)).toBe(traceRoot(second));
    expect(verifyReceiptChain(first)).toBe(true);
  });

  test("detects a single-field mutation", () => {
    const trace = materializeTrace(seeds);
    const call = trace[1];
    if (!call) throw new Error("missing fixture event");
    const tampered = [trace[0]!, { ...call, tool: "write" }];
    expect(verifyReceiptChain(tampered)).toBe(false);
  });

  test("rejects raw body-shaped fields recursively", () => {
    expect(containsRawBody({ meta: { body: "do not retain" } })).toBe(true);
    expect(containsRawBody({ meta: { payloadDigest: "sha256:abc" } })).toBe(
      false,
    );
  });
});
