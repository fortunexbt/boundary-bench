import { canonicalJson } from "./canonical.js";
import type {
  TraceActor,
  TraceEventSeed,
  TraceKind,
  TrustLevel,
} from "./types.js";

export interface ProtocolEnvelope {
  actor?: TraceActor;
  audience?: string;
  costMicros?: number;
  id: string;
  method: string;
  tags?: string[];
  tick: number;
  tool?: string;
  trust?: TrustLevel;
}

interface Mapping {
  actor: TraceActor;
  kind: TraceKind;
  trust: TrustLevel;
}

const MCP_METHODS: Record<string, Mapping> = {
  "boundary/instruction": {
    actor: "user",
    kind: "instruction",
    trust: "trusted",
  },
  "boundary/tool-result": {
    actor: "tool",
    kind: "tool_result",
    trust: "untrusted",
  },
  "notifications/cancelled": {
    actor: "control",
    kind: "stop",
    trust: "control",
  },
  "tools/call": { actor: "agent", kind: "tool_call", trust: "trusted" },
};

const A2A_METHODS: Record<string, Mapping> = {
  "boundary/tool-call": { actor: "agent", kind: "tool_call", trust: "trusted" },
  "boundary/tool-result": {
    actor: "tool",
    kind: "tool_result",
    trust: "untrusted",
  },
  "message/send": { actor: "user", kind: "instruction", trust: "trusted" },
  "tasks/cancel": { actor: "control", kind: "stop", trust: "control" },
};

function adapt(
  envelopes: ProtocolEnvelope[],
  mappings: Record<string, Mapping>,
  profile: string,
): TraceEventSeed[] {
  return envelopes.map((envelope) => {
    const mapping = mappings[envelope.method] ?? {
      actor: "control" as const,
      kind: "protocol_error" as const,
      trust: "control" as const,
    };
    return {
      actor: envelope.actor ?? mapping.actor,
      audience: envelope.audience,
      costMicros: envelope.costMicros,
      id: envelope.id,
      kind: mapping.kind,
      meta: { method: envelope.method, protocolProfile: profile },
      payloadLabel: canonicalJson({
        audience: envelope.audience,
        costMicros: envelope.costMicros,
        id: envelope.id,
        method: envelope.method,
        tags: envelope.tags,
        tick: envelope.tick,
        tool: envelope.tool,
      }),
      tags: envelope.tags,
      tick: envelope.tick,
      tool: envelope.tool,
      trust: envelope.trust ?? mapping.trust,
    };
  });
}

export function adaptMcp2025_11_25(
  envelopes: ProtocolEnvelope[],
): TraceEventSeed[] {
  return adapt(envelopes, MCP_METHODS, "mcp-2025-11-25");
}

export function adaptA2a1_0(envelopes: ProtocolEnvelope[]): TraceEventSeed[] {
  return adapt(envelopes, A2A_METHODS, "a2a-1.0");
}
