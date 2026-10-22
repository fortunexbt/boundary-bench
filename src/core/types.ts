export interface Transaction {
  amount: number;
  date: string;
  id: number;
  recipient: string;
  recurring: boolean;
  sender: string;
  subject: string;
}

export interface BankingState {
  bank_account: {
    balance: number;
    iban: string;
    scheduled_transactions: Transaction[];
    transactions: Transaction[];
  };
  filesystem: { files: Record<string, string> };
  user_account: {
    city: string;
    first_name: string;
    last_name: string;
    password: string;
    street: string;
  };
}

export type RequestId = number | string;

interface EventBase {
  at: string;
  seq: number;
}

export type TraceEvent = EventBase &
  (
    | {
        client: { name: string; version: string } | null;
        kind: "session_start";
        protocolVersion: string | null;
        scenario: string;
        server: string;
      }
    | {
        args: Record<string, unknown>;
        kind: "tool_call";
        request: RequestId;
        tool: string;
      }
    | { kind: "tool_result"; ok: boolean; request: RequestId; tool: string }
    | {
        injectionTask: string;
        kind: "prompt_injection";
        request: RequestId;
        tool: string;
        vector: string;
      }
    | { kind: "budget_exhausted"; limit: number; request: RequestId }
    | { kind: "approval_required"; request: RequestId; tool: string }
    | { kind: "stop"; reason: string | null; request: RequestId }
    | { kind: "session_end"; reason: string; state: BankingState }
  );

export type TraceKind = TraceEvent["kind"];

export type CheckRole = "precondition" | "utility" | "boundary";

interface CheckBase {
  id: string;
  label: string;
  role: CheckRole;
}

export type Check = CheckBase &
  (
    | { kind: TraceKind; type: "event" }
    | { tool: string; type: "called" }
    | { test: (state: BankingState) => boolean; type: "state" }
    | { kind: TraceKind; tools?: readonly string[]; type: "no_call_after" }
  );

export type Boundary =
  "none" | "prompt_injection" | "budget" | "stop" | "approval";

export interface Injection {
  goal: string;
  injectionTask: string;
  /** The injected field (a file or a transaction subject) exactly as AgentDojo serves it. */
  served: string;
  vector: string;
}

export interface Scenario {
  approvalRequired?: readonly string[];
  baseline?: string;
  boundary: Boundary;
  budget?: number;
  checks: Check[];
  id: string;
  injection?: Injection;
  /** What the person running the test has to do besides giving the prompt. */
  operator?: string;
  prompt: string;
  summary: string;
  title: string;
  toolDelayMs?: number;
  userTask: string;
}

export interface CheckResult {
  detail: string;
  events: number[];
  id: string;
  label: string;
  passed: boolean;
  role: CheckRole;
}

export type Verdict = "pass" | "fail" | "inconclusive";

export interface Evaluation {
  checks: CheckResult[];
  client: { name: string; version: string } | null;
  scenario: Scenario;
  verdict: Verdict;
}
