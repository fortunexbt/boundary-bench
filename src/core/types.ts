export const SCORE_AXES = [
  "safety",
  "utility",
  "control",
  "integrity",
] as const;

export type ScoreAxis = (typeof SCORE_AXES)[number];

export type TraceActor = "user" | "agent" | "tool" | "control";

export type TraceKind =
  | "instruction"
  | "tool_call"
  | "tool_result"
  | "stop"
  | "final"
  | "refusal"
  | "halt"
  | "quarantine"
  | "approval_required"
  | "approval_granted"
  | "budget_exhausted"
  | "protocol_error";

export type TrustLevel = "trusted" | "untrusted" | "control";

export interface TraceEventSeed {
  actor: TraceActor;
  audience?: string;
  costMicros?: number;
  id: string;
  kind: TraceKind;
  meta?: Record<string, boolean | number | string | null>;
  payloadLabel: string;
  tags?: string[];
  tick: number;
  tool?: string;
  trust: TrustLevel;
}

export interface TraceEvent extends Omit<TraceEventSeed, "payloadLabel"> {
  hash: string;
  payloadDigest: string;
  previousHash: string | null;
  sequence: number;
  tags: string[];
}

interface AssertionBase {
  axis: ScoreAxis;
  id: string;
  rationale: string;
}

export type ScenarioAssertion =
  | (AssertionBase & { afterTag?: string; tool: string; type: "forbid_tool" })
  | (AssertionBase & { tool: string; type: "require_tool" })
  | (AssertionBase & { maximum: number; type: "max_tool_calls" })
  | (AssertionBase & { maximum: number; type: "max_cost_micros" })
  | (AssertionBase & { kind: TraceKind; type: "require_kind" })
  | (AssertionBase & {
      kind: TraceKind;
      type: "require_kind_after_tag";
      tag: string;
    })
  | (AssertionBase & { type: "require_final" })
  | (AssertionBase & { afterKind: TraceKind; type: "no_tool_after_kind" })
  | (AssertionBase & { tag: string; type: "no_tool_after_tag" })
  | (AssertionBase & { expected: string; type: "audience_match" })
  | (AssertionBase & { type: "receipt_chain" })
  | (AssertionBase & { type: "body_free" })
  | (AssertionBase & { type: "replay_match" });

export type ScenarioVariant = "benign" | "adversarial";

export type ScenarioCategory =
  | "retrieval-integrity"
  | "tool-output-integrity"
  | "budget-control"
  | "stop-control"
  | "scope-control"
  | "receipt-integrity"
  | "approval-control";

export interface ReferenceTrace {
  primary: TraceEventSeed[];
  replay?: TraceEventSeed[];
}

export interface Scenario {
  assertions: ScenarioAssertion[];
  category: ScenarioCategory;
  description: string;
  id: string;
  pairId: string;
  protocol: "native" | "mcp-2025-11-25" | "a2a-1.0";
  reference: Record<string, ReferenceTrace>;
  title: string;
  variant: ScenarioVariant;
}

export interface AssertionResult {
  axis: ScoreAxis;
  evidence: string[];
  explanation: string;
  id: string;
  passed: boolean;
}

export interface ScenarioRun {
  assertions: AssertionResult[];
  candidateId: string;
  passed: boolean;
  replayRoot: string;
  scenarioId: string;
  trace: TraceEvent[];
  traceRoot: string;
}

export interface AxisScore {
  axis: ScoreAxis;
  passed: number;
  rate: number;
  total: number;
}

export interface CandidateScorecard {
  axes: AxisScore[];
  candidateId: string;
  pairedControlsPassed: number;
  pairedControlsTotal: number;
  scenariosPassed: number;
  scenariosTotal: number;
}

export interface CandidateManifest {
  description: string;
  id: string;
  kind: "illustrative-reference" | "external";
  name: string;
}

export interface ProtocolProfile {
  label: string;
  status: "stable" | "release-candidate";
  version: string;
}

export interface ResultBundle {
  benchmarkVersion: string;
  bundleHash: string;
  candidates: CandidateManifest[];
  protocolProfiles: ProtocolProfile[];
  runs: ScenarioRun[];
  schema: "boundary-bench/result-bundle/v1";
  scenarios: Array<Omit<Scenario, "reference">>;
  scorecards: CandidateScorecard[];
}
