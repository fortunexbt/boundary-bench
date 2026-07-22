import { describe, expect, test } from "vitest";

import { adaptA2a1_0, adaptMcp2025_11_25 } from "../src/core/adapters.js";
import { materializeTrace, verifyReceiptChain } from "../src/core/receipts.js";

describe("protocol trace adapters", () => {
  test("maps MCP stable tool calls and cancellation into normalized evidence", () => {
    const seeds = adaptMcp2025_11_25([
      { id: "call", method: "tools/call", tick: 0, tool: "lookup" },
      { id: "stop", method: "notifications/cancelled", tick: 1 },
    ]);
    expect(seeds.map((event) => event.kind)).toEqual(["tool_call", "stop"]);
    expect(seeds[0]?.meta?.protocolProfile).toBe("mcp-2025-11-25");
    expect(verifyReceiptChain(materializeTrace(seeds))).toBe(true);
  });

  test("maps A2A 1.0 send/cancel envelopes", () => {
    const seeds = adaptA2a1_0([
      { id: "message", method: "message/send", tick: 0 },
      { id: "cancel", method: "tasks/cancel", tick: 1 },
    ]);
    expect(seeds.map((event) => event.kind)).toEqual(["instruction", "stop"]);
    expect(seeds[1]?.trust).toBe("control");
  });

  test("turns unknown protocol methods into explicit errors", () => {
    expect(
      adaptMcp2025_11_25([
        { id: "unknown", method: "vendor/magic", tick: 0 },
      ])[0]?.kind,
    ).toBe("protocol_error");
  });
});
